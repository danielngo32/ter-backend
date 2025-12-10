const mongoose = require("mongoose");

const variantInventorySchema = new mongoose.Schema(
  {
    stockOnHand: { type: Number, default: 0, min: 0 },
  },
  { _id: true }
);

const productCategorySchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    parentCategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  { timestamps: true }
);

productCategorySchema.index({ tenantId: 1, name: 1 });

const productBrandSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

productBrandSchema.index({ tenantId: 1, name: 1 });

const productAttributeSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

productAttributeSchema.index({ tenantId: 1, name: 1 }, { unique: true });

const productAttributeValueSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    attributeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductAttribute",
      required: true,
      index: true,
    },
    value: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

productAttributeValueSchema.index({ tenantId: 1, attributeId: 1, value: 1 }, { unique: true });

const productBarcodeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true },
    isPrimary: { type: Boolean, default: false },
  },
  { _id: false }
);

const variantAttributeSchema = new mongoose.Schema(
  {
    attributeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductAttribute",
      required: true,
    },
    valueId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductAttributeValue",
      required: true,
    },
  },
  { _id: false }
);

const productImageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    isPrimary: { type: Boolean, default: false },
  },
  { _id: false }
);

const productVariantSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true, trim: true },
    barcodes: {
      type: [productBarcodeSchema],
      default: [],
    },
    attributes: {
      type: [variantAttributeSchema],
      default: [],
    },
    pricing: {
      cost: { type: Number, default: 0 },
      sale: { type: Number, default: 0 },
      currency: { type: String, default: "VND", trim: true },
    },
    inventory: {
      totalOnHand: { type: Number, default: 0 },
      warehouses: { type: [variantInventorySchema], default: [] },
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
  },
  { _id: true, timestamps: true }
);

const productSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    sku: { type: String, required: true, trim: true },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductCategory",
      default: null,
    },
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductBrand",
      default: null,
    },
    description: { type: String, trim: true },
    images: {
      type: [productImageSchema],
      default: [],
    },

    baseBarcodes: {
      type: [productBarcodeSchema],
      default: [],
    },
    basePricing: {
      cost: { type: Number, default: 0 },
      sale: { type: Number, default: 0 },
      currency: { type: String, default: "VND", trim: true },
    },
    baseInventory: {
      stockOnHand: { type: Number, default: 0 },
    },

    allowSellOutOfStock: { type: Boolean, default: false },
    hasVariants: { type: Boolean, default: false },

    variants: {
      type: [productVariantSchema],
      default: [],
    },
    status: {
      type: String,
      enum: ["draft", "active", "inactive"],
      default: "active",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { 
    timestamps: { 
      createdAt: true, 
      updatedAt: true 
    } 
  }
);

productSchema.pre('save', function(next) {
  if (this.isNew) {
    this.set('updatedAt', undefined);
  }
  next();
});

productSchema.index({ tenantId: 1, sku: 1 }, { unique: true });
productSchema.index({ tenantId: 1, name: 1 });
productSchema.index({ tenantId: 1, status: 1 });
productSchema.index({ "baseBarcodes.code": 1 }, { sparse: true });

productVariantSchema.index({ sku: 1 });
productVariantSchema.index({ "barcodes.code": 1 }, { sparse: true });

const productPromotionSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    type: {
      type: String,
      enum: ["percentage", "fixed_amount"],
      default: "percentage",
    },
    value: { type: Number, required: true, default: 0 },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    isActive: { type: Boolean, default: true },

    appliesTo: {
      productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
      categoryIds: [
        { type: mongoose.Schema.Types.ObjectId, ref: "ProductCategory" },
      ],
      brandIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "ProductBrand" }],
      tags: { type: [String], default: [] },
    },

    conditions: {
      minOrderAmount: { type: Number, default: 0 },
      maxOrderAmount: { type: Number },
      minQuantity: { type: Number, default: 0 },
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

productPromotionSchema.index(
  { tenantId: 1, isActive: 1, startAt: 1, endAt: 1 },
  {}
);

const ProductModel = mongoose.model("Product", productSchema);
const ProductCategoryModel = mongoose.model(
  "ProductCategory",
  productCategorySchema
);
const ProductBrandModel = mongoose.model("ProductBrand", productBrandSchema);
const ProductAttributeModel = mongoose.model("ProductAttribute", productAttributeSchema);
const ProductAttributeValueModel = mongoose.model("ProductAttributeValue", productAttributeValueSchema);
const ProductPromotionModel = mongoose.model(
  "ProductPromotion",
  productPromotionSchema
);

module.exports = {
  ProductModel,
  productSchema,
  productVariantSchema,
  variantInventorySchema,
  ProductCategoryModel,
  productCategorySchema,
  ProductBrandModel,
  productBrandSchema,
  ProductAttributeModel,
  productAttributeSchema,
  ProductAttributeValueModel,
  productAttributeValueSchema,
  ProductPromotionModel,
  productPromotionSchema,
};
