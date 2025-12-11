const { CORS_CONFIG, CONNECTION_SETTINGS } = require('../../config/websocket');
const { authenticateSocket } = require('./auth');
const voiceHandlers = require('./handlers/voice.handler');
const chatHandlers = require('./handlers/chat.handler');

const setupWebSocket = (io) => {
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    const { userId, tenantId } = socket.data;
    
    console.log(`[WebSocket] ✅ Client connected: ${socket.id}`);
    console.log(`[WebSocket] 👤 User ID: ${userId}, Tenant ID: ${tenantId}`);

    socket.on('connect_error', (error) => {
      console.error('[WebSocket] 🔴 Connection error:', error.message);
    });

    socket.on('voice_start', (data) => {
      console.log(`[WebSocket] 🎤 voice_start event received from ${socket.id}`);
      voiceHandlers.handleVoiceStart(socket, data);
    });

    socket.on('audio_chunk', (data) => {
      // Don't log every chunk to avoid spam, but log first few
      if (!socket._chunkCount) socket._chunkCount = 0;
      socket._chunkCount++;
      if (socket._chunkCount <= 3 || socket._chunkCount % 10 === 0) {
        console.log(`[WebSocket] 📦 audio_chunk #${socket._chunkCount} received from ${socket.id}, sessionId: ${data?.sessionId || 'N/A'}`);
      }
      voiceHandlers.handleAudioChunk(socket, data);
    });

    socket.on('voice_stop', (data) => {
      console.log(`[WebSocket] 🛑 voice_stop event received from ${socket.id}, sessionId: ${data?.sessionId || 'N/A'}`);
      voiceHandlers.handleVoiceStop(socket, data);
    });

    socket.on('voice_cancel', (data) => {
      console.log(`[WebSocket] ❌ voice_cancel event received from ${socket.id}, sessionId: ${data?.sessionId || 'N/A'}`);
      voiceHandlers.handleVoiceCancel(socket, data);
    });

    socket.on('cart_update', (data) => {
      console.log(`[WebSocket] 🛒 cart_update event received from ${socket.id}, orderSessionId: ${data?.orderSessionId || 'N/A'}`);
      voiceHandlers.handleCartUpdate(socket, data);
    });

    // Chat handlers
    socket.on('chat_start', (data) => {
      console.log(`[WebSocket] 💬 chat_start event received from ${socket.id}`);
      chatHandlers.handleChatStart(socket, data);
    });

    socket.on('chat_message', (data) => {
      console.log(`[WebSocket] 💬 chat_message event received from ${socket.id}, chatSessionId: ${data?.chatSessionId || 'N/A'}`);
      chatHandlers.handleChatMessage(socket, data);
    });

    socket.on('chat_cancel', (data) => {
      console.log(`[WebSocket] ❌ chat_cancel event received from ${socket.id}, chatSessionId: ${data?.chatSessionId || 'N/A'}`);
      chatHandlers.handleChatCancel(socket, data);
    });

    socket.on('chat_cart_update', (data) => {
      console.log(`[WebSocket] 🛒 chat_cart_update event received from ${socket.id}, orderSessionId: ${data?.orderSessionId || 'N/A'}`);
      chatHandlers.handleCartUpdate(socket, data);
    });

    socket.on('disconnect', (reason) => {
      console.log(`[WebSocket] ❌ Client disconnected: ${socket.id}, reason: ${reason}`);
    });

    socket.on('error', (error) => {
      console.error(`[WebSocket] 🔴 Socket error for ${socket.id}:`, error.message);
    });
  });
};

module.exports = setupWebSocket;

