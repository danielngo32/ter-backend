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

const passwordSchema = Joi.string()
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
  .message('Password must contain at least one special character');

const registerStep1Schema = Joi.object({
  email: Joi.string().email().required(),
  password: passwordSchema,
  deviceId: Joi.string().optional(),
});

const registerStep2Schema = Joi.object({
  email: Joi.string().email().required(),
  fullName: Joi.string().min(3).max(120).required(),
  tenantName: Joi.string().min(2).max(200).required(),
  slug: Joi.string().min(2).max(100).required(),
});

const registerStep3Schema = Joi.object({
  email: Joi.string().email().optional(),
  businessCategoryId: Joi.string().required(),
});

const registerStep4Schema = Joi.object({
  email: Joi.string().email().required(),
  code: Joi.string().length(6).required(),
});

const checkTenantSlugSchema = Joi.object({
  slug: Joi.string().min(2).max(100).required(),
});

const generateTenantSlugSchema = Joi.object({
  name: Joi.string().min(2).max(200).required(),
});

const loginSchema = Joi.object({
  slug: Joi.string().min(2).max(100).optional(), // Optional: required only when not on subdomain
  email: Joi.string().email().optional(),
  phoneNumber: Joi.string().min(6).max(20).optional(),
  password: Joi.string().required(),
  deviceId: Joi.string().optional(),
}).xor('email', 'phoneNumber');

const refreshSchema = Joi.object({
  refreshToken: Joi.string().min(10).optional(),
  deviceId: Joi.string().optional(),
});

const logoutSchema = Joi.object({
  refreshToken: Joi.string().min(10).optional(),
});

const passwordResetRequestSchema = Joi.object({
  email: Joi.string().email().required(),
  slug: Joi.string().min(2).max(100).optional(),
});

const passwordResetSchema = Joi.object({
  email: Joi.string().email().required(),
  code: Joi.string().length(6).required(),
  newPassword: passwordSchema,
});

const qrChallengeSchema = Joi.object({
  deviceId: Joi.string().optional(),
  deviceName: Joi.string().optional(),
  platform: Joi.string().valid('ios', 'android', 'web', 'desktop').optional(),
  location: Joi.string().optional(),
});

const qrPollSchema = Joi.object({
  challengeId: Joi.string().required(),
});

const qrApproveSchema = Joi.object({
  challengeId: Joi.string().required(),
  email: Joi.string().email().optional(),
  phoneNumber: Joi.string().min(6).max(20).optional(),
  password: Joi.string().required(),
}).xor('email', 'phoneNumber');

const resendCodeSchema = Joi.object({
  email: Joi.string().email().required(),
});

const checkEmailSchema = Joi.object({
  email: Joi.string().email().required(),
  exists: Joi.boolean().optional(),
});

const verifyCodeSchema = Joi.object({
  email: Joi.string().email().required(),
  code: Joi.string().length(6).required(),
  type: Joi.string().valid('register', 'reset').required(),
});

module.exports = {
  validateRegisterStep1: validate(registerStep1Schema),
  validateRegisterStep2: validate(registerStep2Schema),
  validateRegisterStep3: validate(registerStep3Schema),
  validateRegisterStep4: validate(registerStep4Schema),
  validateCheckTenantSlug: validate(checkTenantSlugSchema),
  validateGenerateTenantSlug: validate(generateTenantSlugSchema),
  validateLogin: validate(loginSchema),
  validateRefresh: validate(refreshSchema),
  validateLogout: validate(logoutSchema),
  validatePasswordResetRequest: validate(passwordResetRequestSchema),
  validatePasswordReset: validate(passwordResetSchema),
  validateResendCode: validate(resendCodeSchema),
  validateQrChallenge: validate(qrChallengeSchema),
  validateQrPoll: validate(qrPollSchema),
  validateQrApprove: validate(qrApproveSchema),
  validateCheckEmail: validate(checkEmailSchema),
  validateVerifyCode: validate(verifyCodeSchema),
};
