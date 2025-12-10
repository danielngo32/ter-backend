const mongoose = require("mongoose");

const userSettingsSchema = new mongoose.Schema(
  {
    aiMode: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AiMode",
      index: true,
    },
    aiUsage: {
      monthlyTokenLimit: { type: Number, default: 1000000 },
      monthlyTokenUsed: { type: Number, default: 0 },
      periodStart: { type: Date, default: Date.now },
    },
    aiModels: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "AiModel" }],
      default: [],
    },
    isOnline: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false }
);

const deviceSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true },
    deviceName: { type: String },
    platform: {
      type: String,
      enum: ["ios", "android", "web", "desktop"],
      required: true,
    },
    pushToken: { type: String },
    lastSeenAt: { type: Date, default: Date.now },
    ipAddress: { type: String },
    location: { type: String },
    isRevoked: { type: Boolean, default: false },
  },
  { _id: false }
);

const sessionSchema = new mongoose.Schema(
  {
    token: { type: String, required: true },
    deviceId: { 
      type: String,
    },
    userAgent: { type: String },
    ipAddress: { type: String },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date },
    revokedAt: { type: Date },
    lastUsedAt: { type: Date, default: Date.now },
    updatedAt: { type: Date },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phoneNumber: { type: String, sparse: true, index: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    avatarUrl: { type: String },
    gender: {
      type: String,
      enum: ["male", "female"]
    },
    dateOfBirth: { type: Date },
    address: {
      addressLine: { type: String, trim: true },
      provinceName: { type: String, trim: true },
      wardName: { type: String, trim: true },
      provinceCode: { type: String, trim: true },
      wardCode: { type: String, trim: true },
    },
    role: {
      type: String,
      enum: ["owner", "admin", "member"],
      default: "member",
    },
    status: {
      type: String,
      enum: ["active", "inactive", "suspended"],
      default: "active",
    },
    lastLoginAt: { type: Date },
    settings: { type: userSettingsSchema, default: () => ({}) },
    devices: { type: [deviceSchema], default: [] },
    sessions: { type: [sessionSchema], default: [] },
    security: {
      twoFactorEnabled: { type: Boolean, default: false },
      twoFactorMethod: {
        type: String,
        enum: ["email", "authenticator"],
        default: null,
      },
      twoFactorSecret: {
        type: String,
        select: false,
      },
      recoveryCodes: {
        type: [
          {
            code: { type: String, required: true },
            used: { type: Boolean, default: false },
            usedAt: { type: Date },
          },
        ],
        default: [],
        select: false,
      },
    },
  },
  { timestamps: true }
);

userSchema.index({ "devices.deviceId": 1 });
userSchema.index({ "sessions.token": 1 }, { sparse: true });
userSchema.index({ "sessions.deviceId": 1 }, { sparse: true });

userSchema.index({ tenantId: 1, email: 1 }, { unique: true });
userSchema.index(
  { tenantId: 1, phoneNumber: 1 },
  { unique: true, sparse: true }
);

userSchema.methods.toSafeObject = function toSafeObject() {
  const obj = this.toObject({ versionKey: false });
  if (obj.passwordHash) {
    delete obj.passwordHash;
  }
  if (obj.security && obj.security.recoveryCodes) {
    delete obj.security.recoveryCodes;
  }
  if (obj.sessions) {
    delete obj.sessions;
  }
  if (obj.devices) {
    delete obj.devices;
  }
  if (obj.security && obj.security.twoFactorSecret) {
    delete obj.security.twoFactorSecret;
  }
  return obj;
};

userSchema.methods.getDeviceSessions = function(deviceId) {
  if (!this.sessions) return [];
  return this.sessions.filter(
    session => session.deviceId === deviceId && !session.revokedAt
  );
};

userSchema.methods.getDeviceById = function(deviceId) {
  if (!this.devices) return null;
  return this.devices.find(device => device.deviceId === deviceId);
};

userSchema.methods.hasActiveDevice = function(deviceId) {
  const device = this.getDeviceById(deviceId);
  return device && !device.isRevoked;
};

userSchema.methods.getAllDeviceSessions = function(deviceId) {
  if (!this.sessions) return [];
  return this.sessions.filter(session => session.deviceId === deviceId);
};

userSchema.methods.getDeviceWithSessions = function(deviceId) {
  const device = this.getDeviceById(deviceId);
  if (!device) return null;
  
  const sessions = this.getAllDeviceSessions(deviceId);
  return {
    ...device.toObject(),
    sessions: sessions,
    activeSessionsCount: sessions.filter(s => !s.revokedAt).length,
    totalSessionsCount: sessions.length,
  };
};

const UserModel = mongoose.model("User", userSchema);

module.exports = {
  UserModel,
  userSchema,
};
