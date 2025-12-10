const mongoose = require("mongoose");

const zaloAccountSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    provider: {
      type: String,
      enum: ["zalo"],
      default: "zalo",
    },

    externalUserId: { type: String, required: true, trim: true },
    displayName: { type: String, trim: true },
    avatarUrl: { type: String, trim: true },
    phoneNumber: { type: String, trim: true },

    connectionStatus: {
      type: String,
      enum: ["disconnected", "pending_qr", "connected", "error"],
      default: "disconnected",
    },
    lastConnectedAt: { type: Date },
    lastError: { type: String, trim: true },

    loginMethod: {
      type: String,
      enum: ["cookie", "qrcode"],
      default: "qrcode",
    },

    authData: {
      cookie: { type: String, select: false },
    },

    settings: {
      proxy: {
        host: { type: String, trim: true },
        port: { type: Number },
        username: { type: String, trim: true },
        password: { type: String, trim: true, select: false },
      },
      autoReplyEnabled: { type: Boolean, default: false },
      autoReplyMessage: { type: String, trim: true },
    },
  },
  { timestamps: true }
);

zaloAccountSchema.index(
  { tenantId: 1, provider: 1, externalUserId: 1 },
  { unique: true }
);

const zaloConversationSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    zaloAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ZaloAccount",
      required: true,
      index: true,
    },

    externalId: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ["user", "group", "note", "other"],
      default: "user",
    },
    name: { type: String, trim: true },
    avatarUrl: { type: String, trim: true },

    isMuted: { type: Boolean, default: false },
    isArchived: { type: Boolean, default: false },
    tags: { type: [String], default: [] },

    lastMessageAt: { type: Date },
    lastMessageText: { type: String, trim: true },
    unreadCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

zaloConversationSchema.index(
  { tenantId: 1, zaloAccountId: 1, externalId: 1 },
  { unique: true }
);
zaloConversationSchema.index({
  tenantId: 1,
  zaloAccountId: 1,
  lastMessageAt: -1,
});

const zaloMessageSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    zaloAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ZaloAccount",
      required: true,
      index: true,
    },
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ZaloConversation",
      required: true,
      index: true,
    },

    externalMessageId: { type: String, trim: true },
    direction: {
      type: String,
      enum: ["incoming", "outgoing"],
      required: true,
    },

    senderExternalId: { type: String, trim: true },
    senderUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    type: {
      type: String,
      enum: ["text", "image", "file", "sticker", "system"],
      default: "text",
    },
    content: { type: String, trim: true },
    attachments: {
      type: [
        {
          url: { type: String, trim: true },
          fileName: { type: String, trim: true },
          mimeType: { type: String, trim: true },
          size: { type: Number },
        },
      ],
      default: [],
    },

    status: {
      type: String,
      enum: ["sent", "delivered", "seen", "failed"],
      default: "sent",
    },
    sentAt: { type: Date },
    deliveredAt: { type: Date },
    seenAt: { type: Date },
    errorMessage: { type: String, trim: true },
  },
  { timestamps: true }
);

zaloMessageSchema.index(
  { tenantId: 1, zaloAccountId: 1, conversationId: 1, createdAt: 1 },
  {}
);
zaloMessageSchema.index({
  tenantId: 1,
  zaloAccountId: 1,
  externalMessageId: 1,
});

const ZaloAccountModel = mongoose.model("ZaloAccount", zaloAccountSchema);
const ZaloConversationModel = mongoose.model(
  "ZaloConversation",
  zaloConversationSchema
);
const ZaloMessageModel = mongoose.model("ZaloMessage", zaloMessageSchema);

module.exports = {
  ZaloAccountModel,
  ZaloConversationModel,
  ZaloMessageModel,
  zaloAccountSchema,
  zaloConversationSchema,
  zaloMessageSchema,
};
