const { realtimeBaseURL, DEFAULT_MODELS } = require('../config/openai');

const DEFAULT_REALTIME_MODEL = DEFAULT_MODELS.realtime || 'gpt-4o-mini-realtime';

const buildRealtimeConfig = (model = DEFAULT_REALTIME_MODEL) => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  const url = `${realtimeBaseURL}?model=${encodeURIComponent(model)}`;

  const headers = {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    'OpenAI-Beta': 'realtime=v1',
  };

  return { url, headers, model };
};

module.exports = {
  buildRealtimeConfig,
};

