const mongoose = require("mongoose");

const financeAttachmentSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true },
    fileName: { type: String, trim: true },
    mimeType: { type: String, trim: true },
    size: { type: Number },
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { _id: true }
);

const financeTransactionSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    type: {
      type: String,
      enum: ["income", "expense", "transfer"],
      required: true,
    },
    category: { type: String, trim: true },

    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "VND", trim: true },

    transactionDate: { type: Date, required: true },

    partnerName: { type: String, trim: true },
    partnerId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      default: null,
    },

    description: { type: String, trim: true },

    paymentMethod: {
      type: String,
      enum: ["cash", "bank_transfer", "card", "e_wallet", "other"],
      default: "cash",
    },
    referenceCode: { type: String, trim: true },
    status: {
      type: String,
      enum: ["draft", "confirmed", "cancelled"],
      default: "draft",
    },
    confirmedAt: { type: Date },

    attachments: {
      type: [financeAttachmentSchema],
      default: [],
    },

    ocrData: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },

    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
  },
  { timestamps: true }
);

financeTransactionSchema.index(
  { tenantId: 1, transactionDate: 1, type: 1 },
  {}
);

const FinanceTransactionModel = mongoose.model(
  "FinanceTransaction",
  financeTransactionSchema
);

module.exports = {
  FinanceTransactionModel,
  financeTransactionSchema,
  financeAttachmentSchema,
};
