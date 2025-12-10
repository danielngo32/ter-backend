const {
  ZaloAccountModel,
  ZaloConversationModel,
  ZaloMessageModel,
} = require("../schemas/channel.schema");

const createZaloAccount = (payload) => ZaloAccountModel.create(payload);

const listZaloAccountsByTenant = (tenantId) =>
  ZaloAccountModel.find({ tenantId });

const updateZaloAccount = (id, updates) =>
  ZaloAccountModel.findByIdAndUpdate(id, { $set: updates }, { new: true });

const deleteZaloAccount = (id) => ZaloAccountModel.findByIdAndDelete(id);

const upsertConversation = async (tenantId, zaloAccountId, externalId, data) => {
  const filter = { tenantId, zaloAccountId, externalId };
  const update = {
    $set: {
      ...data,
      lastMessageAt: data.lastMessageAt,
      lastMessageText: data.lastMessageText,
    },
  };
  const options = { new: true, upsert: true };
  return ZaloConversationModel.findOneAndUpdate(filter, update, options);
};

const listConversations = (tenantId, zaloAccountId, limit = 50) =>
  ZaloConversationModel.find({ tenantId, zaloAccountId })
    .sort({ lastMessageAt: -1 })
    .limit(limit);

const createZaloMessage = (payload) => ZaloMessageModel.create(payload);

const listMessagesByConversation = (
  tenantId,
  zaloAccountId,
  conversationId,
  limit = 100
) =>
  ZaloMessageModel.find({ tenantId, zaloAccountId, conversationId })
    .sort({ createdAt: -1 })
    .limit(limit);

module.exports = {
  createZaloAccount,
  listZaloAccountsByTenant,
  updateZaloAccount,
  deleteZaloAccount,
  upsertConversation,
  listConversations,
  createZaloMessage,
  listMessagesByConversation,
};


