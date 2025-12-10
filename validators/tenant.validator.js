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

const createWorkspaceSchema = Joi.object({
  name: Joi.string().min(1).max(120).required(),
  businessCategoryId: Joi.string().hex().length(24).required(),
  modules: Joi.array().items(
    Joi.object({
      moduleId: Joi.string().hex().length(24).required(),
      isEnabled: Joi.boolean().default(true),
    })
  ).optional(),
});

const updateMetadataSchema = Joi.object({
  name: Joi.string().min(1).max(120).optional(),
  logoUrl: Joi.string().uri().allow(null, '').optional(),
  domain: Joi.string().lowercase().trim().optional(),
  plan: Joi.string().valid('free', 'pro', 'business', 'enterprise').optional(),
  maxUsers: Joi.number().min(1).optional(),
});

const updateModulesSchema = Joi.array().items(
  Joi.object({
    moduleId: Joi.string().hex().length(24).required(),
    isEnabled: Joi.boolean().default(true),
  })
);

module.exports = {
  validateCreateWorkspace: validate(createWorkspaceSchema),
  validateUpdateMetadata: validate(updateMetadataSchema),
  validateUpdateModules: validate(updateModulesSchema),
};

