const Joi = require('joi');
const orderRepository = require('../data/repositories/order.repository');
const productRepository = require('../data/repositories/product.repository');
const crmRepository = require('../data/repositories/crm.repository');
const { generateDefaultAvatarUrl } = require('../utils/avatarGenerator');
const ApiError = require('../utils/apiError');
const { buildOrderFilter } = require('../services/tools/handlers/order.tools'); // reuse filter logic

// --- Helpers ---

const formatOrderItem = (item) => ({
  id: item._id?.toString(),
  productId: item.productId?._id?.toString() || item.productId?.toString() || null,
  variantId: item.variantId?.toString() || null,
  name: item.name,
  sku: item.sku || null,
  quantity: item.quantity,
  unitPrice: item.unitPrice,
  lineTotal: item.quantity * item.unitPrice,
  product: item.productId
    ? {
        id: item.productId._id?.toString(),
        name: item.productId.name,
        sku: item.productId.sku,
        image: item.productId.images?.[0]?.url || null,
      }
    : null,
});

const formatOrderPayment = (payment) => ({
  id: payment._id?.toString(),
  method: payment.method,
  amount: payment.amount,
  referenceCode: payment.referenceCode || null,
  note: payment.note || null,
  receivedAt: payment.receivedAt,
  partner: payment.partnerId
    ? {
        id: payment.partnerId._id?.toString(),
        name: payment.partnerId.name,
        code: payment.partnerId.code,
      }
    : null,
});

const formatOrder = (order, includeDetails = true) => {
  const base = {
    id: order._id.toString(),
    orderNumber: order.orderNumber,
    orderType: order.orderType,
    status: order.status,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    quickSale: order.quickSale || false,
    notes: order.notes || null,
    customer: order.customerId
      ? {
          id: order.customerId._id?.toString(),
          name: order.customerId.name,
          phone1: order.customerId.phone1 || null,
          phone2: order.customerId.phone2 || null,
          email1: order.customerId.email1 || null,
          email2: order.customerId.email2 || null,
        }
      : null,
    salesPerson: order.salesPersonId
      ? {
          id: order.salesPersonId._id?.toString(),
          fullName: order.salesPersonId.fullName,
          email: order.salesPersonId.email,
        }
      : null,
    totals: {
      subTotal: order.totals?.subTotal || 0,
      discountTotal: order.totals?.discountTotal || 0,
      taxTotal: order.totals?.taxTotal || 0,
      shippingFee: order.totals?.shippingFee || 0,
      grandTotal: order.totals?.grandTotal || 0,
      paidTotal: order.totals?.paidTotal || 0,
      changeAmount: Math.max(0, (order.totals?.paidTotal || 0) - (order.totals?.grandTotal || 0)),
      outstandingBalance: Math.max(0, (order.totals?.grandTotal || 0) - (order.totals?.paidTotal || 0)),
    },
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };

  if (includeDetails) {
    base.items = (order.items || []).map(formatOrderItem);
    base.payments = (order.payments || []).map(formatOrderPayment);
    base.shipping = order.shipping
      ? {
          partner: order.shipping.partnerId
            ? {
                id: order.shipping.partnerId._id?.toString(),
                name: order.shipping.partnerId.name,
                code: order.shipping.partnerId.code,
              }
            : null,
          address: order.shipping.address || null,
          trackingNumber: order.shipping.trackingNumber || null,
          estimatedDeliveryDate: order.shipping.estimatedDeliveryDate || null,
          note: order.shipping.note || null,
        }
      : null;
    base.dueDate = order.dueDate || null;
    base.allowDebt = order.allowDebt || false;
  }

  return base;
};

const calculateOrderTotals = async (items = [], discountTotal = 0, taxTotal = 0, shippingFee = 0, tenantId) => {
  if (!items.length) {
    return {
      items: [],
      subTotal: 0,
      discountTotal: 0,
      taxTotal: 0,
      shippingFee: 0,
      grandTotal: 0,
    };
  }

  const normalizedItems = [];
  let subTotal = 0;

  for (const item of items) {
    let product = null;
    let variant = null;
    let price = item.unitPrice || 0;
    let name = item.name || '';
    let sku = item.sku || '';

    if (item.barcode) {
      const res = await productRepository.findProductByBarcode(tenantId, item.barcode);
      if (res) {
        product = res.product;
        variant = res.variant;
        price = res.isBase
          ? product.basePricing?.sale || product.basePricing?.cost || 0
          : variant.pricing?.sale || variant.pricing?.cost || 0;
        name = product.name;
        sku = res.isBase ? product.sku : variant.sku;
      }
    } else if (item.productId) {
      product = await productRepository.findProductById(item.productId);
      if (product) {
        if (item.variantId && product.hasVariants && product.variants?.length > 0) {
          variant = product.variants.find((v) => v._id.toString() === item.variantId);
          if (variant) {
            price = variant.pricing?.sale || variant.pricing?.cost || 0;
            name = product.name;
            sku = variant.sku;
          }
        } else {
          price = product.basePricing?.sale || product.basePricing?.cost || 0;
          name = product.name;
          sku = product.sku;
        }
      }
    } else if (item.unitPrice !== undefined) {
      // quickSale manual item
      price = item.unitPrice;
      name = item.name || 'Manual Item';
      sku = item.sku || '';
    }

    const quantity = item.quantity || 1;
    const lineTotal = price * quantity;
    subTotal += lineTotal;

    normalizedItems.push({
      productId: product?._id?.toString() || null,
      variantId: variant?._id?.toString() || null,
      name,
      sku,
      quantity,
      unitPrice: price,
    });
  }

  const grandTotal = Math.max(0, subTotal - (discountTotal || 0) + (taxTotal || 0) + (shippingFee || 0));

  return {
    items: normalizedItems,
    subTotal,
    discountTotal: discountTotal || 0,
    taxTotal: taxTotal || 0,
    shippingFee: shippingFee || 0,
    grandTotal,
  };
};

const buildPayments = (payments = []) => {
  const orderPayments = [];
  let paidTotal = 0;
  for (const p of payments) {
    const amt = p.amount || 0;
    if (amt > 0) {
      orderPayments.push({
        method: p.method || 'cash',
        partnerId: p.partnerId || null,
        amount: amt,
        referenceCode: p.referenceCode || null,
        note: p.note || null,
        receivedAt: p.receivedAt ? new Date(p.receivedAt) : new Date(),
      });
      paidTotal += amt;
    }
  }
  return { orderPayments, paidTotal };
};

const decidePaymentStatus = (grandTotal, paidTotal) => {
  if (paidTotal >= grandTotal) return 'paid';
  if (paidTotal > 0) return 'partial';
  return 'unpaid';
};

const ensureCustomer = async ({ tenantId, userId, customerId, customerName, customerPhone, customerEmail }) => {
  let finalCustomerId = customerId;
  if (!finalCustomerId && (customerName || customerPhone || customerEmail)) {
    if (customerPhone || customerEmail) {
      const existing = await crmRepository.findCustomerByPhonesOrEmails(
        tenantId,
        customerPhone,
        null,
        customerEmail,
        null
      );
      if (existing) {
        finalCustomerId = existing._id.toString();
      } else {
        const payload = {
          tenantId,
          name: customerName || 'Khách hàng',
          phone1: customerPhone || null,
          email1: customerEmail || null,
          createdBy: userId,
        };
        const newCustomer = await crmRepository.createCustomer(payload);
        await crmRepository.CustomerModel.findByIdAndUpdate(
          newCustomer._id,
          { $unset: { updatedAt: 1, updatedBy: 1 } },
          { timestamps: false }
        );
        if (!newCustomer.avatarUrl && newCustomer.name) {
          newCustomer.avatarUrl = generateDefaultAvatarUrl(newCustomer.name);
          await newCustomer.save();
        }
        finalCustomerId = newCustomer._id.toString();
      }
    } else if (customerName) {
      const payload = {
        tenantId,
        name: customerName,
        createdBy: userId,
      };
      const newCustomer = await crmRepository.createCustomer(payload);
      await crmRepository.CustomerModel.findByIdAndUpdate(
        newCustomer._id,
        { $unset: { updatedAt: 1, updatedBy: 1 } },
        { timestamps: false }
      );
      if (!newCustomer.avatarUrl && newCustomer.name) {
        newCustomer.avatarUrl = generateDefaultAvatarUrl(newCustomer.name);
        await newCustomer.save();
      }
      finalCustomerId = newCustomer._id.toString();
    }
  }
  return finalCustomerId || null;
};

// --- Controllers ---

const createOrder = async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const userId = req.user?._id || req.userId;
    if (!tenantId || !userId) throw new ApiError(401, 'Unauthorized');

    const {
      items = [],
      customerId,
      customerName,
      customerPhone,
      customerEmail,
      orderType = 'normal',
      status = 'confirmed',
      notes,
      discountTotal = 0,
      taxTotal = 0,
      shippingFee = 0,
      allowDebt = false,
      salesPersonId,
      payments = [],
      shippingAddress = null,
      shippingPartnerId = null,
      shippingNote = null,
      estimatedDeliveryDate = null,
    } = req.body || {};

    if (!items.length) throw new ApiError(400, 'Items are required');

    const totals = await calculateOrderTotals(items, discountTotal, taxTotal, shippingFee, tenantId);
    const { orderPayments, paidTotal } = buildPayments(payments);
    const paymentStatus = decidePaymentStatus(totals.grandTotal, paidTotal);
    const finalCustomerId = await ensureCustomer({
      tenantId,
      userId,
      customerId,
      customerName,
      customerPhone,
      customerEmail,
    });

    const orderCount = await orderRepository.countOrders(tenantId);
    const orderNumber = `ORD-${Date.now()}-${String(orderCount + 1).padStart(4, '0')}`;

    const shipping =
      shippingAddress || shippingPartnerId || shippingNote || estimatedDeliveryDate
        ? {
            partnerId: shippingPartnerId || null,
            address: shippingAddress || null,
            trackingNumber: null,
            estimatedDeliveryDate: estimatedDeliveryDate ? new Date(estimatedDeliveryDate) : null,
            note: shippingNote || null,
          }
        : null;
    const finalOrderType = shippingAddress ? 'shipping' : orderType;

    const orderPayload = {
      tenantId,
      orderNumber,
      orderType: finalOrderType,
      status,
      paymentStatus,
      fulfillmentStatus: 'unfulfilled',
      quickSale: totals.items.some((it) => !it.productId),
      notes: notes || null,
      customerId: finalCustomerId,
      salesPersonId: salesPersonId || null,
      items: totals.items,
      totals: {
        subTotal: totals.subTotal,
        discountTotal: totals.discountTotal,
        taxTotal: totals.taxTotal,
        shippingFee: totals.shippingFee,
        grandTotal: totals.grandTotal,
        paidTotal,
      },
      payments: orderPayments,
      shipping,
      allowDebt: !!allowDebt,
      createdBy: userId,
    };

    const order = await orderRepository.createOrder(orderPayload);
    const populated = await orderRepository.findOrderById(order._id);
    res.status(201).json({
      success: true,
      order: formatOrder(populated),
      message: 'Order created successfully',
    });
  } catch (err) {
    next(err);
  }
};

const listOrders = async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    if (!tenantId) throw new ApiError(401, 'Unauthorized');

    const {
      status,
      paymentStatus,
      fulfillmentStatus,
      orderType,
      customerId,
      salesPersonId,
      quickSale,
      allowDebt,
      minTotal,
      maxTotal,
      startDate,
      endDate,
      page = 1,
      limit = 50,
    } = req.query;

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const filter = buildOrderFilter({
      status,
      paymentStatus,
      fulfillmentStatus,
      orderType,
      customerId,
      salesPersonId,
      quickSale: quickSale === undefined ? undefined : quickSale === 'true',
      allowDebt: allowDebt === undefined ? undefined : allowDebt === 'true',
      minTotal: minTotal !== undefined ? Number(minTotal) : undefined,
      maxTotal: maxTotal !== undefined ? Number(maxTotal) : undefined,
      startDate,
      endDate,
    });

    const orders = await orderRepository.listOrders(tenantId, filter, parseInt(limit, 10), skip);
    const total = await orderRepository.countOrders(tenantId, filter);

    res.json({
      items: orders.map((o) => formatOrder(o, false)),
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        totalPages: Math.ceil(total / parseInt(limit, 10)),
      },
    });
  } catch (err) {
    next(err);
  }
};

const getOrderById = async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    if (!tenantId) throw new ApiError(401, 'Unauthorized');

    const { id } = req.params;
    const order = await orderRepository.findOrderById(id);
    if (!order || order.tenantId?.toString() !== tenantId.toString()) {
      throw new ApiError(404, 'Order not found');
    }
    res.json(formatOrder(order));
  } catch (err) {
    next(err);
  }
};

const getOrderByNumber = async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    if (!tenantId) throw new ApiError(401, 'Unauthorized');
    const { orderNumber } = req.params;
    const order = await orderRepository.findOrderByOrderNumber(tenantId, orderNumber);
    if (!order) throw new ApiError(404, 'Order not found');
    res.json(formatOrder(order));
  } catch (err) {
    next(err);
  }
};

const getOrdersByCustomer = async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    if (!tenantId) throw new ApiError(401, 'Unauthorized');
    const { customerId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const orders = await orderRepository.findOrdersByCustomer(tenantId, customerId, parseInt(limit, 10), skip);
    const total = await orderRepository.countOrders(tenantId, { customerId });
    res.json({
      items: orders.map((o) => formatOrder(o, false)),
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        totalPages: Math.ceil(total / parseInt(limit, 10)),
      },
    });
  } catch (err) {
    next(err);
  }
};

const getOrdersByStatus = async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    if (!tenantId) throw new ApiError(401, 'Unauthorized');
    const { status } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const orders = await orderRepository.findOrdersByStatus(tenantId, status, parseInt(limit, 10), skip);
    const total = await orderRepository.countOrders(tenantId, { status });
    res.json({
      items: orders.map((o) => formatOrder(o, false)),
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        totalPages: Math.ceil(total / parseInt(limit, 10)),
      },
    });
  } catch (err) {
    next(err);
  }
};

const getUnpaidOrders = async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    if (!tenantId) throw new ApiError(401, 'Unauthorized');
    const { page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const orders = await orderRepository.findUnpaidOrders(tenantId, parseInt(limit, 10), skip);
    const total = await orderRepository.countOrders(tenantId, { paymentStatus: { $in: ['unpaid', 'partial'] } });
    res.json({
      items: orders.map((o) => formatOrder(o, false)),
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        totalPages: Math.ceil(total / parseInt(limit, 10)),
      },
    });
  } catch (err) {
    next(err);
  }
};

const getUnfulfilledOrders = async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    if (!tenantId) throw new ApiError(401, 'Unauthorized');
    const { page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const orders = await orderRepository.findUnfulfilledOrders(tenantId, parseInt(limit, 10), skip);
    const total = await orderRepository.countOrders(tenantId, {
      fulfillmentStatus: { $in: ['unfulfilled', 'partial'] },
    });
    res.json({
      items: orders.map((o) => formatOrder(o, false)),
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        totalPages: Math.ceil(total / parseInt(limit, 10)),
      },
    });
  } catch (err) {
    next(err);
  }
};

const getOrderStatistics = async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    if (!tenantId) throw new ApiError(401, 'Unauthorized');
    const { startDate, endDate } = req.query;
    const stats = await orderRepository.getOrderStatistics(
      tenantId,
      startDate ? new Date(startDate) : null,
      endDate ? new Date(endDate) : null
    );
    res.json(stats);
  } catch (err) {
    next(err);
  }
};

const updateOrder = async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const userId = req.user?._id || req.userId;
    if (!tenantId || !userId) throw new ApiError(401, 'Unauthorized');
    const { id } = req.params;
    const order = await orderRepository.findOrderById(id);
    if (!order || order.tenantId?.toString() !== tenantId.toString()) {
      throw new ApiError(404, 'Order not found');
    }

    const payload = req.body || {};

    // If items or payments change, recalc totals/paymentStatus
    let updatedTotals = order.totals;
    let updatedItems = order.items;
    let updatedPayments = order.payments;
    let paidTotal = order.totals?.paidTotal || 0;
    let paymentStatus = order.paymentStatus;

    const itemsChanged = payload.items !== undefined;
    const paymentsChanged = payload.payments !== undefined;

    if (itemsChanged) {
      const totals = await calculateOrderTotals(
        payload.items || [],
        payload.discountTotal !== undefined ? payload.discountTotal : order.totals?.discountTotal || 0,
        payload.taxTotal !== undefined ? payload.taxTotal : order.totals?.taxTotal || 0,
        payload.shippingFee !== undefined ? payload.shippingFee : order.totals?.shippingFee || 0,
        tenantId
      );
      updatedItems = totals.items;
      updatedTotals = {
        subTotal: totals.subTotal,
        discountTotal: totals.discountTotal,
        taxTotal: totals.taxTotal,
        shippingFee: totals.shippingFee,
        grandTotal: totals.grandTotal,
        paidTotal: order.totals?.paidTotal || 0,
      };
    }

    if (paymentsChanged) {
      const { orderPayments, paidTotal: newPaidTotal } = buildPayments(payload.payments || []);
      updatedPayments = orderPayments;
      paidTotal = newPaidTotal;
    } else {
      paidTotal = updatedTotals.paidTotal || order.totals?.paidTotal || 0;
    }

    if (itemsChanged || paymentsChanged || payload.discountTotal !== undefined || payload.taxTotal !== undefined || payload.shippingFee !== undefined) {
      const grandTotal =
        updatedTotals?.grandTotal !== undefined ? updatedTotals.grandTotal : order.totals?.grandTotal || 0;
      paymentStatus = decidePaymentStatus(grandTotal, paidTotal);
      updatedTotals = {
        ...updatedTotals,
        paidTotal,
        grandTotal,
      };
    }

    const shipping =
      payload.shippingAddress || payload.shippingPartnerId || payload.shippingNote || payload.estimatedDeliveryDate
        ? {
            partnerId: payload.shippingPartnerId || order.shipping?.partnerId || null,
            address: payload.shippingAddress || order.shipping?.address || null,
            trackingNumber: order.shipping?.trackingNumber || null,
            estimatedDeliveryDate: payload.estimatedDeliveryDate
              ? new Date(payload.estimatedDeliveryDate)
              : order.shipping?.estimatedDeliveryDate || null,
            note: payload.shippingNote || order.shipping?.note || null,
          }
        : payload.shipping === null
        ? null
        : order.shipping || null;

    const updateData = {
      orderType: payload.orderType || order.orderType,
      status: payload.status || order.status,
      paymentStatus: payload.paymentStatus || paymentStatus,
      fulfillmentStatus: payload.fulfillmentStatus || order.fulfillmentStatus,
      notes: payload.notes !== undefined ? payload.notes : order.notes,
      customerId: payload.customerId !== undefined ? payload.customerId : order.customerId,
      salesPersonId: payload.salesPersonId !== undefined ? payload.salesPersonId : order.salesPersonId,
      items: updatedItems,
      totals: updatedTotals,
      payments: updatedPayments,
      shipping,
      allowDebt: payload.allowDebt !== undefined ? payload.allowDebt : order.allowDebt,
      updatedBy: userId,
    };

    const updated = await orderRepository.updateOrder(id, updateData);
    res.json(formatOrder(updated));
  } catch (err) {
    next(err);
  }
};

const deleteOrder = async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    if (!tenantId) throw new ApiError(401, 'Unauthorized');
    const { id } = req.params;
    const order = await orderRepository.findOrderById(id);
    if (!order || order.tenantId?.toString() !== tenantId.toString()) {
      throw new ApiError(404, 'Order not found');
    }
    await orderRepository.deleteOrder(id);
    res.json({ message: 'Order deleted successfully' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createOrder,
  listOrders,
  getOrderById,
  getOrderByNumber,
  getOrdersByCustomer,
  getOrdersByStatus,
  getUnpaidOrders,
  getUnfulfilledOrders,
  getOrderStatistics,
  updateOrder,
  deleteOrder,
};

