const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const bcrypt = require('bcryptjs');

const generateSecret = (email, serviceName = 'TER') => {
  const secret = speakeasy.generateSecret({
    name: `${serviceName} (${email})`,
    issuer: serviceName,
    length: 32,
  });

  return {
    secret: secret.base32,
    secretKey: secret.base32,
    otpauthUrl: secret.otpauth_url,
  };
};

const generateQRCode = async (otpauthUrl) => {
  try {
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
    return qrCodeDataUrl;
  } catch (error) {
    throw new Error('Failed to generate QR code: ' + error.message);
  }
};

const verifyToken = (secret, token, window = 2) => {
  return speakeasy.totp.verify({
    secret: secret,
    encoding: 'base32',
    token: token,
    window: window,
  });
};

const generateRecoveryCodes = async (count = 10) => {
  const plainCodes = [];
  const hashedCodes = [];

  for (let i = 0; i < count; i++) {
    const plainCode = Math.random().toString(36).substring(2, 10).toUpperCase();
    const hashedCode = await bcrypt.hash(plainCode, 10);

    plainCodes.push(plainCode);
    hashedCodes.push({
      code: hashedCode,
      used: false,
      usedAt: null,
    });
  }

  return {
    plainCodes,
    hashedCodes,
  };
};

const verifyRecoveryCode = async (recoveryCodes, inputCode) => {
  if (!recoveryCodes || recoveryCodes.length === 0) {
    return null;
  }

  const normalizedInput = inputCode.toUpperCase().trim();

  for (const recoveryCode of recoveryCodes) {
    if (recoveryCode.used) {
      continue;
    }

    const isValid = await bcrypt.compare(normalizedInput, recoveryCode.code);
    if (isValid) {
      return recoveryCode;
    }
  }

  return null;
};

module.exports = {
  generateSecret,
  generateQRCode,
  verifyToken,
  generateRecoveryCodes,
  verifyRecoveryCode,
};

