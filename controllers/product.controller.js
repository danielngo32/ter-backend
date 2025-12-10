const multer = require('multer');
const https = require('https');
const http = require('http');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const { Readable } = require('stream');
const productRepository = require('../data/repositories/product.repository');
const userRepository = require('../data/repositories/user.repository');
const tenantRepository = require('../data/repositories/tenant.repository');
const ApiError = require('../utils/apiError');
const authHelper = require('../utils/authHelper');
const { generateFileName, getStoragePath, uploadFile, deleteFile, extractKeyFromUrl } = require('../utils/storageHelper');

const imageFileFilter = (req, file, cb) => {
  const allowedMimes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
  ];
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new ApiError(400, `File type ${file.mimetype} is not allowed. Only images are allowed.`), false);
  }
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB
  },
  fileFilter: imageFileFilter,
});

const importFileFilter = (req, file, cb) => {
  const allowedMimes = [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ];
  
  if (allowedMimes.includes(file.mimetype) || file.originalname.endsWith('.csv') || file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls')) {
    cb(null, true);
  } else {
    cb(new ApiError(400, `File type ${file.mimetype} is not allowed. Only CSV and Excel files are allowed.`), false);
  }
};

const uploadImport = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: importFileFilter,
});

const getCurrentUserId = (req) => {
  const token = req.cookies.accessToken || (req.headers.authorization ? req.headers.authorization.split(' ')[1] : null);
  if (!token) {
    throw new ApiError(401, 'Authorization token missing');
  }
  return authHelper.getCurrentUserId(token);
};

const checkProductAccess = async (userId, tenantId, requiredRole = 'admin') => {
  const user = await userRepository.findById(userId);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  if (user.tenantId?.toString() !== tenantId?.toString()) {
    throw new ApiError(403, 'Access denied');
  }

  const tenant = await tenantRepository.findTenantById(tenantId);
  if (!tenant) {
    throw new ApiError(404, 'Tenant not found');
  }

  const isOwner = tenant.ownerId?.toString() === userId.toString();
  const isAdmin = user.role === 'admin';
  const isMember = user.role === 'member';

  if (requiredRole === 'owner' && !isOwner) {
    throw new ApiError(403, 'Owner access required');
  }

  if (requiredRole === 'admin' && !isOwner && !isAdmin) {
    throw new ApiError(403, 'Admin or owner access required');
  }

  return { user, tenant, isOwner, isAdmin, isMember };
};

const checkBarcodeUnique = async (tenantId, barcode, excludeProductId = null) => {
  const result = await productRepository.findProductByBarcode(tenantId, barcode);
  if (result && (!excludeProductId || result.product._id.toString() !== excludeProductId.toString())) {
    throw new ApiError(400, `Barcode ${barcode} already exists`);
  }
};

const checkSkuUnique = async (tenantId, sku, excludeProductId = null) => {
  const product = await productRepository.findProductBySku(tenantId, sku);
  if (product && (!excludeProductId || product._id.toString() !== excludeProductId.toString())) {
    throw new ApiError(400, `SKU ${sku} already exists`);
  }
};

const checkVariantSkuUnique = async (productId, sku, excludeVariantId = null) => {
  const product = await productRepository.findProductById(productId);
  if (!product) {
    throw new ApiError(404, 'Product not found');
  }
  
  if (product.variants && product.variants.length > 0) {
    const existingVariant = product.variants.find(
      (v) => v.sku === sku.trim() && 
      (!excludeVariantId || v._id.toString() !== excludeVariantId.toString())
    );
    if (existingVariant) {
      throw new ApiError(400, `Variant SKU ${sku} already exists in this product`);
    }
  }
};

const uploadProductImages = async (files, tenantId, productId, isFirstBatch = false) => {
  if (!files || files.length === 0) return [];

  const uploadedImages = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fileName = generateFileName(file.originalname);
    const key = getStoragePath(tenantId, 'product_image', {
      productId: productId.toString(),
      fileName,
    });

    const url = await uploadFile(file.buffer, key, file.mimetype);
    uploadedImages.push({
      url,
      isPrimary: isFirstBatch && i === 0,
    });
  }

  return uploadedImages;
};

const deleteProductImages = async (images) => {
  if (!images || images.length === 0) return;
  
  const imageUrls = images.map(img => typeof img === 'string' ? img : img.url);

  for (const url of imageUrls) {
    try {
      const key = extractKeyFromUrl(url);
      if (key) {
        await deleteFile(key);
      }
    } catch (error) {
      console.error(`Failed to delete image ${url}:`, error.message);
    }
  }
};

const downloadImage = (url) => {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download image: ${response.statusCode}`));
        return;
      }

      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const contentType = response.headers['content-type'] || 'image/jpeg';
        resolve({ buffer, contentType });
      });
      response.on('error', reject);
    }).on('error', reject);
  });
};

const resolveProductOrVariant = async (tenantId, identifiers) => {
  const { productId, productName, sku, barcode, variantBarcode, variantSku } = identifiers || {};

  // Priority: variantBarcode -> barcode -> sku -> productId -> productName
  if (variantBarcode) {
    const res = await productRepository.findProductByBarcode(tenantId, variantBarcode);
    if (res && res.variant) {
      return { product: res.product || res, variant: res.variant, isBase: false };
    }
  }

  if (barcode) {
    const res = await productRepository.findProductByBarcode(tenantId, barcode);
    if (res) {
      return { product: res.product || res, variant: res.variant || null, isBase: res.isBase !== false };
    }
  }

  if (sku) {
    const product = await productRepository.findProductBySku(tenantId, sku);
    if (product) {
      return { product, variant: null, isBase: true };
    }
    // try variant sku
    if (variantSku) {
      const prod = await productRepository.listProducts(tenantId, { "variants.sku": variantSku }, 1, 0);
      if (prod && prod.length > 0) {
        const product = prod[0];
        const variant = product.variants.find(v => v.sku === variantSku);
        if (variant) return { product, variant, isBase: false };
      }
    }
  }

  if (productId) {
    const product = await productRepository.findProductById(productId);
    if (product && product.tenantId.toString() === tenantId.toString()) {
      return { product, variant: null, isBase: true };
    }
  }

  if (productName) {
    const products = await productRepository.listProducts(tenantId, { name: { $regex: productName, $options: 'i' } }, 1, 0);
    if (products && products.length > 0) {
      return { product: products[0], variant: null, isBase: true };
    }
  }

  return null;
};

const resolveWarehouse = async () => null;

const applyInventoryUpdate = (product, variant, warehouseId, stockOnHand, mode) => {
  if (variant) {
    const current = variant.inventory?.totalOnHand || 0;
    let next = stockOnHand;
    if (mode === 'increment') next = current + stockOnHand;
    if (mode === 'decrement') next = Math.max(0, current - stockOnHand);
    variant.inventory = {
      totalOnHand: next,
      warehouses: [{ stockOnHand: next }],
    };
  } else {
    const current = product.baseInventory?.stockOnHand || 0;
    let next = stockOnHand;
    if (mode === 'increment') next = current + stockOnHand;
    if (mode === 'decrement') next = Math.max(0, current - stockOnHand);
    product.baseInventory = { stockOnHand: next };
  }
};

/**
 * Inventory listing & export helpers
 */
const flattenInventoryRows = (products) => {
  const rows = [];
  products.forEach((prod) => {
    // Base inventory
    const baseStock = prod.baseInventory?.stockOnHand ?? 0;
    rows.push({
      productId: prod._id?.toString(),
      productName: prod.name,
      sku: prod.sku,
      barcode: prod.baseBarcodes?.[0]?.code || '',
      variantSku: '',
      variantBarcode: '',
      warehouseId: '',
      warehouseName: '',
      warehouseCode: '',
      stockOnHand: baseStock,
      isVariant: false,
      brandName: prod.brandId?.name || '',
      categoryName: prod.categoryId?.name || '',
      status: prod.status,
      updatedAt: prod.updatedAt,
    });

    // Variant inventory
    if (prod.hasVariants && Array.isArray(prod.variants)) {
      prod.variants.forEach((v) => {
        const total = v.inventory?.totalOnHand ?? 0;
        rows.push({
          productId: prod._id?.toString(),
          productName: prod.name,
          sku: prod.sku,
          barcode: prod.baseBarcodes?.[0]?.code || '',
          variantSku: v.sku,
          variantBarcode: v.barcodes?.[0]?.code || '',
          warehouseId: '',
          warehouseName: '',
          warehouseCode: '',
          stockOnHand: total,
          isVariant: true,
          brandName: prod.brandId?.name || '',
          categoryName: prod.categoryId?.name || '',
          status: v.status || prod.status,
          updatedAt: v.updatedAt || prod.updatedAt,
        });
      });
    }
  });
  return rows;
};

const filterInventoryRows = (rows, filters) => {
  return rows.filter((r) => {
    if (filters.sku && r.sku?.toLowerCase() !== filters.sku.toLowerCase()) return false;
    if (filters.variantSku && r.variantSku?.toLowerCase() !== filters.variantSku.toLowerCase()) return false;
    if (filters.barcode && r.barcode?.toLowerCase() !== filters.barcode.toLowerCase()) return false;
    if (filters.variantBarcode && r.variantBarcode?.toLowerCase() !== filters.variantBarcode.toLowerCase()) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const hit =
        (r.productName && r.productName.toLowerCase().includes(q)) ||
        (r.sku && r.sku.toLowerCase().includes(q)) ||
        (r.variantSku && r.variantSku.toLowerCase().includes(q)) ||
        (r.barcode && r.barcode.toLowerCase().includes(q)) ||
        (r.variantBarcode && r.variantBarcode.toLowerCase().includes(q));
      if (!hit) return false;
    }
    return true;
  });
};

const listInventory = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }
    await checkProductAccess(userId, user.tenantId, 'admin');

    const {
      page = 1,
      limit = 50,
      sku,
      variantSku,
      barcode,
      variantBarcode,
      search,
    } = req.query;

    const filter = { tenantId: user.tenantId };
    const products = await productRepository.findProductsForExport(user.tenantId, filter);
    const rows = flattenInventoryRows(products);
    const filtered = filterInventoryRows(rows, { sku, variantSku, barcode, variantBarcode, search });

    const p = parseInt(page) || 1;
    const l = Math.min(parseInt(limit) || 50, 200);
    const start = (p - 1) * l;
    const paged = filtered.slice(start, start + l);

    res.json({
      items: paged,
      pagination: {
        page: p,
        limit: l,
        total: filtered.length,
        totalPages: Math.ceil(filtered.length / l),
      },
    });
  } catch (error) {
    next(error);
  }
};

const exportInventory = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }
    await checkProductAccess(userId, user.tenantId, 'admin');

    const {
      sku,
      variantSku,
      barcode,
      variantBarcode,
      search,
      columns,
    } = req.query;

    const filter = { tenantId: user.tenantId };
    const products = await productRepository.findProductsForExport(user.tenantId, filter);
    const rows = flattenInventoryRows(products);
    const filtered = filterInventoryRows(rows, { sku, variantSku, barcode, variantBarcode, search });

    const allColumns = [
      'productId',
      'productName',
      'sku',
      'barcode',
      'variantSku',
      'variantBarcode',
      'stockOnHand',
      'brandName',
      'categoryName',
      'status',
      'updatedAt',
    ];

    let cols = allColumns;
    if (columns) {
      if (Array.isArray(columns)) {
        cols = columns.filter((c) => allColumns.includes(c));
      } else if (typeof columns === 'string') {
        cols = columns.split(',').map((c) => c.trim()).filter((c) => allColumns.includes(c));
      }
      if (cols.length === 0) cols = allColumns;
    }

    const data = filtered.map((r) => {
      const o = {};
      cols.forEach((c) => {
        o[c] = r[c] !== undefined ? r[c] : '';
      });
      return o;
    });

    const worksheet = xlsx.utils.json_to_sheet(data);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Inventory');
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="inventory-export.xlsx"');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

const bulkUpdateInventory = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }
    await checkProductAccess(userId, user.tenantId, 'admin');

    const { items = [], applyTo = 'mixed', mode = 'set' } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      throw new ApiError(400, 'Items is required');
    }
    const normalizedMode = (mode || 'set').toLowerCase();
    if (!['set', 'increment', 'decrement'].includes(normalizedMode)) {
      throw new ApiError(400, 'Invalid mode (set|increment|decrement)');
    }

    const warehouses = await tenantRepository.getWarehouses(user.tenantId);

    const results = {
      total: items.length,
      success: 0,
      failed: 0,
      errors: [],
    };

    const decideApplyTo = (rowApplyTo, product, hasVariantResolved) => {
      const val = (rowApplyTo || applyTo || 'mixed').toLowerCase();
      if (!['base', 'variant', 'mixed'].includes(val)) return 'mixed';
      if (!product.hasVariants && val === 'variant') {
        throw new Error('Product has no variants, cannot apply to variant');
      }
      if (product.hasVariants && val === 'variant' && !hasVariantResolved) {
        throw new Error('Product has variants, please provide variantBarcode or variantSku');
      }
      return val;
    };

    for (let i = 0; i < items.length; i++) {
      const row = items[i];
      try {
        const resolved = await resolveProductOrVariant(user.tenantId, {
          productId: row.productId,
          productName: row.productName,
          sku: row.sku,
          variantSku: row.variantSku,
          barcode: row.barcode,
          variantBarcode: row.variantBarcode,
        });
        if (!resolved || !resolved.product) {
          throw new Error(`Row ${i + 1}: Product not found`);
        }

        const stockVal = parseFloat(row.stockOnHand);
        if (isNaN(stockVal)) {
          throw new Error(`Row ${i + 1}: Invalid stock value`);
        }
        const rowMode = (row.mode || normalizedMode).toLowerCase();
        if (!['set', 'increment', 'decrement'].includes(rowMode)) {
          throw new Error(`Row ${i + 1}: Invalid mode (set|increment|decrement)`);
        }

        const target = decideApplyTo(row.applyTo, resolved.product, !!resolved.variant);
        let targetVariant = resolved.variant;
        if (target === 'variant') {
          if (!targetVariant) {
            throw new Error(`Row ${i + 1}: Product has variants, please provide variantBarcode or variantSku`);
          }
        } else if (target === 'base') {
          targetVariant = null;
        } else {
          targetVariant = resolved.variant || null;
        }

        applyInventoryUpdate(resolved.product, targetVariant, null, stockVal, rowMode);
        await resolved.product.save();
        results.success++;
      } catch (err) {
        results.failed++;
        results.errors.push(err.message);
      }
    }

    res.json({
      success: true,
      message: `Bulk update: ${results.success} success, ${results.failed} failed`,
      data: results,
    });
  } catch (error) {
    next(error);
  }
};

const generateInventorySample = async (req, res, next) => {
  try {
    const baseOnly = [
      {
        productId: '64b1c2...',
        productName: 'Base product no variant',
        sku: 'BASE001',
        barcode: '8931234567000',
        stockOnHand: 50,
        mode: 'set',
        applyTo: 'base', // base | variant | mixed
      },
    ];

    const variantOnly = [
      {
        productId: '64b1c2...',
        productName: 'Product with variants',
        sku: 'SP001',
        barcode: '8931234567890',
        variantSku: 'SP001-001',
        variantBarcode: '8931234567891',
        stockOnHand: 30,
        mode: 'increment',
        applyTo: 'variant',
      },
    ];

    const mixed = [
      {
        productId: '64b1c2...',
        productName: 'Product with variants',
        sku: 'SP001',
        barcode: '8931234567890',
        stockOnHand: 5,
        mode: 'decrement',
        applyTo: 'base',
      },
      {
        productId: '64b1c2...',
        productName: 'Product with variants',
        sku: 'SP001',
        barcode: '8931234567890',
        variantSku: 'SP001-002',
        variantBarcode: '8931234567892',
        stockOnHand: 40,
        mode: 'set',
        applyTo: 'variant',
      },
    ];

    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(baseOnly), 'BaseOnly');
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(variantOnly), 'VariantOnly');
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(mixed), 'Mixed');

    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="inventory-import-sample.xlsx"');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

const importInventory = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }
    await checkProductAccess(userId, user.tenantId, 'admin');

    if (!req.file) {
      throw new ApiError(400, 'No file uploaded');
    }

    const defaultApplyTo = (req.body.applyTo || 'mixed').toLowerCase(); // base | variant | mixed
    const defaultMode = (req.body.mode || 'set').toLowerCase(); // set|increment|decrement
    if (!['set', 'increment', 'decrement'].includes(defaultMode)) {
      throw new ApiError(400, 'Invalid mode (set|increment|decrement)');
    }

    const file = req.file;
    let rows = [];
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      const parsed = await parseCSV(file.buffer);
      rows = parsed.map((r) => ({ ...r, _applyTo: defaultApplyTo, _sheet: 'CSV' }));
    } else if (file.mimetype.includes('excel') || file.mimetype.includes('spreadsheet') || file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls')) {
      const workbook = xlsx.read(file.buffer, { type: 'buffer' });
      workbook.SheetNames.forEach((sheetName) => {
        const sheetRows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName] || {});
        const inferredApply =
          sheetName.toLowerCase().includes('variant') ? 'variant' :
          sheetName.toLowerCase().includes('base') ? 'base' : 'mixed';
        sheetRows.forEach((r) => rows.push({ ...r, _applyTo: inferredApply, _sheet: sheetName }));
      });
    } else {
      throw new ApiError(400, 'Unsupported file format. Only CSV and Excel files are supported.');
    }

    if (!rows || rows.length === 0) {
      throw new ApiError(400, 'File is empty or could not be parsed');
    }

    const results = {
      total: rows.length,
      success: 0,
      failed: 0,
      errors: [],
    };

    const decideApplyTo = (rowApplyTo, product, hasVariantResolved) => {
      const val = (rowApplyTo || defaultApplyTo || 'mixed').toLowerCase();
      if (!['base', 'variant', 'mixed'].includes(val)) return 'mixed';
      if (!product.hasVariants && val === 'variant') {
        throw new Error('Product has no variants, cannot apply to variant');
      }
      if (product.hasVariants && val === 'variant' && !hasVariantResolved) {
        throw new Error('Product has variants, please provide variantBarcode or variantSku');
      }
      if (product.hasVariants && val === 'base' && hasVariantResolved) {
        return 'base';
      }
      return val;
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const resolved = await resolveProductOrVariant(user.tenantId, {
          productId: row.productId || row.ProductId,
          productName: row.productName || row.ProductName,
          sku: row.sku || row.SKU,
          variantSku: row.variantSku || row.VariantSku,
          barcode: row.barcode || row.Barcode,
          variantBarcode: row.variantBarcode || row.VariantBarcode,
        });
        if (!resolved || !resolved.product) {
          throw new Error(`Row ${i + 1}: Product not found`);
        }

        const stockVal = parseFloat(row.stockOnHand || row.StockOnHand || row.stock || row.qty || 0);
        if (isNaN(stockVal)) {
          throw new Error(`Row ${i + 1}: Invalid stock value`);
        }
        const mode = (row.mode || row.Mode || defaultMode).toLowerCase();
        if (!['set', 'increment', 'decrement'].includes(mode)) {
          throw new Error(`Row ${i + 1}: Invalid mode (set|increment|decrement)`);
        }

        const applyTo = decideApplyTo(row.applyTo || row.ApplyTo || row._applyTo, resolved.product, !!resolved.variant);

        let targetVariant = resolved.variant;
        if (applyTo === 'variant') {
          if (!targetVariant) {
            throw new Error(`Row ${i + 1}: Product has variants, please provide variantBarcode or variantSku`);
          }
        } else if (applyTo === 'base') {
          targetVariant = null;
        } else if (applyTo === 'mixed') {
          // if variant resolved use it, else base
          targetVariant = resolved.variant || null;
        }

        applyInventoryUpdate(resolved.product, targetVariant, null, stockVal, mode);
        await resolved.product.save();
        results.success++;
      } catch (err) {
        results.failed++;
        results.errors.push(err.message);
      }
    }

    res.json({
      success: true,
      message: `Import completed: ${results.success} success, ${results.failed} failed`,
      data: results,
    });
  } catch (error) {
    next(error);
  }
};

const copyProductImages = async (images, tenantId, productId) => {
  if (!images || images.length === 0) return [];

  const copiedImages = [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const imgUrl = typeof img === 'string' ? img : (img.url || '');
    
    if (!imgUrl || !imgUrl.startsWith('http')) {
      continue;
    }

    try {
      const { buffer, contentType } = await downloadImage(imgUrl);
      const fileName = generateFileName(`image-${i}.jpg`);
      const key = getStoragePath(tenantId, 'product_image', {
        productId: productId.toString(),
        fileName,
      });

      const newUrl = await uploadFile(buffer, key, contentType);
      copiedImages.push({
        url: newUrl,
        isPrimary: (typeof img === 'object' && img.isPrimary) || (i === 0 && copiedImages.length === 0),
      });
    } catch (error) {
      console.error(`Failed to copy image ${imgUrl}:`, error.message);
    }
  }

  if (copiedImages.length > 0 && !copiedImages.some(img => img.isPrimary)) {
    copiedImages[0].isPrimary = true;
  }

  return copiedImages;
};

const createProduct = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    await checkProductAccess(userId, user.tenantId, 'admin');

    const productData = {
      ...req.body,
      tenantId: user.tenantId,
      createdBy: userId,
    };

    if (typeof productData.variants === 'string') {
      productData.variants = JSON.parse(productData.variants);
    }
    if (typeof productData.baseBarcodes === 'string') {
      productData.baseBarcodes = JSON.parse(productData.baseBarcodes);
    }
    if (typeof productData.images === 'string') {
      productData.images = JSON.parse(productData.images);
    }
    if (typeof productData.basePricing === 'string') {
      productData.basePricing = JSON.parse(productData.basePricing);
    }
    if (typeof productData.baseInventory === 'string') {
      productData.baseInventory = JSON.parse(productData.baseInventory);
    }

    if (!productData.sku || !productData.sku.trim()) {
      throw new ApiError(400, 'SKU is required');
    }
    productData.sku = productData.sku.trim();
    await checkSkuUnique(user.tenantId, productData.sku);

    if (typeof productData.allowSellOutOfStock === 'string') {
      productData.allowSellOutOfStock = productData.allowSellOutOfStock === 'true';
    }
    if (typeof productData.hasVariants === 'string') {
      productData.hasVariants = productData.hasVariants === 'true';
    }

    if (productData.basePricing && typeof productData.basePricing === 'object') {
      if (typeof productData.basePricing.cost === 'string') {
        productData.basePricing.cost = parseFloat(productData.basePricing.cost) || 0;
      }
      if (typeof productData.basePricing.sale === 'string') {
        productData.basePricing.sale = parseFloat(productData.basePricing.sale) || 0;
      }
    }

    if (productData.baseInventory && typeof productData.baseInventory === 'object') {
      if (typeof productData.baseInventory.stockOnHand === 'string') {
        productData.baseInventory.stockOnHand = parseFloat(productData.baseInventory.stockOnHand) || 0;
      }
    }

    if (productData.hasVariants && productData.variants?.length > 0) {
      productData.baseBarcodes = [];
    } else {
      productData.variants = [];
    }

    if (productData.baseBarcodes?.length > 0) {
      for (const barcode of productData.baseBarcodes) {
        if (!barcode.code || !barcode.code.trim()) {
          throw new ApiError(400, 'Barcode code is required');
        }
        await checkBarcodeUnique(user.tenantId, barcode.code);
      }
    }

    if (productData.variants?.length > 0) {
      const variantSkus = new Set();
      for (const variant of productData.variants) {
        if (!variant.sku || !variant.sku.trim()) {
          throw new ApiError(400, 'Variant SKU is required');
        }
        variant.sku = variant.sku.trim();
        
        if (variantSkus.has(variant.sku)) {
          throw new ApiError(400, `Duplicate variant SKU: ${variant.sku}`);
        }
        variantSkus.add(variant.sku);
        
        if (variant.barcodes?.length > 0) {
          for (const barcode of variant.barcodes) {
            if (!barcode.code || !barcode.code.trim()) {
              throw new ApiError(400, 'Barcode code is required');
            }
            await checkBarcodeUnique(user.tenantId, barcode.code);
          }
        }

        if (variant.attributes?.length > 0) {
          for (const attr of variant.attributes) {
            if (!attr.attributeId || !attr.valueId) {
              throw new ApiError(400, 'Attribute ID and Value ID are required');
            }
            const attribute = await productRepository.findAttributeById(attr.attributeId);
            if (!attribute || attribute.tenantId.toString() !== user.tenantId.toString()) {
              throw new ApiError(400, `Invalid attribute ID: ${attr.attributeId}`);
            }
            const value = await productRepository.findAttributeValueById(attr.valueId);
            if (!value || value.tenantId.toString() !== user.tenantId.toString()) {
              throw new ApiError(400, `Invalid attribute value ID: ${attr.valueId}`);
            }
            if (value.attributeId.toString() !== attr.attributeId.toString()) {
              throw new ApiError(400, `Attribute value does not belong to the specified attribute`);
            }
          }
        }
      }
    }

    const product = await productRepository.createProduct(productData);
    const productId = product._id.toString();

    const filesByField = {};
    if (req.files && Array.isArray(req.files)) {
      req.files.forEach(file => {
        if (!filesByField[file.fieldname]) {
          filesByField[file.fieldname] = [];
        }
        filesByField[file.fieldname].push(file);
      });
    }

    const productImageFiles = filesByField.productImages || [];
    if (productImageFiles.length > 0) {
      const existingImages = product.images || [];
      const hasPrimary = existingImages.some(img => img.isPrimary);
      const productImages = await uploadProductImages(productImageFiles, user.tenantId, productId, !hasPrimary);
      
      if (productImages.length > 0 && !hasPrimary) {
        productImages[0].isPrimary = true;
      }
      
      product.images = [...existingImages, ...productImages];
    }

    if (productImageFiles.length > 0) {
      product.set('updatedAt', undefined);
      await product.save();
    }

    const populatedProduct = await productRepository.findProductById(product._id);
    res.status(201).json(populatedProduct);
  } catch (error) {
    next(error);
  }
};

const getProductById = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    const { id } = req.params;
    const product = await productRepository.findProductById(id);

    if (!product) {
      throw new ApiError(404, 'Product not found');
    }

    if (product.tenantId.toString() !== user.tenantId.toString()) {
      throw new ApiError(403, 'Access denied');
    }

    res.json(product);
  } catch (error) {
    next(error);
  }
};

const getProductByBarcode = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    const { barcode } = req.params;
    if (!barcode || !barcode.trim()) {
      throw new ApiError(400, 'Barcode is required');
    }

    const result = await productRepository.findProductByBarcode(user.tenantId, barcode);
    if (!result) {
      throw new ApiError(404, 'Product not found');
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
};

const listProducts = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    const { page = 1, limit = 50, status, type, categoryId, brandId, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = { tenantId: user.tenantId };
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (categoryId) filter.categoryId = categoryId;
    if (brandId) filter.brandId = brandId;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
      ];
    }

    const products = await productRepository.listProducts(user.tenantId, filter, parseInt(limit), skip);
    const total = await productRepository.countProducts(user.tenantId, filter);

    res.json({
      products,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    next(error);
  }
};

const updateProduct = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    await checkProductAccess(userId, user.tenantId, 'admin');

    const { id } = req.params;
    const product = await productRepository.findProductById(id);

    if (!product) {
      throw new ApiError(404, 'Product not found');
    }

    if (product.tenantId.toString() !== user.tenantId.toString()) {
      throw new ApiError(403, 'Access denied');
    }

    const updateData = {
      ...req.body,
      updatedBy: userId,
    };

    if (typeof updateData.variants === 'string') {
      updateData.variants = JSON.parse(updateData.variants);
    }
    if (typeof updateData.baseBarcodes === 'string') {
      updateData.baseBarcodes = JSON.parse(updateData.baseBarcodes);
    }
    if (typeof updateData.images === 'string') {
      updateData.images = JSON.parse(updateData.images);
    }

    if (updateData.sku && updateData.sku.trim()) {
      await checkSkuUnique(user.tenantId, updateData.sku.trim(), id);
    }
    if (typeof updateData.baseUnit === 'string') {
      updateData.baseUnit = JSON.parse(updateData.baseUnit);
    }
    if (typeof updateData.basePricing === 'string') {
      updateData.basePricing = JSON.parse(updateData.basePricing);
    }
    if (typeof updateData.baseInventory === 'string') {
      updateData.baseInventory = JSON.parse(updateData.baseInventory);
    }

    if (typeof updateData.allowSellOutOfStock === 'string') {
      updateData.allowSellOutOfStock = updateData.allowSellOutOfStock === 'true';
    }
    if (typeof updateData.hasVariants === 'string') {
      updateData.hasVariants = updateData.hasVariants === 'true';
    }

    if (updateData.basePricing && typeof updateData.basePricing === 'object') {
      if (typeof updateData.basePricing.cost === 'string') {
        updateData.basePricing.cost = parseFloat(updateData.basePricing.cost) || 0;
      }
      if (typeof updateData.basePricing.sale === 'string') {
        updateData.basePricing.sale = parseFloat(updateData.basePricing.sale) || 0;
      }
    }

    if (updateData.baseInventory && typeof updateData.baseInventory === 'object') {
      if (typeof updateData.baseInventory.stockOnHand === 'string') {
        updateData.baseInventory.stockOnHand = parseFloat(updateData.baseInventory.stockOnHand) || 0;
      }
    }

    if (updateData.hasVariants && updateData.variants?.length > 0) {
      updateData.baseBarcodes = [];
    }

    if (updateData.baseBarcodes?.length > 0) {
      for (const barcode of updateData.baseBarcodes) {
        if (!barcode.code || !barcode.code.trim()) {
          throw new ApiError(400, 'Barcode code is required');
        }
        await checkBarcodeUnique(user.tenantId, barcode.code, id);
      }
    }

    if (updateData.variants?.length > 0) {
      for (const variant of updateData.variants) {
        if (variant.barcodes?.length > 0) {
          for (const barcode of variant.barcodes) {
            if (!barcode.code || !barcode.code.trim()) {
              throw new ApiError(400, 'Barcode code is required');
            }
            await checkBarcodeUnique(user.tenantId, barcode.code, id);
          }
        }

        if (variant.attributes?.length > 0) {
          for (const attr of variant.attributes) {
            if (!attr.attributeId || !attr.valueId) {
              throw new ApiError(400, 'Attribute ID and Value ID are required');
            }
            const attribute = await productRepository.findAttributeById(attr.attributeId);
            if (!attribute || attribute.tenantId.toString() !== user.tenantId.toString()) {
              throw new ApiError(400, `Invalid attribute ID: ${attr.attributeId}`);
            }
            const value = await productRepository.findAttributeValueById(attr.valueId);
            if (!value || value.tenantId.toString() !== user.tenantId.toString()) {
              throw new ApiError(400, `Invalid attribute value ID: ${attr.valueId}`);
            }
            if (value.attributeId.toString() !== attr.attributeId.toString()) {
              throw new ApiError(400, `Attribute value does not belong to the specified attribute`);
            }
          }
        }
      }
    }

    const filesByField = {};
    if (req.files && Array.isArray(req.files)) {
      req.files.forEach(file => {
        if (!filesByField[file.fieldname]) {
          filesByField[file.fieldname] = [];
        }
        filesByField[file.fieldname].push(file);
      });
    }

    const oldProductImages = [...(product.images || [])];
    let newProductImages = updateData.images || product.images || [];
    
    if (Array.isArray(newProductImages) && newProductImages.length > 0) {
      if (typeof newProductImages[0] === 'string') {
        newProductImages = newProductImages.map((url, index) => ({
          url,
          isPrimary: index === 0,
        }));
      }
    }
    
    const productImageFiles = filesByField.productImages || [];
    if (productImageFiles.length > 0) {
      const existingImages = newProductImages || [];
      const hasPrimary = existingImages.some(img => img.isPrimary);
      const uploadedImages = await uploadProductImages(productImageFiles, user.tenantId, id, !hasPrimary);
      
      if (uploadedImages.length > 0 && !hasPrimary) {
        uploadedImages[0].isPrimary = true;
      }
      
      updateData.images = [...existingImages, ...uploadedImages];
    } else {
      updateData.images = newProductImages;
    }

    const oldImageUrls = oldProductImages.map(img => typeof img === 'string' ? img : img.url);
    const newImageUrls = updateData.images.map(img => typeof img === 'string' ? img : img.url);
    const imagesToDelete = oldProductImages.filter((img, index) => {
      const url = typeof img === 'string' ? img : img.url;
      return !newImageUrls.includes(url);
    });
    
    if (imagesToDelete.length > 0) {
      await deleteProductImages(imagesToDelete);
    }
    
    if (updateData.images && updateData.images.length > 0) {
      const primaryCount = updateData.images.filter(img => img.isPrimary).length;
      if (primaryCount === 0) {
        updateData.images[0].isPrimary = true;
      } else if (primaryCount > 1) {
        let foundFirst = false;
        updateData.images.forEach(img => {
          if (img.isPrimary && !foundFirst) {
            foundFirst = true;
          } else if (img.isPrimary) {
            img.isPrimary = false;
          }
        });
      }
    }


    const updated = await productRepository.updateProduct(id, updateData);
    res.json(updated);
  } catch (error) {
    next(error);
  }
};

const copyProduct = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    await checkProductAccess(userId, user.tenantId, 'admin');

    const { id } = req.params;
    const originalProduct = await productRepository.findProductById(id);

    if (!originalProduct) {
      throw new ApiError(404, 'Product not found');
    }

    if (originalProduct.tenantId.toString() !== user.tenantId.toString()) {
      throw new ApiError(403, 'Access denied');
    }

    const timestamp = Date.now().toString().slice(-6);
    const newSku = `${originalProduct.sku}-copy-${timestamp}`;
    const newName = `${originalProduct.name} Copy`;

    await checkSkuUnique(user.tenantId, newSku);

    const getStringId = (id) => {
      if (!id) return undefined;
      return typeof id === 'string' ? id : (id._id ? id._id.toString() : id.toString());
    };

    const copyData = {
      name: newName,
      sku: newSku,
      categoryId: getStringId(originalProduct.categoryId),
      brandId: getStringId(originalProduct.brandId),
      description: originalProduct.description || undefined,
      images: (originalProduct.images || []).map(img => {
        if (typeof img === 'string') {
          return { url: img, isPrimary: false };
        }
        return {
          url: img.url || '',
          isPrimary: img.isPrimary || false,
        };
      }).filter(img => img.url),
      baseBarcodes: [],
      basePricing: {
        cost: originalProduct.basePricing?.cost || 0,
        sale: originalProduct.basePricing?.sale || 0,
        currency: originalProduct.basePricing?.currency || 'VND',
      },
      baseInventory: {
        stockOnHand: 0,
      },
      allowSellOutOfStock: originalProduct.allowSellOutOfStock || false,
      hasVariants: originalProduct.hasVariants || false,
      status: 'draft',
      tenantId: user.tenantId,
      createdBy: userId,
      variants: originalProduct.hasVariants ? (originalProduct.variants || []).map((variant, idx) => {
        const variantSku = variant.sku ? `${variant.sku}-copy-${timestamp}` : `${newSku}-${String(idx + 1).padStart(3, '0')}`;
        return {
          sku: variantSku,
          barcodes: [],
          attributes: (variant.attributes || []).map(attr => ({
            attributeId: getStringId(attr.attributeId),
            valueId: getStringId(attr.valueId),
          })).filter(attr => attr.attributeId && attr.valueId),
          pricing: {
            cost: variant.pricing?.cost || 0,
            sale: variant.pricing?.sale || 0,
            currency: variant.pricing?.currency || 'VND',
          },
          inventory: {
            totalOnHand: 0,
            warehouses: [],
          },
          status: variant.status || 'active',
          metadata: variant.metadata ? (variant.metadata instanceof Map ? Object.fromEntries(variant.metadata) : variant.metadata) : {},
        };
      }) : [],
    };

    const originalImages = (originalProduct.images || []).map(img => {
      if (typeof img === 'string') {
        return { url: img, isPrimary: false };
      }
      return {
        url: img.url || '',
        isPrimary: img.isPrimary || false,
      };
    }).filter(img => img.url);

    const copyDataWithoutImages = { ...copyData };
    copyDataWithoutImages.images = [];

    const product = await productRepository.createProduct(copyDataWithoutImages);
    const productId = product._id.toString();

    if (originalImages.length > 0) {
      const copiedImages = await copyProductImages(originalImages, user.tenantId, productId);
      if (copiedImages.length > 0) {
        product.images = copiedImages;
        product.set('updatedAt', undefined);
        await product.save();
      }
    }

    const populatedProduct = await productRepository.findProductById(productId);
    res.status(201).json(populatedProduct);
  } catch (error) {
    next(error);
  }
};

const deleteProduct = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    await checkProductAccess(userId, user.tenantId, 'admin');

    const { id } = req.params;
    const product = await productRepository.findProductById(id);

    if (!product) {
      throw new ApiError(404, 'Product not found');
    }

    if (product.tenantId.toString() !== user.tenantId.toString()) {
      throw new ApiError(403, 'Access denied');
    }

    if (product.images && product.images.length > 0) {
      await deleteProductImages(product.images);
    }

    await productRepository.deleteProduct(id);
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    next(error);
  }
};

const deleteProductsBulk = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    await checkProductAccess(userId, user.tenantId, 'admin');

    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw new ApiError(400, 'Product IDs array is required');
    }

    const products = await Promise.all(
      ids.map(id => productRepository.findProductById(id))
    );

    const validProducts = products.filter(p => p && p.tenantId.toString() === user.tenantId.toString());
    
    if (validProducts.length === 0) {
      throw new ApiError(404, 'No valid products found to delete');
    }

    for (const product of validProducts) {
      if (product.images && product.images.length > 0) {
        await deleteProductImages(product.images);
      }
      await productRepository.deleteProduct(product._id);
    }

    res.json({ 
      message: `Successfully deleted ${validProducts.length} product(s)`,
      deletedCount: validProducts.length 
    });
  } catch (error) {
    next(error);
  }
};

const generateSampleFile = async (req, res, next) => {
  try {
    const workbook = xlsx.utils.book_new();

    const sheet1Data = [
      {
        'Tên sản phẩm': 'Áo thun nam',
        'Mã hàng': 'PROD001',
        'Danh mục cha': 'Thời trang Nam',
        'Danh mục': 'Áo',
        'Thương hiệu': 'Nike',
        'ảnh đại diện': 'https://example.com/main.jpg',
        'ảnh 1': 'https://example.com/img1.jpg',
        'ảnh 2': 'https://example.com/img2.jpg',
        'ảnh 3': '',
        'ảnh 4': '',
        'Mã vạch': '1234567890123',
        'Giá vốn': 100000,
        'Giá bán': 200000,
        'Tồn kho': 50,
        'Trạng thái': 'active',
        'Cho phép bán khi hết hàng': false,
        'Mô tả': 'Áo thun nam chất lượng cao',
      },
      {
        'Tên sản phẩm': 'Quần jean nữ',
        'Mã hàng': 'PROD002',
        'Danh mục cha': 'Thời trang Nữ',
        'Danh mục': 'Quần',
        'Thương hiệu': 'Adidas',
        'ảnh đại diện': 'https://example.com/main2.jpg',
        'ảnh 1': '',
        'ảnh 2': '',
        'ảnh 3': '',
        'ảnh 4': '',
        'Mã vạch': '1234567890124',
        'Giá vốn': 150000,
        'Giá bán': 300000,
        'Tồn kho': 30,
        'Trạng thái': 'active',
        'Cho phép bán khi hết hàng': true,
        'Mô tả': 'Quần jean nữ đẹp',
      },
    ];

    const sheet2Data = [
      {
        'Tên sản phẩm': 'Áo sơ mi nam',
        'Mã hàng': 'PROD003',
        'Danh mục cha': 'Thời trang Nam',
        'Danh mục': 'Áo',
        'Thương hiệu': 'Uniqlo',
        'ảnh đại diện': 'https://example.com/main3.jpg',
        'ảnh 1': 'https://example.com/img3.jpg',
        'ảnh 2': '',
        'ảnh 3': '',
        'ảnh 4': '',
        'Mã hàng biến thể': 'PROD003-001',
        'Thuộc tính biến thể': 'Màu sắc:Trắng,Size:M',
        'Mã vạch biến thể': '1234567890125',
        'Giá vốn biến thể': 120000,
        'Giá bán biến thể': 250000,
        'Tồn kho biến thể': 20,
        'Trạng thái biến thể': 'active',
        'Trạng thái': 'active',
        'Cho phép bán khi hết hàng': false,
        'Mô tả': 'Áo sơ mi nam có biến thể',
      },
      {
        'Tên sản phẩm': 'Áo sơ mi nam',
        'Mã hàng': 'PROD003',
        'Danh mục cha': 'Thời trang Nam',
        'Danh mục': 'Áo',
        'Thương hiệu': 'Uniqlo',
        'ảnh đại diện': 'https://example.com/main3.jpg',
        'ảnh 1': 'https://example.com/img3.jpg',
        'ảnh 2': '',
        'ảnh 3': '',
        'ảnh 4': '',
        'Mã hàng biến thể': 'PROD003-002',
        'Thuộc tính biến thể': 'Màu sắc:Trắng,Size:L',
        'Mã vạch biến thể': '1234567890126',
        'Giá vốn biến thể': 120000,
        'Giá bán biến thể': 250000,
        'Tồn kho biến thể': 15,
        'Trạng thái biến thể': 'active',
        'Trạng thái': 'active',
        'Cho phép bán khi hết hàng': false,
        'Mô tả': 'Áo sơ mi nam có biến thể',
      },
    ];

    const sheet3Data = [
      {
        'Tên sản phẩm': 'Giày thể thao',
        'Mã hàng': 'PROD004',
        'Danh mục cha': 'Phụ kiện',
        'Danh mục': 'Giày',
        'Thương hiệu': 'Nike',
        'ảnh đại diện': 'https://example.com/main4.jpg',
        'ảnh 1': '',
        'ảnh 2': '',
        'ảnh 3': '',
        'ảnh 4': '',
        'Mã vạch': '1234567890127',
        'Giá vốn': 500000,
        'Giá bán': 1000000,
        'Tồn kho': 10,
        'Trạng thái': 'active',
        'Cho phép bán khi hết hàng': false,
        'Mô tả': 'Giày thể thao không biến thể',
      },
      {
        'Tên sản phẩm': 'Quần short nam',
        'Mã hàng': 'PROD005',
        'Danh mục cha': 'Thời trang Nam',
        'Danh mục': 'Quần',
        'Thương hiệu': 'Adidas',
        'ảnh đại diện': 'https://example.com/main5.jpg',
        'ảnh 1': '',
        'ảnh 2': '',
        'ảnh 3': '',
        'ảnh 4': '',
        'Mã hàng biến thể': 'PROD005-001',
        'Thuộc tính biến thể': 'Size:M',
        'Mã vạch biến thể': '1234567890128',
        'Giá vốn biến thể': 80000,
        'Giá bán biến thể': 150000,
        'Tồn kho biến thể': 25,
        'Trạng thái biến thể': 'active',
        'Trạng thái': 'active',
        'Cho phép bán khi hết hàng': true,
        'Mô tả': 'Quần short nam có biến thể',
      },
    ];

    const ws1 = xlsx.utils.json_to_sheet(sheet1Data);
    const ws2 = xlsx.utils.json_to_sheet(sheet2Data);
    const ws3 = xlsx.utils.json_to_sheet(sheet3Data);

    xlsx.utils.book_append_sheet(workbook, ws1, 'Không biến thể');
    xlsx.utils.book_append_sheet(workbook, ws2, 'Có biến thể');
    xlsx.utils.book_append_sheet(workbook, ws3, 'Trộn');

    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="mau-import-san-pham.xlsx"');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

const parseCSV = (buffer) => {
  return new Promise((resolve, reject) => {
    const results = [];
    const stream = Readable.from(buffer);
    
    stream
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
};

const parseExcel = (buffer, selectedSheets = null) => {
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const allRows = [];
  
  const sheetsToProcess = selectedSheets && selectedSheets.length > 0 
    ? selectedSheets.filter(sheet => workbook.SheetNames.includes(sheet))
    : workbook.SheetNames;
  
  for (const sheetName of sheetsToProcess) {
    const worksheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(worksheet);
    allRows.push(...rows);
  }
  
  return allRows;
};

const buildExportFilter = (userTenantId, query) => {
  const { status, categoryId, brandId, search, filters } = query;
  const baseFilter = { tenantId: userTenantId };

  if (status) baseFilter.status = status;
  if (categoryId) baseFilter.categoryId = categoryId;
  if (brandId) baseFilter.brandId = brandId;

  const orFromSearch = [];
  if (search) {
    orFromSearch.push(
      { name: { $regex: search, $options: 'i' } },
      { sku: { $regex: search, $options: 'i' } },
    );
  }

  if (filters) {
    let parsedFilters = filters;
    if (typeof filters === 'string') {
      try {
        parsedFilters = JSON.parse(filters);
      } catch (e) {
        parsedFilters = [];
      }
    }
    if (Array.isArray(parsedFilters) && parsedFilters.length > 0) {
      const allowedFields = ['name', 'sku', 'status', 'brandId', 'categoryId', 'barcode'];
      const andConditions = [];
      const orConditions = [];

      const toRegexCond = (field, val) => ({ [field]: { $regex: val, $options: 'i' } });
      const toEqCond = (field, val) => ({ [field]: val });
      const toInCond = (field, arr) => ({ [field]: { $in: arr } });

      const buildCondition = (f) => {
        if (!f || !allowedFields.includes(f.field) || f.value === undefined) return null;
        const joiner = f.joiner === 'or' ? 'or' : 'and';
        const val = f.value;
        const operator = f.operator || 'contains';
        const field = f.field;

        const buildBarcodeCond = (v) => ({
          $or: [
            { "baseBarcodes.code": v },
            { "variants.barcodes.code": v },
          ]
        });

        let condition = null;
        switch (field) {
          case 'name':
          case 'sku':
            if (Array.isArray(val)) {
              const conds = val.filter(Boolean).map(x => operator === 'contains' ? toRegexCond(field, x) : toEqCond(field, x));
              condition = conds.length > 1 ? { $or: conds } : conds[0];
            } else {
              condition = operator === 'contains' ? toRegexCond(field, val) : toEqCond(field, val);
            }
            break;
          case 'status':
          case 'brandId':
          case 'categoryId':
            if (Array.isArray(val)) {
              condition = toInCond(field, val);
            } else {
              condition = toEqCond(field, val);
            }
            break;
          case 'barcode':
            if (Array.isArray(val)) {
              const conds = val.filter(Boolean).map(buildBarcodeCond);
              condition = conds.length > 1 ? { $or: conds } : conds[0];
            } else {
              condition = buildBarcodeCond(val);
            }
            break;
          default:
            condition = null;
        }

        if (!condition) return null;
        return { condition, joiner };
      };

      parsedFilters
        .map(buildCondition)
        .filter(Boolean)
        .forEach((entry) => {
          if (entry.joiner === 'or') {
            orConditions.push(entry.condition);
          } else {
            andConditions.push(entry.condition);
          }
        });

      const mergedOr = [...orFromSearch, ...orConditions];

      if (andConditions.length > 0 && mergedOr.length > 0) {
        baseFilter.$and = [...andConditions, { $or: mergedOr }];
      } else if (andConditions.length > 0) {
        baseFilter.$and = andConditions;
      } else if (mergedOr.length > 0) {
        baseFilter.$or = mergedOr;
      }
    } else if (orFromSearch.length > 0) {
      baseFilter.$or = orFromSearch;
    }
  } else if (orFromSearch.length > 0) {
    baseFilter.$or = orFromSearch;
  }

  return baseFilter;
};

const exportProducts = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    await checkProductAccess(userId, user.tenantId, 'admin');

    const filter = buildExportFilter(user.tenantId, req.query);
    const products = await productRepository.findProductsForExport(user.tenantId, filter);

    const allColumns = [
      'name', 'sku', 'barcode',
      'categoryId', 'categoryName', 'parentCategoryId', 'parentCategoryName',
      'brandId', 'brandName',
      'description',
      'status', 'allowSellOutOfStock', 'hasVariants',
      'cost', 'sale', 'stockOnHand',
      'variantSku', 'variantBarcode', 'variantAttributes',
      'variantCost', 'variantSale', 'variantStockOnHand',
      'imageMain', 'image1', 'image2', 'image3', 'image4',
      'createdAt', 'updatedAt',
      'createdById', 'createdByName', 'createdByEmail', 'createdByAvatar',
      'updatedById', 'updatedByName', 'updatedByEmail', 'updatedByAvatar'
    ];

    let columns = allColumns;
    if (req.query.columns) {
      if (Array.isArray(req.query.columns)) {
        columns = req.query.columns;
      } else if (typeof req.query.columns === 'string') {
        columns = req.query.columns.split(',').map(c => c.trim()).filter(Boolean);
      }
      columns = columns.filter(c => allColumns.includes(c));
      if (columns.length === 0) columns = allColumns;
    }

    const rows = [];
    products.forEach(prod => {
      const categoryIdVal = prod.categoryId?._id?.toString() || prod.categoryId?.toString() || '';
      const categoryNameVal = prod.categoryId?.name || '';
      const parentCategoryIdVal = prod.categoryId?.parentCategoryId?._id?.toString()
        || prod.categoryId?.parentCategoryId?.toString() || '';
      const parentCategoryNameVal = prod.categoryId?.parentCategoryId?.name || '';
      const brandIdVal = prod.brandId?._id?.toString() || prod.brandId?.toString() || '';
      const brandNameVal = prod.brandId?.name || '';
      const createdByIdVal = prod.createdBy?._id?.toString() || prod.createdBy?.toString() || '';
      const createdByNameVal = prod.createdBy?.fullName || '';
      const updatedByIdVal = prod.updatedBy?._id?.toString() || prod.updatedBy?.toString() || '';
      const updatedByNameVal = prod.updatedBy?.fullName || '';

      const images = prod.images || [];
      const primaryImage = images.find(img => img.isPrimary) || images[0] || {};
      const imageMain = primaryImage.url || '';
      const moreImages = images.filter(img => !img.isPrimary);
      const image1 = moreImages[0]?.url || '';
      const image2 = moreImages[1]?.url || '';
      const image3 = moreImages[2]?.url || '';
      const image4 = moreImages[3]?.url || '';

      const baseData = {
        name: prod.name,
        sku: prod.sku,
        barcode: prod.baseBarcodes?.[0]?.code || '',
        categoryId: categoryIdVal,
        categoryName: categoryNameVal,
        parentCategoryId: parentCategoryIdVal,
        parentCategoryName: parentCategoryNameVal,
        brandId: brandIdVal,
        brandName: brandNameVal,
        description: prod.description || '',
        status: prod.status,
        allowSellOutOfStock: prod.allowSellOutOfStock ? 'Yes' : 'No',
        hasVariants: prod.hasVariants ? 'Yes' : 'No',
        cost: prod.basePricing?.cost || 0,
        sale: prod.basePricing?.sale || 0,
        stockOnHand: prod.baseInventory?.stockOnHand || 0,
        imageMain,
        image1,
        image2,
        image3,
        image4,
        createdAt: prod.createdAt,
        updatedAt: prod.updatedAt,
        createdById: createdByIdVal,
        createdByName: createdByNameVal,
        createdByEmail: prod.createdBy?.email || '',
        createdByAvatar: prod.createdBy?.avatarUrl || '',
        updatedById: updatedByIdVal,
        updatedByName: updatedByNameVal,
        updatedByEmail: prod.updatedBy?.email || '',
        updatedByAvatar: prod.updatedBy?.avatarUrl || '',
      };

      if (prod.hasVariants && prod.variants?.length) {
        prod.variants.forEach(v => {
          const row = {
            ...baseData,
            variantSku: v.sku,
            variantBarcode: v.barcodes?.[0]?.code || '',
            variantAttributes: (v.attributes || []).map(a => {
              const attrName = a.attributeId?.name || '';
              const valName = a.valueId?.value || '';
              return attrName && valName ? `${attrName}:${valName}` : '';
            }).filter(Boolean).join(', '),
            variantCost: v.pricing?.cost || 0,
            variantSale: v.pricing?.sale || 0,
            variantStockOnHand: v.inventory?.totalOnHand || 0,
          };
          const picked = {};
          columns.forEach(c => picked[c] = row[c] !== undefined ? row[c] : '');
          rows.push(picked);
        });
      } else {
        const picked = {};
        columns.forEach(c => picked[c] = baseData[c] !== undefined ? baseData[c] : '');
        rows.push(picked);
      }
    });

    const worksheet = xlsx.utils.json_to_sheet(rows);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Products');
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="products-export.xlsx"');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

const normalizeProductData = (row, tenantId, userId) => {
  const productData = {
    tenantId,
    createdBy: userId,
    name: (row.name || row['Tên sản phẩm'] || '').trim(),
    sku: (row.sku || row['Mã hàng'] || row.SKU || '').trim(),
    categoryName: (row.categoryName || row['Danh mục'] || row['Category'] || '').trim() || null,
    categoryId: row.categoryId || row['Danh mục ID'] || null,
    parentCategoryName: (row.parentCategoryName || row['Danh mục cha'] || row['Parent Category'] || '').trim() || null,
    parentCategoryId: row.parentCategoryId || row['Danh mục cha ID'] || null,
    brandName: (row.brandName || row['Thương hiệu'] || row['Brand'] || '').trim() || null,
    brandId: row.brandId || row['Thương hiệu ID'] || null,
    description: (row.description || row['Mô tả'] || '').trim() || undefined,
    images: [],
    baseBarcodes: [],
    basePricing: {
      cost: parseFloat(row.cost || row['Giá vốn'] || row['Giá vốn (VNĐ)'] || 0) || 0,
      sale: parseFloat(row.sale || row['Giá bán'] || row['Giá bán (VNĐ)'] || 0) || 0,
      currency: 'VND',
    },
    baseInventory: {
      stockOnHand: parseFloat(row.stockOnHand || row['Tồn kho'] || row['Số lượng tồn kho'] || 0) || 0,
    },
    allowSellOutOfStock: row.allowSellOutOfStock === 'true' || row['Cho phép bán khi hết hàng'] === 'true' || row['Cho phép bán khi hết hàng'] === true || false,
    hasVariants: false,
    variants: [],
    status: (row.status || row['Trạng thái'] || 'active').toLowerCase() === 'draft' ? 'draft' : (row.status || row['Trạng thái'] || 'active').toLowerCase() === 'inactive' ? 'inactive' : 'active',
  };

  const barcode = (row.barcode || row['Mã vạch'] || '').trim();
  if (barcode) {
    productData.baseBarcodes = [{ code: barcode, isPrimary: true }];
  }

  const images = [];
  
  const mainImageFields = ['mainImage', 'ảnh đại diện', 'Ảnh đại diện', 'Main Image', 'main_image'];
  let mainImageUrl = null;
  for (const field of mainImageFields) {
    const value = row[field];
    if (value && typeof value === 'string' && value.trim().startsWith('http')) {
      mainImageUrl = value.trim();
      break;
    }
  }
  
  if (mainImageUrl) {
    images.push({
      url: mainImageUrl,
      isPrimary: true,
    });
  }
  
  const additionalImageFields = [
    { fields: ['image1', 'ảnh 1', 'Ảnh 1', 'Image 1', 'image_1'], index: 1 },
    { fields: ['image2', 'ảnh 2', 'Ảnh 2', 'Image 2', 'image_2'], index: 2 },
    { fields: ['image3', 'ảnh 3', 'Ảnh 3', 'Image 3', 'image_3'], index: 3 },
    { fields: ['image4', 'ảnh 4', 'Ảnh 4', 'Image 4', 'image_4'], index: 4 },
  ];
  
  for (const { fields, index } of additionalImageFields) {
    for (const field of fields) {
      const value = row[field];
      if (value && typeof value === 'string' && value.trim().startsWith('http')) {
        const url = value.trim();
        if (!images.some(img => img.url === url)) {
          images.push({
            url,
            isPrimary: false,
          });
        }
        break;
      }
    }
  }
  
  if (images.length > 0) {
    if (!images.some(img => img.isPrimary)) {
      images[0].isPrimary = true;
    }
    productData.images = images.slice(0, 5);
  }

  const variantSku = (row.variantSku || row['Mã hàng biến thể'] || row['Variant SKU'] || '').trim();
  if (variantSku) {
    productData.hasVariants = true;
    productData.variantData = {
      sku: variantSku,
      barcode: (row.variantBarcode || row['Mã vạch biến thể'] || row['Variant Barcode'] || '').trim() || null,
      attributesString: row.variantAttributes || row['Thuộc tính biến thể'] || row['Variant Attributes'] || '',
      cost: parseFloat(row.variantCost || row['Giá vốn biến thể'] || row['Variant Cost'] || 0) || 0,
      sale: parseFloat(row.variantSale || row['Giá bán biến thể'] || row['Variant Sale'] || 0) || 0,
      stockOnHand: parseFloat(row.variantStock || row['Tồn kho biến thể'] || row['Variant Stock'] || 0) || 0,
      status: (row.variantStatus || row['Trạng thái biến thể'] || 'active').toLowerCase() === 'inactive' ? 'inactive' : 'active',
    };
  }

  return productData;
};

const validateProductRow = (productData, rowIndex) => {
  const errors = [];
  
  if (!productData.name || !productData.name.trim()) {
    errors.push(`Row ${rowIndex + 1}: Tên sản phẩm is required`);
  }
  
  if (!productData.sku || !productData.sku.trim()) {
    errors.push(`Row ${rowIndex + 1}: Mã hàng (SKU) is required`);
  }
  
  if (productData.images && productData.images.length > 5) {
    errors.push(`Row ${rowIndex + 1}: Maximum 5 images allowed`);
  }

  if (productData.variantData) {
    if (!productData.variantData.sku || !productData.variantData.sku.trim()) {
      errors.push(`Row ${rowIndex + 1}: Mã hàng biến thể (Variant SKU) is required when variant data is provided`);
    }
  }
  
  return errors;
};

const findOrCreateCategory = async (tenantId, categoryName, categoryId, parentCategoryName, parentCategoryId, action = 'link') => {
  if (categoryId) {
    const category = await productRepository.findCategoryById(categoryId);
    if (category && category.tenantId.toString() === tenantId.toString()) {
      return category._id;
    }
  }

  if (!categoryName || !categoryName.trim()) {
    return null;
  }

  let parentCategoryIdResolved = null;
  
  if (parentCategoryId) {
    const parentCategory = await productRepository.findCategoryById(parentCategoryId);
    if (parentCategory && parentCategory.tenantId.toString() === tenantId.toString()) {
      parentCategoryIdResolved = parentCategory._id;
    }
  } else if (parentCategoryName && parentCategoryName.trim()) {
    const categories = await productRepository.listCategories(tenantId);
    const existingParentCategory = categories.find(
      c => c.name.toLowerCase().trim() === parentCategoryName.toLowerCase().trim()
    );

    if (existingParentCategory) {
      parentCategoryIdResolved = existingParentCategory._id;
    } else {
      const newParentCategory = await productRepository.createCategory({
        tenantId,
        name: parentCategoryName.trim(),
        parentCategoryId: null,
      });
      parentCategoryIdResolved = newParentCategory._id;
    }
  }

  const categories = await productRepository.listCategories(tenantId);
  let existingCategory = null;
  
  if (parentCategoryIdResolved) {
    existingCategory = categories.find(
      c => c.name.toLowerCase().trim() === categoryName.toLowerCase().trim() &&
           c.parentCategoryId && c.parentCategoryId.toString() === parentCategoryIdResolved.toString()
    );
  } else {
    existingCategory = categories.find(
      c => c.name.toLowerCase().trim() === categoryName.toLowerCase().trim() &&
           (!c.parentCategoryId || c.parentCategoryId === null)
    );
  }

  if (existingCategory) {
    if (action === 'create') {
      const newCategory = await productRepository.createCategory({
        tenantId,
        name: `${categoryName.trim()} (${Date.now().toString().slice(-6)})`,
        parentCategoryId: parentCategoryIdResolved,
      });
      return newCategory._id;
    }
    
    if (parentCategoryIdResolved && (!existingCategory.parentCategoryId || existingCategory.parentCategoryId.toString() !== parentCategoryIdResolved.toString())) {
      await productRepository.updateCategory(existingCategory._id, {
        parentCategoryId: parentCategoryIdResolved,
      });
    }
    return existingCategory._id;
  }

  const newCategory = await productRepository.createCategory({
    tenantId,
    name: categoryName.trim(),
    parentCategoryId: parentCategoryIdResolved,
  });

  return newCategory._id;
};

const findOrCreateBrand = async (tenantId, brandName, brandId, action = 'link') => {
  if (brandId) {
    const brand = await productRepository.findBrandById(brandId);
    if (brand && brand.tenantId.toString() === tenantId.toString()) {
      return brand._id;
    }
  }

  if (!brandName || !brandName.trim()) {
    return null;
  }

  const brands = await productRepository.listBrands(tenantId);
  const existingBrand = brands.find(
    b => b.name.toLowerCase().trim() === brandName.toLowerCase().trim()
  );

  if (existingBrand) {
    if (action === 'create') {
      const newBrand = await productRepository.createBrand({
        tenantId,
        name: `${brandName.trim()} (${Date.now().toString().slice(-6)})`,
      });
      return newBrand._id;
    }
    return existingBrand._id;
  }

  const newBrand = await productRepository.createBrand({
    tenantId,
    name: brandName.trim(),
  });

  return newBrand._id;
};

const findOrCreateAttribute = async (tenantId, attributeName) => {
  if (!attributeName || !attributeName.trim()) {
    return null;
  }

  const attributes = await productRepository.listAttributes(tenantId);
  const existingAttribute = attributes.find(
    a => a.name.toLowerCase().trim() === attributeName.toLowerCase().trim()
  );

  if (existingAttribute) {
    return existingAttribute._id;
  }

  const newAttribute = await productRepository.createAttribute({
    tenantId,
    name: attributeName.trim(),
  });

  return newAttribute._id;
};

const findOrCreateAttributeValue = async (tenantId, attributeId, valueName) => {
  if (!valueName || !valueName.trim() || !attributeId) {
    return null;
  }

  const attributeValues = await productRepository.listAttributeValues(tenantId, attributeId);
  const existingValue = attributeValues.find(
    v => v.value.toLowerCase().trim() === valueName.toLowerCase().trim()
  );

  if (existingValue) {
    return existingValue._id;
  }

  const newValue = await productRepository.createAttributeValue({
    tenantId,
    attributeId,
    value: valueName.trim(),
  });

  return newValue._id;
};

const parseVariantAttributes = async (tenantId, attributesString) => {
  if (!attributesString || !attributesString.trim()) {
    return [];
  }

  try {
    if (attributesString.startsWith('{') || attributesString.startsWith('[')) {
      const parsed = JSON.parse(attributesString);
      if (Array.isArray(parsed)) {
        const result = [];
        for (const item of parsed) {
          if (item.attributeName && item.valueName) {
            const attributeId = await findOrCreateAttribute(tenantId, item.attributeName);
            if (attributeId) {
              const valueId = await findOrCreateAttributeValue(tenantId, attributeId, item.valueName);
              if (valueId) {
                result.push({ attributeId, valueId });
              }
            }
          }
        }
        return result;
      }
    }

    const pairs = attributesString.split(',').map(p => p.trim());
    const result = [];
    for (const pair of pairs) {
      const [attrName, valueName] = pair.split(':').map(s => s.trim());
      if (attrName && valueName) {
        const attributeId = await findOrCreateAttribute(tenantId, attrName);
        if (attributeId) {
          const valueId = await findOrCreateAttributeValue(tenantId, attributeId, valueName);
          if (valueId) {
            result.push({ attributeId, valueId });
          }
        }
      }
    }
    return result;
  } catch (error) {
    return [];
  }
};

const importProducts = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    await checkProductAccess(userId, user.tenantId, 'admin');

    if (!req.file) {
      throw new ApiError(400, 'No file uploaded');
    }

    const options = {
      duplicateSkuAction: req.body.duplicateSkuAction || 'stop',
      duplicateBarcodeAction: req.body.duplicateBarcodeAction || 'stop',
      duplicateCategoryAction: req.body.duplicateCategoryAction || 'link',
      duplicateBrandAction: req.body.duplicateBrandAction || 'link',
      duplicateVariantSkuAction: req.body.duplicateVariantSkuAction || 'stop',
      missingRequiredFieldAction: req.body.missingRequiredFieldAction || 'skip',
      invalidImageUrlAction: req.body.invalidImageUrlAction || 'skip',
    };

    const selectedSheets = req.body.selectedSheets 
      ? (Array.isArray(req.body.selectedSheets) ? req.body.selectedSheets : JSON.parse(req.body.selectedSheets))
      : null;

    const file = req.file;
    let rows = [];

    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      rows = await parseCSV(file.buffer);
    } else if (file.mimetype.includes('excel') || file.mimetype.includes('spreadsheet') || file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls')) {
      rows = await parseExcel(file.buffer, selectedSheets);
    } else {
      throw new ApiError(400, 'Unsupported file format. Only CSV and Excel files are supported.');
    }

    if (!rows || rows.length === 0) {
      throw new ApiError(400, 'File is empty or could not be parsed');
    }

    const results = {
      total: rows.length,
      success: 0,
      failed: 0,
      errors: [],
      products: [],
    };

    // Step 1: Normalize all rows first
    const normalizedRows = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const productData = normalizeProductData(row, user.tenantId, userId);
        const validationErrors = validateProductRow(productData, i);
        
        if (validationErrors.length > 0) {
          if (options.missingRequiredFieldAction === 'stop') {
            results.failed++;
            results.errors.push(...validationErrors);
            results.errors.push(`Row ${i + 1}: Import stopped due to validation errors.`);
            return res.json({
              success: false,
              message: `Import stopped at row ${i + 1}`,
              data: results,
            });
          } else {
            results.failed++;
            results.errors.push(...validationErrors);
            continue;
          }
        }
        
        normalizedRows.push({
          rowIndex: i + 1,
          productData,
          originalRow: row,
        });
      } catch (error) {
        results.failed++;
        results.errors.push(`Row ${i + 1}: ${error.message}`);
      }
    }

    // Step 2: Group rows by product key (for variants)
    // Product key = name + sku + categoryName + parentCategoryName + brandName + images
    const getProductKey = (productData) => {
      const images = (productData.images || []).map(img => 
        typeof img === 'string' ? img : img.url
      ).sort().join('|');
      
      return [
        (productData.name || '').trim().toLowerCase(),
        (productData.sku || '').trim().toLowerCase(),
        (productData.categoryName || '').trim().toLowerCase(),
        (productData.parentCategoryName || '').trim().toLowerCase(),
        (productData.brandName || '').trim().toLowerCase(),
        images,
      ].join('|||');
    };

    const productGroups = new Map();
    const variantRows = [];
    const nonVariantRows = [];

    for (const normalizedRow of normalizedRows) {
      const { productData } = normalizedRow;
      
      if (productData.variantData) {
        // Has variant - group by product key
        const key = getProductKey(productData);
        if (!productGroups.has(key)) {
          productGroups.set(key, []);
        }
        productGroups.get(key).push(normalizedRow);
      } else {
        // No variant - process separately
        nonVariantRows.push(normalizedRow);
      }
    }

    const skuSet = new Set();
    const variantSkuSet = new Set();
    const barcodeSet = new Set();

    // Step 3: Process non-variant products
    for (const normalizedRow of nonVariantRows) {
      const { rowIndex, productData } = normalizedRow;
      
      try {
        // Check SKU duplicate
        if (skuSet.has(productData.sku)) {
          if (options.duplicateSkuAction === 'stop') {
            results.failed++;
            results.errors.push(`Row ${rowIndex}: SKU "${productData.sku}" is duplicated in the file. Import stopped.`);
            return res.json({
              success: false,
              message: `Import stopped at row ${rowIndex}`,
              data: results,
            });
          } else if (options.duplicateSkuAction === 'skip') {
            results.failed++;
            results.errors.push(`Row ${rowIndex}: SKU "${productData.sku}" is duplicated in the file. Skipped.`);
            continue;
          } else if (options.duplicateSkuAction === 'replace') {
            const timestamp = Date.now().toString().slice(-6);
            productData.sku = `${productData.sku}-${timestamp}`;
          }
        }

        const existingProduct = await productRepository.findProductBySku(user.tenantId, productData.sku);
        if (existingProduct) {
          if (options.duplicateSkuAction === 'stop') {
            results.failed++;
            results.errors.push(`Row ${rowIndex}: SKU "${productData.sku}" already exists. Import stopped.`);
            return res.json({
              success: false,
              message: `Import stopped at row ${rowIndex}`,
              data: results,
            });
          } else if (options.duplicateSkuAction === 'skip') {
            results.failed++;
            results.errors.push(`Row ${rowIndex}: SKU "${productData.sku}" already exists. Skipped.`);
            continue;
          } else if (options.duplicateSkuAction === 'replace') {
            const timestamp = Date.now().toString().slice(-6);
            productData.sku = `${productData.sku}-${timestamp}`;
          }
        }

        if (productData.baseBarcodes && productData.baseBarcodes.length > 0) {
          const barcode = productData.baseBarcodes[0].code;
          if (barcodeSet.has(barcode)) {
            if (options.duplicateBarcodeAction === 'stop') {
              results.failed++;
              results.errors.push(`Row ${rowIndex}: Barcode "${barcode}" is duplicated in the file. Import stopped.`);
              return res.json({
                success: false,
                message: `Import stopped at row ${rowIndex}`,
                data: results,
              });
            } else if (options.duplicateBarcodeAction === 'skip') {
              results.failed++;
              results.errors.push(`Row ${rowIndex}: Barcode "${barcode}" is duplicated in the file. Skipped.`);
              continue;
            } else if (options.duplicateBarcodeAction === 'replace') {
              productData.baseBarcodes = [];
            }
          } else {
            const existingBarcode = await productRepository.findProductByBarcode(user.tenantId, barcode);
            if (existingBarcode) {
              if (options.duplicateBarcodeAction === 'stop') {
                results.failed++;
                results.errors.push(`Row ${rowIndex}: Barcode "${barcode}" already exists. Import stopped.`);
                return res.json({
                  success: false,
                  message: `Import stopped at row ${rowIndex}`,
                  data: results,
                });
              } else if (options.duplicateBarcodeAction === 'skip') {
                results.failed++;
                results.errors.push(`Row ${rowIndex}: Barcode "${barcode}" already exists. Skipped.`);
                continue;
              } else if (options.duplicateBarcodeAction === 'replace') {
                productData.baseBarcodes = [];
              }
            } else {
              barcodeSet.add(barcode);
            }
          }
        }

        try {
          productData.categoryId = await findOrCreateCategory(
            user.tenantId,
            productData.categoryName,
            productData.categoryId,
            productData.parentCategoryName,
            productData.parentCategoryId,
            options.duplicateCategoryAction
          );
        } catch (error) {
          if (options.duplicateCategoryAction === 'stop') {
            results.failed++;
            results.errors.push(`Row ${rowIndex}: Failed to process category: ${error.message}. Import stopped.`);
            return res.json({
              success: false,
              message: `Import stopped at row ${rowIndex}`,
              data: results,
            });
          } else {
            results.failed++;
            results.errors.push(`Row ${rowIndex}: Failed to process category: ${error.message}. Skipped.`);
            continue;
          }
        }

        try {
          productData.brandId = await findOrCreateBrand(
            user.tenantId,
            productData.brandName,
            productData.brandId,
            options.duplicateBrandAction
          );
        } catch (error) {
          if (options.duplicateBrandAction === 'stop') {
            results.failed++;
            results.errors.push(`Row ${rowIndex}: Failed to process brand: ${error.message}. Import stopped.`);
            return res.json({
              success: false,
              message: `Import stopped at row ${rowIndex}`,
              data: results,
            });
          } else {
            results.failed++;
            results.errors.push(`Row ${rowIndex}: Failed to process brand: ${error.message}. Skipped.`);
            continue;
          }
        }

        delete productData.categoryName;
        delete productData.parentCategoryName;
        delete productData.parentCategoryId;
        delete productData.brandName;

        if (productData.images && productData.images.length > 5) {
          productData.images = productData.images.slice(0, 5);
        }

        productData.hasVariants = false;
        productData.variants = [];

        skuSet.add(productData.sku);

        const product = await productRepository.createProduct(productData);
        results.success++;
        results.products.push({
          _id: product._id,
          name: product.name,
          sku: product.sku,
        });
      } catch (error) {
        results.failed++;
        const errorMessage = error.message || 'Unknown error';
        results.errors.push(`Row ${rowIndex}: ${errorMessage}`);
      }
    }

    // Step 4: Process variant products (grouped)
    for (const [productKey, groupRows] of productGroups.entries()) {
      if (groupRows.length === 0) continue;

      try {
        // Use first row as base for product info
        const baseRow = groupRows[0];
        const baseProductData = { ...baseRow.productData };

        // Check if base SKU already exists
        if (skuSet.has(baseProductData.sku)) {
          if (options.duplicateSkuAction === 'stop') {
            results.failed += groupRows.length;
            results.errors.push(`Rows ${groupRows.map(r => r.rowIndex).join(', ')}: SKU "${baseProductData.sku}" is duplicated. Import stopped.`);
            return res.json({
              success: false,
              message: `Import stopped`,
              data: results,
            });
          } else if (options.duplicateSkuAction === 'skip') {
            results.failed += groupRows.length;
            results.errors.push(`Rows ${groupRows.map(r => r.rowIndex).join(', ')}: SKU "${baseProductData.sku}" is duplicated. Skipped.`);
            continue;
          } else if (options.duplicateSkuAction === 'replace') {
            const timestamp = Date.now().toString().slice(-6);
            baseProductData.sku = `${baseProductData.sku}-${timestamp}`;
          }
        }

        const existingProduct = await productRepository.findProductBySku(user.tenantId, baseProductData.sku);
        if (existingProduct) {
          if (options.duplicateSkuAction === 'stop') {
            results.failed += groupRows.length;
            results.errors.push(`Rows ${groupRows.map(r => r.rowIndex).join(', ')}: SKU "${baseProductData.sku}" already exists. Import stopped.`);
            return res.json({
              success: false,
              message: `Import stopped`,
              data: results,
            });
          } else if (options.duplicateSkuAction === 'skip') {
            results.failed += groupRows.length;
            results.errors.push(`Rows ${groupRows.map(r => r.rowIndex).join(', ')}: SKU "${baseProductData.sku}" already exists. Skipped.`);
            continue;
          } else if (options.duplicateSkuAction === 'replace') {
            const timestamp = Date.now().toString().slice(-6);
            baseProductData.sku = `${baseProductData.sku}-${timestamp}`;
          }
        }

        // Process category and brand
        try {
          baseProductData.categoryId = await findOrCreateCategory(
            user.tenantId,
            baseProductData.categoryName,
            baseProductData.categoryId,
            baseProductData.parentCategoryName,
            baseProductData.parentCategoryId,
            options.duplicateCategoryAction
          );
        } catch (error) {
          results.failed += groupRows.length;
          results.errors.push(`Rows ${groupRows.map(r => r.rowIndex).join(', ')}: Failed to process category: ${error.message}`);
          continue;
        }

        try {
          baseProductData.brandId = await findOrCreateBrand(
            user.tenantId,
            baseProductData.brandName,
            baseProductData.brandId,
            options.duplicateBrandAction
          );
        } catch (error) {
          results.failed += groupRows.length;
          results.errors.push(`Rows ${groupRows.map(r => r.rowIndex).join(', ')}: Failed to process brand: ${error.message}`);
          continue;
        }

        delete baseProductData.categoryName;
        delete baseProductData.parentCategoryName;
        delete baseProductData.parentCategoryId;
        delete baseProductData.brandName;

        if (baseProductData.images && baseProductData.images.length > 5) {
          baseProductData.images = baseProductData.images.slice(0, 5);
        }

        // Process all variants from group
        const variants = [];
        const variantSkusInGroup = new Set();

        for (const normalizedRow of groupRows) {
          const { rowIndex, productData } = normalizedRow;
          const variantData = productData.variantData;
          
          if (!variantData || !variantData.sku) {
            results.failed++;
            results.errors.push(`Row ${rowIndex}: Variant SKU is required`);
            continue;
          }

          const variantSku = variantData.sku.trim();

          // Check duplicate variant SKU within group
          if (variantSkusInGroup.has(variantSku)) {
            if (options.duplicateVariantSkuAction === 'stop') {
              results.failed += groupRows.length;
              results.errors.push(`Row ${rowIndex}: Variant SKU "${variantSku}" is duplicated in the same product group. Import stopped.`);
              return res.json({
                success: false,
                message: `Import stopped at row ${rowIndex}`,
                data: results,
              });
            } else if (options.duplicateVariantSkuAction === 'skip') {
              results.failed++;
              results.errors.push(`Row ${rowIndex}: Variant SKU "${variantSku}" is duplicated in the same product group. Skipped.`);
              continue;
            } else if (options.duplicateVariantSkuAction === 'replace') {
              const timestamp = Date.now().toString().slice(-6);
              variantData.sku = `${variantSku}-${timestamp}`;
            }
          }

          // Check duplicate variant SKU globally
          if (variantSkuSet.has(variantSku)) {
            if (options.duplicateVariantSkuAction === 'stop') {
              results.failed += groupRows.length;
              results.errors.push(`Row ${rowIndex}: Variant SKU "${variantSku}" is duplicated in the file. Import stopped.`);
              return res.json({
                success: false,
                message: `Import stopped at row ${rowIndex}`,
                data: results,
              });
            } else if (options.duplicateVariantSkuAction === 'skip') {
              results.failed++;
              results.errors.push(`Row ${rowIndex}: Variant SKU "${variantSku}" is duplicated in the file. Skipped.`);
              continue;
            } else if (options.duplicateVariantSkuAction === 'replace') {
              const timestamp = Date.now().toString().slice(-6);
              variantData.sku = `${variantSku}-${timestamp}`;
            }
          }

          const existingVariantProduct = await productRepository.findProductBySku(user.tenantId, variantData.sku);
          if (existingVariantProduct) {
            if (options.duplicateVariantSkuAction === 'stop') {
              results.failed += groupRows.length;
              results.errors.push(`Row ${rowIndex}: Variant SKU "${variantData.sku}" already exists. Import stopped.`);
              return res.json({
                success: false,
                message: `Import stopped at row ${rowIndex}`,
                data: results,
              });
            } else if (options.duplicateVariantSkuAction === 'skip') {
              results.failed++;
              results.errors.push(`Row ${rowIndex}: Variant SKU "${variantData.sku}" already exists. Skipped.`);
              continue;
            } else if (options.duplicateVariantSkuAction === 'replace') {
              const timestamp = Date.now().toString().slice(-6);
              variantData.sku = `${variantData.sku}-${timestamp}`;
            }
          }

          variantSkusInGroup.add(variantData.sku);
          variantSkuSet.add(variantData.sku);

          const variantAttributes = await parseVariantAttributes(
            user.tenantId,
            variantData.attributesString
          );

          if (variantAttributes.length === 0) {
            results.failed++;
            results.errors.push(`Row ${rowIndex}: Variant must have at least one attribute`);
            continue;
          }

          const variant = {
            sku: variantData.sku,
            barcodes: variantData.barcode ? [{ code: variantData.barcode.trim(), isPrimary: true }] : [],
            attributes: variantAttributes,
            pricing: {
              cost: variantData.cost || 0,
              sale: variantData.sale || 0,
              currency: 'VND',
            },
            inventory: {
              totalOnHand: variantData.stockOnHand || 0,
              warehouses: [],
            },
            status: variantData.status || 'active',
            metadata: {},
          };

          if (variant.barcodes.length > 0) {
            const variantBarcode = variant.barcodes[0].code;
            if (barcodeSet.has(variantBarcode)) {
              results.failed++;
              results.errors.push(`Row ${rowIndex}: Variant barcode "${variantBarcode}" is duplicated in the file`);
              continue;
            }

            const existingBarcode = await productRepository.findProductByBarcode(user.tenantId, variantBarcode);
            if (existingBarcode) {
              results.failed++;
              results.errors.push(`Row ${rowIndex}: Variant barcode "${variantBarcode}" already exists`);
              continue;
            }
            barcodeSet.add(variantBarcode);
          }

          variants.push(variant);
        }

        if (variants.length === 0) {
          results.failed += groupRows.length;
          results.errors.push(`Rows ${groupRows.map(r => r.rowIndex).join(', ')}: No valid variants found`);
          continue;
        }

        // Create product with all variants
        baseProductData.hasVariants = true;
        baseProductData.variants = variants;
        baseProductData.baseBarcodes = [];

        skuSet.add(baseProductData.sku);

        const product = await productRepository.createProduct(baseProductData);
        results.success++;
        results.products.push({
          _id: product._id,
          name: product.name,
          sku: product.sku,
          variantsCount: variants.length,
        });
      } catch (error) {
        results.failed += groupRows.length;
        const errorMessage = error.message || 'Unknown error';
        results.errors.push(`Rows ${groupRows.map(r => r.rowIndex).join(', ')}: ${errorMessage}`);
      }
    }

    res.json({
      success: true,
      message: `Import completed: ${results.success} successful, ${results.failed} failed`,
      data: results,
    });
  } catch (error) {
    next(error);
  }
};

const createCategory = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    await checkProductAccess(userId, user.tenantId, 'admin');

    const categoryData = {
      ...req.body,
      tenantId: user.tenantId,
    };

    const category = await productRepository.createCategory(categoryData);
    res.status(201).json(category);
  } catch (error) {
    next(error);
  }
};

const listCategories = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    const { parentCategoryId } = req.query;
    const categories = await productRepository.listCategories(user.tenantId);

    let filtered = categories;
    if (parentCategoryId !== undefined) {
      if (parentCategoryId === null || parentCategoryId === '') {
        filtered = filtered.filter((c) => !c.parentCategoryId);
      } else {
        filtered = filtered.filter((c) => c.parentCategoryId?.toString() === parentCategoryId);
      }
    }

    res.json(filtered);
  } catch (error) {
    next(error);
  }
};

const updateCategory = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    await checkProductAccess(userId, user.tenantId, 'admin');

    const { id } = req.params;
    const category = await productRepository.findCategoryById(id);

    if (!category) {
      throw new ApiError(404, 'Category not found');
    }

    if (category.tenantId.toString() !== user.tenantId.toString()) {
      throw new ApiError(403, 'Access denied');
    }

    const updated = await productRepository.updateCategory(id, req.body);
    res.json(updated);
  } catch (error) {
    next(error);
  }
};

const deleteCategory = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    await checkProductAccess(userId, user.tenantId, 'admin');

    const { id } = req.params;
    const category = await productRepository.findCategoryById(id);

    if (!category) {
      throw new ApiError(404, 'Category not found');
    }

    if (category.tenantId.toString() !== user.tenantId.toString()) {
      throw new ApiError(403, 'Access denied');
    }

    await productRepository.deleteCategory(id);
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    next(error);
  }
};

const createBrand = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    await checkProductAccess(userId, user.tenantId, 'admin');

    const brandData = {
      ...req.body,
      tenantId: user.tenantId,
    };

    const brand = await productRepository.createBrand(brandData);
    res.status(201).json(brand);
  } catch (error) {
    next(error);
  }
};

const listBrands = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    const brands = await productRepository.listBrands(user.tenantId);
    res.json(brands);
  } catch (error) {
    next(error);
  }
};

const updateBrand = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    await checkProductAccess(userId, user.tenantId, 'admin');

    const { id } = req.params;
    const brand = await productRepository.findBrandById(id);

    if (!brand) {
      throw new ApiError(404, 'Brand not found');
    }

    if (brand.tenantId.toString() !== user.tenantId.toString()) {
      throw new ApiError(403, 'Access denied');
    }

    const updated = await productRepository.updateBrand(id, req.body);
    res.json(updated);
  } catch (error) {
    next(error);
  }
};

const deleteBrand = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    await checkProductAccess(userId, user.tenantId, 'admin');

    const { id } = req.params;
    const brand = await productRepository.findBrandById(id);

    if (!brand) {
      throw new ApiError(404, 'Brand not found');
    }

    if (brand.tenantId.toString() !== user.tenantId.toString()) {
      throw new ApiError(403, 'Access denied');
    }

    await productRepository.deleteBrand(id);
    res.json({ message: 'Brand deleted successfully' });
  } catch (error) {
    next(error);
  }
};

const createPromotion = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    await checkProductAccess(userId, user.tenantId, 'admin');

    const promotionData = {
      ...req.body,
      tenantId: user.tenantId,
      createdBy: userId,
    };

    const promotion = await productRepository.createPromotion(promotionData);
    res.status(201).json(promotion);
  } catch (error) {
    next(error);
  }
};

const listPromotions = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    const { page = 1, limit = 50, isActive, startAt, endAt } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = { tenantId: user.tenantId };
    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }
    if (startAt) filter.startAt = { $gte: new Date(startAt) };
    if (endAt) filter.endAt = { $lte: new Date(endAt) };

    const promotions = await productRepository.listPromotions(user.tenantId, filter);
    const total = promotions.length;
    const paginated = promotions.slice(skip, skip + parseInt(limit));

    res.json({
      promotions: paginated,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    next(error);
  }
};

const getPromotionById = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    const { id } = req.params;
    const promotion = await productRepository.findPromotionById(id);

    if (!promotion) {
      throw new ApiError(404, 'Promotion not found');
    }

    if (promotion.tenantId.toString() !== user.tenantId.toString()) {
      throw new ApiError(403, 'Access denied');
    }

    res.json(promotion);
  } catch (error) {
    next(error);
  }
};

const updatePromotion = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    await checkProductAccess(userId, user.tenantId, 'admin');

    const { id } = req.params;
    const promotion = await productRepository.findPromotionById(id);

    if (!promotion) {
      throw new ApiError(404, 'Promotion not found');
    }

    if (promotion.tenantId.toString() !== user.tenantId.toString()) {
      throw new ApiError(403, 'Access denied');
    }

    const updateData = {
      ...req.body,
      updatedBy: userId,
    };

    const updated = await productRepository.updatePromotion(id, updateData);
    res.json(updated);
  } catch (error) {
    next(error);
  }
};

const deletePromotion = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    await checkProductAccess(userId, user.tenantId, 'admin');

    const { id } = req.params;
    const promotion = await productRepository.findPromotionById(id);

    if (!promotion) {
      throw new ApiError(404, 'Promotion not found');
    }

    if (promotion.tenantId.toString() !== user.tenantId.toString()) {
      throw new ApiError(403, 'Access denied');
    }

    await productRepository.deletePromotion(id);
    res.json({ message: 'Promotion deleted successfully' });
  } catch (error) {
    next(error);
  }
};

const getVariantInventories = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    const { productId, variantId } = req.params;
    const product = await productRepository.findProductById(productId);

    if (!product) {
      throw new ApiError(404, 'Product not found');
    }

    if (product.tenantId.toString() !== user.tenantId.toString()) {
      throw new ApiError(403, 'Access denied');
    }

    const variant = product.variants.id(variantId);
    if (!variant) {
      throw new ApiError(404, 'Variant not found');
    }

    const inventories = variant.inventory.warehouses.map(inv => ({
        _id: inv._id,
      warehouse: null,
        stockOnHand: inv.stockOnHand,
    }));

    res.json(inventories);
  } catch (error) {
    next(error);
  }
};

const addVariantInventory = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    await checkProductAccess(userId, user.tenantId, 'member');

    const { productId, variantId } = req.params;
    const { stockOnHand } = req.body;

    const product = await productRepository.findProductById(productId);
    if (!product) {
      throw new ApiError(404, 'Product not found');
    }

    if (product.tenantId.toString() !== user.tenantId.toString()) {
      throw new ApiError(403, 'Access denied');
    }

    const variant = product.variants.id(variantId);
    if (!variant) {
      throw new ApiError(404, 'Variant not found');
    }

    const updated = await productRepository.addVariantInventory(productId, variantId, stockOnHand || 0);

    res.status(201).json(updated);
  } catch (error) {
    next(error);
  }
};

const updateVariantInventory = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    await checkProductAccess(userId, user.tenantId, 'member');

    const { productId, variantId, inventoryId } = req.params;
    const updates = { ...req.body };

    const product = await productRepository.findProductById(productId);
    if (!product) {
      throw new ApiError(404, 'Product not found');
    }

    if (product.tenantId.toString() !== user.tenantId.toString()) {
      throw new ApiError(403, 'Access denied');
    }

    const variant = product.variants.id(variantId);
    if (!variant) {
      throw new ApiError(404, 'Variant not found');
    }

    const updated = await productRepository.updateVariantInventory(
      productId,
      variantId,
      updates.stockOnHand
    );

    res.json(updated);
  } catch (error) {
    next(error);
  }
};

const removeVariantInventory = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    await checkProductAccess(userId, user.tenantId, 'admin');

    const { productId, variantId, inventoryId } = req.params;

    const product = await productRepository.findProductById(productId);
    if (!product) {
      throw new ApiError(404, 'Product not found');
    }

    if (product.tenantId.toString() !== user.tenantId.toString()) {
      throw new ApiError(403, 'Access denied');
    }

    const variant = product.variants.id(variantId);
    if (!variant) {
      throw new ApiError(404, 'Variant not found');
    }

    const updated = await productRepository.removeVariantInventory(
      productId,
      variantId
    );

    res.json({ message: 'Inventory removed successfully', product: updated });
  } catch (error) {
    next(error);
  }
};

const getWarehouses = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    const warehouses = await tenantRepository.getWarehouses(user.tenantId);
    res.json(warehouses);
  } catch (error) {
    next(error);
  }
};

const createAttribute = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    await checkProductAccess(userId, user.tenantId, 'admin');

    const attributeData = {
      ...req.body,
      tenantId: user.tenantId,
    };

    const attribute = await productRepository.createAttribute(attributeData);
    res.status(201).json(attribute);
  } catch (error) {
    if (error.code === 11000 || error.codeName === 'DuplicateKey') {
      return next(new ApiError(400, 'Attribute name already exists in this tenant'));
    }
    next(error);
  }
};

const listAttributes = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    const attributes = await productRepository.listAttributes(user.tenantId);
    res.json(attributes);
  } catch (error) {
    next(error);
  }
};

const getAttributeById = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    const { id } = req.params;
    const attribute = await productRepository.findAttributeById(id);

    if (!attribute) {
      throw new ApiError(404, 'Attribute not found');
    }

    if (attribute.tenantId.toString() !== user.tenantId.toString()) {
      throw new ApiError(403, 'Access denied');
    }

    res.json(attribute);
  } catch (error) {
    next(error);
  }
};

const updateAttribute = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    await checkProductAccess(userId, user.tenantId, 'admin');

    const { id } = req.params;
    const attribute = await productRepository.findAttributeById(id);

    if (!attribute) {
      throw new ApiError(404, 'Attribute not found');
    }

    if (attribute.tenantId.toString() !== user.tenantId.toString()) {
      throw new ApiError(403, 'Access denied');
    }

    if (req.body.name && req.body.name.trim() !== attribute.name) {
      const existingAttributes = await productRepository.listAttributes(user.tenantId);
      const duplicate = existingAttributes.find(
        attr => attr._id.toString() !== id.toString() && attr.name.toLowerCase().trim() === req.body.name.toLowerCase().trim()
      );
      if (duplicate) {
        throw new ApiError(400, 'Attribute name already exists in this tenant');
      }
    }

    const updated = await productRepository.updateAttribute(id, req.body);
    res.json(updated);
  } catch (error) {
    if (error.code === 11000 || error.codeName === 'DuplicateKey') {
      return next(new ApiError(400, 'Attribute name already exists in this tenant'));
    }
    next(error);
  }
};

const deleteAttribute = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    await checkProductAccess(userId, user.tenantId, 'admin');

    const { id } = req.params;
    const attribute = await productRepository.findAttributeById(id);

    if (!attribute) {
      throw new ApiError(404, 'Attribute not found');
    }

    if (attribute.tenantId.toString() !== user.tenantId.toString()) {
      throw new ApiError(403, 'Access denied');
    }

    await productRepository.deleteAttributeValuesByAttributeId(id);
    await productRepository.deleteAttribute(id);
    res.json({ message: 'Attribute and all related attribute values deleted successfully' });
  } catch (error) {
    next(error);
  }
};

const createAttributeValue = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    await checkProductAccess(userId, user.tenantId, 'admin');

    const valueData = {
      ...req.body,
      tenantId: user.tenantId,
    };

    const value = await productRepository.createAttributeValue(valueData);
    res.status(201).json(value);
  } catch (error) {
    if (error.code === 11000 || error.codeName === 'DuplicateKey') {
      return next(new ApiError(400, 'Attribute value already exists for this attribute'));
    }
    next(error);
  }
};

const getAttributeValueById = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    const { id } = req.params;
    const value = await productRepository.findAttributeValueById(id);

    if (!value) {
      throw new ApiError(404, 'Attribute value not found');
    }

    if (value.tenantId.toString() !== user.tenantId.toString()) {
      throw new ApiError(403, 'Access denied');
    }

    res.json(value);
  } catch (error) {
    next(error);
  }
};

const listAttributeValues = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    const { attributeId } = req.query;
    const values = await productRepository.listAttributeValues(user.tenantId, attributeId || null);
    res.json(values);
  } catch (error) {
    next(error);
  }
};

const updateAttributeValue = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    await checkProductAccess(userId, user.tenantId, 'admin');

    const { id } = req.params;
    const value = await productRepository.findAttributeValueById(id);

    if (!value) {
      throw new ApiError(404, 'Attribute value not found');
    }

    if (value.tenantId.toString() !== user.tenantId.toString()) {
      throw new ApiError(403, 'Access denied');
    }

    const attributeId = req.body.attributeId || value.attributeId;
    const newValue = req.body.value;

    if (newValue && newValue.trim() !== value.value) {
      const existingValues = await productRepository.listAttributeValues(user.tenantId, attributeId);
      const duplicate = existingValues.find(
        v => v._id.toString() !== id && v.value.toLowerCase().trim() === newValue.toLowerCase().trim()
      );
      if (duplicate) {
        throw new ApiError(400, 'Attribute value already exists for this attribute');
      }
    }

    const updated = await productRepository.updateAttributeValue(id, req.body);
    res.json(updated);
  } catch (error) {
    if (error.code === 11000 || error.codeName === 'DuplicateKey') {
      return next(new ApiError(400, 'Attribute value already exists for this attribute'));
    }
    next(error);
  }
};

const deleteAttributeValue = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    await checkProductAccess(userId, user.tenantId, 'admin');

    const { id } = req.params;
    const value = await productRepository.findAttributeValueById(id);

    if (!value) {
      throw new ApiError(404, 'Attribute value not found');
    }

    if (value.tenantId.toString() !== user.tenantId.toString()) {
      throw new ApiError(403, 'Access denied');
    }

    await productRepository.deleteAttributeValue(id);
    res.json({ message: 'Attribute value deleted successfully' });
  } catch (error) {
    next(error);
  }
};


module.exports = {
  upload,
  uploadImport,
  createProduct,
  getProductById,
  getProductByBarcode,
  listProducts,
  updateProduct,
  copyProduct,
  deleteProduct,
  deleteProductsBulk,
  importProducts,
  generateSampleFile,
  exportProducts,
  createCategory,
  listCategories,
  updateCategory,
  deleteCategory,
  createBrand,
  listBrands,
  updateBrand,
  deleteBrand,
  createPromotion,
  listPromotions,
  getPromotionById,
  updatePromotion,
  deletePromotion,
  getVariantInventories,
  addVariantInventory,
  updateVariantInventory,
  removeVariantInventory,
  getWarehouses,
  createAttribute,
  listAttributes,
  getAttributeById,
  updateAttribute,
  deleteAttribute,
  createAttributeValue,
  listAttributeValues,
  getAttributeValueById,
  updateAttributeValue,
  deleteAttributeValue,
  listInventory,
  exportInventory,
  generateInventorySample,
  importInventory,
  bulkUpdateInventory,
};

