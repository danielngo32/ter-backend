const {
  ProductModel,
  ProductCategoryModel,
  ProductBrandModel,
  ProductAttributeModel,
  ProductAttributeValueModel,
  ProductPromotionModel,
} = require("../schemas/product.schema");

const createProduct = (payload) => ProductModel.create(payload);

const findProductById = (id) => ProductModel.findById(id)
  .populate('categoryId')
  .populate('brandId')
  .populate('createdBy', 'fullName email avatarUrl _id')
  .populate('updatedBy', 'fullName email avatarUrl _id')
  .populate({
    path: 'variants.attributes.attributeId',
    model: 'ProductAttribute'
  })
  .populate({
    path: 'variants.attributes.valueId',
    model: 'ProductAttributeValue'
  });

const findProductBySku = (tenantId, sku) =>
  ProductModel.findOne({ tenantId, sku: sku.trim() });

const findProductByBarcode = async (tenantId, barcode) => {
  const trimmedBarcode = barcode?.trim();
  if (!trimmedBarcode) return null;

  const product = await ProductModel.findOne({
    tenantId,
    $or: [
      { "baseBarcodes.code": trimmedBarcode },
      { "variants.barcodes.code": trimmedBarcode },
    ],
  })
    .populate("categoryId")
    .populate("brandId")
    .populate("createdBy", "fullName email avatarUrl _id")
    .populate("updatedBy", "fullName email avatarUrl _id")
    .populate({
      path: 'variants.attributes.attributeId',
      model: 'ProductAttribute'
    })
    .populate({
      path: 'variants.attributes.valueId',
      model: 'ProductAttributeValue'
    });

  if (!product) return null;

  if (product.hasVariants && product.variants?.length > 0) {
    for (const variant of product.variants) {
      if (variant.barcodes?.some((bc) => bc.code === trimmedBarcode)) {
        return {
          product: {
            _id: product._id,
            name: product.name,
            sku: product.sku,
            categoryId: product.categoryId,
            brandId: product.brandId,
            description: product.description,
            images: product.images,
            status: product.status,
            basePricing: product.basePricing,
            allowSellOutOfStock: product.allowSellOutOfStock,
            hasVariants: product.hasVariants,
            createdAt: product.createdAt,
            updatedAt: product.updatedAt,
            createdBy: product.createdBy,
            updatedBy: product.updatedBy,
          },
          variant: {
            _id: variant._id,
            sku: variant.sku,
            barcodes: variant.barcodes,
            attributes: variant.attributes,
            pricing: variant.pricing,
            inventory: variant.inventory,
            status: variant.status,
            metadata: variant.metadata,
            createdAt: variant.createdAt,
            updatedAt: variant.updatedAt,
          },
          isBase: false,
        };
      }
    }
  }

  if (product.baseBarcodes?.some((bc) => bc.code === trimmedBarcode)) {
    return {
      product: {
        _id: product._id,
        name: product.name,
        sku: product.sku,
            categoryId: product.categoryId,
            brandId: product.brandId,
        description: product.description,
        images: product.images,
            status: product.status,
            basePricing: product.basePricing,
            baseInventory: product.baseInventory,
            baseBarcodes: product.baseBarcodes,
            allowSellOutOfStock: product.allowSellOutOfStock,
        hasVariants: product.hasVariants,
        variants: product.variants,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
        createdBy: product.createdBy,
        updatedBy: product.updatedBy,
          },
      variant: null,
      isBase: true,
    };
  }

  return null;
};

const listProducts = (tenantId, filter = {}, limit = 50, skip = 0) =>
  ProductModel.find({ tenantId, ...filter })
    .populate('categoryId')
    .populate('brandId')
    .populate('createdBy', 'fullName email avatarUrl _id')
    .populate('updatedBy', 'fullName email avatarUrl _id')
    .populate({
      path: 'variants.attributes.attributeId',
      model: 'ProductAttribute'
    })
    .populate({
      path: 'variants.attributes.valueId',
      model: 'ProductAttributeValue'
    })
    .lean()
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

const findProductsForExport = (tenantId, filter = {}) =>
  ProductModel.find({ tenantId, ...filter })
    .populate('categoryId')
    .populate({
      path: 'categoryId',
      populate: { path: 'parentCategoryId' }
    })
    .populate('brandId')
    .populate('createdBy', 'fullName email avatarUrl _id')
    .populate('updatedBy', 'fullName email avatarUrl _id')
    .populate({
      path: 'variants.attributes.attributeId',
      model: 'ProductAttribute'
    })
    .populate({
      path: 'variants.attributes.valueId',
      model: 'ProductAttributeValue'
    })
    .lean()
    .sort({ createdAt: -1 });

const countProducts = (tenantId, filter = {}) =>
  ProductModel.countDocuments({ tenantId, ...filter });

const updateProduct = (id, updates) =>
  ProductModel.findByIdAndUpdate(id, { $set: updates }, { new: true })
    .populate('categoryId')
    .populate('brandId')
    .populate('createdBy', 'fullName email avatarUrl _id')
    .populate('updatedBy', 'fullName email avatarUrl _id')
    .populate({
      path: 'variants.attributes.attributeId',
      model: 'ProductAttribute'
    })
    .populate({
      path: 'variants.attributes.valueId',
      model: 'ProductAttributeValue'
    });

const deleteProduct = (id) => ProductModel.findByIdAndDelete(id);

const createCategory = (payload) => ProductCategoryModel.create(payload);

const findCategoryById = (id) => ProductCategoryModel.findById(id);

const listCategories = (tenantId) =>
  ProductCategoryModel.find({ tenantId }).sort({ name: 1 });

const updateCategory = (id, updates) =>
  ProductCategoryModel.findByIdAndUpdate(id, { $set: updates }, { new: true });

const deleteCategory = (id) => ProductCategoryModel.findByIdAndDelete(id);

const createBrand = (payload) => ProductBrandModel.create(payload);

const findBrandById = (id) => ProductBrandModel.findById(id);

const listBrands = (tenantId) =>
  ProductBrandModel.find({ tenantId }).sort({ name: 1 });

const updateBrand = (id, updates) =>
  ProductBrandModel.findByIdAndUpdate(id, { $set: updates }, { new: true });

const deleteBrand = (id) => ProductBrandModel.findByIdAndDelete(id);

const createPromotion = (payload) => ProductPromotionModel.create(payload);

const findPromotionById = (id) => ProductPromotionModel.findById(id)
  .populate('appliesTo.productIds')
  .populate('appliesTo.categoryIds')
  .populate('appliesTo.brandIds');

const listPromotions = (tenantId, filter = {}) =>
  ProductPromotionModel.find({ tenantId, ...filter })
    .populate('appliesTo.productIds')
    .populate('appliesTo.categoryIds')
    .populate('appliesTo.brandIds')
    .sort({ startAt: -1 });

const updatePromotion = (id, updates) =>
  ProductPromotionModel.findByIdAndUpdate(
    id,
    { $set: updates },
    { new: true }
  )
    .populate('appliesTo.productIds')
    .populate('appliesTo.categoryIds')
    .populate('appliesTo.brandIds');

const deletePromotion = (id) => ProductPromotionModel.findByIdAndDelete(id);

const updateVariantInventory = async (productId, variantId, stockOnHand) => {
  const product = await ProductModel.findById(productId);
  if (!product) return null;
  const variant = product.variants.id(variantId);
  if (!variant) return null;
  variant.inventory.totalOnHand = stockOnHand;
  variant.inventory.warehouses = [{ stockOnHand }];
  await product.save();
  return product;
};

const addVariantInventory = async (productId, variantId, stockOnHand) => {
  const product = await ProductModel.findById(productId);
  if (!product) return null;
  const variant = product.variants.id(variantId);
  if (!variant) return null;
  variant.inventory.totalOnHand = (variant.inventory.totalOnHand || 0) + (stockOnHand || 0);
  variant.inventory.warehouses = [{ stockOnHand: variant.inventory.totalOnHand }];
  await product.save();
  return product;
};

const removeVariantInventory = async (productId, variantId) => {
  const product = await ProductModel.findById(productId);
  if (!product) return null;
  const variant = product.variants.id(variantId);
  if (!variant) return null;
  variant.inventory.totalOnHand = 0;
  variant.inventory.warehouses = [];
  await product.save();
  return product;
};

const createAttribute = (payload) => ProductAttributeModel.create(payload);

const listAttributes = (tenantId, query = {}) => {
  const filter = { tenantId };
  return ProductAttributeModel.find(filter).sort({ name: 1 });
};

const updateAttribute = (id, updates) =>
  ProductAttributeModel.findByIdAndUpdate(id, updates, { new: true });

const deleteAttribute = (id) => ProductAttributeModel.findByIdAndDelete(id);

const createAttributeValue = (payload) => ProductAttributeValueModel.create(payload);

const listAttributeValues = (tenantId, attributeId = null) => {
  const filter = { tenantId };
  if (attributeId) {
    filter.attributeId = attributeId;
  }
  return ProductAttributeValueModel.find(filter)
    .populate('attributeId')
    .sort({ value: 1 });
};

const updateAttributeValue = (id, updates) =>
  ProductAttributeValueModel.findByIdAndUpdate(id, updates, { new: true });

const deleteAttributeValue = (id) => ProductAttributeValueModel.findByIdAndDelete(id);

const deleteAttributeValuesByAttributeId = (attributeId) =>
  ProductAttributeValueModel.deleteMany({ attributeId });

const findAttributeById = (id) => ProductAttributeModel.findById(id);

const findAttributeValueById = (id) => ProductAttributeValueModel.findById(id);

module.exports = {
  createProduct,
  findProductById,
  findProductBySku,
  findProductByBarcode,
  listProducts,
  countProducts,
  updateProduct,
  deleteProduct,
  createCategory,
  findCategoryById,
  listCategories,
  updateCategory,
  deleteCategory,
  createBrand,
  findBrandById,
  listBrands,
  updateBrand,
  deleteBrand,
  createPromotion,
  findPromotionById,
  listPromotions,
  updatePromotion,
  deletePromotion,
  updateVariantInventory,
  addVariantInventory,
  removeVariantInventory,
  findProductsForExport,
  createAttribute,
  listAttributes,
  updateAttribute,
  deleteAttribute,
  createAttributeValue,
  listAttributeValues,
  updateAttributeValue,
  deleteAttributeValue,
  deleteAttributeValuesByAttributeId,
  findAttributeById,
  findAttributeValueById,
};


