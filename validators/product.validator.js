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

const barcodeSchema = Joi.object({
  code: Joi.string().trim().required(),
  isPrimary: Joi.boolean().default(false),
});

const variantInventorySchema = Joi.object({
  stockOnHand: Joi.number().min(0).default(0),
});

const variantAttributeSchema = Joi.object({
  attributeId: Joi.string().required(),
  valueId: Joi.string().required(),
});

const imageSchema = Joi.object({
  url: Joi.string().uri().required(),
  isPrimary: Joi.boolean().default(false),
});

const variantSchema = Joi.object({
  sku: Joi.string().trim().required(),
  barcodes: Joi.array().items(barcodeSchema).default([]),
  attributes: Joi.array().items(variantAttributeSchema).default([]),
  pricing: Joi.object({
    cost: Joi.number().min(0).default(0),
    sale: Joi.number().min(0).default(0),
    currency: Joi.string().trim().default('VND'),
  }).default({}),
  inventory: Joi.object({
    totalOnHand: Joi.number().min(0).default(0),
    warehouses: Joi.array().items(variantInventorySchema).default([]),
  }).default({}),
  status: Joi.string().valid('active', 'inactive').default('active'),
  metadata: Joi.object().default({}),
});

const createProductSchema = Joi.object({
  name: Joi.string().trim().min(1).max(200).required(),
  sku: Joi.string().trim().min(1).max(100).required(),
  categoryId: Joi.string().allow(null, '').optional(),
  brandId: Joi.string().allow(null, '').optional(),
  description: Joi.string().trim().max(5000).allow(null, '').optional(),
  images: Joi.array().items(imageSchema).default([]),
  baseBarcodes: Joi.array().items(barcodeSchema).default([]),
  basePricing: Joi.object({
    cost: Joi.number().min(0).default(0),
    sale: Joi.number().min(0).default(0),
    currency: Joi.string().trim().default('VND'),
  }).default({}),
  baseInventory: Joi.object({
    stockOnHand: Joi.number().min(0).default(0),
  }).default({}),
  allowSellOutOfStock: Joi.boolean().default(false),
  hasVariants: Joi.boolean().default(false),
  variants: Joi.array().items(variantSchema).default([]),
  status: Joi.string().valid('draft', 'active', 'inactive').default('active'),
});

const updateProductSchema = Joi.object({
  name: Joi.string().trim().min(1).max(200).optional(),
  sku: Joi.string().trim().min(1).max(100).optional(),
  categoryId: Joi.string().allow(null, '').optional(),
  brandId: Joi.string().allow(null, '').optional(),
  description: Joi.string().trim().max(5000).allow(null, '').optional(),
  images: Joi.array().items(imageSchema).optional(),
  baseBarcodes: Joi.array().items(barcodeSchema).optional(),
  basePricing: Joi.object({
    cost: Joi.number().min(0).default(0),
    sale: Joi.number().min(0).default(0),
    currency: Joi.string().trim().default('VND'),
  }).optional(),
  baseInventory: Joi.object({
    stockOnHand: Joi.number().min(0).default(0),
  }).optional(),
  allowSellOutOfStock: Joi.boolean().optional(),
  hasVariants: Joi.boolean().optional(),
  variants: Joi.array().items(variantSchema).optional(),
  status: Joi.string().valid('draft', 'active', 'inactive').optional(),
});

const productIdParamSchema = Joi.object({
  id: Joi.string().required(),
});

const deleteProductsBulkSchema = Joi.object({
  ids: Joi.array().items(Joi.string().required()).min(1).required(),
});

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

const barcodeQuerySchema = Joi.object({
  barcode: Joi.string().trim().required(),
});

const barcodePathParamSchema = Joi.object({
  barcode: Joi.string().trim().required(),
});

const listProductsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(50),
  status: Joi.string().valid('draft', 'active', 'inactive').optional(),
  categoryId: Joi.string().optional(),
  brandId: Joi.string().optional(),
  search: Joi.string().trim().optional(),
});

const exportProductsQuerySchema = Joi.object({
  columns: Joi.alternatives().try(
    Joi.array().items(Joi.string().trim()),
    Joi.string().trim()
  ).optional(),
  filterMode: Joi.string().valid('and', 'or').default('and'),
  filters: Joi.alternatives().try(Joi.string(), Joi.array().items(Joi.object())).optional(),
  status: Joi.string().valid('draft', 'active', 'inactive').optional(),
  categoryId: Joi.string().optional(),
  brandId: Joi.string().optional(),
  search: Joi.string().trim().optional(),
});

const listInventoryQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(50),
  sku: Joi.string().trim().optional(),
  variantSku: Joi.string().trim().optional(),
  barcode: Joi.string().trim().optional(),
  variantBarcode: Joi.string().trim().optional(),
  warehouseId: Joi.string().trim().optional(),
  search: Joi.string().trim().optional(),
});

const exportInventoryQuerySchema = Joi.object({
  columns: Joi.alternatives().try(
    Joi.array().items(Joi.string().trim()),
    Joi.string().trim()
  ).optional(),
  sku: Joi.string().trim().optional(),
  variantSku: Joi.string().trim().optional(),
  barcode: Joi.string().trim().optional(),
  variantBarcode: Joi.string().trim().optional(),
  warehouseId: Joi.string().trim().optional(),
  search: Joi.string().trim().optional(),
});

const bulkInventorySchema = Joi.object({
  mode: Joi.string().valid('set', 'increment', 'decrement').default('set'),
  applyTo: Joi.string().valid('base', 'variant', 'mixed').default('mixed'),
  items: Joi.array().items(
    Joi.object({
      productId: Joi.string().optional(),
      productName: Joi.string().optional(),
      sku: Joi.string().optional(),
      barcode: Joi.string().optional(),
      variantSku: Joi.string().optional(),
      variantBarcode: Joi.string().optional(),
      stockOnHand: Joi.number().required(),
      mode: Joi.string().valid('set', 'increment', 'decrement').optional(),
      applyTo: Joi.string().valid('base', 'variant', 'mixed').optional(),
    }).custom((value, helpers) => {
      if (!value.productId && !value.sku && !value.barcode && !value.productName) {
        return helpers.error('any.required', { message: 'Product identifier is required (productId/sku/barcode/productName)' });
      }
      return value;
    })
  ).min(1).required(),
});

const createCategorySchema = Joi.object({
  name: Joi.string().trim().min(1).max(200).required(),
  parentCategoryId: Joi.string().allow(null, '').optional(),
});

const updateCategorySchema = createCategorySchema.fork(['name'], (schema) => schema.optional());

const createBrandSchema = Joi.object({
  name: Joi.string().trim().min(1).max(200).required(),
});

const updateBrandSchema = createBrandSchema.fork(['name'], (schema) => schema.optional());

const createPromotionSchema = Joi.object({
  name: Joi.string().trim().min(1).max(200).required(),
  description: Joi.string().trim().max(5000).allow(null, '').optional(),
  type: Joi.string().valid('percentage', 'fixed_amount').default('percentage'),
  value: Joi.number().min(0).required(),
  startAt: Joi.date().required(),
  endAt: Joi.date().greater(Joi.ref('startAt')).required(),
  isActive: Joi.boolean().default(true),
  appliesTo: Joi.object({
    productIds: Joi.array().items(Joi.string()).default([]),
    categoryIds: Joi.array().items(Joi.string()).default([]),
    brandIds: Joi.array().items(Joi.string()).default([]),
    tags: Joi.array().items(Joi.string().trim()).default([]),
  }).default({}),
  conditions: Joi.object({
    minOrderAmount: Joi.number().min(0).default(0),
    maxOrderAmount: Joi.number().min(0).optional(),
    minQuantity: Joi.number().integer().min(0).default(0),
  }).default({}),
});

const updatePromotionSchema = createPromotionSchema.fork(['name', 'startAt', 'endAt'], (schema) => schema.optional());

const idParamSchema = Joi.object({
  id: Joi.string().required(),
});

const listCategoriesQuerySchema = Joi.object({
  isActive: Joi.boolean().optional(),
  parentCategoryId: Joi.string().allow(null, '').optional(),
});

const listBrandsQuerySchema = Joi.object({});

const listPromotionsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(50),
  isActive: Joi.boolean().optional(),
  startAt: Joi.date().optional(),
  endAt: Joi.date().optional(),
});

const validateCreateProduct = validate(createProductSchema);
const validateUpdateProduct = validate(updateProductSchema);
const validateProductIdParam = validateParams(productIdParamSchema);
const validateDeleteProductsBulk = validate(deleteProductsBulkSchema);
const validateBarcodeQuery = validateQuery(barcodeQuerySchema);
const validateBarcodePathParam = validateParams(barcodePathParamSchema);
const validateListProductsQuery = validateQuery(listProductsQuerySchema);
const validateExportProductsQuery = validateQuery(exportProductsQuerySchema);

const validateCreateCategory = validate(createCategorySchema);
const validateUpdateCategory = validate(updateCategorySchema);
const validateCategoryIdParam = validateParams(idParamSchema);
const validateListCategoriesQuery = validateQuery(listCategoriesQuerySchema);

const validateCreateBrand = validate(createBrandSchema);
const validateUpdateBrand = validate(updateBrandSchema);
const validateBrandIdParam = validateParams(idParamSchema);
const validateListBrandsQuery = validateQuery(listBrandsQuerySchema);

const validateCreatePromotion = validate(createPromotionSchema);
const validateUpdatePromotion = validate(updatePromotionSchema);
const validatePromotionIdParam = validateParams(idParamSchema);
const validateListPromotionsQuery = validateQuery(listPromotionsQuerySchema);

const updateVariantInventorySchema = Joi.object({
  stockOnHand: Joi.number().min(0).optional(),
});

const addVariantInventorySchema = Joi.object({
  stockOnHand: Joi.number().min(0).default(0),
});

const variantIdParamSchema = Joi.object({
  productId: Joi.string().required(),
  variantId: Joi.string().required(),
});

const inventoryIdParamSchema = Joi.object({
  productId: Joi.string().required(),
  variantId: Joi.string().required(),
  inventoryId: Joi.string().required(),
});

const validateUpdateVariantInventory = validate(updateVariantInventorySchema);
const validateAddVariantInventory = validate(addVariantInventorySchema);
const validateVariantIdParam = validateParams(variantIdParamSchema);
const validateInventoryIdParam = validateParams(inventoryIdParamSchema);

const createAttributeSchema = Joi.object({
  name: Joi.string().trim().min(1).max(200).required(),
});

const updateAttributeSchema = createAttributeSchema.fork(['name'], (schema) => schema.optional());

const attributeIdParamSchema = Joi.object({
  id: Joi.string().required(),
});

const createAttributeValueSchema = Joi.object({
  attributeId: Joi.string().required(),
  value: Joi.string().trim().min(1).max(200).required(),
});

const updateAttributeValueSchema = createAttributeValueSchema.fork(['value'], (schema) => schema.optional());

const attributeValueIdParamSchema = Joi.object({
  id: Joi.string().required(),
});

const listAttributeValuesQuerySchema = Joi.object({
  attributeId: Joi.string().allow(null, '').optional(),
});

const validateCreateAttribute = validate(createAttributeSchema);
const validateUpdateAttribute = validate(updateAttributeSchema);
const validateAttributeIdParam = validateParams(attributeIdParamSchema);
const validateCreateAttributeValue = validate(createAttributeValueSchema);
const validateUpdateAttributeValue = validate(updateAttributeValueSchema);
const validateAttributeValueIdParam = validateParams(attributeValueIdParamSchema);
const validateListAttributeValuesQuery = validateQuery(listAttributeValuesQuerySchema);
const validateListInventoryQuery = validateQuery(listInventoryQuerySchema);
const validateExportInventoryQuery = validateQuery(exportInventoryQuerySchema);
const validateBulkInventory = validate(bulkInventorySchema);

module.exports = {
  validateCreateProduct,
  validateUpdateProduct,
  validateProductIdParam,
  validateDeleteProductsBulk,
  validateBarcodeQuery,
  validateBarcodePathParam,
  validateListProductsQuery,
  validateCreateCategory,
  validateUpdateCategory,
  validateCategoryIdParam,
  validateListCategoriesQuery,
  validateCreateBrand,
  validateUpdateBrand,
  validateBrandIdParam,
  validateListBrandsQuery,
  validateCreatePromotion,
  validateUpdatePromotion,
  validatePromotionIdParam,
  validateListPromotionsQuery,
  validateUpdateVariantInventory,
  validateAddVariantInventory,
  validateVariantIdParam,
  validateInventoryIdParam,
  validateCreateAttribute,
  validateUpdateAttribute,
  validateAttributeIdParam,
  validateCreateAttributeValue,
  validateUpdateAttributeValue,
  validateAttributeValueIdParam,
  validateListAttributeValuesQuery,
  validateExportProductsQuery,
  validateListInventoryQuery,
  validateExportInventoryQuery,
  validateBulkInventory,
};

