const express = require('express');
const storageController = require('../controllers/storage.controller');
const validator = require('../validators/storage.validator');

const router = express.Router();

router.get('/', validator.validateParentIdQuery, storageController.listItems);
router.get('/trash', storageController.listTrash);
router.get('/:id', validator.validateItemIdParam, storageController.getItem);

router.post('/folders', validator.validateCreateFolder, storageController.createFolder);
router.post('/files', storageController.upload.single('file'), storageController.uploadFile);

router.put('/:id', validator.validateItemIdParam, validator.validateUpdateItem, storageController.updateItem);
router.put('/:id/share', validator.validateItemIdParam, validator.validateShareItem, storageController.shareItem);

router.post('/:id/trash', validator.validateItemIdParam, storageController.moveToTrash);
router.post('/:id/restore', validator.validateItemIdParam, storageController.restoreFromTrash);
router.delete('/:id', validator.validateItemIdParam, storageController.deletePermanently);

module.exports = router;

