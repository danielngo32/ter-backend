const { toFile } = require('openai');
const { openaiClient, DEFAULT_MODELS, DEFAULT_SETTINGS, isOpenAIAvailable } = require('../config/openai');
const ApiError = require('../utils/apiError');

const transcribeAudio = async (audioFile, options = {}) => {
  if (!isOpenAIAvailable()) {
    throw new ApiError(503, 'OpenAI service is not available. Please configure OPENAI_API_KEY.');
  }

  try {
    const model = options.model || DEFAULT_MODELS.whisper;
    const language = options.language;
    const prompt = options.prompt;

    const requestParams = {
      file: audioFile,
      model,
      response_format: 'json',
    };

    // Only include language if it's a valid string
    if (language && typeof language === 'string' && language.trim().length > 0) {
      requestParams.language = language;
    }
    
    // Only include prompt if it's a valid string
    if (prompt && typeof prompt === 'string' && prompt.trim().length > 0) {
      requestParams.prompt = prompt;
    }

    const transcription = await openaiClient.audio.transcriptions.create(requestParams);

    return {
      text: transcription.text,
      language: transcription.language || language,
    };
  } catch (error) {
    if (error.response) {
      throw new ApiError(
        error.response.status || 500,
        error.response.data?.error?.message || 'Failed to transcribe audio'
      );
    }
    throw new ApiError(500, `Whisper transcription failed: ${error.message}`);
  }
};

const transcribeFromBuffer = async (audioBuffer, filename = 'audio.mp3', options = {}) => {
  if (!isOpenAIAvailable()) {
    console.error('[Whisper] ❌ OpenAI service is not available. OPENAI_API_KEY not configured.');
    throw new ApiError(503, 'OpenAI service is not available. Please configure OPENAI_API_KEY.');
  }

  let tempPath;

  try {
    console.log('[Whisper] 🔄 Starting transcription...');
    console.log('[Whisper] 📊 Buffer size:', audioBuffer.length, 'bytes');
    console.log('[Whisper] 📁 Filename:', filename);
    console.log('[Whisper] ⚙️ Options:', JSON.stringify({ 
      model: options.model || DEFAULT_MODELS.whisper,
      language: options.language || 'not set',
      hasPrompt: !!options.prompt,
    }));

    // Use OpenAI SDK helper (toFile) per official docs
    const file = await toFile(audioBuffer, filename, {
      type: getContentType(filename),
    });

    console.log('[Whisper] ✅ File object created:', {
      name: file.name,
      type: file.type,
      size: file.size,
    });

    const requestParams = {
      file,
      model: options.model || DEFAULT_MODELS.whisper,
      response_format: 'json',
    };

    if (options.language && typeof options.language === 'string' && options.language.trim().length > 0) {
      requestParams.language = options.language;
    }
    if (options.prompt && typeof options.prompt === 'string' && options.prompt.trim().length > 0) {
      requestParams.prompt = options.prompt;
    }

    console.log('[Whisper] 📤 Sending request to OpenAI API...');
    console.log('[Whisper] 📋 Request params:', {
      model: requestParams.model,
      response_format: requestParams.response_format,
      language: requestParams.language || 'not set',
      hasPrompt: !!requestParams.prompt,
      fileSize: file.size,
    });

    const startTime = Date.now();
    const response = await openaiClient.audio.transcriptions.create(requestParams);
    const duration = Date.now() - startTime;

    console.log('[Whisper] ✅ Transcription successful!');
    console.log('[Whisper] ⏱️ Duration:', duration, 'ms');
    console.log('[Whisper] 📝 Text length:', response.text?.length || 0, 'characters');
    console.log('[Whisper] 🌐 Detected language:', response.language || options.language || 'unknown');
    console.log('[Whisper] 📄 First 100 chars:', response.text?.substring(0, 100) || 'N/A');

    return {
      text: response.text,
      language: response.language || options.language,
    };
  } catch (error) {
    console.error('[Whisper] ❌ Transcription failed!');
    console.error('[Whisper] 🔴 Error type:', error.constructor.name);
    console.error('[Whisper] 🔴 Error message:', error.message);
    
    if (error.response) {
      console.error('[Whisper] 🔴 Response status:', error.response.status);
      console.error('[Whisper] 🔴 Response data:', JSON.stringify(error.response.data, null, 2));
    }
    
    if (error.stack) {
      console.error('[Whisper] 🔴 Stack trace:', error.stack);
    }

    if (error instanceof ApiError) {
      throw error;
    }
    if (error.response) {
      throw new ApiError(
        error.response.status || 500,
        error.response.data?.error?.message || 'Failed to transcribe audio'
      );
    }
    throw new ApiError(500, `Failed to transcribe audio from buffer: ${error.message}`);
  }
};

const getContentType = (filename) => {
  const ext = filename.toLowerCase().split('.').pop();
  const contentTypes = {
    mp3: 'audio/mpeg',
    mp4: 'audio/mp4',
    m4a: 'audio/mp4', // M4A uses MP4 container format
    mpeg: 'audio/mpeg',
    mpga: 'audio/mpeg',
    mpa: 'audio/mpeg',
    wav: 'audio/wav',
    webm: 'audio/webm',
    ogg: 'audio/ogg',
    oga: 'audio/ogg',
    flac: 'audio/flac',
  };
  return contentTypes[ext] || 'audio/mpeg';
};

module.exports = {
  transcribeAudio,
  transcribeFromBuffer,
};
