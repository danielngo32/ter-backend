const mongoose = require("mongoose");

const roomParticipantSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    role: {
      type: String,
      enum: ["owner", "admin", "member"],
      default: "member",
    },
    joinedAt: { type: Date, default: Date.now },
    isMuted: { type: Boolean, default: false },
  },
  { _id: true }
);

const messageReadSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    readAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MessageRoom",
      required: true,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["text", "image", "file", "system"],
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
    reads: { type: [messageReadSchema], default: [] },
    isEdited: { type: Boolean, default: false },
    editedAt: { type: Date },
  },
  { timestamps: true }
);

messageSchema.index({ roomId: 1, createdAt: 1 });

const messageRoomSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["direct", "group", "tenant"],
      default: "group",
    },
    name: { type: String, trim: true },
    isDefaultTenantRoom: { type: Boolean, default: false },
    directUserIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      default: [],
    },
    participants: {
      type: [roomParticipantSchema],
      default: [],
    },

    lastMessageAt: { type: Date },
    lastMessageText: { type: String, trim: true },

    isArchived: { type: Boolean, default: false },
    archivedAt: { type: Date },
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

messageRoomSchema.index({ tenantId: 1, type: 1, isDefaultTenantRoom: 1 });
messageRoomSchema.index({ tenantId: 1, "participants.userId": 1 });

const MessageRoomModel = mongoose.model("MessageRoom", messageRoomSchema);
const MessageModel = mongoose.model("Message", messageSchema);

module.exports = {
  MessageRoomModel,
  MessageModel,
  messageRoomSchema,
  messageSchema,
  roomParticipantSchema,
  messageReadSchema,
};


