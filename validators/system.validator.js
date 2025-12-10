const Joi = require('joi');

const validate = (schema) => async (req, res, next) => {
  try {
    const value = await schema.validateAsync(req.query, { abortEarly: false, stripUnknown: true });
    req.query = value;
    next();
  } catch (error) {
    res.status(400).json({
      message: 'Validation failed',
      details: error.details?.map((d) => d.message) || [],
    });
  }
};

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

const getWardsQuerySchema = Joi.object({
  provinceCode: Joi.string().trim().optional(),
  provinceId: Joi.string().trim().optional(),
});

const codeParamSchema = Joi.object({
  code: Joi.string().trim().required(),
});

const parentIdParamSchema = Joi.object({
  parentId: Joi.string().trim().required(),
});

module.exports = {
  validateGetWards: validate(getWardsQuerySchema),
  validateCodeParam: validateParams(codeParamSchema),
  validateParentIdParam: validateParams(parentIdParamSchema),
};

