const express = require('express');
const tenantController = require('../controllers/tenant.controller');
const validator = require('../validators/tenant.validator');

const router = express.Router();

router.post('/', validator.validateCreateWorkspace, tenantController.createWorkspace);
router.get('/', tenantController.listWorkspaces);
router.get('/slug/:slug', tenantController.getWorkspaceBySlug);
router.get('/:id', tenantController.getWorkspaceById);
router.put('/:id', validator.validateUpdateMetadata, tenantController.updateMetadata);
router.put('/:id/modules', validator.validateUpdateModules, tenantController.updateModules);

router.post('/:id/logo', tenantController.upload.single('file'), tenantController.uploadLogo);
router.delete('/:id/logo', tenantController.deleteLogo);

module.exports = router;

