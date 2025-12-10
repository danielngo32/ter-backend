const express = require('express');
const router = express.Router();
const {
  getProvinces,
  getProvinceByCode,
  getWards,
  getWardByCode,
  getBusinessCategories,
  getParentBusinessCategories,
  getSubBusinessCategories,
  getAppModules,
} = require('../controllers/system.controller');
const validator = require('../validators/system.validator');

router.get('/provinces', getProvinces);
router.get('/provinces/:code', validator.validateCodeParam, getProvinceByCode);

router.get('/wards', validator.validateGetWards, getWards);
router.get('/wards/:code', validator.validateCodeParam, getWardByCode);

router.get('/business-categories', getBusinessCategories);
router.get('/business-categories/parents', getParentBusinessCategories);
router.get('/business-categories/parents/:parentId/children', validator.validateParentIdParam, getSubBusinessCategories);

router.get('/app-modules', getAppModules);

module.exports = router;

