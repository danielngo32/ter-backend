const orderRepository = require('../../../data/repositories/order.repository');
const productRepository = require('../../../data/repositories/product.repository');
const crmRepository = require('../../../data/repositories/crm.repository');
const { generateDefaultAvatarUrl } = require('../../../utils/avatarGenerator');

const formatOrderItem = (item) => ({
  id: item._id?.toString(),
  productId: item.productId?._id?.toString() || item.productId?.toString() || null,
  variantId: item.variantId?.toString() || null,
  name: item.name,
  sku: item.sku || null,
  quantity: item.quantity,
  unitPrice: item.unitPrice,
  lineTotal: item.quantity * item.unitPrice,
  product: item.productId ? {
    id: item.productId._id?.toString(),
    name: item.productId.name,
    sku: item.productId.sku,
    image: item.productId.images?.[0]?.url || null,
  } : null,
});

const formatOrderPayment = (payment) => ({
  id: payment._id?.toString(),
  method: payment.method,
  amount: payment.amount,
  referenceCode: payment.referenceCode || null,
  note: payment.note || null,
  receivedAt: payment.receivedAt,
  partner: payment.partnerId ? {
    id: payment.partnerId._id?.toString(),
    name: payment.partnerId.name,
    code: payment.partnerId.code,
  } : null,
});

const formatOrder = (order, includeDetails = true) => {
  const baseOrder = {
    id: order._id.toString(),
    orderNumber: order.orderNumber,
    orderType: order.orderType,
    status: order.status,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    quickSale: order.quickSale || false,
    notes: order.notes || null,
    customer: order.customerId ? {
      id: order.customerId._id?.toString(),
      name: order.customerId.name,
      phone1: order.customerId.phone1 || null,
      phone2: order.customerId.phone2 || null,
      email1: order.customerId.email1 || null,
      email2: order.customerId.email2 || null,
    } : null,
    salesPerson: order.salesPersonId ? {
      id: order.salesPersonId._id?.toString(),
      fullName: order.salesPersonId.fullName,
      email: order.salesPersonId.email,
    } : null,
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
    baseOrder.items = (order.items || []).map(formatOrderItem);
    baseOrder.payments = (order.payments || []).map(formatOrderPayment);
    baseOrder.shipping = order.shipping ? {
      partner: order.shipping.partnerId ? {
        id: order.shipping.partnerId._id?.toString(),
        name: order.shipping.partnerId.name,
        code: order.shipping.partnerId.code,
      } : null,
      address: order.shipping.address || null,
      trackingNumber: order.shipping.trackingNumber || null,
      estimatedDeliveryDate: order.shipping.estimatedDeliveryDate || null,
      note: order.shipping.note || null,
    } : null;
    baseOrder.dueDate = order.dueDate || null;
    baseOrder.allowDebt = order.allowDebt || false;
  }

  return baseOrder;
};

const buildOrderFilter = (args) => {
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
  } = args;

  const filter = {};

  if (status) {
    filter.status = status;
  }

  if (paymentStatus) {
    filter.paymentStatus = paymentStatus;
  }

  if (fulfillmentStatus) {
    filter.fulfillmentStatus = fulfillmentStatus;
  }

  if (orderType) {
    filter.orderType = orderType;
  }

  if (customerId) {
    filter.customerId = customerId;
  }

  if (salesPersonId) {
    filter.salesPersonId = salesPersonId;
  }

  if (quickSale !== undefined) {
    filter.quickSale = quickSale;
  }

  if (allowDebt !== undefined) {
    filter.allowDebt = allowDebt;
  }

  if (minTotal !== undefined || maxTotal !== undefined) {
    filter['totals.grandTotal'] = {};
    if (minTotal !== undefined) {
      filter['totals.grandTotal'].$gte = minTotal;
    }
    if (maxTotal !== undefined) {
      filter['totals.grandTotal'].$lte = maxTotal;
    }
  }

  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) {
      filter.createdAt.$gte = new Date(startDate);
    }
    if (endDate) {
      filter.createdAt.$lte = new Date(endDate);
    }
  }

  return filter;
};

const getOrdersWithPagination = async (tenantId, filter, limit, skip) => {
  const orders = await orderRepository.listOrders(tenantId, filter, limit, skip);
  const total = await orderRepository.countOrders(tenantId, filter);

  return {
    orders: orders.map((o) => formatOrder(o)),
    total,
    limit,
    skip,
  };
};

const calculateOrderTotal = async (args, context) => {
  const { items, discountTotal = 0, taxTotal = 0, shippingFee = 0 } = args;
  const { tenantId } = context;

  if (!tenantId) {
    throw new Error('Tenant ID is required');
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return {
      subTotal: 0,
      discountTotal: 0,
      taxTotal: 0,
      shippingFee: 0,
      grandTotal: 0,
      items: [],
    };
  }

  const orderItems = [];
  let subTotal = 0;

  for (const item of items) {
    let product = null;
    let variant = null;
    let price = 0;
    let name = item.name || '';
    let sku = item.sku || '';

    if (item.barcode) {
      const result = await productRepository.findProductByBarcode(tenantId, item.barcode);
      if (result) {
        product = result.product;
        variant = result.variant;
        price = result.isBase
          ? product.basePricing?.sale || product.basePricing?.cost || 0
          : variant.pricing?.sale || variant.pricing?.cost || 0;
        name = product.name;
        sku = result.isBase ? product.sku : variant.sku;
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
      price = item.unitPrice;
      name = item.name || 'Manual Item';
      sku = item.sku || '';
    }

    const quantity = item.quantity || 1;
    const lineTotal = price * quantity;
    subTotal += lineTotal;

    orderItems.push({
      productId: product?._id?.toString() || null,
      variantId: variant?._id?.toString() || null,
      name,
      sku,
      quantity,
      unitPrice: price,
      lineTotal,
    });
  }

  const grandTotal = Math.max(0, subTotal - discountTotal + taxTotal + shippingFee);

  return {
    items: orderItems,
    subTotal,
    discountTotal,
    taxTotal,
    shippingFee,
    grandTotal,
  };
};

const getOrderById = async (args, context) => {
  const { orderId } = args;
  const { tenantId } = context;

  if (!tenantId) {
    throw new Error('Tenant ID is required');
  }

  if (!orderId) {
    return { found: false, message: 'Order ID is required' };
  }

  const order = await orderRepository.findOrderById(orderId);

  if (!order) {
    return { found: false, message: 'Order not found' };
  }

  if (order.tenantId?.toString() !== tenantId.toString()) {
    return { found: false, message: 'Order not found' };
  }

  return {
    found: true,
    order: formatOrder(order),
  };
};

const getOrderByOrderNumber = async (args, context) => {
  const { orderNumber } = args;
  const { tenantId } = context;

  if (!tenantId) {
    throw new Error('Tenant ID is required');
  }

  if (!orderNumber || orderNumber.trim().length === 0) {
    return { found: false, message: 'Order number is required' };
  }

  const order = await orderRepository.findOrderByOrderNumber(tenantId, orderNumber.trim());

  if (!order) {
    return { found: false, message: 'Order not found' };
  }

  return {
    found: true,
    order: formatOrder(order),
  };
};

const searchOrders = async (args, context) => {
  const { query, limit = 10, status, paymentStatus, orderType } = args;
  const { tenantId } = context;

  if (!tenantId) {
    throw new Error('Tenant ID is required');
  }

  const filter = buildOrderFilter({ status, paymentStatus, orderType });

  if (query && query.trim().length > 0) {
    filter.$or = [
      { orderNumber: { $regex: query.trim(), $options: 'i' } },
      { 'items.name': { $regex: query.trim(), $options: 'i' } },
      { 'items.sku': { $regex: query.trim(), $options: 'i' } },
      { notes: { $regex: query.trim(), $options: 'i' } },
    ];
  }

  const result = await getOrdersWithPagination(tenantId, filter, limit, 0);

  return {
    ...result,
    message: `Found ${result.total} order(s)`,
  };
};

const listOrders = async (args, context) => {
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
    limit = 50,
    skip = 0,
  } = args;
  const { tenantId } = context;

  if (!tenantId) {
    throw new Error('Tenant ID is required');
  }

  const filter = buildOrderFilter({
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
  });

  const result = await getOrdersWithPagination(tenantId, filter, limit, skip);

  return {
    ...result,
    message: `Found ${result.total} order(s)`,
  };
};

const getOrdersByCustomer = async (args, context) => {
  const { customerId, limit = 50, skip = 0 } = args;
  const { tenantId } = context;

  if (!tenantId) {
    throw new Error('Tenant ID is required');
  }

  if (!customerId) {
    return { orders: [], total: 0, message: 'Customer ID is required' };
  }

  const orders = await orderRepository.findOrdersByCustomer(tenantId, customerId, limit, skip);
  const total = await orderRepository.countOrders(tenantId, { customerId });

  return {
    orders: orders.map((o) => formatOrder(o)),
    total,
    limit,
    skip,
    message: `Found ${total} order(s) for customer`,
  };
};

const getOrdersByStatus = async (args, context) => {
  const { status, limit = 50, skip = 0 } = args;
  const { tenantId } = context;

  if (!tenantId) {
    throw new Error('Tenant ID is required');
  }

  if (!status) {
    return { orders: [], total: 0, message: 'Status is required' };
  }

  const orders = await orderRepository.findOrdersByStatus(tenantId, status, limit, skip);
  const total = await orderRepository.countOrders(tenantId, { status });

  return {
    orders: orders.map((o) => formatOrder(o)),
    total,
    limit,
    skip,
    message: `Found ${total} order(s) with status ${status}`,
  };
};

const getUnpaidOrders = async (args, context) => {
  const { limit = 50, skip = 0 } = args;
  const { tenantId } = context;

  if (!tenantId) {
    throw new Error('Tenant ID is required');
  }

  const orders = await orderRepository.findUnpaidOrders(tenantId, limit, skip);
  const total = await orderRepository.countOrders(tenantId, {
    paymentStatus: { $in: ['unpaid', 'partial'] },
  });

  return {
    orders: orders.map((o) => formatOrder(o)),
    total,
    limit,
    skip,
    message: `Found ${total} unpaid order(s)`,
  };
};

const getUnfulfilledOrders = async (args, context) => {
  const { limit = 50, skip = 0 } = args;
  const { tenantId } = context;

  if (!tenantId) {
    throw new Error('Tenant ID is required');
  }

  const orders = await orderRepository.findUnfulfilledOrders(tenantId, limit, skip);
  const total = await orderRepository.countOrders(tenantId, {
    fulfillmentStatus: { $in: ['unfulfilled', 'partial'] },
  });

  return {
    orders: orders.map((o) => formatOrder(o)),
    total,
    limit,
    skip,
    message: `Found ${total} unfulfilled order(s)`,
  };
};

const getOrderStatistics = async (args, context) => {
  const { startDate, endDate } = args;
  const { tenantId } = context;

  if (!tenantId) {
    throw new Error('Tenant ID is required');
  }

  const stats = await orderRepository.getOrderStatistics(
    tenantId,
    startDate ? new Date(startDate) : null,
    endDate ? new Date(endDate) : null
  );

  return {
    ...stats,
    message: 'Order statistics retrieved successfully',
  };
};

const createOrder = async (args, context) => {
  const {
    items,
    customerId,
    customerName,
    customerPhone,
    customerEmail,
    customerGender,
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
  } = args;
  const { tenantId, userId } = context;

  if (!tenantId || !userId) {
    throw new Error('Tenant ID and User ID are required');
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return { success: false, message: 'Items are required' };
  }

  const totalResult = await calculateOrderTotal(
    { items, discountTotal, taxTotal, shippingFee },
    context
  );

  let finalCustomerId = customerId;

  if (!finalCustomerId && (customerName || customerPhone || customerEmail)) {
    if (customerPhone || customerEmail) {
      const existingCustomer = await crmRepository.findCustomerByPhonesOrEmails(
        tenantId,
        customerPhone,
        null,
        customerEmail,
        null
      );

      if (existingCustomer) {
        finalCustomerId = existingCustomer._id.toString();
      } else {
        const customerPayload = {
          tenantId,
          name: customerName || 'Khách hàng',
          phone1: customerPhone || null,
          email1: customerEmail || null,
          gender: customerGender || null,
          createdBy: userId,
        };
        const newCustomer = await crmRepository.createCustomer(customerPayload);
        
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
      const customerPayload = {
        tenantId,
        name: customerName,
        gender: customerGender || null,
        createdBy: userId,
      };
      const newCustomer = await crmRepository.createCustomer(customerPayload);
      
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

  const orderCount = await orderRepository.countOrders(tenantId);
  const orderNumber = `ORD-${Date.now()}-${String(orderCount + 1).padStart(4, '0')}`;

  const orderItems = totalResult.items.map((item) => ({
    productId: item.productId || null,
    variantId: item.variantId || null,
    name: item.name,
    sku: item.sku || null,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
  }));


  const orderPayments = [];
  let paidTotal = 0;

  if (payments && Array.isArray(payments) && payments.length > 0) {
    for (const payment of payments) {
      const paymentAmount = payment.amount || 0;
      if (paymentAmount > 0) {
        orderPayments.push({
          method: payment.method || 'cash',
          partnerId: payment.partnerId || null,
          amount: paymentAmount,
          referenceCode: payment.referenceCode || null,
          note: payment.note || null,
          receivedAt: payment.receivedAt ? new Date(payment.receivedAt) : new Date(),
        });
        paidTotal += paymentAmount;
      }
    }
  }

  // Calculate payment status
  let paymentStatus = 'unpaid';
  if (paidTotal >= totalResult.grandTotal) {
    paymentStatus = 'paid';
  } else if (paidTotal > 0) {
    paymentStatus = 'partial';
  }

  // Process shipping
  const shipping = shippingAddress || shippingPartnerId || shippingNote || estimatedDeliveryDate
    ? {
        partnerId: shippingPartnerId || null,
        address: shippingAddress || null,
        trackingNumber: null,
        estimatedDeliveryDate: estimatedDeliveryDate ? new Date(estimatedDeliveryDate) : null,
        note: shippingNote || null,
      }
    : null;

  // Set orderType to 'shipping' if shipping address is provided
  const finalOrderType = shippingAddress ? 'shipping' : orderType;

  const orderPayload = {
    tenantId,
    orderNumber,
    orderType: finalOrderType,
    status,
    paymentStatus,
    fulfillmentStatus: 'unfulfilled',
    quickSale: orderItems.some((item) => !item.productId),
    notes: notes || null,
    customerId: finalCustomerId || null,
    salesPersonId: salesPersonId || null,
    items: orderItems,
    totals: {
      subTotal: totalResult.subTotal,
      discountTotal: totalResult.discountTotal,
      taxTotal: totalResult.taxTotal,
      shippingFee: totalResult.shippingFee,
      grandTotal: totalResult.grandTotal,
      paidTotal,
    },
    payments: orderPayments,
    shipping,
    allowDebt: allowDebt || false,
    createdBy: userId,
  };

  const order = await orderRepository.createOrder(orderPayload);
  const populatedOrder = await orderRepository.findOrderById(order._id);

  const formattedOrder = formatOrder(populatedOrder);
  
  // Calculate change amount for response
  const changeAmount = Math.max(0, paidTotal - totalResult.grandTotal);
  const outstandingBalance = Math.max(0, totalResult.grandTotal - paidTotal);

  return {
    success: true,
    order: formattedOrder,
    paymentSummary: {
      grandTotal: totalResult.grandTotal,
      paidTotal,
      changeAmount,
      outstandingBalance,
      paymentStatus,
    },
    message: 'Order created successfully',
  };
};

const calculatePaymentChange = async (args, context) => {
  const { grandTotal, payments } = args;

  if (!grandTotal || grandTotal <= 0) {
    return { error: 'Grand total must be greater than 0' };
  }

  if (!payments || !Array.isArray(payments) || payments.length === 0) {
    return {
      grandTotal,
      paidTotal: 0,
      changeAmount: 0,
      outstandingBalance: grandTotal,
      paymentStatus: 'unpaid',
    };
  }

  let paidTotal = 0;
  const paymentBreakdown = [];

  for (const payment of payments) {
    const amount = payment.amount || 0;
    if (amount > 0) {
      paidTotal += amount;
      paymentBreakdown.push({
        method: payment.method || 'cash',
        amount,
      });
    }
  }

  const changeAmount = Math.max(0, paidTotal - grandTotal);
  const outstandingBalance = Math.max(0, grandTotal - paidTotal);
  
  let paymentStatus = 'unpaid';
  if (paidTotal >= grandTotal) {
    paymentStatus = 'paid';
  } else if (paidTotal > 0) {
    paymentStatus = 'partial';
  }

  return {
    grandTotal,
    paidTotal,
    changeAmount,
    outstandingBalance,
    paymentStatus,
    paymentBreakdown,
  };
};

module.exports = {
  buildOrderFilter,
  calculateOrderTotal,
  getOrderById,
  getOrderByOrderNumber,
  searchOrders,
  listOrders,
  getOrdersByCustomer,
  getOrdersByStatus,
  getUnpaidOrders,
  getUnfulfilledOrders,
  getOrderStatistics,
  createOrder,
};

