const express = require("express");
const productController = require("../controllers/product.controller");
const validator = require("../validators/product.validator");
const parseFormData = require("../utils/parseFormData");

const router = express.Router();

router.get(
  "/barcode/:barcode",
  validator.validateBarcodePathParam,
  productController.getProductByBarcode
);

router.get(
  "/categories",
  validator.validateListCategoriesQuery,
  productController.listCategories
);

router.post(
  "/categories",
  validator.validateCreateCategory,
  productController.createCategory
);

router.put(
  "/categories/:id",
  validator.validateCategoryIdParam,
  validator.validateUpdateCategory,
  productController.updateCategory
);

router.delete(
  "/categories/:id",
  validator.validateCategoryIdParam,
  productController.deleteCategory
);

router.get(
  "/brands",
  validator.validateListBrandsQuery,
  productController.listBrands
);

router.post(
  "/brands",
  validator.validateCreateBrand,
  productController.createBrand
);

router.put(
  "/brands/:id",
  validator.validateBrandIdParam,
  validator.validateUpdateBrand,
  productController.updateBrand
);

router.delete(
  "/brands/:id",
  validator.validateBrandIdParam,
  productController.deleteBrand
);

router.get(
  "/attributes",
  productController.listAttributes
);

router.get(
  "/attributes/:id",
  validator.validateAttributeIdParam,
  productController.getAttributeById
);

router.post(
  "/attributes",
  validator.validateCreateAttribute,
  productController.createAttribute
);

router.put(
  "/attributes/:id",
  validator.validateAttributeIdParam,
  validator.validateUpdateAttribute,
  productController.updateAttribute
);

router.delete(
  "/attributes/:id",
  validator.validateAttributeIdParam,
  productController.deleteAttribute
);

router.get(
  "/attribute-values",
  validator.validateListAttributeValuesQuery,
  productController.listAttributeValues
);

router.get(
  "/attribute-values/:id",
  validator.validateAttributeValueIdParam,
  productController.getAttributeValueById
);

router.post(
  "/attribute-values",
  validator.validateCreateAttributeValue,
  productController.createAttributeValue
);

router.put(
  "/attribute-values/:id",
  validator.validateAttributeValueIdParam,
  validator.validateUpdateAttributeValue,
  productController.updateAttributeValue
);

router.delete(
  "/attribute-values/:id",
  validator.validateAttributeValueIdParam,
  productController.deleteAttributeValue
);

router.get(
  "/promotions",
  validator.validateListPromotionsQuery,
  productController.listPromotions
);

router.get(
  "/promotions/:id",
  validator.validatePromotionIdParam,
  productController.getPromotionById
);

router.post(
  "/promotions",
  validator.validateCreatePromotion,
  productController.createPromotion
);

router.put(
  "/promotions/:id",
  validator.validatePromotionIdParam,
  validator.validateUpdatePromotion,
  productController.updatePromotion
);

router.delete(
  "/promotions/:id",
  validator.validatePromotionIdParam,
  productController.deletePromotion
);

router.get("/warehouses", productController.getWarehouses);

router.get(
  "/",
  validator.validateListProductsQuery,
  productController.listProducts
);

router.post(
  "/",
  productController.upload.any(),
  parseFormData,
  validator.validateCreateProduct,
  productController.createProduct
);

router.get(
  "/import/sample",
  productController.generateSampleFile
);

router.get(
  "/inventory/import/sample",
  productController.generateInventorySample
);

router.get(
  "/inventory",
  validator.validateListInventoryQuery,
  productController.listInventory
);

router.get(
  "/inventory/export",
  validator.validateExportInventoryQuery,
  productController.exportInventory
);

router.post(
  "/inventory/bulk",
  validator.validateBulkInventory,
  productController.bulkUpdateInventory
);

router.post(
  "/inventory/import",
  productController.uploadImport.single('file'),
  parseFormData,
  productController.importInventory
);

router.post(
  "/import",
  productController.uploadImport.single('file'),
  parseFormData,
  productController.importProducts
);

router.get(
  "/export",
  validator.validateExportProductsQuery,
  productController.exportProducts
);

router.delete(
  "/bulk",
  validator.validateDeleteProductsBulk,
  productController.deleteProductsBulk
);

router.get(
  "/:id",
  validator.validateProductIdParam,
  productController.getProductById
);

router.put(
  "/:id",
  productController.upload.any(),
  parseFormData,
  validator.validateProductIdParam,
  validator.validateUpdateProduct,
  productController.updateProduct
);

router.post(
  "/:id/copy",
  productController.upload.any(),
  parseFormData,
  validator.validateProductIdParam,
  productController.copyProduct
);

router.delete(
  "/:id",
  validator.validateProductIdParam,
  productController.deleteProduct
);

router.get(
  "/:productId/variants/:variantId/inventory",
  validator.validateVariantIdParam,
  productController.getVariantInventories
);

router.post(
  "/:productId/variants/:variantId/inventory",
  validator.validateVariantIdParam,
  validator.validateAddVariantInventory,
  productController.addVariantInventory
);

router.put(
  "/:productId/variants/:variantId/inventory/:inventoryId",
  validator.validateInventoryIdParam,
  validator.validateUpdateVariantInventory,
  productController.updateVariantInventory
);

router.delete(
  "/:productId/variants/:variantId/inventory/:inventoryId",
  validator.validateInventoryIdParam,
  productController.removeVariantInventory
);

module.exports = router;
