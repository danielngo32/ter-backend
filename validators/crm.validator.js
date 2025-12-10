const Joi = require('joi');

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

const validateParams = (schema) => async (req, res, next) => {
  try {
    const value = await schema.validateAsync(req.params, { abortEarly: false, stripUnknown: true });
    req.params = value;
    next();
  } catch (error) {
    res.status(400).json({
      message: 'Validation failed',
      details: error.details?.map((d) => d.message) || [],
    });
  }
};

const addressSchema = Joi.object({
  addressLine: Joi.string().trim().allow('', null).optional(),
  provinceCode: Joi.string().trim().allow('', null).optional(),
  provinceName: Joi.string().trim().allow('', null).optional(),
  wardCode: Joi.string().trim().allow('', null).optional(),
  wardName: Joi.string().trim().allow('', null).optional(),
}).optional();

const createCustomerSchema = Joi.object({
  name: Joi.string().trim().min(1).max(200).required(),
  avatarUrl: Joi.string().uri().allow(null, '').optional(),
  gender: Joi.string().valid('male', 'female', 'other').default('other'),
  birthday: Joi.date().optional(),
  phone1: Joi.string().trim().allow('', null).optional(),
  phone2: Joi.string().trim().allow('', null).optional(),
  email1: Joi.string().trim().email().allow('', null).optional(),
  email2: Joi.string().trim().email().allow('', null).optional(),
  address: addressSchema.default(() => ({})),
  note: Joi.string().trim().max(2000).allow(null, '').optional(),
  lastActivityAt: Joi.date().optional(),
});

const updateCustomerSchema = createCustomerSchema.fork(
  ['name'],
  (schema) => schema.optional()
);

const idParamSchema = Joi.object({
  id: Joi.string().required(),
});

const listCustomersQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(50),
  search: Joi.string().trim().optional(),
});

const exportCustomersQuerySchema = Joi.object({
  columns: Joi.alternatives().try(
    Joi.array().items(Joi.string().trim()),
    Joi.string().trim()
  ).optional(),
  search: Joi.string().trim().optional(),
});

const importCustomersQuerySchema = Joi.object({
  mode: Joi.string().valid('create', 'upsert').default('create'),
  duplicateCodeAction: Joi.string().valid('stop', 'skip', 'upsert').default('upsert'),
  duplicateContactAction: Joi.string().valid('stop', 'skip', 'upsert').default('upsert'), // phone/email
}).optional();

const deleteCustomersBulkSchema = Joi.object({
  ids: Joi.array().items(Joi.string().required()).min(1).required(),
});

const validateCreateCustomer = validate(createCustomerSchema);
const validateUpdateCustomer = validate(updateCustomerSchema);
const validateCustomerIdParam = validateParams(idParamSchema);
const validateListCustomersQuery = validateQuery(listCustomersQuerySchema);
const validateExportCustomersQuery = validateQuery(exportCustomersQuerySchema);
const validateImportCustomersQuery = validateQuery(importCustomersQuerySchema);
const validateDeleteCustomersBulk = validate(deleteCustomersBulkSchema);

module.exports = {
  validateCreateCustomer,
  validateUpdateCustomer,
  validateCustomerIdParam,
  validateListCustomersQuery,
  validateExportCustomersQuery,
  validateImportCustomersQuery,
  validateDeleteCustomersBulk,
};

