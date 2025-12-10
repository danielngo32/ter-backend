const mongoose = require("mongoose");

const branchSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true }, 
    address: { type: String, trim: true },
    phoneNumber: { type: String, trim: true },
    isWorkingBranch: { type: Boolean, default: true },
    isPayrollBranch: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { _id: true, timestamps: true }
);

const departmentMemberSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    role: {
      type: String,
      enum: ["manager", "staff"],
      default: "staff",
    },
    joinedAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

const departmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true },
    description: { type: String, trim: true },
    parentDepartmentId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    managerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    members: {
      type: [departmentMemberSchema],
      default: [],
    },
    isActive: { type: Boolean, default: true },
  },
  { _id: true, timestamps: true }
);

const tenantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    domain: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    businessCategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessCategory",
      required: true,
    },
    logoUrl: { type: String },
    plan: {
      type: String,
      enum: ["free", "pro", "business", "enterprise"],
      default: "free",
    },
    maxUsers: { type: Number, default: 20 },
    modules: {
      type: [
        {
          moduleId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AppModule",
            required: true,
          },
          isEnabled: { type: Boolean, default: true },
        },
      ],
      default: [],
    },
    branches: { type: [branchSchema], default: [] },
    departments: { type: [departmentSchema], default: [] },
    settings: {
      tax: {
        vatPercent: { type: Number, default: 0, min: 0, max: 100 },
      },
      shipping: {
        enablePartners: { type: Boolean, default: false },
        partners: {
          type: [
            {
              partnerId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "ShippingPartner",
                required: true,
              },
              apiKey: { type: String, trim: true },
              isActive: { type: Boolean, default: true },
            },
          ],
          default: [],
        },
      },
      payment: {
        enablePartners: { type: Boolean, default: false },
        partners: {
          type: [
            {
              partnerId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "PaymentPartner",
                required: true,
              },
              apiKey: { type: String, trim: true },
              isActive: { type: Boolean, default: true },
            },
          ],
          default: [],
        },
      },
    },
  },
  { timestamps: true }
);

tenantSchema.index({ plan: 1 });

const TenantModel = mongoose.model("Tenant", tenantSchema);

module.exports = {
  TenantModel,
  tenantSchema,
  branchSchema,
  departmentSchema,
  departmentMemberSchema,
};
