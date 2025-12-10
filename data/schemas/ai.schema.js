const mongoose = require("mongoose");

const aiAttachmentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["file", "image", "audio", "video", "other"],
      default: "file",
    },
    url: { type: String, required: true, trim: true },
    fileName: { type: String, trim: true },
    mimeType: { type: String, trim: true },
    size: { type: Number },
    source: {
      type: String,
      enum: ["user", "assistant", "system", "tool"],
      default: "user",
    },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const aiMessageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["user", "assistant", "system", "tool"],
      required: true,
    },
    content: { type: String },
    attachments: { type: [aiAttachmentSchema], default: [] },
    tokens: { type: Number },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const aiChatSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    mode: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AiMode",
      required: true,
      index: true,
    },
    title: { type: String, trim: true },
    model: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AiModel",
      required: true,
      index: true,
    },
    messages: { type: [aiMessageSchema], default: [] },
    lastActivityAt: { type: Date, default: Date.now },
  },
  { timestamps: true, _id: true }
);

aiChatSchema.index({ tenantId: 1, userId: 1, lastActivityAt: -1 });

const AiChatModel = mongoose.model("AiChat", aiChatSchema);

module.exports = {
  aiAttachmentSchema,
  aiMessageSchema,
  aiChatSchema,
  AiChatModel,
};
