const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const ApiError = require('./apiError');

const ensureJwtSecret = () => {
  if (!process.env.JWT_SECRET) {
    throw new ApiError(500, 'JWT secret is not configured');
  }
  return process.env.JWT_SECRET;
};

const buildToken = (payload, options = {}) =>
  jwt.sign(payload, ensureJwtSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
    ...options,
  });

const decodeToken = (token) => {
  if (!token) {
    throw new ApiError(401, 'Authentication token missing');
  }
  try {
    return jwt.verify(token, ensureJwtSecret());
  } catch (error) {
    throw new ApiError(401, 'Invalid or expired token');
  }
};

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const sanitizeUser = (userDoc) => {
  if (!userDoc) return null;
  return typeof userDoc.toSafeObject === 'function' ? userDoc.toSafeObject() : userDoc;
};

const hashPassword = async (password) => bcrypt.hash(password, 10);

const comparePassword = async (password, hash) => bcrypt.compare(password, hash);

const validateUserPassword = async (userDoc, password) => {
  if (!userDoc || !userDoc.passwordHash) {
    throw new ApiError(401, 'Invalid credentials');
  }

  const isMatch = await bcrypt.compare(password, userDoc.passwordHash);
  if (!isMatch) {
    throw new ApiError(401, 'Invalid credentials');
  }
  return userDoc;
};

const getCurrentUser = async (token, userRepository) => {
  const payload = decodeToken(token);
  const user = await userRepository.findById(payload.sub);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  return sanitizeUser(user);
};

const getCurrentUserEmail = (token) => decodeToken(token).email;

const getCurrentUserId = (token) => decodeToken(token).sub;

const getCurrentTenantId = (token) => decodeToken(token).tenantId;

const isLoggedIn = (token) => {
  try {
    decodeToken(token);
    return true;
  } catch (error) {
    return false;
  }
};

const isLoggedOut = (token) => !isLoggedIn(token);

module.exports = {
  buildToken,
  decodeToken,
  hashToken,
  sanitizeUser,
  hashPassword,
  comparePassword,
  validateUserPassword,
  getCurrentUser,
  getCurrentUserEmail,
  getCurrentUserId,
  getCurrentTenantId,
  isLoggedIn,
  isLoggedOut,
};