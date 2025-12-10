const { OpenAI } = require('openai');

if (!process.env.OPENAI_API_KEY) {
  if (process.env.NODE_ENV === 'development') {
    console.warn('Warning: OPENAI_API_KEY is not set. AI functionality will be disabled.');
  }
}

const baseURL = process.env.OPENAI_BASE_URL || undefined;

const realtimeBaseURL =
  process.env.OPENAI_REALTIME_BASE_URL || 'wss://api.openai.com/v1/realtime';

const clientOptions = {
  apiKey: process.env.OPENAI_API_KEY,
  ...(baseURL ? { baseURL } : {}),
};

const openaiClient = process.env.OPENAI_API_KEY ? new OpenAI(clientOptions) : null;

const DEFAULT_MODELS = {
  whisper: process.env.OPENAI_WHISPER_MODEL || 'whisper-1',
  chat: process.env.OPENAI_CHAT_MODEL || 'gpt-4o',
  tts: process.env.OPENAI_TTS_MODEL || 'tts-1',
  ttsVoice: process.env.OPENAI_TTS_VOICE || 'nova', // alloy, echo, fable, onyx, nova, shimmer
  embeddings: process.env.OPENAI_EMBEDDINGS_MODEL || 'text-embedding-3-small',
  realtime: process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-mini-realtime',
};

const DEFAULT_SETTINGS = {
  maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 2000,
  temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.7,
  timeout: parseInt(process.env.OPENAI_TIMEOUT) || 60000,
  maxRetries: parseInt(process.env.OPENAI_MAX_RETRIES) || 3,
};

const getOpenAIConfig = () => ({
  client: openaiClient,
  baseURL,
  realtimeBaseURL,
  models: DEFAULT_MODELS,
  settings: DEFAULT_SETTINGS,
});

const isOpenAIAvailable = () => !!openaiClient;

module.exports = {
  openaiClient,
  baseURL,
  realtimeBaseURL,
  DEFAULT_MODELS,
  DEFAULT_SETTINGS,
  getOpenAIConfig,
  isOpenAIAvailable,
};