const { getVoiceOrderSystemPrompt } = require('./voice/order.system');
const { getGeneralChatSystemPrompt } = require('./chat/general.system');

module.exports = {
  getVoiceOrderSystemPrompt,
  getGeneralChatSystemPrompt,
};

