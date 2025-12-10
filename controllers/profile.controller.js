const multer = require('multer');
const bcrypt = require('bcryptjs');
const userRepository = require('../data/repositories/user.repository');
const tenantRepository = require('../data/repositories/tenant.repository');
const avatarGenerator = require('../utils/avatarGenerator');
const ApiError = require('../utils/apiError');
const authHelper = require('../utils/authHelper');
const twoFactorHelper = require('../utils/twoFactorHelper');
const { generateFileName, getStoragePath, uploadFile, deleteFile, extractKeyFromUrl } = require('../utils/storageHelper');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ApiError(400, `File type ${file.mimetype} is not allowed. Only images are allowed.`), false);
    }
  },
});

const getCurrentUserId = (req) => {
  const token = req.cookies.accessToken || (req.headers.authorization ? req.headers.authorization.split(' ')[1] : null);
  if (!token) {
    throw new ApiError(401, 'Authorization token missing');
  }
  return authHelper.getCurrentUserId(token);
};

const getProfile = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    
    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    const userData = authHelper.sanitizeUser(user);
    
    if (user.tenantId) {
      const tenant = await tenantRepository.findTenantById(user.tenantId);
      if (tenant) {
        userData.tenant = {
          _id: tenant._id,
          name: tenant.name,
          slug: tenant.slug,
          logoUrl: tenant.logoUrl || null,
        };
      }
    }
    res.json(userData);
  } catch (error) {
    next(error);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const { fullName, phoneNumber, avatarUrl, gender, dateOfBirth, address } = req.body;
    const currentUser = await userRepository.findById(userId);

    if (!currentUser) {
      throw new ApiError(404, 'User not found');
    }

    const updatePayload = {};

    if (fullName !== undefined) {
      updatePayload.fullName = fullName;
      
      if (avatarGenerator.isDefaultAvatar(currentUser.avatarUrl)) {
        updatePayload.avatarUrl = avatarGenerator.generateDefaultAvatarUrl(fullName);
      }
    }

    if (phoneNumber !== undefined) {
      updatePayload.phoneNumber = phoneNumber || null;
    }

    if (avatarUrl !== undefined) {
      if (avatarUrl === null || avatarUrl === '') {
        if (currentUser.avatarUrl) {
          const oldKey = extractKeyFromUrl(currentUser.avatarUrl);
          if (oldKey) {
            try {
              await deleteFile(oldKey);
            } catch (error) {
              console.error('Failed to delete old avatar:', error);
            }
          }
        }
        updatePayload.avatarUrl = null;
      } else {
        updatePayload.avatarUrl = avatarUrl;
      }
    }

    if (gender !== undefined) {
      updatePayload.gender = gender || null;
    }

    if (dateOfBirth !== undefined) {
      updatePayload.dateOfBirth = dateOfBirth || null;
    }

    if (address !== undefined) {
      updatePayload.address = address || null;
    }

    const updatedUser = await userRepository.updateProfile(userId, updatePayload);
    res.json(authHelper.sanitizeUser(updatedUser));
  } catch (error) {
    next(error);
  }
};

const updateSettings = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const settings = req.body;
    
    const updatedUser = await userRepository.updateSettings(userId, settings);
    res.json(authHelper.sanitizeUser(updatedUser));
  } catch (error) {
    next(error);
  }
};

const setup2FA = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    
    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    if (user.security?.twoFactorEnabled) {
      throw new ApiError(400, 'Two-factor authentication is already enabled');
    }

    const { secret, secretKey, otpauthUrl } = twoFactorHelper.generateSecret(
      user.email,
      'TER'
    );

    const qrCodeDataUrl = await twoFactorHelper.generateQRCode(otpauthUrl);

    await userRepository.updateSecurity(userId, {
      twoFactorSecret: secret,
      twoFactorMethod: 'authenticator',
    });

    res.json({
      success: true,
      data: {
        qrCode: qrCodeDataUrl,
        otpauthUrl: otpauthUrl,
        secretKey: secretKey,
        manualEntryKey: secretKey,
      },
    });
  } catch (error) {
    next(error);
  }
};

const verifyAndEnable2FA = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const { code } = req.body;

    if (!code || code.length !== 6) {
      throw new ApiError(400, 'Invalid code. Code must be 6 digits');
    }

    const user = await userRepository.findByIdWithTwoFactorSecret(userId);
    if (!user) {
      throw new ApiError(404, 'User not found');
    }
    
    const twoFactorSecret = user.security?.twoFactorSecret;
    if (!twoFactorSecret) {
      throw new ApiError(400, 'Two-factor authentication setup not found. Please setup first.');
    }

    const isValid = twoFactorHelper.verifyToken(twoFactorSecret, code);
    if (!isValid) {
      throw new ApiError(400, 'Invalid verification code');
    }

    const { plainCodes, hashedCodes } = await twoFactorHelper.generateRecoveryCodes(10);

    await userRepository.updateSecurity(userId, {
      twoFactorEnabled: true,
      recoveryCodes: hashedCodes,
    });

    res.json({
      success: true,
      message: 'Two-factor authentication enabled successfully',
      data: {
        recoveryCodes: plainCodes,
      },
    });
  } catch (error) {
    next(error);
  }
};

const disable2FA = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const { password } = req.body;

    if (!password) {
      throw new ApiError(400, 'Password is required to disable two-factor authentication');
    }

    const user = await userRepository.findByIdWithPassword(userId);
    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new ApiError(401, 'Invalid password');
    }

    await userRepository.updateSecurity(userId, {
      twoFactorEnabled: false,
      twoFactorMethod: null,
      twoFactorSecret: null,
      recoveryCodes: [],
    });

    res.json({
      success: true,
      message: 'Two-factor authentication disabled successfully',
    });
  } catch (error) {
    next(error);
  }
};

const regenerateRecoveryCodes = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const { password } = req.body;

    if (!password) {
      throw new ApiError(400, 'Password is required to regenerate recovery codes');
    }

    const user = await userRepository.findByIdWithPassword(userId);
    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    if (!user.security?.twoFactorEnabled) {
      throw new ApiError(400, 'Two-factor authentication is not enabled');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new ApiError(401, 'Invalid password');
    }

    const { plainCodes, hashedCodes } = await twoFactorHelper.generateRecoveryCodes(10);

    await userRepository.updateSecurity(userId, {
      recoveryCodes: hashedCodes,
    });

    res.json({
      success: true,
      message: 'Recovery codes regenerated successfully',
      data: {
        recoveryCodes: plainCodes,
      },
    });
  } catch (error) {
    next(error);
  }
};

const listDevices = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.listDevices(userId);
    
    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    const sessionsByDevice = {};
    (user.sessions || []).forEach(session => {
      if (session.deviceId && !session.revokedAt) {
        if (!sessionsByDevice[session.deviceId]) {
          sessionsByDevice[session.deviceId] = 0;
        }
        sessionsByDevice[session.deviceId]++;
      }
    });

    const devices = (user.devices || []).map(device => ({
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      platform: device.platform,
      lastSeenAt: device.lastSeenAt,
      ipAddress: device.ipAddress,
      location: device.location,
      isRevoked: device.isRevoked,
      activeSessionsCount: sessionsByDevice[device.deviceId] || 0,
    }));

    res.json({
      success: true,
      data: devices,
    });
  } catch (error) {
    next(error);
  }
};

const revokeDevice = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const { deviceId } = req.params;

    if (!deviceId) {
      throw new ApiError(400, 'Device ID is required');
    }

    const user = await userRepository.listDevices(userId);
    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    const device = (user.devices || []).find(d => d.deviceId === deviceId);
    if (!device) {
      throw new ApiError(404, 'Device not found');
    }

    await userRepository.revokeDevice(userId, deviceId);
    await userRepository.revokeSessionsByDeviceId(userId, deviceId);

    res.json({
      success: true,
      message: 'Device revoked successfully',
    });
  } catch (error) {
    next(error);
  }
};

const revokeAllDevices = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const { password } = req.body;

    if (!password) {
      throw new ApiError(400, 'Password is required to revoke all devices');
    }

    const user = await userRepository.findByIdWithPassword(userId);
    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new ApiError(401, 'Invalid password');
    }

    await userRepository.revokeAllDevices(userId);
    await userRepository.revokeAllSessions(userId);

    res.json({
      success: true,
      message: 'All devices revoked successfully',
    });
  } catch (error) {
    next(error);
  }
};

const changePassword = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const { currentPassword, newPassword } = req.body;

    const user = await userRepository.findByIdWithPassword(userId);
    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isPasswordValid) {
      throw new ApiError(401, 'Invalid current password');
    }

    const isSamePassword = await bcrypt.compare(newPassword, user.passwordHash);
    if (isSamePassword) {
      throw new ApiError(400, 'New password cannot be the same as current password');
    }

    const newPasswordHash = await authHelper.hashPassword(newPassword);
    await userRepository.updatePasswordHash(userId, newPasswordHash);
    await userRepository.revokeAllSessions(userId);

    res.json({
      success: true,
      message: 'Password changed successfully. All sessions have been revoked.',
    });
  } catch (error) {
    next(error);
  }
};

const listSessions = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.listSessions(userId);
    
    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    const sessions = (user.sessions || []).map(session => ({
      deviceId: session.deviceId,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
      lastUsedAt: session.lastUsedAt || session.createdAt,
      updatedAt: session.updatedAt,
      isActive: !session.revokedAt && (!session.expiresAt || session.expiresAt > new Date()),
    }));

    res.json({
      success: true,
      data: sessions,
    });
  } catch (error) {
    next(error);
  }
};

const revokeSession = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const { token } = req.body;

    if (!token) {
      throw new ApiError(400, 'Session token is required');
    }

    const tokenHash = authHelper.hashToken(token);
    const user = await userRepository.findUserBySessionToken(tokenHash);
    
    if (!user || !user.sessions || !user.sessions.length) {
      throw new ApiError(404, 'Session not found');
    }

    const session = user.sessions[0];
    if (session.revokedAt) {
      throw new ApiError(400, 'Session already revoked');
    }

    await userRepository.revokeSession(userId, tokenHash);

    res.json({
      success: true,
      message: 'Session revoked successfully',
    });
  } catch (error) {
    next(error);
  }
};

const uploadAvatar = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    if (!req.file) {
      throw new ApiError(400, 'No file uploaded');
    }

    if (user.avatarUrl) {
      const oldKey = extractKeyFromUrl(user.avatarUrl);
      if (oldKey) {
        try {
          await deleteFile(oldKey);
        } catch (error) {
          console.error('Failed to delete old avatar:', error);
        }
      }
    }

    const fileName = generateFileName(req.file.originalname);
    const key = getStoragePath(user.tenantId, 'user_avatar', {
      userId: userId.toString(),
      fileName,
    });

    const url = await uploadFile(req.file.buffer, key, req.file.mimetype);
    await userRepository.updateProfile(userId, { avatarUrl: url });

    res.json({ url, key });
  } catch (error) {
    next(error);
  }
};

const deleteAvatar = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    if (!user.avatarUrl) {
      throw new ApiError(400, 'No avatar to delete');
    }

    const key = extractKeyFromUrl(user.avatarUrl);
    if (key) {
      await deleteFile(key);
    }

    await userRepository.updateProfile(userId, { avatarUrl: null });
    res.json({ message: 'Avatar deleted successfully' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  upload,
  getProfile,
  updateProfile,
  updateSettings,
  setup2FA,
  verifyAndEnable2FA,
  disable2FA,
  regenerateRecoveryCodes,
  listDevices,
  revokeDevice,
  revokeAllDevices,
  changePassword,
  listSessions,
  revokeSession,
  uploadAvatar,
  deleteAvatar,
};
