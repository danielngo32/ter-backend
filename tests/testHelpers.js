const authController = require('../controllers/auth.controller');

const getTestToken = (type, identifier) => {
  const store = type === 'passwordReset' 
    ? authController._resetTokens 
    : authController._verificationTokens;
  
  if (!store) {
    return null;
  }

  const token = Array.from(store.keys()).find(
    (key) => {
      const record = store.get(key);
      if (!record) return false;
      const recordUserId = record.userId?.toString() || record.userId;
      const identifierStr = identifier?.toString() || identifier;
      return recordUserId === identifierStr;
    }
  );
  
  if (token) {
    return token;
  }

  const tokens = Array.from(store.keys());
  return tokens[0] || null;
};

module.exports = {
  getTestToken,
};

