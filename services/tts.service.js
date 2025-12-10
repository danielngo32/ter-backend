const { openaiClient, DEFAULT_MODELS, DEFAULT_SETTINGS, isOpenAIAvailable } = require('../config/openai');
const ApiError = require('../utils/apiError');

const textToSpeech = async (text, options = {}) => {
  if (!isOpenAIAvailable()) {
    throw new ApiError(503, 'OpenAI service is not available. Please configure OPENAI_API_KEY.');
  }

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new ApiError(400, 'Text is required and cannot be empty');
  }

  try {
    const model = options.model || DEFAULT_MODELS.tts;
    const voice = options.voice || DEFAULT_MODELS.ttsVoice;
    const responseFormat = options.response_format || 'mp3';
    const speed = options.speed || 1.0;

    if (speed < 0.25 || speed > 4.0) {
      throw new ApiError(400, 'Speed must be between 0.25 and 4.0');
    }

    const response = await openaiClient.audio.speech.create({
      model,
      input: text,
      voice,
      response_format: responseFormat,
      speed,
    });

    const buffer = Buffer.from(await response.arrayBuffer());

    return {
      audio: buffer,
      format: responseFormat,
      size: buffer.length,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (error.response) {
      throw new ApiError(
        error.response.status || 500,
        error.response.data?.error?.message || 'Failed to generate speech'
      );
    }
    throw new ApiError(500, `TTS generation failed: ${error.message}`);
  }
};

const getAvailableVoices = () => {
  return ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
};

module.exports = {
  textToSpeech,
  getAvailableVoices,
};

