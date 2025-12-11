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
    const origin = socket.handshake.headers?.origin || 'no origin';
    const userAgent = socket.handshake.headers?.['user-agent'] || 'unknown';
    const isMobile = userAgent.includes('Expo') || userAgent.includes('ReactNative') || !socket.handshake.headers?.origin;
    
    console.log(`[WebSocket Auth] 🔐 Authentication attempt from: ${origin}, Mobile: ${isMobile}`);
    console.log(`[WebSocket Auth] 📱 User-Agent: ${userAgent}`);
    
    // Try multiple sources for token
    let token = socket.handshake.auth?.token || 
                socket.handshake.query?.token ||
                (socket.handshake.headers?.authorization ? socket.handshake.headers.authorization.split(' ')[1] : null);

    console.log(`[WebSocket Auth] 🔑 Token sources - auth: ${!!socket.handshake.auth?.token}, query: ${!!socket.handshake.query?.token}, header: ${!!socket.handshake.headers?.authorization}`);

    // If no token in auth/query/headers, try to get from cookies
    if (!token && socket.handshake.headers?.cookie) {
      const cookies = parseCookies(socket.handshake.headers.cookie);
      token = cookies.accessToken;
      
      console.log(`[WebSocket Auth] 🍪 Checking cookies - accessToken: ${!!cookies.accessToken}, available cookies: ${Object.keys(cookies).join(', ')}`);
      
      // If still no token, try refreshToken (but this should be used to get new accessToken)
      // For now, we'll allow it as fallback, but ideally should refresh first
      if (!token && cookies.refreshToken) {
        console.warn('[WebSocket Auth] ⚠️ Using refreshToken as fallback - should refresh accessToken first');
        token = cookies.refreshToken;
      }
    }

    if (!token) {
      console.error('[WebSocket Auth] ❌ Token missing');
      console.error('[WebSocket Auth] Handshake auth:', JSON.stringify(socket.handshake.auth, null, 2));
      console.error('[WebSocket Auth] Handshake query:', JSON.stringify(socket.handshake.query, null, 2));
      console.error('[WebSocket Auth] Handshake headers keys:', Object.keys(socket.handshake.headers || {}));
        if (socket.handshake.headers?.cookie) {
          const cookies = parseCookies(socket.handshake.headers.cookie);
        console.error('[WebSocket Auth] Cookies:', Object.keys(cookies));
      }
      return next(new Error('Authentication token missing'));
    }
    
    console.log(`[WebSocket Auth] ✅ Token found: ${token.substring(0, 20)}...`);

    try {
      const userId = authHelper.getCurrentUserId(token);
      console.log(`[WebSocket Auth] 👤 Extracted User ID: ${userId}`);
      
      const user = await userRepository.findById(userId);

      if (!user || !user.tenantId) {
        console.error('[WebSocket Auth] ❌ User or tenant not found', { userId, user: !!user, tenantId: user?.tenantId });
        return next(new Error('User or tenant not found'));
      }

      socket.data.userId = userId;
      socket.data.tenantId = user.tenantId.toString();
      socket.data.user = user;

      console.log(`[WebSocket Auth] ✅ Authenticated successfully: User ${userId}, Tenant ${user.tenantId}`);

      next();
    } catch (authError) {
      console.error('[WebSocket Auth] ❌ Token validation error:', authError.message);
      console.error('[WebSocket Auth] Error stack:', authError.stack);
      if (authError instanceof ApiError) {
        return next(new Error(authError.message));
      }
      return next(new Error('Invalid or expired token'));
    }
  } catch (error) {
    console.error('[WebSocket Auth] ❌ Unexpected error:', error.message);
    console.error('[WebSocket Auth] Error stack:', error.stack);
    return next(new Error('Authentication failed'));
  }
};

module.exports = {
  authenticateSocket,
};

