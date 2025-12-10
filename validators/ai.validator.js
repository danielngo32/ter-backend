const Joi = require('joi');

const validate = (schema) => async (req, res, next) => {
  try {
    const value = await schema.validateAsync(req.body, { abortEarly: false, stripUnknown: true });
    req.body = value;
    next();
  } catch (error) {
    res.status(400).json({
      message: 'Validation failed',
      details: error.details?.map((d) => d.message) || [],
    });
  }
};

const validateQuery = (schema) => async (req, res, next) => {
  try {
    const value = await schema.validateAsync(req.query, { abortEarly: false, stripUnknown: true });
    req.query = value;
    next();
  } catch (error) {
    res.status(400).json({
      message: 'Validation failed',
      details: error.details?.map((d) => d.message) || [],
    });
  }
};

const validateParams = (schema) => async (req, res, next) => {
  try {
    const value = await schema.validateAsync(req.params, { abortEarly: false, stripUnknown: true });
    req.params = value;
    next();
  } catch (error) {
    res.status(400).json({
      message: 'Validation failed',
      details: error.details?.map((d) => d.message) || [],
    });
  }
};

const messageSchema = Joi.object({
  role: Joi.string().valid('user', 'assistant', 'system', 'tool').required(),
  content: Joi.string().allow('', null).optional(),
  attachments: Joi.array().items(
    Joi.object({
      type: Joi.string().valid('file', 'image', 'audio', 'video', 'other').default('file'),
      url: Joi.string().uri().required(),
      fileName: Joi.string().trim().optional(),
      mimeType: Joi.string().trim().optional(),
      size: Joi.number().min(0).optional(),
      source: Joi.string().valid('user', 'assistant', 'system', 'tool').default('user'),
    })
  ).default([]),
  tokens: Joi.number().min(0).optional(),
});

const chatSchema = Joi.object({
  messages: Joi.array().items(messageSchema).min(1).required(),
  model: Joi.string().trim().optional(),
  temperature: Joi.number().min(0).max(2).optional(),
  maxTokens: Joi.number().min(1).max(4096).optional(),
  useTools: Joi.boolean().default(true),
  promptType: Joi.string().valid('general', 'voice_order').default('general'),
  chatId: Joi.string().trim().optional(),
  saveChat: Joi.boolean().default(true),
});

const transcribeSchema = Joi.object({
  language: Joi.string().length(2).optional(),
  prompt: Joi.string().max(1000).optional(),
  model: Joi.string().trim().optional(),
});

const ttsSchema = Joi.object({
  text: Joi.string().trim().required().min(1).max(4096),
  voice: Joi.string().valid('alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer').optional(),
  response_format: Joi.string().valid('mp3', 'opus', 'aac', 'flac').default('mp3'),
  speed: Joi.number().min(0.25).max(4.0).default(1.0),
  model: Joi.string().trim().optional(),
});

const embeddingsSchema = Joi.object({
  input: Joi.alternatives()
    .try(
      Joi.string().trim().min(1),
      Joi.array().items(Joi.string().trim().min(1)).min(1).max(2048)
    )
    .required(),
  model: Joi.string().trim().optional(),
  encoding_format: Joi.string().valid('float', 'base64').default('float'),
  dimensions: Joi.number().min(1).optional(),
});

const chatIdParamSchema = Joi.object({
  id: Joi.string().trim().required(),
});

const validateChat = validate(chatSchema);
const validateTranscribe = validate(transcribeSchema);
const validateTTS = validate(ttsSchema);
const validateEmbeddings = validate(embeddingsSchema);
const validateChatIdParam = validateParams(chatIdParamSchema);

module.exports = {
  validateChat,
  validateTranscribe,
  validateTTS,
  validateEmbeddings,
  validateChatIdParam,
};

