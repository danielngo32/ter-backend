const { S3Client } = require('@aws-sdk/client-s3');

if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
  if (process.env.NODE_ENV === 'development') {
    console.warn('Warning: R2 credentials are not set. Storage functionality will be disabled.');
  }
}

if (!process.env.R2_ENDPOINT) {
  throw new Error('R2_ENDPOINT must be configured in environment variables');
}

if (!process.env.R2_BUCKET_NAME) {
  throw new Error('R2_BUCKET_NAME must be configured in environment variables');
}

const s3Client = new S3Client({
  region: process.env.R2_REGION || 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
  forcePathStyle: false,
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME;

const getPublicUrl = (key) => {
  const domain = process.env.R2_CUSTOM_DOMAIN || process.env.R2_PUBLIC_DOMAIN;
  if (!domain) {
    throw new Error('R2_PUBLIC_DOMAIN or R2_CUSTOM_DOMAIN must be configured');
  }
  const cleanKey = key.startsWith('/') ? key.substring(1) : key;
  return `https://${domain}/${cleanKey}`;
};

module.exports = {
  s3Client,
  BUCKET_NAME,
  getPublicUrl,
};

