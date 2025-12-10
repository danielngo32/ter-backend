const mongoose = require("mongoose");

const storageShareSchema = new mongoose.Schema(
  {
    tenantWide: { type: Boolean, default: false },

    departmentIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId }],
      default: [],
    },

    userIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      default: [],
    },
  },
  { _id: false }
);

const storageItemSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: ["file", "folder"],
      default: "file",
    },

    name: { type: String, required: true, trim: true },
    mimeType: { type: String, trim: true },
    size: { type: Number, default: 0 },
    url: { type: String, trim: true },

    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StorageItem",
      default: null,
    },

    path: { type: String, trim: true },

    visibility: {
      type: String,
      enum: ["private", "shared", "public"],
      default: "private",
    },
    shares: { type: storageShareSchema, default: () => ({}) },

    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
  },
  { timestamps: true }
);

storageItemSchema.index({ tenantId: 1, ownerId: 1, visibility: 1 });
storageItemSchema.index({ tenantId: 1, parentId: 1, type: 1 });
storageItemSchema.index({ tenantId: 1, isDeleted: 1, updatedAt: 1 });

const StorageItemModel = mongoose.model("StorageItem", storageItemSchema);

module.exports = {
  StorageItemModel,
  storageItemSchema,
  storageShareSchema,
};


