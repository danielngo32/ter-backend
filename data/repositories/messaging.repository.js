const {
  MessageRoomModel,
  MessageModel,
} = require("../schemas/messaging.schema");

const createRoom = (payload) => MessageRoomModel.create(payload);

const findRoomById = (id) => MessageRoomModel.findById(id);

const listRoomsByTenant = (tenantId, filter = {}, limit = 50) =>
  MessageRoomModel.find({ tenantId, ...filter })
    .sort({ lastMessageAt: -1 })
    .limit(limit);

const updateRoom = (id, updates) =>
  MessageRoomModel.findByIdAndUpdate(id, { $set: updates }, { new: true });

const createMessage = (payload) => MessageModel.create(payload);

const listMessagesByRoom = (roomId, limit = 100) =>
  MessageModel.find({ roomId }).sort({ createdAt: -1 }).limit(limit);

const markMessageEdited = (messageId, content) =>
  MessageModel.findByIdAndUpdate(
    messageId,
    { $set: { content, isEdited: true, editedAt: new Date() } },
    { new: true }
  );

module.exports = {
  createRoom,
  findRoomById,
  listRoomsByTenant,
  updateRoom,
  createMessage,
  listMessagesByRoom,
  markMessageEdited,
};


