const authHelper = require('../../utils/authHelper');
const userRepository = require('../../data/repositories/user.repository');
const ApiError = require('../../utils/apiError');

const parseCookies = (cookieHeader) => {
  if (!cookieHeader) return {};
  const cookies = {};
  cookieHeader.split(';').forEach((cookie) => {
    const parts = cookie.trim().split('=');
    if (parts.length === 2) {
      cookies[parts[0]] = parts[1];
    }
  });
  return cookies;
};

const authenticateSocket = async (socket, next) => {
  try {
    // Try multiple sources for token
    let token = socket.handshake.auth?.token || 
                socket.handshake.query?.token ||
                (socket.handshake.headers?.authorization ? socket.handshake.headers.authorization.split(' ')[1] : null);

    // If no token in auth/query/headers, try to get from cookies
    if (!token && socket.handshake.headers?.cookie) {
      const cookies = parseCookies(socket.handshake.headers.cookie);
      token = cookies.accessToken;
      
      if (process.env.NODE_ENV === 'development') {
        if (!token) {
          console.log('No accessToken in cookies, available cookies:', Object.keys(cookies));
        } else {
          console.log('Found accessToken in cookies');
        }
      }
      
      // If still no token, try refreshToken (but this should be used to get new accessToken)
      // For now, we'll allow it as fallback, but ideally should refresh first
      if (!token && cookies.refreshToken) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('Using refreshToken as fallback - should refresh accessToken first');
        }
        token = cookies.refreshToken;
      }
    }

    if (!token) {
      if (process.env.NODE_ENV === 'development') {
        console.error('WebSocket auth error: Token missing');
        console.error('Handshake auth:', socket.handshake.auth);
        console.error('Handshake query:', socket.handshake.query);
        console.error('Handshake headers:', socket.handshake.headers);
        if (socket.handshake.headers?.cookie) {
          const cookies = parseCookies(socket.handshake.headers.cookie);
          console.error('Cookies:', Object.keys(cookies));
        }
      }
      return next(new Error('Authentication token missing'));
    }

    try {
      const userId = authHelper.getCurrentUserId(token);
      const user = await userRepository.findById(userId);

      if (!user || !user.tenantId) {
        if (process.env.NODE_ENV === 'development') {
          console.error('WebSocket auth error: User or tenant not found', { userId, user: !!user });
        }
        return next(new Error('User or tenant not found'));
      }

      socket.data.userId = userId;
      socket.data.tenantId = user.tenantId.toString();
      socket.data.user = user;

      if (process.env.NODE_ENV === 'development') {
        console.log(`WebSocket authenticated: User ${userId}, Tenant ${user.tenantId}`);
      }

      next();
    } catch (authError) {
      if (process.env.NODE_ENV === 'development') {
        console.error('WebSocket auth error:', authError.message);
      }
      if (authError instanceof ApiError) {
        return next(new Error(authError.message));
      }
      return next(new Error('Invalid or expired token'));
    }
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('WebSocket auth unexpected error:', error);
    }
    return next(new Error('Authentication failed'));
  }
};

module.exports = {
  authenticateSocket,
};

