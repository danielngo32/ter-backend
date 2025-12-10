const express = require('express');
const profileController = require('../controllers/profile.controller');
const validator = require('../validators/profile.validator');

const router = express.Router();

router.get('/me', profileController.getProfile);
router.put('/me', validator.validateUpdateProfile, profileController.updateProfile);
router.put('/me/settings', validator.validateUpdateSettings, profileController.updateSettings);

router.post('/me/avatar', profileController.upload.single('file'), profileController.uploadAvatar);
router.delete('/me/avatar', profileController.deleteAvatar);

router.post('/me/security/2fa/setup', profileController.setup2FA);
router.post('/me/security/2fa/verify', validator.validateVerify2FA, profileController.verifyAndEnable2FA);
router.post('/me/security/2fa/disable', validator.validateDisable2FA, profileController.disable2FA);
router.post('/me/security/2fa/recovery-codes/regenerate', validator.validateRegenerateRecoveryCodes, profileController.regenerateRecoveryCodes);

router.get('/me/devices', profileController.listDevices);
router.post('/me/devices/:deviceId/revoke', validator.validateDeviceIdParam, profileController.revokeDevice);
router.post('/me/devices/revoke-all', validator.validateRevokeAllDevices, profileController.revokeAllDevices);

router.post('/me/password/change', validator.validateChangePassword, profileController.changePassword);

router.get('/me/sessions', profileController.listSessions);
router.post('/me/sessions/revoke', validator.validateRevokeSession, profileController.revokeSession);

module.exports = router;

