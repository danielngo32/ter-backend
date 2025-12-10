const { UserModel } = require("../schemas/user.schema");

const createUser = (payload) => UserModel.create(payload);

const buildQueryWithOptions = (baseQuery, options = {}) => {
  if (options.includePassword) {
    baseQuery.select("+passwordHash");
  }
  if (options.projection) {
    baseQuery.select(options.projection);
  }
  return baseQuery;
};

const findByEmail = (email, options = {}) =>
  buildQueryWithOptions(UserModel.findOne({ email }), options);

const findByEmailAndTenantId = (email, tenantId, options = {}) =>
  buildQueryWithOptions(UserModel.findOne({ email, tenantId }), options);

const findByPhoneNumber = (phoneNumber, options = {}) =>
  buildQueryWithOptions(UserModel.findOne({ phoneNumber }), options);

const findByPhoneNumberAndTenantId = (phoneNumber, tenantId, options = {}) =>
  buildQueryWithOptions(UserModel.findOne({ phoneNumber, tenantId }), options);

const findById = (id, options = {}) =>
  buildQueryWithOptions(UserModel.findById(id), options);

const findByIdWithPassword = (id) =>
  buildQueryWithOptions(UserModel.findById(id), { includePassword: true });

const findByIdWithTwoFactorSecret = (id) =>
  UserModel.findById(id).select('+security.twoFactorSecret');

const updateProfile = (userId, payload) =>
  UserModel.findByIdAndUpdate(
    userId,
    {
      $set: {
        ...(payload.fullName ? { fullName: payload.fullName } : {}),
        ...(payload.phoneNumber !== undefined
          ? { phoneNumber: payload.phoneNumber || null }
          : {}),
        ...(payload.avatarUrl !== undefined
          ? { avatarUrl: payload.avatarUrl || null }
          : {}),
        ...(payload.gender !== undefined
          ? { gender: payload.gender || null }
          : {}),
        ...(payload.dateOfBirth !== undefined
          ? { dateOfBirth: payload.dateOfBirth || null }
          : {}),
        ...(payload.address !== undefined
          ? { address: payload.address || null }
          : {}),
      },
    },
    { new: true }
  );

const findByIdAndUpdate = (userId, payload) =>
  UserModel.findByIdAndUpdate(userId, { $set: payload }, { new: true });

const updateSettings = (userId, settings) =>
  UserModel.findByIdAndUpdate(
    userId,
    {
      $set: Object.entries(settings).reduce(
        (acc, [key, value]) => ({
          ...acc,
          [`settings.${key}`]: value,
        }),
        {}
      ),
    },
    { new: true }
  );

const updateSecurity = (userId, securityUpdates) =>
  UserModel.findByIdAndUpdate(
    userId,
    {
      $set: Object.entries(securityUpdates).reduce(
        (acc, [key, value]) => ({
          ...acc,
          [`security.${key}`]: value,
        }),
        {}
      ),
    },
    { new: true, select: { security: 1 } }
  );

const replaceRecoveryCodes = (userId, codes) =>
  UserModel.findByIdAndUpdate(
    userId,
    {
      $set: { "security.recoveryCodes": codes },
    },
    { new: true, select: { security: 1 } }
  );

const markRecoveryCodeUsed = async (userId, recoveryCodeId) => {
  return UserModel.findOneAndUpdate(
    { 
      _id: userId,
      "security.recoveryCodes._id": recoveryCodeId,
      "security.recoveryCodes.used": false,
    },
    {
      $set: {
        "security.recoveryCodes.$.used": true,
        "security.recoveryCodes.$.usedAt": new Date(),
      },
    },
    { new: true, select: { security: 1 } }
  );
};


const updateLastLogin = (userId, date = new Date()) =>
  UserModel.findByIdAndUpdate(
    userId,
    { $set: { lastLoginAt: date } },
    { new: true }
  );

const updatePasswordHash = (userId, passwordHash) =>
  UserModel.findByIdAndUpdate(
    userId,
    {
      $set: { passwordHash },
    },
    { new: true, select: { _id: 1 } }
  );

const upsertDevice = async (userId, device) => {
  const updateData = {
        "devices.$.deviceName": device.deviceName,
        "devices.$.platform": device.platform,
        "devices.$.pushToken": device.pushToken,
        "devices.$.ipAddress": device.ipAddress,
        "devices.$.location": device.location,
        "devices.$.lastSeenAt": device.lastSeenAt || new Date(),
        "devices.$.isRevoked": Boolean(device.isRevoked),
  };

  const existing = await UserModel.findOneAndUpdate(
    { _id: userId, "devices.deviceId": device.deviceId },
    { $set: updateData },
    { new: true }
  );

  if (existing) {
    return existing;
  }

  return UserModel.findByIdAndUpdate(
    userId,
    {
      $push: {
        devices: {
          deviceId: device.deviceId,
          deviceName: device.deviceName,
          platform: device.platform,
          pushToken: device.pushToken,
          ipAddress: device.ipAddress,
          location: device.location,
          lastSeenAt: device.lastSeenAt || new Date(),
          isRevoked: Boolean(device.isRevoked),
        },
      },
    },
    { new: true }
  );
};

const removeDevice = async (userId, deviceId) => {
  await revokeSessionsByDeviceId(userId, deviceId);
  return UserModel.findByIdAndUpdate(
    userId,
    {
      $pull: { devices: { deviceId } },
    },
    { new: true }
  );
};

const listDevices = (userId) =>
  UserModel.findById(userId, {
    devices: 1,
    sessions: 1,
    "security.twoFactorEnabled": 1,
  });

const revokeDevice = (userId, deviceId) =>
  UserModel.findOneAndUpdate(
    { _id: userId, "devices.deviceId": deviceId },
    {
      $set: {
        "devices.$.isRevoked": true,
        "devices.$.lastSeenAt": new Date(),
      },
    },
    { new: true }
  );

const revokeAllDevices = (userId) =>
  UserModel.updateOne(
    { _id: userId },
    {
      $set: {
        "devices.$[elem].isRevoked": true,
        "devices.$[elem].lastSeenAt": new Date(),
      },
    },
    {
      arrayFilters: [{ "elem.isRevoked": false }],
    }
  );

const revokeSessionsByDeviceId = (userId, deviceId) =>
  UserModel.updateOne(
    { _id: userId },
    {
      $set: {
        "sessions.$[elem].revokedAt": new Date(),
      },
    },
    {
      arrayFilters: [
        { "elem.deviceId": deviceId, "elem.revokedAt": null },
      ],
    }
  );

const revokeAllSessions = async (userId) => {
  await UserModel.updateOne(
    { _id: userId },
    {
      $set: {
        "sessions.$[elem].revokedAt": new Date(),
      },
    },
    {
      arrayFilters: [{ "elem.revokedAt": null }],
    }
  );
  return UserModel.findById(userId, { sessions: 1 });
};

const addSession = async (userId, session) => {
  if (session.deviceId) {
    const user = await UserModel.findById(userId, { devices: 1 });
    if (!user) {
      const ApiError = require('../utils/apiError');
      throw new ApiError(404, 'User not found');
    }
    const device = user.devices && user.devices.find(
      d => d.deviceId === session.deviceId
    );
    if (!device) {
      const ApiError = require('../utils/apiError');
      throw new ApiError(400, `Device with deviceId ${session.deviceId} not found. Please register device first.`);
    }
    if (device.isRevoked) {
      const ApiError = require('../utils/apiError');
      throw new ApiError(400, `Device with deviceId ${session.deviceId} has been revoked.`);
    }
  }

  return UserModel.findByIdAndUpdate(
    userId,
    {
      $push: {
        sessions: {
          ...session,
          createdAt: session.createdAt || new Date(),
          lastUsedAt: session.lastUsedAt || new Date(),
          updatedAt: session.updatedAt || new Date(),
        },
      },
    },
    { new: true, select: { sessions: 1 } }
  );
};

const findUserBySessionToken = (token) =>
  UserModel.findOne(
    { "sessions.token": token },
    {
      email: 1,
      sessions: {
        $elemMatch: { token },
      },
    }
  );

const listSessions = (userId) =>
  UserModel.findById(userId, {
    sessions: 1,
  });

const findSessionsByDeviceId = (userId, deviceId) =>
  UserModel.findOne(
    { _id: userId, "sessions.deviceId": deviceId },
    {
      sessions: {
        $elemMatch: { deviceId },
      },
    }
  );

const cleanupOrphanedSessions = async (userId) => {
  const user = await UserModel.findById(userId, { devices: 1, sessions: 1 });
  if (!user || !user.devices || !user.sessions) return;

  const validDeviceIds = new Set(user.devices.map(d => d.deviceId));
  const orphanedSessions = user.sessions.filter(
    s => s.deviceId && !validDeviceIds.has(s.deviceId) && !s.revokedAt
  );

  if (orphanedSessions.length > 0) {
    const orphanedTokens = orphanedSessions.map(s => s.token);
    await UserModel.updateOne(
      { _id: userId },
      {
        $set: {
          "sessions.$[elem].revokedAt": new Date(),
        },
      },
      {
        arrayFilters: [
          { "elem.token": { $in: orphanedTokens }, "elem.revokedAt": null },
        ],
      }
    );
  }
};

const findSessionByToken = (userId, token) =>
  UserModel.findOne(
    { _id: userId, "sessions.token": token },
    {
      sessions: {
        $elemMatch: { token },
      },
    }
  );

const updateSessionToken = (userId, oldToken, updates) =>
  UserModel.findOneAndUpdate(
    { _id: userId, "sessions.token": oldToken },
    {
      $set: {
        "sessions.$.token": updates.token,
        "sessions.$.expiresAt": updates.expiresAt,
        "sessions.$.deviceId": updates.deviceId,
        "sessions.$.userAgent": updates.userAgent,
        "sessions.$.ipAddress": updates.ipAddress,
        "sessions.$.lastUsedAt": new Date(),
        "sessions.$.updatedAt": new Date(),
      },
    },
    { new: true, select: { sessions: 1 } }
  );

const revokeSession = (userId, token) =>
  UserModel.findOneAndUpdate(
    { _id: userId, "sessions.token": token },
    {
      $set: {
        "sessions.$.revokedAt": new Date(),
      },
    },
    { new: true, select: { sessions: 1 } }
  );

const removeSession = (userId, token) =>
  UserModel.findByIdAndUpdate(
    userId,
    {
      $pull: { sessions: { token } },
    },
    { new: true, select: { sessions: 1 } }
  );

const clearSessions = (userId) =>
  UserModel.findByIdAndUpdate(
    userId,
    {
      $set: { sessions: [] },
    },
    { new: true, select: { sessions: 1 } }
  );

module.exports = {
  createUser,
  findByEmail,
  findByEmailAndTenantId,
  findByPhoneNumber,
  findByPhoneNumberAndTenantId,
  findById,
  findByIdWithPassword,
  findByIdWithTwoFactorSecret,
  updateProfile,
  findByIdAndUpdate,
  updateSettings,
  updateSecurity,
  replaceRecoveryCodes,
  markRecoveryCodeUsed,
  updateLastLogin,
  updatePasswordHash,
  upsertDevice,
  removeDevice,
  listDevices,
  revokeDevice,
  revokeAllDevices,
  revokeSessionsByDeviceId,
  revokeAllSessions,
  addSession,
  findUserBySessionToken,
  listSessions,
  findSessionsByDeviceId,
  cleanupOrphanedSessions,
  findSessionByToken,
  updateSessionToken,
  revokeSession,
  removeSession,
  clearSessions,
};
