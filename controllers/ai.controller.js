const express = require('express');
const multer = require('multer');
const ApiError = require('../utils/apiError');
const authHelper = require('../utils/authHelper');
const userRepository = require('../data/repositories/user.repository');
const aiRepository = require('../data/repositories/ai.repository');
const gptService = require('../services/gpt.service');
const whisperService = require('../services/whisper.service');
const ttsService = require('../services/tts.service');
const embeddingsService = require('../services/embeddings.service');

const getCurrentUserId = (req) => {
  const token = req.cookies.accessToken || (req.headers.authorization ? req.headers.authorization.split(' ')[1] : null);
  if (!token) {
    throw new ApiError(401, 'Authentication required');
  }
  return authHelper.getCurrentUserId(token);
};

const ensureTenantUser = async (req) => {
  const userId = getCurrentUserId(req);
  const user = await userRepository.findById(userId);
  if (!user || !user.tenantId) {
    throw new ApiError(404, 'User or tenant not found');
  }
  return { userId, tenantId: user.tenantId };
};

const audioFileFilter = (req, file, cb) => {
  const allowedMimes = [
    'audio/mpeg',
    'audio/mp3',
    'audio/mp4',
    'audio/wav',
    'audio/webm',
    'audio/x-m4a',
    'audio/ogg',
  ];
  
  if (allowedMimes.includes(file.mimetype) || 
      file.originalname.match(/\.(mp3|mp4|wav|webm|m4a|ogg)$/i)) {
    cb(null, true);
  } else {
    cb(new ApiError(400, `File type ${file.mimetype} is not allowed. Only audio files are allowed.`), false);
  }
};

const uploadAudio = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB (OpenAI Whisper limit)
  },
  fileFilter: audioFileFilter,
});

const chat = async (req, res, next) => {
  try {
    const { tenantId, userId } = await ensureTenantUser(req);
    const { messages, model, temperature, maxTokens, useTools, promptType, chatId, saveChat } = req.body;

    const options = {
      model,
      temperature,
      maxTokens,
      useTools,
      promptType,
    };

    const result = await gptService.chatCompletion(messages, options);

    if (saveChat && chatId) {
      await aiRepository.appendMessage(chatId, {
        role: 'user',
        content: messages[messages.length - 1]?.content || '',
        attachments: messages[messages.length - 1]?.attachments || [],
      });

      await aiRepository.appendMessage(chatId, {
        role: 'assistant',
        content: result.message.content || '',
        tokens: result.usage?.total_tokens,
      });
    } else if (saveChat && !chatId) {
      const newChat = await aiRepository.createChat({
        tenantId,
        userId,
        mode: null,
        model: null,
        title: messages[0]?.content?.substring(0, 50) || 'New Chat',
        messages: [
          {
            role: 'user',
            content: messages[messages.length - 1]?.content || '',
            attachments: messages[messages.length - 1]?.attachments || [],
          },
          {
            role: 'assistant',
            content: result.message.content || '',
            tokens: result.usage?.total_tokens,
          },
        ],
      });

      return res.status(200).json({
        ...result,
        chatId: newChat._id.toString(),
      });
    }

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const streamChat = async (req, res, next) => {
  try {
    const { tenantId, userId } = await ensureTenantUser(req);
    const { messages, model, temperature, maxTokens, useTools, promptType, chatId, saveChat } = req.body;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const options = {
      model,
      temperature,
      maxTokens,
      useTools,
      promptType,
    };

    let fullContent = '';
    let savedUserMessage = false;
    let savedChatId = chatId;
    let finishReason = null;

    const onChunk = (content) => {
      if (content) {
        fullContent += content;
        res.write(`data: ${JSON.stringify({ type: 'content', content })}\n\n`);
      }
    };

    try {
      const result = await gptService.streamChatCompletion(messages, options, onChunk);
      finishReason = result.finishReason;

      if (result.toolCalls && result.toolCalls.length > 0) {
        res.write(`data: ${JSON.stringify({ type: 'tool_calls', toolCalls: result.toolCalls })}\n\n`);
      }

      if (finishReason) {
        res.write(`data: ${JSON.stringify({ type: 'finish', reason: finishReason })}\n\n`);
      }

      if (saveChat && fullContent) {
        if (!savedUserMessage && savedChatId) {
          await aiRepository.appendMessage(savedChatId, {
            role: 'user',
            content: messages[messages.length - 1]?.content || '',
            attachments: messages[messages.length - 1]?.attachments || [],
          });
          savedUserMessage = true;
        }

        if (savedChatId) {
          await aiRepository.appendMessage(savedChatId, {
            role: 'assistant',
            content: fullContent,
          });
        } else {
          const newChat = await aiRepository.createChat({
            tenantId,
            userId,
            mode: null,
            model: null,
            title: messages[0]?.content?.substring(0, 50) || 'New Chat',
            messages: [
              {
                role: 'user',
                content: messages[messages.length - 1]?.content || '',
                attachments: messages[messages.length - 1]?.attachments || [],
              },
              {
                role: 'assistant',
                content: fullContent,
              },
            ],
          });
          savedChatId = newChat._id.toString();
        }

        res.write(`data: ${JSON.stringify({ type: 'chatId', chatId: savedChatId })}\n\n`);
      }

      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
    } catch (error) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
      res.end();
    }
  } catch (error) {
    next(error);
  }
};

const transcribe = async (req, res, next) => {
  try {
    await ensureTenantUser(req);

    if (!req.file) {
      throw new ApiError(400, 'Audio file is required');
    }

    const { language, prompt, model } = req.body;

    const options = {
      language,
      prompt,
      model,
    };

    const result = await whisperService.transcribeFromBuffer(
      req.file.buffer,
      req.file.originalname,
      options
    );

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const textToSpeech = async (req, res, next) => {
  try {
    await ensureTenantUser(req);

    const { text, voice, response_format, speed, model } = req.body;

    const options = {
      voice,
      response_format,
      speed,
      model,
    };

    const result = await ttsService.textToSpeech(text, options);

    res.setHeader('Content-Type', `audio/${result.format}`);
    res.setHeader('Content-Length', result.size);
    res.setHeader('Content-Disposition', `attachment; filename="speech.${result.format}"`);

    res.status(200).send(result.audio);
  } catch (error) {
    next(error);
  }
};

const createEmbeddings = async (req, res, next) => {
  try {
    await ensureTenantUser(req);

    const { input, model, encoding_format, dimensions } = req.body;

    const options = {
      model,
      encoding_format,
      dimensions,
    };

    const result = await embeddingsService.createEmbeddings(input, options);

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const listChats = async (req, res, next) => {
  try {
    const { tenantId, userId } = await ensureTenantUser(req);
    const { limit = 50 } = req.query;

    const chats = await aiRepository.listChatsByUser(tenantId, userId, parseInt(limit));

    res.status(200).json({
      chats: chats.map((chat) => ({
        id: chat._id.toString(),
        title: chat.title,
        lastActivityAt: chat.lastActivityAt,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
      })),
    });
  } catch (error) {
    next(error);
  }
};

const getChat = async (req, res, next) => {
  try {
    const { tenantId, userId } = await ensureTenantUser(req);
    const { id } = req.params;

    const chat = await aiRepository.findChatById(id);

    if (!chat) {
      throw new ApiError(404, 'Chat not found');
    }

    if (chat.tenantId.toString() !== tenantId.toString() || chat.userId.toString() !== userId.toString()) {
      throw new ApiError(403, 'Access denied');
    }

    res.status(200).json({
      id: chat._id.toString(),
      title: chat.title,
      messages: chat.messages,
      lastActivityAt: chat.lastActivityAt,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
    });
  } catch (error) {
    next(error);
  }
};

const deleteChat = async (req, res, next) => {
  try {
    const { tenantId, userId } = await ensureTenantUser(req);
    const { id } = req.params;

    const chat = await aiRepository.findChatById(id);

    if (!chat) {
      throw new ApiError(404, 'Chat not found');
    }

    if (chat.tenantId.toString() !== tenantId.toString() || chat.userId.toString() !== userId.toString()) {
      throw new ApiError(403, 'Access denied');
    }

    await aiRepository.deleteChat(id);

    res.status(200).json({ message: 'Chat deleted successfully' });
  } catch (error) {
    next(error);
  }
};

const getAvailableVoices = async (req, res, next) => {
  try {
    await ensureTenantUser(req);

    const voices = ttsService.getAvailableVoices();

    res.status(200).json({ voices });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  uploadAudio,
  chat,
  streamChat,
  transcribe,
  textToSpeech,
  createEmbeddings,
  listChats,
  getChat,
  deleteChat,
  getAvailableVoices,
};

