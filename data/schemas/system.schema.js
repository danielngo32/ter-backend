const mongoose = require("mongoose");

const appModuleSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    isEnabled: { type: Boolean, default: true },
    isDefaultForNewTenant: { type: Boolean, default: false },
  },
  { timestamps: true, _id: true }
);

const businessCategorySchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true },
    nameVi: { type: String, required: true, trim: true },
    nameEn: { type: String, required: true, trim: true },
    parentCode: { type: String, trim: true, default: null },
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true, _id: true }
);

businessCategorySchema.index({ parentCode: 1, order: 1 });

const aiModeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      enum: ["ask", "agent", "plan"],
      trim: true,
    },
    description: { type: String, trim: true },
    isEnabled: { type: Boolean, default: true },
  },
  { timestamps: true, _id: true }
);

const aiProviderSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    isEnabled: { type: Boolean, default: true },
  },
  { timestamps: true, _id: true }
);

const aiModelSchema = new mongoose.Schema(
  {
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AiProvider",
      required: true,
      index: true,
    },
    modelId: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    contextLimit: {
      type: Number,
      required: true,
      default: 128000,
      min: 1024,
      max: 1024000,
    },
    isThinking: { type: Boolean, default: false },
    isEnabled: { type: Boolean, default: true },
  },
  { timestamps: true, _id: true }
);

aiModelSchema.index({ isEnabled: 1 });
aiModelSchema.index({ provider: 1, isEnabled: 1 });

const provinceSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, trim: true },
    type: { type: String, trim: true },
    isCentral: { type: Boolean, default: false },
    fullName: { type: String, trim: true },
  },
  { timestamps: true, _id: true }
);

provinceSchema.index({ slug: 1 });

const wardSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, trim: true },
    type: { type: String, trim: true },
    province: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Province",
      required: true,
    },
  },
  { timestamps: true, _id: true }
);

wardSchema.index({ slug: 1 });
wardSchema.index({ province: 1 });

const shippingPartnerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    apiEndpoint: { type: String, trim: true },
    isEnabled: { type: Boolean, default: true },
  },
  { timestamps: true, _id: true }
);

shippingPartnerSchema.index({ isEnabled: 1 });

const paymentPartnerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    apiEndpoint: { type: String, trim: true },
    isEnabled: { type: Boolean, default: true },
  },
  { timestamps: true, _id: true }
);

paymentPartnerSchema.index({ isEnabled: 1 });

const AppModuleModel = mongoose.model("AppModule", appModuleSchema);
const BusinessCategoryModel = mongoose.model(
  "BusinessCategory",
  businessCategorySchema
);
const AiModeModel = mongoose.model("AiMode", aiModeSchema);
const AiProviderModel = mongoose.model("AiProvider", aiProviderSchema);
const AiModelModel = mongoose.model("AiModel", aiModelSchema);
const ProvinceModel = mongoose.model("Province", provinceSchema);
const WardModel = mongoose.model("Ward", wardSchema);
const ShippingPartnerModel = mongoose.model("ShippingPartner", shippingPartnerSchema);
const PaymentPartnerModel = mongoose.model("PaymentPartner", paymentPartnerSchema);

module.exports = {
  AppModuleModel,
  BusinessCategoryModel,
  AiModeModel,
  AiProviderModel,
  AiModelModel,
  ProvinceModel,
  WardModel,
  ShippingPartnerModel,
  PaymentPartnerModel,
  appModuleSchema,
  businessCategorySchema,
  aiModeSchema,
  aiProviderSchema,
  aiModelSchema,  
  provinceSchema,
  wardSchema,
  shippingPartnerSchema,
  paymentPartnerSchema,
};