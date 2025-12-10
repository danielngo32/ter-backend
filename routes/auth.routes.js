const express = require('express');
const authController = require('../controllers/auth.controller');
const validator = require('../validators/auth.validator');
const { requireMainDomain } = require('../utils/subdomain');

const router = express.Router();

router.post('/check-email', validator.validateCheckEmail, authController.checkEmailAvailable);
router.post('/register/step1', requireMainDomain, validator.validateRegisterStep1, authController.registerStep1);
router.post('/register/step2', requireMainDomain, validator.validateRegisterStep2, authController.registerStep2);
router.post('/register/step3', requireMainDomain, validator.validateRegisterStep3, authController.registerStep3);
router.post('/register/step4', requireMainDomain, validator.validateRegisterStep4, authController.registerStep4);
router.post('/register/resend', requireMainDomain, validator.validateResendCode, authController.resendRegistrationCode);
router.post('/tenant/check-slug', requireMainDomain, validator.validateCheckTenantSlug, authController.checkTenantSlug);
router.post('/tenant/generate-slug', requireMainDomain, validator.validateGenerateTenantSlug, authController.generateTenantSlug);
router.post('/login', validator.validateLogin, authController.login);
router.post('/token/refresh', validator.validateRefresh, authController.refreshToken);
router.post('/token/revoke', validator.validateLogout, authController.logout);
router.post('/password/forgot', validator.validatePasswordResetRequest, authController.requestPasswordReset);
router.post('/verify-code', validator.validateVerifyCode, authController.verifyCode);
router.post('/password/reset', validator.validatePasswordReset, authController.resetPassword);
router.get('/me', authController.getProfileFromToken);
router.post('/qr/challenge', validator.validateQrChallenge, authController.createQrChallenge);
router.post('/qr/poll', validator.validateQrPoll, authController.pollQrChallenge);
router.post('/qr/approve', validator.validateQrApprove, authController.approveQrChallenge);

module.exports = router;
