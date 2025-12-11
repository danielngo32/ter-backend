const { getVoiceOrderSystemPrompt } = require('./voice/order.system');
const { getGeneralChatSystemPrompt } = require('./chat/general.system');
const { getProductChatSystemPrompt } = require('./chat/product.system');

module.exports = {
  getVoiceOrderSystemPrompt,
  getGeneralChatSystemPrompt,
  getProductChatSystemPrompt,
};

