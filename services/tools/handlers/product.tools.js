const productRepository = require('../../../data/repositories/product.repository');

const formatVariant = (v) => ({
  id: v._id?.toString(),
  sku: v.sku,
  price: v.pricing?.sale || v.pricing?.cost || 0,
  stock: v.inventory?.totalOnHand || 0,
  attributes: v.attributes?.map((attr) => ({
    attribute: attr.attributeId?.name || '',
    value: attr.valueId?.value || '',
  })) || [],
  status: v.status,
});

const formatCategory = (cat) => (cat ? {
  id: cat._id?.toString(),
  name: cat.name,
} : null);

const formatBrand = (brand) => (brand ? {
  id: brand._id?.toString(),
  name: brand.name,
} : null);

const formatProduct = (p, includeVariants = true) => {
  const basePrice = p.basePricing?.sale || p.basePricing?.cost || 0;
  const baseStock = p.baseInventory?.stockOnHand || 0;

  return {
    id: p._id.toString(),
    name: p.name,
    sku: p.sku,
    price: basePrice,
    stock: baseStock,
    image: p.images?.[0]?.url || null,
    category: formatCategory(p.categoryId),
    brand: formatBrand(p.brandId),
    hasVariants: p.hasVariants || false,
    status: p.status,
    allowSellOutOfStock: p.allowSellOutOfStock || false,
    ...(includeVariants && p.hasVariants && p.variants?.length > 0 && {
      variants: p.variants.map(formatVariant),
    }),
  };
};

const buildProductFilter = (args) => {
  const {
    query,
    categoryId,
    brandId,
    status,
    minPrice,
    maxPrice,
    inStock,
    hasVariants,
  } = args;

  const filter = {};

  if (query && query.trim().length > 0) {
    filter.$or = [
      { name: { $regex: query.trim(), $options: 'i' } },
      { sku: { $regex: query.trim(), $options: 'i' } },
      { 'baseBarcodes.code': query.trim() },
      { 'variants.barcodes.code': query.trim() },
      { 'variants.sku': { $regex: query.trim(), $options: 'i' } },
    ];
  }

  if (categoryId) {
    filter.categoryId = categoryId;
  }

  if (brandId) {
    filter.brandId = brandId;
  }

  if (status) {
    filter.status = status;
  }

  if (hasVariants !== undefined) {
    filter.hasVariants = hasVariants;
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    const priceConditions = [];
    const salePriceCondition = {};
    const costPriceCondition = {};

    if (minPrice !== undefined) {
      salePriceCondition.$gte = minPrice;
      costPriceCondition.$gte = minPrice;
    }
    if (maxPrice !== undefined) {
      salePriceCondition.$lte = maxPrice;
      costPriceCondition.$lte = maxPrice;
    }

    if (Object.keys(salePriceCondition).length > 0) {
      priceConditions.push({ 'basePricing.sale': salePriceCondition });
    }
    if (Object.keys(costPriceCondition).length > 0) {
      priceConditions.push({ 'basePricing.cost': costPriceCondition });
    }

    if (priceConditions.length > 0) {
      filter.$or = filter.$or || [];
      filter.$or.push(...priceConditions);
    }
  }

  if (inStock !== undefined) {
    if (inStock) {
      const stockConditions = [
        { 'baseInventory.stockOnHand': { $gt: 0 } },
        { 'variants.inventory.totalOnHand': { $gt: 0 } },
      ];
      filter.$or = filter.$or || [];
      filter.$or.push(...stockConditions);
    } else {
      filter.$and = filter.$and || [];
      filter.$and.push(
        { 'baseInventory.stockOnHand': { $lte: 0 } },
        {
          $or: [
            { hasVariants: false },
            { 'variants.inventory.totalOnHand': { $lte: 0 } },
          ],
        }
      );
    }
  }

  return filter;
};

const getProductsWithPagination = async (tenantId, filter, limit, skip) => {
  const products = await productRepository.listProducts(tenantId, filter, limit, skip);
  const total = await productRepository.countProducts(tenantId, filter);

  return {
    products: products.map((p) => formatProduct(p)),
    total,
    limit,
    skip,
  };
};

const searchProducts = async (args, context) => {
  const { query, limit = 10, categoryId, brandId } = args;
  const { tenantId } = context;

  if (!tenantId) {
    throw new Error('Tenant ID is required');
  }

  const filter = buildProductFilter({ query, categoryId, brandId });
  const result = await getProductsWithPagination(tenantId, filter, limit, 0);

  return {
    ...result,
    message: `Found ${result.total} product(s)`,
  };
};

const getProductByBarcode = async (args, context) => {
  const { barcode } = args;
  const { tenantId } = context;

  if (!tenantId) {
    throw new Error('Tenant ID is required');
  }

  if (!barcode || barcode.trim().length === 0) {
    return { found: false, message: 'Barcode is required' };
  }

  const result = await productRepository.findProductByBarcode(tenantId, barcode.trim());

  if (!result) {
    return { found: false, message: 'Product not found' };
  }

  const { product, variant, isBase } = result;

  const price = isBase
    ? product.basePricing?.sale || product.basePricing?.cost || 0
    : variant.pricing?.sale || variant.pricing?.cost || 0;

  const stock = isBase
    ? product.baseInventory?.stockOnHand || 0
    : variant.inventory?.totalOnHand || 0;

  return {
    found: true,
    product: {
      ...formatProduct(product, false),
      price,
      stock,
    },
    variant: variant ? formatVariant(variant) : null,
    isBase,
  };
};

const getProductById = async (args, context) => {
  const { productId, variantId } = args;
  const { tenantId } = context;

  if (!tenantId) {
    throw new Error('Tenant ID is required');
  }

  if (!productId) {
    return { found: false, message: 'Product ID is required' };
  }

  const product = await productRepository.findProductById(productId);

  if (!product) {
    return { found: false, message: 'Product not found' };
  }

  if (product.tenantId?.toString() !== tenantId.toString()) {
    return { found: false, message: 'Product not found' };
  }

  let variant = null;
  if (variantId && product.hasVariants && product.variants?.length > 0) {
    variant = product.variants.find((v) => v._id.toString() === variantId);
  }

  const price = variant
    ? variant.pricing?.sale || variant.pricing?.cost || 0
    : product.basePricing?.sale || product.basePricing?.cost || 0;

  const stock = variant
    ? variant.inventory?.totalOnHand || 0
    : product.baseInventory?.stockOnHand || 0;

  return {
    found: true,
    product: {
      ...formatProduct(product),
      price,
      stock,
    },
    variant: variant ? formatVariant(variant) : null,
  };
};

const getProductBySku = async (args, context) => {
  const { sku } = args;
  const { tenantId } = context;

  if (!tenantId) {
    throw new Error('Tenant ID is required');
  }

  if (!sku || sku.trim().length === 0) {
    return { found: false, message: 'SKU is required' };
  }

  const product = await productRepository.findProductBySku(tenantId, sku.trim());

  if (!product) {
    return { found: false, message: 'Product not found' };
  }

  const fullProduct = await productRepository.findProductById(product._id);

  if (!fullProduct) {
    return { found: false, message: 'Product not found' };
  }

  return {
    found: true,
    product: formatProduct(fullProduct),
  };
};

const checkProductStock = async (args, context) => {
  const { productId, variantId, quantity = 1 } = args;
  const { tenantId } = context;

  if (!tenantId) {
    throw new Error('Tenant ID is required');
  }

  if (!productId) {
    return { available: false, message: 'Product ID is required' };
  }

  const product = await productRepository.findProductById(productId);

  if (!product) {
    return { available: false, message: 'Product not found' };
  }

  if (product.tenantId?.toString() !== tenantId.toString()) {
    return { available: false, message: 'Product not found' };
  }

  let stock = 0;
  const allowSellOutOfStock = product.allowSellOutOfStock || false;

  if (variantId && product.hasVariants && product.variants?.length > 0) {
    const variant = product.variants.find((v) => v._id.toString() === variantId);
    if (variant) {
      stock = variant.inventory?.totalOnHand || 0;
    } else {
      return { available: false, message: 'Variant not found' };
    }
  } else {
    stock = product.baseInventory?.stockOnHand || 0;
  }

  const available = allowSellOutOfStock || stock >= quantity;

  return {
    available,
    stock,
    requested: quantity,
    allowSellOutOfStock,
    message: available
      ? `Stock available: ${stock} units`
      : `Insufficient stock: ${stock} units available, ${quantity} requested`,
  };
};

const getCategories = async (args, context) => {
  const { tenantId } = context;

  if (!tenantId) {
    throw new Error('Tenant ID is required');
  }

  const categories = await productRepository.listCategories(tenantId);

  return {
    categories: categories.map((cat) => ({
      id: cat._id.toString(),
      name: cat.name,
      description: cat.description || '',
      parentCategoryId: cat.parentCategoryId?.toString() || null,
    })),
    total: categories.length,
  };
};

const getBrands = async (args, context) => {
  const { tenantId } = context;

  if (!tenantId) {
    throw new Error('Tenant ID is required');
  }

  const brands = await productRepository.listBrands(tenantId);

  return {
    brands: brands.map((brand) => ({
      id: brand._id.toString(),
      name: brand.name,
      description: brand.description || '',
    })),
    total: brands.length,
  };
};

const getActivePromotions = async (args, context) => {
  const { productId, categoryId, brandId } = args;
  const { tenantId } = context;

  if (!tenantId) {
    throw new Error('Tenant ID is required');
  }

  const now = new Date();
  const filter = {
    tenantId,
    startAt: { $lte: now },
    endAt: { $gte: now },
    isActive: true,
  };

  const promotions = await productRepository.listPromotions(tenantId, filter);

  let filteredPromotions = promotions;

  if (productId) {
    filteredPromotions = filteredPromotions.filter((promo) => {
      const appliesTo = promo.appliesTo || {};
      return (
        appliesTo.productIds?.some((id) => id._id?.toString() === productId) ||
        appliesTo.categoryIds?.length > 0 ||
        appliesTo.brandIds?.length > 0 ||
        (!appliesTo.productIds && !appliesTo.categoryIds && !appliesTo.brandIds)
      );
    });
  }

  if (categoryId) {
    filteredPromotions = filteredPromotions.filter((promo) => {
      const appliesTo = promo.appliesTo || {};
      return (
        appliesTo.categoryIds?.some((id) => id._id?.toString() === categoryId) ||
        (!appliesTo.productIds && !appliesTo.categoryIds && !appliesTo.brandIds)
      );
    });
  }

  if (brandId) {
    filteredPromotions = filteredPromotions.filter((promo) => {
      const appliesTo = promo.appliesTo || {};
      return (
        appliesTo.brandIds?.some((id) => id._id?.toString() === brandId) ||
        (!appliesTo.productIds && !appliesTo.categoryIds && !appliesTo.brandIds)
      );
    });
  }

  return {
    promotions: filteredPromotions.map((promo) => ({
      id: promo._id.toString(),
      name: promo.name,
      type: promo.type,
      value: promo.value,
      startAt: promo.startAt,
      endAt: promo.endAt,
      appliesTo: {
        productIds: promo.appliesTo?.productIds?.map((p) => p._id?.toString()) || [],
        categoryIds: promo.appliesTo?.categoryIds?.map((c) => c._id?.toString()) || [],
        brandIds: promo.appliesTo?.brandIds?.map((b) => b._id?.toString()) || [],
      },
    })),
    total: filteredPromotions.length,
  };
};

const listProductsByCategory = async (args, context) => {
  const { categoryId, limit = 50, skip = 0, status } = args;
  const { tenantId } = context;

  if (!tenantId) {
    throw new Error('Tenant ID is required');
  }

  if (!categoryId) {
    return { products: [], total: 0, message: 'Category ID is required' };
  }

  const filter = buildProductFilter({ categoryId, status });
  const result = await getProductsWithPagination(tenantId, filter, limit, skip);

  return {
    ...result,
    message: `Found ${result.total} product(s) in category`,
  };
};

const listProductsByBrand = async (args, context) => {
  const { brandId, limit = 50, skip = 0, status } = args;
  const { tenantId } = context;

  if (!tenantId) {
    throw new Error('Tenant ID is required');
  }

  if (!brandId) {
    return { products: [], total: 0, message: 'Brand ID is required' };
  }

  const filter = buildProductFilter({ brandId, status });
  const result = await getProductsWithPagination(tenantId, filter, limit, skip);

  return {
    ...result,
    message: `Found ${result.total} product(s) for brand`,
  };
};

const listProducts = async (args, context) => {
  const {
    categoryId,
    brandId,
    status,
    minPrice,
    maxPrice,
    inStock,
    hasVariants,
    limit = 50,
    skip = 0,
  } = args;
  const { tenantId } = context;

  if (!tenantId) {
    throw new Error('Tenant ID is required');
  }

  const filter = buildProductFilter({
    categoryId,
    brandId,
    status,
    minPrice,
    maxPrice,
    inStock,
    hasVariants,
  });

  const result = await getProductsWithPagination(tenantId, filter, limit, skip);

  return {
    ...result,
    message: `Found ${result.total} product(s)`,
  };
};

const findCategoryByName = async (args, context) => {
  const { name } = args;
  const { tenantId } = context;

  if (!tenantId) {
    throw new Error('Tenant ID is required');
  }

  if (!name || name.trim().length === 0) {
    return { found: false, message: 'Category name is required' };
  }

  const categories = await productRepository.listCategories(tenantId);
  const category = categories.find(
    (cat) => cat.name.toLowerCase().trim() === name.toLowerCase().trim()
  );

  if (!category) {
    return { found: false, message: 'Category not found' };
  }

  return {
    found: true,
    category: {
      id: category._id.toString(),
      name: category.name,
      description: category.description || '',
      parentCategoryId: category.parentCategoryId?.toString() || null,
    },
  };
};

const findBrandByName = async (args, context) => {
  const { name } = args;
  const { tenantId } = context;

  if (!tenantId) {
    throw new Error('Tenant ID is required');
  }

  if (!name || name.trim().length === 0) {
    return { found: false, message: 'Brand name is required' };
  }

  const brands = await productRepository.listBrands(tenantId);
  const brand = brands.find(
    (b) => b.name.toLowerCase().trim() === name.toLowerCase().trim()
  );

  if (!brand) {
    return { found: false, message: 'Brand not found' };
  }

  return {
    found: true,
    brand: {
      id: brand._id.toString(),
      name: brand.name,
      description: brand.description || '',
    },
  };
};

const findProductVariantByAttributes = async (args, context) => {
  const { productId, attributeValues } = args;
  const { tenantId } = context;

  if (!tenantId) {
    throw new Error('Tenant ID is required');
  }

  if (!productId) {
    return { found: false, message: 'Product ID is required' };
  }

  if (!attributeValues || !Array.isArray(attributeValues) || attributeValues.length === 0) {
    return { found: false, message: 'Attribute values are required' };
  }

  const product = await productRepository.findProductById(productId);

  if (!product) {
    return { found: false, message: 'Product not found' };
  }

  if (product.tenantId?.toString() !== tenantId.toString()) {
    return { found: false, message: 'Product not found' };
  }

  if (!product.hasVariants || !product.variants || product.variants.length === 0) {
    return { found: false, message: 'Product has no variants' };
  }

  const normalizedValues = attributeValues.map((av) => ({
    attribute: (av.attribute || '').toLowerCase().trim(),
    value: (av.value || '').toLowerCase().trim(),
  }));

  const matchingVariant = product.variants.find((variant) => {
    if (!variant.attributes || variant.attributes.length === 0) {
      return false;
    }

    return normalizedValues.every((nv) => {
      return variant.attributes.some((attr) => {
        const attrName = (attr.attributeId?.name || '').toLowerCase().trim();
        const attrValue = (attr.valueId?.value || '').toLowerCase().trim();
        return attrName === nv.attribute && attrValue === nv.value;
      });
    });
  });

  if (!matchingVariant) {
    return {
      found: false,
      message: 'Variant not found with specified attributes',
      product: formatProduct(product, true),
    };
  }

  const price = matchingVariant.pricing?.sale || matchingVariant.pricing?.cost || 0;
  const stock = matchingVariant.inventory?.totalOnHand || 0;

  return {
    found: true,
    product: formatProduct(product, false),
    variant: formatVariant(matchingVariant),
    variantId: matchingVariant._id.toString(),
    price,
    stock,
  };
};

module.exports = {
  searchProducts,
  getProductByBarcode,
  getProductById,
  getProductBySku,
  checkProductStock,
  getCategories,
  getBrands,
  getActivePromotions,
  listProductsByCategory,
  listProductsByBrand,
  listProducts,
  findCategoryByName,
  findBrandByName,
  findProductVariantByAttributes,
};
