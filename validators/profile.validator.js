const Joi = require('joi');

const validate = (schema) => async (req, res, next) => {
  try {
    const value = await schema.validateAsync(req.body, { abortEarly: false, stripUnknown: true });
    req.body = value;
    next();
  } catch (error) {
    res.status(400).json({
      message: 'Validation failed',
      details: error.details?.map((d) => d.message) || [],
    });
  }
};

const updateProfileSchema = Joi.object({
  fullName: Joi.string().min(1).max(120).trim().optional(),
  phoneNumber: Joi.string().pattern(/^[0-9+\-\s()]{6,20}$/).allow(null, '').optional(),
  avatarUrl: Joi.string().uri().allow(null, '').optional(),
  gender: Joi.string().valid('male', 'female').allow(null, '').optional(),
  dateOfBirth: Joi.date().max('now').allow(null, '').optional(),
  address: Joi.object({
    addressLine: Joi.string().max(500).trim().allow(null, '').optional(),
    provinceName: Joi.string().max(200).trim().allow(null, '').optional(),
    wardName: Joi.string().max(200).trim().allow(null, '').optional(),
    provinceCode: Joi.string().trim().allow(null, '').optional(),
    wardCode: Joi.string().trim().allow(null, '').optional(),
  }).optional(),
});

const updateSettingsSchema = Joi.object({
  language: Joi.string().valid('vi', 'en').optional(),
  timezone: Joi.string().optional(),
  notifications: Joi.object({
    email: Joi.boolean().optional(),
    push: Joi.boolean().optional(),
  }).optional(),
  startOfWeek: Joi.string().valid('monday', 'sunday').optional(),
  isOnline: Joi.boolean().optional(),
});

const verify2FASchema = Joi.object({
  code: Joi.string().pattern(/^[0-9]{6}$/).required()
    .messages({
      'string.pattern.base': 'Code must be exactly 6 digits',
      'any.required': 'Verification code is required',
    }),
});

const disable2FASchema = Joi.object({
  password: Joi.string().required()
    .messages({
      'any.required': 'Password is required to disable two-factor authentication',
    }),
});

const regenerateRecoveryCodesSchema = Joi.object({
  password: Joi.string().required()
    .messages({
      'any.required': 'Password is required to regenerate recovery codes',
    }),
});

const revokeAllDevicesSchema = Joi.object({
  password: Joi.string().required()
    .messages({
      'any.required': 'Password is required to revoke all devices',
    }),
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required()
    .messages({
      'any.required': 'Current password is required',
    }),
  newPassword: Joi.string()
    .min(6)
    .max(128)
    .required()
    .pattern(/[A-Z]/, { name: 'uppercase' })
    .message('Password must contain at least one uppercase letter')
    .pattern(/[a-z]/, { name: 'lowercase' })
    .message('Password must contain at least one lowercase letter')
    .pattern(/[0-9]/, { name: 'number' })
    .message('Password must contain at least one number')
    .pattern(/[!@#$%^&*(),.?":{}|<>\[\]\\\/_+\-=~`]/, { name: 'special' })
    .message('Password must contain at least one special character')
    .messages({
      'any.required': 'New password is required',
    }),
});

const revokeSessionSchema = Joi.object({
  token: Joi.string().min(10).required()
    .messages({
      'any.required': 'Session token is required',
    }),
});

const validateParams = (schema) => async (req, res, next) => {
  try {
    const value = await schema.validateAsync(req.params, { abortEarly: false, stripUnknown: true });
    req.params = value;
    next();
  } catch (error) {
    res.status(400).json({
      message: 'Validation failed',
      details: error.details?.map((d) => d.message) || [],
    });
  }
};

const deviceIdParamSchema = Joi.object({
  deviceId: Joi.string().trim().required(),
});

module.exports = {
  validateUpdateProfile: validate(updateProfileSchema),
  validateUpdateSettings: validate(updateSettingsSchema),
  validateVerify2FA: validate(verify2FASchema),
  validateDisable2FA: validate(disable2FASchema),
  validateRegenerateRecoveryCodes: validate(regenerateRecoveryCodesSchema),
  validateRevokeAllDevices: validate(revokeAllDevicesSchema),
  validateChangePassword: validate(changePasswordSchema),
  validateRevokeSession: validate(revokeSessionSchema),
  validateDeviceIdParam: validateParams(deviceIdParamSchema),
};

