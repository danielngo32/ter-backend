const Joi = require('joi');

const orderItemSchema = Joi.object({
  productId: Joi.string().optional(),
  variantId: Joi.string().optional(),
  name: Joi.string().allow('', null),
  sku: Joi.string().allow('', null),
  barcode: Joi.string().allow('', null),
  quantity: Joi.number().integer().min(1).required(),
  unitPrice: Joi.number().min(0).required(),
});

const paymentSchema = Joi.object({
  method: Joi.string().valid('cash', 'bank_transfer', 'card', 'qr_code', 'other').default('cash'),
  partnerId: Joi.string().allow(null),
  amount: Joi.number().min(0).required(),
  referenceCode: Joi.string().allow('', null),
  note: Joi.string().allow('', null),
  receivedAt: Joi.date().allow(null).optional(),
});

const shippingSchema = Joi.object({
  partnerId: Joi.string().allow(null),
  address: Joi.object({
    addressLine: Joi.string().allow('', null),
    provinceName: Joi.string().allow('', null),
    wardName: Joi.string().allow('', null),
    recipientName: Joi.string().allow('', null),
    recipientPhone: Joi.string().allow('', null),
  }).allow(null),
  trackingNumber: Joi.string().allow('', null),
  estimatedDeliveryDate: Joi.date().allow(null),
  note: Joi.string().allow('', null),
});

const createOrderSchema = Joi.object({
  items: Joi.array().items(orderItemSchema).min(1).required(),
  customerId: Joi.string().allow(null),
  customerName: Joi.string().allow('', null),
  customerPhone: Joi.string().allow('', null),
  customerEmail: Joi.alternatives().try(
    Joi.string().email(),
    Joi.string().allow('', null)
  ).allow(null),
  orderType: Joi.string().valid('normal', 'shipping').default('normal'),
  status: Joi.string().valid('draft', 'confirmed', 'fulfilled', 'cancelled').default('confirmed'),
  notes: Joi.string().allow('', null),
  discountTotal: Joi.number().min(0).default(0),
  taxTotal: Joi.number().min(0).default(0),
  shippingFee: Joi.number().min(0).default(0),
  allowDebt: Joi.boolean().default(false),
  salesPersonId: Joi.string().allow(null),
  payments: Joi.array().items(paymentSchema).default([]),
  shippingAddress: shippingSchema.extract('address').allow(null),
  shippingPartnerId: Joi.string().allow(null),
  shippingNote: Joi.string().allow('', null),
  estimatedDeliveryDate: Joi.date().allow(null),
});

const updateOrderSchema = Joi.object({
  items: Joi.array().items(orderItemSchema).min(1),
  customerId: Joi.string().allow(null),
  orderType: Joi.string().valid('normal', 'shipping'),
  status: Joi.string().valid('draft', 'confirmed', 'fulfilled', 'cancelled'),
  paymentStatus: Joi.string().valid('unpaid', 'partial', 'paid', 'refunded'),
  fulfillmentStatus: Joi.string().valid('unfulfilled', 'partial', 'fulfilled'),
  notes: Joi.string().allow('', null),
  discountTotal: Joi.number().min(0),
  taxTotal: Joi.number().min(0),
  shippingFee: Joi.number().min(0),
  allowDebt: Joi.boolean(),
  salesPersonId: Joi.string().allow(null),
  payments: Joi.array().items(paymentSchema),
  shippingAddress: shippingSchema.extract('address').allow(null),
  shippingPartnerId: Joi.string().allow(null),
  shippingNote: Joi.string().allow('', null),
  estimatedDeliveryDate: Joi.date().allow(null),
}).min(1);

const listQuerySchema = Joi.object({
  status: Joi.string().valid('draft', 'confirmed', 'fulfilled', 'cancelled'),
  paymentStatus: Joi.string().valid('unpaid', 'partial', 'paid', 'refunded'),
  fulfillmentStatus: Joi.string().valid('unfulfilled', 'partial', 'fulfilled'),
  orderType: Joi.string().valid('normal', 'shipping'),
  customerId: Joi.string(),
  salesPersonId: Joi.string(),
  quickSale: Joi.boolean(),
  allowDebt: Joi.boolean(),
  minTotal: Joi.number(),
  maxTotal: Joi.number(),
  startDate: Joi.date(),
  endDate: Joi.date(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(50),
});

// Validation middleware functions
const validate = (schema) => async (req, res, next) => {
  try {
    const value = await schema.validateAsync(req.body, { abortEarly: false, stripUnknown: true });
    req.body = value;
    next();
  } catch (error) {
    res.status(400).json({
      message: 'Validation failed',
      details: error.details?.map((d) => d.message) || [],
    });
  }
};

const validateQuery = (schema) => async (req, res, next) => {
  try {
    const value = await schema.validateAsync(req.query, { abortEarly: false, stripUnknown: true });
    req.query = value;
    next();
  } catch (error) {
    res.status(400).json({
      message: 'Validation failed',
      details: error.details?.map((d) => d.message) || [],
    });
  }
};

// Export validation functions
const validateCreateOrder = validate(createOrderSchema);
const validateUpdateOrder = validate(updateOrderSchema);
const validateListOrdersQuery = validateQuery(listQuerySchema);

module.exports = {
  createOrderSchema,
  updateOrderSchema,
  listQuerySchema,
  validateCreateOrder,
  validateUpdateOrder,
  validateListOrdersQuery,
};

