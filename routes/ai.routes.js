const express = require('express');
const aiController = require('../controllers/ai.controller');
const validator = require('../validators/ai.validator');

const router = express.Router();

router.post(
  '/chat',
  validator.validateChat,
  aiController.chat
);

router.post(
  '/chat/stream',
  validator.validateChat,
  aiController.streamChat
);

router.post(
  '/transcribe',
  aiController.uploadAudio.single('audio'),
  validator.validateTranscribe,
  aiController.transcribe
);

router.post(
  '/tts',
  validator.validateTTS,
  aiController.textToSpeech
);

router.post(
  '/embeddings',
  validator.validateEmbeddings,
  aiController.createEmbeddings
);

router.get(
  '/chats',
  aiController.listChats
);

router.get(
  '/chats/:id',
  validator.validateChatIdParam,
  aiController.getChat
);

router.delete(
  '/chats/:id',
  validator.validateChatIdParam,
  aiController.deleteChat
);

router.get(
  '/voices',
  aiController.getAvailableVoices
);

module.exports = router;

