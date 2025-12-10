const getAllowedOrigins = () => {
  if (process.env.WEBSOCKET_ALLOWED_ORIGINS) {
    return process.env.WEBSOCKET_ALLOWED_ORIGINS.split(",").map((origin) =>
      origin.trim()
    );
  }
  if (process.env.FRONTEND_URL) {
    return [process.env.FRONTEND_URL];
  }
  if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
    return ['http://localhost:3000', 'http://127.0.0.1:5500', 'file://'];
  }
  return ['https://ter.vn', 'https://www.ter.vn'];
};

const allowNullOrigin = process.env.WEBSOCKET_ALLOW_NO_ORIGIN === 'true';

const CORS_CONFIG = {
  origin: (origin, callback) => {
    const allowedOrigins = getAllowedOrigins();
    
    // In development, allow all origins for testing
    if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
      // Allow null origin (file://, postman, etc.)
      if (!origin || origin === 'null') {
        return callback(null, true);
      }
      // Allow any localhost
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        return callback(null, true);
      }
      // Allow if in allowed list
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // In dev, allow all
      return callback(null, true);
    }
    
    // Allow native/mobile clients that don't send Origin when explicitly permitted
    if (!origin || origin === 'null') {
      if (allowNullOrigin) {
        return callback(null, true);
      }
      return callback(new Error('Origin missing and WEBSOCKET_ALLOW_NO_ORIGIN is not enabled'));
    }

    // Production: strict check
    if (allowedOrigins.length === 0) {
      return callback(new Error('No allowed origins configured'));
    }
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ["GET", "POST"],
};

const CONNECTION_SETTINGS = {
  pingTimeout: parseInt(process.env.WEBSOCKET_PING_TIMEOUT) || 60000,
  pingInterval: parseInt(process.env.WEBSOCKET_PING_INTERVAL) || 25000,
  maxHttpBufferSize: parseInt(process.env.WEBSOCKET_MAX_BUFFER_SIZE) || 1e8, // 100MB
  transports: ["websocket", "polling"],
  allowEIO3: true,
};

const VOICE_SETTINGS = {
  maxAudioBufferSize:
    parseInt(process.env.WEBSOCKET_MAX_AUDIO_BUFFER) || 10 * 1024 * 1024, // 10MB
  sessionTimeout:
    parseInt(process.env.WEBSOCKET_SESSION_TIMEOUT) || 5 * 60 * 1000, // 5 minutes
  audioChunkSize: parseInt(process.env.WEBSOCKET_AUDIO_CHUNK_SIZE) || 64 * 1024, // 64KB
  cleanupInterval: parseInt(process.env.WEBSOCKET_CLEANUP_INTERVAL) || 60000, // 1 minute
  // Partial transcription: wait ~2s of audio to improve accuracy
  partialTranscriptionInterval: parseInt(process.env.WEBSOCKET_PARTIAL_TRANSCRIPTION_INTERVAL) || 2000, // 2 seconds
  partialTranscriptionMinChunks: parseInt(process.env.WEBSOCKET_PARTIAL_TRANSCRIPTION_MIN_CHUNKS) || 4, // Minimum chunks before transcribing
};

const CHAT_SETTINGS = {
  maxMessageLength: parseInt(process.env.WEBSOCKET_MAX_MESSAGE_LENGTH) || 10000,
  rateLimit: {
    windowMs: parseInt(process.env.WEBSOCKET_RATE_LIMIT_WINDOW) || 60000, // 1 minute
    max: parseInt(process.env.WEBSOCKET_RATE_LIMIT_MAX) || 100, // 100 messages per minute
  },
};

module.exports = {
  CORS_CONFIG,
  CONNECTION_SETTINGS,
  VOICE_SETTINGS,
  CHAT_SETTINGS,
  getAllowedOrigins,
};
