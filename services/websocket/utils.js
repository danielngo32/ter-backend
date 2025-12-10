const { VOICE_SETTINGS } = require('../../config/websocket');

class AudioBufferManager {
  constructor() {
    this.buffers = new Map();
    this.timeouts = new Map();
  }

  createSession(sessionId) {
    if (this.buffers.has(sessionId)) {
      return false;
    }

    this.buffers.set(sessionId, {
      chunks: [],
      totalSize: 0,
      createdAt: Date.now(),
      lastTranscriptionIndex: 0, // Track last chunk index that was transcribed
      lastTranscriptionTime: Date.now(), // Track last transcription time
      isPartialTranscribing: false, // Prevent concurrent partial transcription
      audioFormat: 'webm', // Default format, can be overridden by client
    });

    this.setSessionTimeout(sessionId);
    return true;
  }

  appendChunk(sessionId, chunk) {
    const session = this.buffers.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Validate chunk is not empty
    if (!chunk || typeof chunk !== 'string' || chunk.trim().length === 0) {
      throw new Error('Invalid chunk: chunk is empty or not a string');
    }

    let chunkBuffer;
    try {
      chunkBuffer = Buffer.from(chunk, 'base64');
    } catch (error) {
      throw new Error(`Invalid chunk: failed to decode base64 - ${error.message}`);
    }

    const chunkSize = chunkBuffer.length;

    // Validate chunk size
    if (chunkSize === 0) {
      throw new Error('Invalid chunk: decoded buffer is empty');
    }

    if (chunkSize > VOICE_SETTINGS.maxAudioBufferSize) {
      throw new Error(`Chunk size ${chunkSize} exceeds maximum buffer size ${VOICE_SETTINGS.maxAudioBufferSize}`);
    }

    if (session.totalSize + chunkSize > VOICE_SETTINGS.maxAudioBufferSize) {
      throw new Error('Audio buffer size exceeded');
    }

    session.chunks.push(chunkBuffer);
    session.totalSize += chunkSize;

    this.setSessionTimeout(sessionId);
  }

  mergeChunks(sessionId) {
    const session = this.buffers.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    if (session.chunks.length === 0) {
      throw new Error('No audio chunks to merge');
    }

    // Validate minimum audio size (at least 1KB)
    if (session.totalSize < 1024) {
      throw new Error('Audio buffer too small. Minimum 1KB required.');
    }

    const mergedBuffer = Buffer.concat(session.chunks);
    
    // Validate buffer is not empty
    if (mergedBuffer.length === 0) {
      throw new Error('Merged audio buffer is empty');
    }

    return mergedBuffer;
  }

  // Get chunks since last transcription for partial transcription
  getChunksSinceLastTranscription(sessionId) {
    const session = this.buffers.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    if (session.chunks.length === 0 || session.lastTranscriptionIndex >= session.chunks.length) {
      return null;
    }

    const newChunks = session.chunks.slice(session.lastTranscriptionIndex);
    const mergedBuffer = Buffer.concat(newChunks);
    
    return mergedBuffer;
  }

  // Update last transcription index after partial transcription
  updateLastTranscriptionIndex(sessionId) {
    const session = this.buffers.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    session.lastTranscriptionIndex = session.chunks.length;
    session.lastTranscriptionTime = Date.now();
  }

  getSession(sessionId) {
    return this.buffers.get(sessionId);
  }

  deleteSession(sessionId) {
    const session = this.buffers.get(sessionId);
    if (session) {
      session.chunks = [];
      session.totalSize = 0;
    }
    this.buffers.delete(sessionId);
    this.clearSessionTimeout(sessionId);
  }

  setSessionTimeout(sessionId) {
    this.clearSessionTimeout(sessionId);

    const timeout = setTimeout(() => {
      this.deleteSession(sessionId);
    }, VOICE_SETTINGS.sessionTimeout);

    this.timeouts.set(sessionId, timeout);
  }

  clearSessionTimeout(sessionId) {
    const timeout = this.timeouts.get(sessionId);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(sessionId);
    }
  }

  cleanup() {
    const now = Date.now();
    for (const [sessionId, session] of this.buffers.entries()) {
      if (now - session.createdAt > VOICE_SETTINGS.sessionTimeout) {
        this.deleteSession(sessionId);
      }
    }
  }

  getAllSessions() {
    return Array.from(this.buffers.keys());
  }
}

const audioBufferManager = new AudioBufferManager();

setInterval(() => {
  audioBufferManager.cleanup();
}, VOICE_SETTINGS.cleanupInterval);

const generateSessionId = () => {
  return `voice_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

const emitError = (socket, sessionId, message, code = 'ERROR') => {
  socket.emit('error', {
    type: 'error',
    sessionId,
    message,
    code,
    timestamp: Date.now(),
  });
};

const emitSuccess = (socket, type, sessionId, data = {}) => {
  socket.emit(type, {
    type,
    sessionId,
    ...data,
    timestamp: Date.now(),
  });
};

module.exports = {
  audioBufferManager,
  generateSessionId,
  emitError,
  emitSuccess,
};

