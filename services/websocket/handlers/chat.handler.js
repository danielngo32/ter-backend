const gptService = require('../../gpt.service');
const { handleError, validateMessage } = require('./base.handler');
const { emitError, emitSuccess } = require('../utils');

const chatSessions = new Map();
const generateChatSessionId = () => `chat_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
const generateOrderSessionId = () => `order_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

const getOrCreateChatSession = (chatSessionId, orderSessionId, socketId) => {
  const chatId = chatSessionId || generateChatSessionId();
  const orderId = orderSessionId || generateOrderSessionId();
  
  if (!chatSessions.has(chatId)) {
    chatSessions.set(chatId, {
      messages: [],
      orderSessionId: orderId,
      socketId,
      cartItems: [],
      total: 0,
      createdAt: new Date(),
      lastActivityAt: new Date(),
    });
  } else {
    chatSessions.get(chatId).lastActivityAt = new Date();
  }
  
  return { chatSessionId: chatId, session: chatSessions.get(chatId) };
};

const clearChatSession = (chatSessionId) => {
  if (chatSessionId && chatSessions.has(chatSessionId)) {
    chatSessions.delete(chatSessionId);
  }
};

const handleChatMessage = async (socket, data) => {
  try {
    console.log('[Chat Handler] 💬 handleChatMessage called');
    validateMessage(data, ['message']);

    const { message, chatSessionId, orderSessionId } = data;
    const { userId, tenantId } = socket.data;

    console.log('[Chat Handler] 📝 Message:', message.substring(0, 100));
    console.log('[Chat Handler] 👤 User:', userId, 'Tenant:', tenantId);

    const chatSession = getOrCreateChatSession(chatSessionId, orderSessionId, socket.id);
    const session = chatSession.session;

    session.messages.push({
      role: 'user',
      content: message,
      timestamp: new Date(),
    });

    const messages = session.messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    const context = {
      userId,
      tenantId,
      orderSessionId: session.orderSessionId,
      currentCartItems: session.cartItems || [],
      currentTotal: session.total || 0,
    };

    console.log('[Chat Handler] 🤖 Calling GPT service...');
    const result = await gptService.chatCompletion(messages, {
      model: 'gpt-4o-mini',
      temperature: 0.7,
      maxTokens: 2000,
      useTools: true,
      promptType: 'product_chat',
      context,
    });

    console.log('[Chat Handler] ✅ GPT response received');
    console.log('[Chat Handler] 📋 Tool calls:', result.toolCalls?.length || 0);
    console.log('[Chat Handler] 📋 Tool results:', result.toolResults?.length || 0);
    if (result.toolCalls && result.toolCalls.length > 0) {
      console.log('[Chat Handler] 🔧 Tool calls:', result.toolCalls.map(tc => ({ name: tc.function?.name, id: tc.id })));
    }
    if (result.toolResults && result.toolResults.length > 0) {
      console.log('[Chat Handler] 📊 Tool results:', result.toolResults.map(tr => ({ name: tr.name, hasContent: !!tr.content })));
    }
    console.log('[Chat Handler] 💬 Response content:', result.message.content?.substring(0, 200) || 'N/A');

    session.messages.push({
      role: 'assistant',
      content: result.message.content || '',
      toolCalls: result.toolCalls || [],
      timestamp: new Date(),
    });

    let cartItems = session.cartItems;
    let total = session.total;

    if (result.toolResults && result.toolResults.length > 0) {
      const orderTotalResult = result.toolResults.find(
        (tr) => tr.name === 'calculate_order_total'
      );

      if (orderTotalResult && orderTotalResult.content) {
        try {
          const parsed = typeof orderTotalResult.content === 'string'
            ? JSON.parse(orderTotalResult.content)
            : orderTotalResult.content;

          console.log('[Chat Handler] 🛒 Parsed order total result:', {
            itemsCount: parsed.items?.length || 0,
            grandTotal: parsed.grandTotal,
          });

          if (parsed.items) {
            if (parsed.items.length > 0 || session.cartItems.length === 0) {
              cartItems = parsed.items;
              session.cartItems = cartItems;
            } else {
              console.warn('[Chat Handler] ⚠️ AI returned empty items but cart has items. Keeping existing cart.');
              cartItems = session.cartItems;
            }
          }
          if (parsed.grandTotal !== undefined) {
            total = parsed.grandTotal;
            session.total = total;
          } else if (cartItems.length > 0) {
            // Nếu không có grandTotal nhưng có items, tính lại total
            total = cartItems.reduce((sum, item) => sum + (item.lineTotal || 0), 0);
            session.total = total;
          }
        } catch (error) {
          console.error('[Chat Handler] ⚠️ Error parsing tool result:', error);
        }
      } else {
        console.warn('[Chat Handler] ⚠️ No calculate_order_total tool result found!');
        console.warn('[Chat Handler] ⚠️ Available tool results:', result.toolResults.map(tr => tr.name));
      }
    } else {
      console.warn('[Chat Handler] ⚠️ No tool results at all!');
    }

    emitSuccess(socket, 'chat_response', chatSession.chatSessionId, {
      content: result.message.content || '',
      chatSessionId: chatSession.chatSessionId,
      orderSessionId: session.orderSessionId,
      cartItems,
      total,
      toolCalls: result.toolCalls || [],
    });

    console.log('[Chat Handler] 📤 Emitted chat_response event');
  } catch (error) {
    console.error('[Chat Handler] ❌ Error in handleChatMessage:', error.message);
    handleError(socket, error, data?.chatSessionId);
  }
};

const handleChatStart = async (socket, data) => {
  try {
    console.log('[Chat Handler] 🚀 handleChatStart called');
    validateMessage(data, []);

    const { chatSessionId, orderSessionId } = data;
    const { userId, tenantId } = socket.data;

    const chatSession = getOrCreateChatSession(chatSessionId, orderSessionId, socket.id);

    emitSuccess(socket, 'chat_session_started', chatSession.chatSessionId, {
      chatSessionId: chatSession.chatSessionId,
      orderSessionId: chatSession.session.orderSessionId,
      userId,
      tenantId,
    });

    console.log('[Chat Handler] 📤 Emitted chat_session_started event');
  } catch (error) {
    console.error('[Chat Handler] ❌ Error in handleChatStart:', error.message);
    handleError(socket, error, data?.chatSessionId);
  }
};

const handleChatCancel = async (socket, data) => {
  try {
    console.log('[Chat Handler] ❌ handleChatCancel called');
    validateMessage(data, []);

    const { chatSessionId } = data;
    if (chatSessionId) {
      clearChatSession(chatSessionId);
    }

    emitSuccess(socket, 'chat_session_cancelled', chatSessionId || null, {
      chatSessionId: chatSessionId || null,
    });

    console.log('[Chat Handler] 📤 Emitted chat_session_cancelled event');
  } catch (error) {
    console.error('[Chat Handler] ❌ Error in handleChatCancel:', error.message);
    handleError(socket, error, data?.chatSessionId);
  }
};

const handleCartUpdate = async (socket, data) => {
  try {
    console.log('[Chat Handler] 🛒 handleCartUpdate called');
    validateMessage(data, ['orderSessionId', 'items', 'total']);

    const { orderSessionId, items, total } = data;
    const { userId, tenantId } = socket.data;

    let targetSession = null;
    for (const [chatId, session] of chatSessions.entries()) {
      if (session.orderSessionId === orderSessionId) {
        targetSession = session;
        break;
      }
    }

    if (targetSession) {
      targetSession.cartItems = items;
      targetSession.total = total;
      targetSession.lastActivityAt = new Date();
    }

    emitSuccess(socket, 'cart_updated', orderSessionId, {
      orderSessionId,
      items,
      total,
    });

    console.log('[Chat Handler] 📤 Emitted cart_updated event');
  } catch (error) {
    console.error('[Chat Handler] ❌ Error in handleCartUpdate:', error.message);
    handleError(socket, error, data?.orderSessionId);
  }
};

setInterval(() => {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  
  for (const [chatId, session] of chatSessions.entries()) {
    if (session.lastActivityAt < oneHourAgo) {
      console.log(`[Chat Handler] 🗑️ Cleaning up old session: ${chatId}`);
      chatSessions.delete(chatId);
    }
  }
}, 5 * 60 * 1000); 

module.exports = {
  handleChatMessage,
  handleChatStart,
  handleChatCancel,
  handleCartUpdate,
};

