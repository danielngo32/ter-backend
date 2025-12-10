const { AiChatModel } = require("../schemas/ai.schema");

const createChat = (payload) => AiChatModel.create(payload);

const findChatById = (id) => AiChatModel.findById(id);

const listChatsByUser = (tenantId, userId, limit = 50) =>
  AiChatModel.find({ tenantId, userId })
    .sort({ lastActivityAt: -1 })
    .limit(limit);

const appendMessage = (chatId, message) =>
  AiChatModel.findByIdAndUpdate(
    chatId,
    {
      $push: { messages: message },
      $set: { lastActivityAt: new Date() },
    },
    { new: true }
  );

const updateChatTitle = (chatId, title) =>
  AiChatModel.findByIdAndUpdate(
    chatId,
    { $set: { title } },
    { new: true }
  );

const deleteChat = (chatId) => AiChatModel.findByIdAndDelete(chatId);

module.exports = {
  createChat,
  findChatById,
  listChatsByUser,
  appendMessage,
  updateChatTitle,
  deleteChat,
};


