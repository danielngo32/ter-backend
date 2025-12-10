const Joi = require('joi');

const createFolderSchema = Joi.object({
  name: Joi.string().trim().required().min(1).max(255),
  parentId: Joi.string().hex().length(24).allow(null, ''),
  visibility: Joi.string().valid('private', 'shared', 'public').default('private'),
  shares: Joi.object({
    tenantWide: Joi.boolean().default(false),
    userIds: Joi.array().items(Joi.string().hex().length(24)).default([]),
    departmentIds: Joi.array().items(Joi.string().hex().length(24)).default([]),
  }).optional(),
});

const updateItemSchema = Joi.object({
  name: Joi.string().trim().min(1).max(255),
  parentId: Joi.string().hex().length(24).allow(null, ''),
  visibility: Joi.string().valid('private', 'shared', 'public'),
  shares: Joi.object({
    tenantWide: Joi.boolean(),
    userIds: Joi.array().items(Joi.string().hex().length(24)),
    departmentIds: Joi.array().items(Joi.string().hex().length(24)),
  }).optional(),
});

const shareItemSchema = Joi.object({
  visibility: Joi.string().valid('shared', 'public').required(),
  shares: Joi.object({
    tenantWide: Joi.boolean().default(false),
    userIds: Joi.array().items(Joi.string().hex().length(24)).default([]),
    departmentIds: Joi.array().items(Joi.string().hex().length(24)).default([]),
  }).required(),
});

const validateCreateFolder = (req, res, next) => {
  const { error } = createFolderSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }
  next();
};

const validateUpdateItem = (req, res, next) => {
  const { error } = updateItemSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }
  next();
};

const validateShareItem = (req, res, next) => {
  const { error } = shareItemSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }
  next();
};

const validateItemIdParam = (req, res, next) => {
  const { id } = req.params;
  if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
    return res.status(400).json({ message: 'Invalid item ID' });
  }
  next();
};

const validateParentIdQuery = (req, res, next) => {
  const { parentId } = req.query;
  if (parentId && !/^[0-9a-fA-F]{24}$/.test(parentId)) {
    return res.status(400).json({ message: 'Invalid parent ID' });
  }
  next();
};

module.exports = {
  validateCreateFolder,
  validateUpdateItem,
  validateShareItem,
  validateItemIdParam,
  validateParentIdQuery,
};

