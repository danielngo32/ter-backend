const { emitError } = require('../utils');

const handleError = (socket, error, sessionId = null) => {
  const message = error.message || 'An unexpected error occurred';
  const code = error.code || 'ERROR';
  
  emitError(socket, sessionId, message, code);
  
  if (process.env.NODE_ENV === 'development') {
    console.error('WebSocket error:', error);
  }
};

const validateMessage = (data, requiredFields = []) => {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid message format');
  }

  for (const field of requiredFields) {
    if (!(field in data)) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  return true;
};

module.exports = {
  handleError,
  validateMessage,
};

