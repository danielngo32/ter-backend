const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    avatarUrl: { type: String },
    gender: {
      type: String,
      enum: ["male", "female", "other"],
      default: "other",
    },
    birthday: { type: Date },
    phone1: { type: String, trim: true },
    phone2: { type: String, trim: true },
    email1: { type: String, trim: true, lowercase: true },
    email2: { type: String, trim: true, lowercase: true },
    address: {
      type: {
        addressLine: { type: String, trim: true },
        provinceCode: { type: String, trim: true },
        provinceName: { type: String, trim: true },
        wardCode: { type: String, trim: true },
        wardName: { type: String, trim: true },
      },
      default: () => ({}),
      _id: false,
    },
    note: { type: String, trim: true },
    lastActivityAt: { type: Date },
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

customerSchema.index({ tenantId: 1, name: 1 });
customerSchema.index({ tenantId: 1, status: 1 });

const CustomerModel = mongoose.model("Customer", customerSchema);

module.exports = {
  CustomerModel,
  customerSchema,
};

