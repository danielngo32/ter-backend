const { OrderModel } = require("../schemas/order.schema");

const createOrder = (payload) => OrderModel.create(payload);

const findOrderById = (id) => OrderModel.findById(id)
  .populate('customerId', '_id name phone1 phone2 email1 email2 avatarUrl')
  .populate('salesPersonId', '_id fullName email avatarUrl')
  .populate('createdBy', '_id fullName email avatarUrl')
  .populate('updatedBy', '_id fullName email avatarUrl')
  .populate('items.productId', '_id name sku images basePricing')
  .populate('shipping.partnerId', '_id name code')
  .populate('payments.partnerId', '_id name code');

const findOrderByOrderNumber = (tenantId, orderNumber) =>
  OrderModel.findOne({ tenantId, orderNumber })
    .populate('customerId', '_id name phone1 phone2 email1 email2 avatarUrl')
    .populate('salesPersonId', '_id fullName email avatarUrl')
    .populate('createdBy', '_id fullName email avatarUrl')
    .populate('updatedBy', '_id fullName email avatarUrl')
    .populate('items.productId', '_id name sku images basePricing')
    .populate('shipping.partnerId', '_id name code')
    .populate('payments.partnerId', '_id name code');

const listOrders = (tenantId, filter = {}, limit = 50, skip = 0) =>
  OrderModel.find({ tenantId, ...filter })
    .populate('customerId', '_id name phone1 phone2 email1 email2 avatarUrl')
    .populate('salesPersonId', '_id fullName email avatarUrl')
    .populate('createdBy', '_id fullName email avatarUrl')
    .populate('updatedBy', '_id fullName email avatarUrl')
    .populate('items.productId', '_id name sku images basePricing')
    .populate('shipping.partnerId', '_id name code')
    .populate('payments.partnerId', '_id name code')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

const findOrdersForExport = (tenantId, filter = {}) =>
  OrderModel.find({ tenantId, ...filter })
    .populate('customerId', '_id name phone1 phone2 email1 email2')
    .populate('salesPersonId', '_id fullName email')
    .populate('createdBy', '_id fullName email')
    .populate('updatedBy', '_id fullName email')
    .populate('items.productId', '_id name sku')
    .populate('shipping.partnerId', '_id name code')
    .populate('payments.partnerId', '_id name code')
    .lean()
    .sort({ createdAt: -1 });

const countOrders = (tenantId, filter = {}) =>
  OrderModel.countDocuments({ tenantId, ...filter });

const updateOrder = (id, updates) =>
  OrderModel.findByIdAndUpdate(id, { $set: updates }, { new: true })
    .populate('customerId', '_id name phone1 phone2 email1 email2 avatarUrl')
    .populate('salesPersonId', '_id fullName email avatarUrl')
    .populate('createdBy', '_id fullName email avatarUrl')
    .populate('updatedBy', '_id fullName email avatarUrl')
    .populate('items.productId', '_id name sku images basePricing')
    .populate('shipping.partnerId', '_id name code')
    .populate('payments.partnerId', '_id name code');

const deleteOrder = (id) => OrderModel.findByIdAndDelete(id);

const findOrdersByCustomer = (tenantId, customerId, limit = 50, skip = 0) =>
  OrderModel.find({ tenantId, customerId })
    .populate('customerId', '_id name phone1 phone2 email1 email2 avatarUrl')
    .populate('salesPersonId', '_id fullName email avatarUrl')
    .populate('createdBy', '_id fullName email avatarUrl')
    .populate('updatedBy', '_id fullName email avatarUrl')
    .populate('items.productId', '_id name sku images basePricing')
    .populate('shipping.partnerId', '_id name code')
    .populate('payments.partnerId', '_id name code')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

const findOrdersByStatus = (tenantId, status, limit = 50, skip = 0) =>
  OrderModel.find({ tenantId, status })
    .populate('customerId', '_id name phone1 phone2 email1 email2 avatarUrl')
    .populate('salesPersonId', '_id fullName email avatarUrl')
    .populate('createdBy', '_id fullName email avatarUrl')
    .populate('updatedBy', '_id fullName email avatarUrl')
    .populate('items.productId', '_id name sku images basePricing')
    .populate('shipping.partnerId', '_id name code')
    .populate('payments.partnerId', '_id name code')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

const findOrdersByPaymentStatus = (tenantId, paymentStatus, limit = 50, skip = 0) =>
  OrderModel.find({ tenantId, paymentStatus })
    .populate('customerId', '_id name phone1 phone2 email1 email2 avatarUrl')
    .populate('salesPersonId', '_id fullName email avatarUrl')
    .populate('createdBy', '_id fullName email avatarUrl')
    .populate('updatedBy', '_id fullName email avatarUrl')
    .populate('items.productId', '_id name sku images basePricing')
    .populate('shipping.partnerId', '_id name code')
    .populate('payments.partnerId', '_id name code')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

const findOrdersByDateRange = (tenantId, startDate, endDate, limit = 50, skip = 0) =>
  OrderModel.find({
    tenantId,
    createdAt: {
      $gte: startDate,
      $lte: endDate,
    },
  })
    .populate('customerId', '_id name phone1 phone2 email1 email2 avatarUrl')
    .populate('salesPersonId', '_id fullName email avatarUrl')
    .populate('createdBy', '_id fullName email avatarUrl')
    .populate('updatedBy', '_id fullName email avatarUrl')
    .populate('items.productId', '_id name sku images basePricing')
    .populate('shipping.partnerId', '_id name code')
    .populate('payments.partnerId', '_id name code')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

const findOrdersBySalesPerson = (tenantId, salesPersonId, limit = 50, skip = 0) =>
  OrderModel.find({ tenantId, salesPersonId })
    .populate('customerId', '_id name phone1 phone2 email1 email2 avatarUrl')
    .populate('salesPersonId', '_id fullName email avatarUrl')
    .populate('createdBy', '_id fullName email avatarUrl')
    .populate('updatedBy', '_id fullName email avatarUrl')
    .populate('items.productId', '_id name sku images basePricing')
    .populate('shipping.partnerId', '_id name code')
    .populate('payments.partnerId', '_id name code')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

const findOrdersByOrderType = (tenantId, orderType, limit = 50, skip = 0) =>
  OrderModel.find({ tenantId, orderType })
    .populate('customerId', '_id name phone1 phone2 email1 email2 avatarUrl')
    .populate('salesPersonId', '_id fullName email avatarUrl')
    .populate('createdBy', '_id fullName email avatarUrl')
    .populate('updatedBy', '_id fullName email avatarUrl')
    .populate('items.productId', '_id name sku images basePricing')
    .populate('shipping.partnerId', '_id name code')
    .populate('payments.partnerId', '_id name code')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

const findUnpaidOrders = (tenantId, limit = 50, skip = 0) =>
  OrderModel.find({
    tenantId,
    paymentStatus: { $in: ['unpaid', 'partial'] },
  })
    .populate('customerId', '_id name phone1 phone2 email1 email2 avatarUrl')
    .populate('salesPersonId', '_id fullName email avatarUrl')
    .populate('createdBy', '_id fullName email avatarUrl')
    .populate('updatedBy', '_id fullName email avatarUrl')
    .populate('items.productId', '_id name sku images basePricing')
    .populate('shipping.partnerId', '_id name code')
    .populate('payments.partnerId', '_id name code')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

const findUnfulfilledOrders = (tenantId, limit = 50, skip = 0) =>
  OrderModel.find({
    tenantId,
    fulfillmentStatus: { $in: ['unfulfilled', 'partial'] },
  })
    .populate('customerId', '_id name phone1 phone2 email1 email2 avatarUrl')
    .populate('salesPersonId', '_id fullName email avatarUrl')
    .populate('createdBy', '_id fullName email avatarUrl')
    .populate('updatedBy', '_id fullName email avatarUrl')
    .populate('items.productId', '_id name sku images basePricing')
    .populate('shipping.partnerId', '_id name code')
    .populate('payments.partnerId', '_id name code')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

const findQuickSaleOrders = (tenantId, limit = 50, skip = 0) =>
  OrderModel.find({ tenantId, quickSale: true })
    .populate('customerId', '_id name phone1 phone2 email1 email2 avatarUrl')
    .populate('salesPersonId', '_id fullName email avatarUrl')
    .populate('createdBy', '_id fullName email avatarUrl')
    .populate('updatedBy', '_id fullName email avatarUrl')
    .populate('items.productId', '_id name sku images basePricing')
    .populate('shipping.partnerId', '_id name code')
    .populate('payments.partnerId', '_id name code')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

const findOrdersWithDebt = (tenantId, limit = 50, skip = 0) =>
  OrderModel.find({ tenantId, allowDebt: true, paymentStatus: { $in: ['unpaid', 'partial'] } })
    .populate('customerId', '_id name phone1 phone2 email1 email2 avatarUrl')
    .populate('salesPersonId', '_id fullName email avatarUrl')
    .populate('createdBy', '_id fullName email avatarUrl')
    .populate('updatedBy', '_id fullName email avatarUrl')
    .populate('items.productId', '_id name sku images basePricing')
    .populate('shipping.partnerId', '_id name code')
    .populate('payments.partnerId', '_id name code')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

const getOrderStatistics = async (tenantId, startDate, endDate) => {
  const matchStage = {
    tenantId,
    ...(startDate && endDate && {
      createdAt: {
        $gte: startDate,
        $lte: endDate,
      },
    }),
  };

  const stats = await OrderModel.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        totalRevenue: { $sum: '$totals.grandTotal' },
        totalPaid: { $sum: '$totals.paidTotal' },
        totalOutstanding: {
          $sum: {
            $subtract: ['$totals.grandTotal', '$totals.paidTotal'],
          },
        },
        avgOrderValue: { $avg: '$totals.grandTotal' },
        byStatus: {
          $push: {
            status: '$status',
            grandTotal: '$totals.grandTotal',
          },
        },
        byPaymentStatus: {
          $push: {
            paymentStatus: '$paymentStatus',
            grandTotal: '$totals.grandTotal',
          },
        },
      },
    },
  ]);

  if (!stats || stats.length === 0) {
    return {
      totalOrders: 0,
      totalRevenue: 0,
      totalPaid: 0,
      totalOutstanding: 0,
      avgOrderValue: 0,
      byStatus: {},
      byPaymentStatus: {},
    };
  }

  const result = stats[0];

  const statusBreakdown = {};
  result.byStatus.forEach((item) => {
    if (!statusBreakdown[item.status]) {
      statusBreakdown[item.status] = { count: 0, revenue: 0 };
    }
    statusBreakdown[item.status].count += 1;
    statusBreakdown[item.status].revenue += item.grandTotal || 0;
  });

  const paymentStatusBreakdown = {};
  result.byPaymentStatus.forEach((item) => {
    if (!paymentStatusBreakdown[item.paymentStatus]) {
      paymentStatusBreakdown[item.paymentStatus] = { count: 0, revenue: 0 };
    }
    paymentStatusBreakdown[item.paymentStatus].count += 1;
    paymentStatusBreakdown[item.paymentStatus].revenue += item.grandTotal || 0;
  });

  return {
    totalOrders: result.totalOrders || 0,
    totalRevenue: result.totalRevenue || 0,
    totalPaid: result.totalPaid || 0,
    totalOutstanding: Math.max(0, result.totalOutstanding || 0),
    avgOrderValue: result.avgOrderValue || 0,
    byStatus: statusBreakdown,
    byPaymentStatus: paymentStatusBreakdown,
  };
};

module.exports = {
  OrderModel,
  createOrder,
  findOrderById,
  findOrderByOrderNumber,
  listOrders,
  findOrdersForExport,
  countOrders,
  updateOrder,
  deleteOrder,
  findOrdersByCustomer,
  findOrdersByStatus,
  findOrdersByPaymentStatus,
  findOrdersByDateRange,
  findOrdersBySalesPerson,
  findOrdersByOrderType,
  findUnpaidOrders,
  findUnfulfilledOrders,
  findQuickSaleOrders,
  findOrdersWithDebt,
  getOrderStatistics,
};
