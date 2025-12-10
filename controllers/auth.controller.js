const authHelper = require('../utils/authHelper');
const ApiError = require('../utils/apiError');
const emailHelper = require('../utils/emailHelper');
const userRepository = require('../data/repositories/user.repository');
const tenantRepository = require('../data/repositories/tenant.repository');
const systemRepository = require('../data/repositories/system.repository');
const avatarGenerator = require('../utils/avatarGenerator');
const subdomainHelper = require('../utils/subdomain');
const crypto = require('crypto');
const ms = require('ms');

const registrationSessions = new Map();
const verificationCodes = new Map();
const qrChallenges = new Map();

const CODE_TTL_MS = 1000 * 60 * 10;
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '30d';
const REFRESH_TOKEN_TTL_MS = ms(REFRESH_TOKEN_EXPIRES_IN);
const QR_CHALLENGE_TTL_MS = 1000 * 30;
const REGISTRATION_SESSION_TTL_MS = 1000 * 60 * 30;

const getCookieOptions = (req) => {
  const hostname = (req?.get?.('host') || req?.headers?.host || '').toLowerCase();
  const origin = req?.get?.('origin') || req?.headers?.origin || '';
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const isLocalhost = hostname.includes('localhost') || hostname.includes('127.0.0.1') || isDevelopment;
  const isCrossOrigin = origin && !origin.includes(hostname.split(':')[0]);
  
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true' || (process.env.COOKIE_SECURE === undefined && process.env.NODE_ENV === 'production'),
    sameSite: process.env.COOKIE_SAME_SITE || (isCrossOrigin && isDevelopment ? 'none' : (process.env.NODE_ENV === 'production' ? 'none' : 'lax')),
    path: process.env.COOKIE_PATH || '/',
  };

  if (process.env.COOKIE_DOMAIN) {
    cookieOptions.domain = process.env.COOKIE_DOMAIN;
  } else if (isLocalhost && (hostname.includes('localhost') || origin.includes('localhost'))) {
    cookieOptions.domain = '.localhost';
  } else if (process.env.FRONTEND_URL) {
    try {
      const url = new URL(process.env.FRONTEND_URL);
      cookieOptions.domain = `.${url.hostname}`;
    } catch {
    }
  }

  if (cookieOptions.sameSite === 'none') {
    cookieOptions.secure = true;
  }

  return cookieOptions;
};

const generateId = () =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : crypto.randomBytes(16).toString('hex');

const generateVerificationCode = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

const generateCaptcha = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const generateSlug = (name) => {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

const buildSessionContext = (req) => ({
  deviceId: req.body.deviceId,
  deviceName: req.body.deviceName,
  platform: req.body.platform || 'web',
  pushToken: req.body.pushToken,
  userAgent: req.get('user-agent'),
  ipAddress: req.ip,
  location: req.body.location,
});

const upsertUserDevice = async (userId, sessionContext) => {
  if (!sessionContext.deviceId) return;

  await userRepository.upsertDevice(userId, {
    deviceId: sessionContext.deviceId,
    deviceName: sessionContext.deviceName,
    platform: sessionContext.platform,
    pushToken: sessionContext.pushToken,
    ipAddress: sessionContext.ipAddress,
    location: sessionContext.location,
    lastSeenAt: new Date(),
    isRevoked: false,
  });
};

const isEmail = (str) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);

const purgeExpiredSessions = () => {
  const now = Date.now();
  registrationSessions.forEach((value, key) => {
    if (value.expiresAt < now) {
      registrationSessions.delete(key);
    }
  });
  verificationCodes.forEach((value, key) => {
    if (value.expiresAt < now) {
      verificationCodes.delete(key);
    }
  });
};

const purgeExpiredQrChallenges = () => {
  const now = Date.now();
  qrChallenges.forEach((value, key) => {
    if (value.expiresAt < now || value.status === 'consumed') {
      qrChallenges.delete(key);
    }
  });
};

const getRefreshExpiryDate = () => new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

const createSessionForUser = async (userDoc, sessionContext = {}) => {
  const refreshToken = crypto.randomBytes(64).toString('hex');
  const refreshTokenHash = authHelper.hashToken(refreshToken);
  const expiresAt = getRefreshExpiryDate();

  await userRepository.addSession(userDoc.id, {
    token: refreshTokenHash,
    deviceId: sessionContext.deviceId,
    userAgent: sessionContext.userAgent,
    ipAddress: sessionContext.ipAddress,
    expiresAt,
  });

  return { refreshToken, expiresAt };
};

const setAuthCookies = (res, accessToken, refreshToken, refreshTokenExpiresAt) => {
  const cookieOptions = getCookieOptions(res.req);
  const maxAge = refreshTokenExpiresAt 
    ? Math.floor((refreshTokenExpiresAt.getTime() - Date.now()) / 1000) 
    : ms(REFRESH_TOKEN_EXPIRES_IN) / 1000;

  cookieOptions.maxAge = maxAge;

  res.cookie('accessToken', accessToken, {
    ...cookieOptions,
    maxAge: ms(process.env.JWT_EXPIRES_IN || '1d') / 1000,
  });

  res.cookie('refreshToken', refreshToken, cookieOptions);
};

const issueAuthTokens = async (userDoc, reason, sessionContext = {}, res = null) => {
  await userRepository.updateLastLogin(userDoc.id);
  
  if (sessionContext.deviceId) {
    await upsertUserDevice(userDoc.id, sessionContext);
  }
  
  const tenantId = userDoc.tenantId ? userDoc.tenantId.toString() : null;
  const accessToken = authHelper.buildToken({ 
    sub: userDoc.id, 
    email: userDoc.email,
    tenantId: tenantId,
  });
  const { refreshToken, expiresAt } = await createSessionForUser(userDoc, sessionContext);

  if (res) {
    setAuthCookies(res, accessToken, refreshToken, expiresAt);
  }

  return {
    user: authHelper.sanitizeUser(userDoc),
    accessToken,
    refreshToken,
    refreshTokenExpiresAt: expiresAt,
  };
};

const checkEmailAvailable = async (req, res, next) => {
  try {
    const { email, exists } = req.body;
    const user = await userRepository.findByEmail(email);
    
    if (exists) {
      if (!user) {
        throw new ApiError(404, 'Email not found in system');
      }
      res.json({ exists: true });
    } else {
      if (user) {
        throw new ApiError(409, 'Email is already registered');
      }
      res.json({ available: true });
    }
  } catch (error) {
    next(error);
  }
};

const registerStep1 = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    purgeExpiredSessions();

    const existing = await userRepository.findByEmail(email);
    if (existing) {
      throw new ApiError(409, 'Email is already registered');
    }

    const passwordHash = await authHelper.hashPassword(password);
    const expiresAt = Date.now() + REGISTRATION_SESSION_TTL_MS;

    registrationSessions.set(email, {
      step: 1,
      email,
      passwordHash,
      sessionContext: buildSessionContext(req),
      expiresAt,
    });

    res.json({
      email,
      step: 1,
      message: 'Step 1 completed',
    });
  } catch (error) {
    next(error);
  }
};

const registerStep2 = async (req, res, next) => {
  try {
    const { email, fullName, tenantName, slug } = req.body;

    const session = registrationSessions.get(email);
    if (!session || (session.step !== 1 && session.step !== 2 && session.step !== 3)) {
      purgeExpiredSessions();
      throw new ApiError(400, 'Invalid registration step. Please start from step 1.');
    }

    purgeExpiredSessions();

    if (!fullName || fullName.trim().length < 3) {
      throw new ApiError(400, 'Full name is required and must be at least 3 characters');
    }

    const finalSlug = slug || generateSlug(tenantName);
    const existingTenant = await tenantRepository.findTenantBySlug(finalSlug);
    if (existingTenant) {
      throw new ApiError(409, 'Tenant slug already exists');
    }

    const expiresAt = Date.now() + REGISTRATION_SESSION_TTL_MS;

    const updatedSession = {
      ...session,
      step: 2,
      fullName: fullName.trim(),
      tenantName,
      slug: finalSlug,
      expiresAt,
    };
    
    if (session.step === 3) {
      delete updatedSession.businessCategoryId;
    }

    registrationSessions.set(email, updatedSession);

    res.json({
      email,
      step: 2,
      slug: finalSlug,
      message: 'Step 2 completed',
    });
  } catch (error) {
    next(error);
  }
};

const registerStep3 = async (req, res, next) => {
  try {
    const { businessCategoryId, email } = req.body;

    purgeExpiredSessions();

    if (!email) {
      throw new ApiError(400, 'Email is required');
    }

    const session = registrationSessions.get(email);
    if (!session || session.step !== 2) {
      throw new ApiError(400, 'Invalid registration step');
    }

    const category = await systemRepository.findBusinessCategoryById(businessCategoryId);
    if (!category || !category.isActive) {
      throw new ApiError(404, 'Business category not found or inactive');
    }

    const expiresAt = Date.now() + REGISTRATION_SESSION_TTL_MS;

    registrationSessions.set(email, {
      ...session,
      step: 3,
      businessCategoryId,
      expiresAt,
    });

    const code = generateVerificationCode();
    const codeExpiresAt = Date.now() + CODE_TTL_MS;
    verificationCodes.set(`register:${email}`, { code, expiresAt: codeExpiresAt });

    await emailHelper.sendEmailVerificationCode(email, session.fullName, code, '10 minutes');

    res.json({
      email,
      step: 3,
      message: 'Verification code sent to email',
    });
  } catch (error) {
    next(error);
  }
};

const registerStep4 = async (req, res, next) => {
  try {
    const { email, code } = req.body;

    purgeExpiredSessions();

    const session = registrationSessions.get(email);
    if (!session || session.step !== 3) {
      throw new ApiError(400, 'Invalid registration step');
    }

    const key = `register:${email}`;
    const record = verificationCodes.get(key);
    if (!record) {
      throw new ApiError(400, 'Invalid or expired verification code');
    }
    if (record.expiresAt < Date.now()) {
      verificationCodes.delete(key);
      throw new ApiError(400, 'Verification code expired');
    }
    if (record.code !== code) {
      throw new ApiError(400, 'Invalid verification code');
    }

    verificationCodes.delete(key);

    const defaultModules = await systemRepository.findDefaultAppModules();
    const modules = defaultModules.map((m) => ({
      moduleId: m._id,
      isEnabled: true,
    }));

    const avatarUrl = avatarGenerator.generateDefaultAvatarUrl(session.fullName);
    const logoUrl = avatarGenerator.generateDefaultAvatarUrl(session.tenantName);

    const tenant = await tenantRepository.createTenant({
      name: session.tenantName,
      slug: session.slug,
      ownerId: null,
      businessCategoryId: session.businessCategoryId,
      modules,
      logoUrl,
    });

    const user = await userRepository.createUser({
      tenantId: tenant._id,
      fullName: session.fullName,
      email: session.email,
      passwordHash: session.passwordHash,
      avatarUrl,
      role: 'owner',
    });

    await tenantRepository.updateTenant(tenant._id, { ownerId: user._id });

    registrationSessions.delete(email);

    const result = await issueAuthTokens(user, 'register', session.sessionContext, res);
    const subdomainUrl = subdomainHelper.buildSubdomainUrl(tenant.slug, '');
    
    res.status(201).json({
      user: result.user,
      subdomainUrl,
      slug: tenant.slug,
    });
  } catch (error) {
    next(error);
  }
};


const checkTenantSlug = async (req, res, next) => {
  try {
    const { slug } = req.body;
    const existing = await tenantRepository.findTenantBySlug(slug);
    res.json({ available: !existing });
  } catch (error) {
    next(error);
  }
};

const generateTenantSlug = async (req, res, next) => {
  try {
    const { name } = req.body;
    const baseSlug = generateSlug(name);
    let slug = baseSlug;
    let counter = 1;

    while (await tenantRepository.findTenantBySlug(slug)) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    res.json({ slug });
  } catch (error) {
    next(error);
  }
};

const resendRegistrationCode = async (req, res, next) => {
  try {
    const { email } = req.body;
    const session = registrationSessions.get(email);

    if (!session || session.step !== 3) {
      throw new ApiError(400, 'Invalid registration step');
    }

    purgeExpiredSessions();
    const code = generateVerificationCode();
    const codeExpiresAt = Date.now() + CODE_TTL_MS;
    verificationCodes.set(`register:${email}`, { code, expiresAt: codeExpiresAt });

    await emailHelper.sendEmailVerificationCode(email, session.fullName, code, '10 minutes');

    res.json({ email, message: 'Verification code resent' });
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { slug, email, phoneNumber, password } = req.body;
    const identifier = email || phoneNumber;

    let tenantSlug = slug;
    
    if (!tenantSlug) {
      tenantSlug = subdomainHelper.extractTenantSlug(req);
    }
    
    if (!tenantSlug) {
      throw new ApiError(400, 'Tenant slug is required');
    }

    const tenant = await tenantRepository.findTenantBySlug(tenantSlug);
    if (!tenant) {
      throw new ApiError(404, 'Tenant not found');
    }

    let user;
    let reason;

    if (isEmail(identifier)) {
      user = await userRepository.findByEmailAndTenantId(identifier, tenant._id, { includePassword: true });
      reason = 'login_email';
    } else {
      user = await userRepository.findByPhoneNumberAndTenantId(identifier, tenant._id, { includePassword: true });
      reason = 'login_phone';
    }

    if (!user) {
      throw new ApiError(401, 'Invalid credentials');
    }

    await authHelper.validateUserPassword(user, password);
    const result = await issueAuthTokens(user, reason, buildSessionContext(req), res);
    
    // Always include tokens in response body for mobile clients
    // Web clients can use cookies, mobile clients will use response body
    res.json({
      user: result.user,
      tenantSlug: tenant.slug,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      refreshTokenExpiresAt: result.refreshTokenExpiresAt,
    });
  } catch (error) {
    next(error);
  }
};

const refreshToken = async (req, res, next) => {
  try {
    const refreshTokenInput = req.cookies.refreshToken || req.body.refreshToken;
    if (!refreshTokenInput) {
      throw new ApiError(401, 'Refresh token missing');
    }

    const tokenHash = authHelper.hashToken(refreshTokenInput);
    const userWithSession = await userRepository.findUserBySessionToken(tokenHash);
    
    if (!userWithSession || !userWithSession.sessions || !userWithSession.sessions.length) {
      throw new ApiError(401, 'Invalid refresh token');
    }

    const session = userWithSession.sessions[0];
    if (session.revokedAt) {
      throw new ApiError(401, 'Refresh token revoked');
    }
    if (session.expiresAt && session.expiresAt.getTime() < Date.now()) {
      await userRepository.revokeSession(userWithSession.id || userWithSession._id, tokenHash);
      throw new ApiError(401, 'Refresh token expired');
    }

    const sessionContext = buildSessionContext(req);
    const deviceId = sessionContext.deviceId || session.deviceId;
    
    if (sessionContext.deviceId) {
      await upsertUserDevice(userWithSession.id || userWithSession._id, sessionContext);
    }

    const tenantId = userWithSession.tenantId ? userWithSession.tenantId.toString() : null;
    const newAccessToken = authHelper.buildToken({ 
      sub: userWithSession.id || userWithSession._id, 
      email: userWithSession.email,
      tenantId: tenantId,
    });
    const newRefreshToken = crypto.randomBytes(64).toString('hex');
    const newExpiresAt = getRefreshExpiryDate();

    await userRepository.updateSessionToken(userWithSession.id || userWithSession._id, tokenHash, {
      token: authHelper.hashToken(newRefreshToken),
      expiresAt: newExpiresAt,
      deviceId: deviceId,
      userAgent: sessionContext.userAgent || session.userAgent,
      ipAddress: sessionContext.ipAddress || session.ipAddress,
    });

    setAuthCookies(res, newAccessToken, newRefreshToken, newExpiresAt);

    res.json({
      message: 'Token refreshed successfully',
    });
  } catch (error) {
    next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    const refreshTokenInput = req.cookies.refreshToken || req.body.refreshToken;
    
    if (refreshTokenInput) {
    const tokenHash = authHelper.hashToken(refreshTokenInput);
    const userWithSession = await userRepository.findUserBySessionToken(tokenHash);
    
    if (userWithSession) {
      await userRepository.revokeSession(userWithSession.id || userWithSession._id, tokenHash);
    }
    }

    const clearCookieOptions = getCookieOptions(req);
    delete clearCookieOptions.maxAge;

    res.clearCookie('accessToken', clearCookieOptions);
    res.clearCookie('refreshToken', clearCookieOptions);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

const requestPasswordReset = async (req, res, next) => {
  try {
    const { email, slug } = req.body;
    
    let tenantSlug = slug;
    if (!tenantSlug) {
      tenantSlug = subdomainHelper.extractTenantSlug(req);
    }

    let user;
    if (tenantSlug) {
      const tenant = await tenantRepository.findTenantBySlug(tenantSlug);
      if (!tenant) {
        throw new ApiError(404, 'Tenant not found');
      }
      user = await userRepository.findByEmailAndTenantId(email, tenant._id);
      if (!user) {
        throw new ApiError(404, 'Email not found in this tenant');
      }
    } else {
      user = await userRepository.findByEmail(email);
    if (!user) {
      throw new ApiError(404, 'Email not found in system');
      }
    }

    purgeExpiredSessions();
    const code = generateVerificationCode();
    const expiresAt = Date.now() + CODE_TTL_MS;
    verificationCodes.set(`reset:${email}`, { code, userId: user.id, expiresAt });

    await emailHelper.sendEmailVerificationCode(email, user.fullName, code, '10 minutes');

    res.json({ email, message: 'Verification code sent' });
  } catch (error) {
    next(error);
  }
};

const verifyCode = async (req, res, next) => {
  try {
    const { email, code, type } = req.body;

    if (type === 'register') {
      const session = registrationSessions.get(email);
      if (!session || session.step !== 3) {
        throw new ApiError(400, 'Invalid registration step');
      }
      const key = `register:${email}`;
      const record = verificationCodes.get(key);
      if (!record) {
        throw new ApiError(400, 'Invalid or expired verification code');
      }
      if (record.expiresAt < Date.now()) {
        verificationCodes.delete(key);
        throw new ApiError(400, 'Verification code expired');
      }
      if (record.code !== code) {
        throw new ApiError(400, 'Invalid verification code');
      }
    } else if (type === 'reset') {
      const key = `reset:${email}`;
      const record = verificationCodes.get(key);
      if (!record) {
        throw new ApiError(400, 'Invalid or expired verification code');
      }
      if (record.expiresAt < Date.now()) {
        verificationCodes.delete(key);
        throw new ApiError(400, 'Verification code expired');
      }
      if (record.code !== code) {
        throw new ApiError(400, 'Invalid verification code');
      }
    } else {
      throw new ApiError(400, 'Invalid verification type');
    }

    res.json({ valid: true, message: 'Code verified successfully', type });
  } catch (error) {
    next(error);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const { email, code, newPassword } = req.body;
    const key = `reset:${email}`;
    const record = verificationCodes.get(key);

    if (!record) {
      throw new ApiError(400, 'Invalid or expired verification code');
    }
    if (record.expiresAt < Date.now()) {
      verificationCodes.delete(key);
      throw new ApiError(400, 'Verification code expired');
    }
    if (record.code !== code) {
      throw new ApiError(400, 'Invalid verification code');
    }

    const user = await userRepository.findByIdWithPassword(record.userId);
    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    if (user.passwordHash) {
      const isSamePassword = await authHelper.comparePassword(newPassword, user.passwordHash);
      if (isSamePassword) {
        throw new ApiError(400, 'New password cannot be the same as current password');
      }
    }

    verificationCodes.delete(key);
    const passwordHash = await authHelper.hashPassword(newPassword);
    await userRepository.updatePasswordHash(record.userId, passwordHash);
    await userRepository.clearSessions(record.userId);
    
    const updatedUser = await userRepository.findById(record.userId);
    if (!updatedUser) {
      throw new ApiError(404, 'User not found');
    }
    
    const sessionContext = buildSessionContext(req);
    const result = await issueAuthTokens(updatedUser, 'password_reset', sessionContext, res);
    res.json({ user: result.user });
  } catch (error) {
    next(error);
  }
};

const getProfileFromToken = async (req, res, next) => {
  try {
    const cookies = req.cookies || {};
    const token = cookies.accessToken || (req.headers.authorization ? req.headers.authorization.split(' ')[1] : null);
    
    if (!token) {
      throw new ApiError(401, 'Authorization token missing');
    }
    const user = await authHelper.getCurrentUser(token, userRepository);
    
    let tenantSlug = null;
    if (user?.tenantId) {
      const tenant = await tenantRepository.findTenantById(user.tenantId);
      if (tenant) {
        tenantSlug = tenant.slug;
      }
    }
    
    res.json({
      ...user,
      ...(tenantSlug && { tenantSlug }),
    });
  } catch (error) {
    next(error);
  }
};

const createQrChallenge = async (req, res, next) => {
  try {
    purgeExpiredQrChallenges();
    const challengeId = generateId();
    const expiresAt = Date.now() + QR_CHALLENGE_TTL_MS;
    qrChallenges.set(challengeId, {
      status: 'pending',
      expiresAt,
      sessionContext: buildSessionContext(req),
      userId: null,
    });

    res.json({
      challengeId,
      qrValue: `ter-qr:${challengeId}`,
      expiresAt,
      ttl: QR_CHALLENGE_TTL_MS,
    });
  } catch (error) {
    next(error);
  }
};

const approveQrChallenge = async (req, res, next) => {
  try {
    const { challengeId, email, phoneNumber, password } = req.body;
    purgeExpiredQrChallenges();
    const challenge = qrChallenges.get(challengeId);
    if (!challenge) {
      throw new ApiError(404, 'QR challenge not found or expired');
    }
    if (challenge.expiresAt < Date.now()) {
      qrChallenges.delete(challengeId);
      throw new ApiError(410, 'QR challenge expired');
    }
    if (challenge.status === 'approved') {
      res.json({ status: 'approved' });
      return;
    }

    const identifier = email || phoneNumber;
    let user;
    if (isEmail(identifier)) {
      user = await userRepository.findByEmail(identifier, { includePassword: true });
    } else {
      user = await userRepository.findByPhoneNumber(identifier, { includePassword: true });
    }
    await authHelper.validateUserPassword(user, password);
    challenge.status = 'approved';
    challenge.userId = user.id || user._id;
    qrChallenges.set(challengeId, challenge);
    res.json({ status: 'approved' });
  } catch (error) {
    next(error);
  }
};

const pollQrChallenge = async (req, res, next) => {
  try {
    const { challengeId } = req.body;
    purgeExpiredQrChallenges();
    const challenge = qrChallenges.get(challengeId);
    if (!challenge) {
      res.json({ status: 'expired' });
      return;
    }
    if (challenge.expiresAt < Date.now()) {
      qrChallenges.delete(challengeId);
      res.json({ status: 'expired' });
      return;
    }
    if (challenge.status !== 'approved' || !challenge.userId) {
      res.json({ status: 'pending' });
      return;
    }

    const user = await userRepository.findById(challenge.userId, { includePassword: false });
    if (!user) {
      qrChallenges.delete(challengeId);
      throw new ApiError(404, 'User not found for QR challenge');
    }
    const result = await issueAuthTokens(user, 'login_qr', challenge.sessionContext, res);
    qrChallenges.delete(challengeId);
    res.json({ status: 'approved', user: result.user });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  checkEmailAvailable,
  registerStep1,
  registerStep2,
  registerStep3,
  registerStep4,
  checkTenantSlug,
  generateTenantSlug,
  resendRegistrationCode,
  login,
  refreshToken,
  logout,
  requestPasswordReset,
  verifyCode,
  resetPassword,
  getProfileFromToken,
  createQrChallenge,
  approveQrChallenge,
  pollQrChallenge,
  ...(process.env.NODE_ENV === 'test' && {
    _registrationSessions: registrationSessions,
    _verificationCodes: verificationCodes,
    _qrChallenges: qrChallenges,
  }),
};
