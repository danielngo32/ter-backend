const sgMail = require('@sendgrid/mail');

if (!process.env.SENDGRID_API_KEY) {
  if (process.env.NODE_ENV === 'development') {
    console.warn('Warning: SENDGRID_API_KEY is not set. Email functionality will be disabled.');
    console.log('Available env vars:', Object.keys(process.env).filter(k => k.includes('SEND') || k.includes('GRID')));
  }
} else {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  if (process.env.NODE_ENV === 'development') {
    console.log('✅ SendGrid API key loaded successfully');
  }
}

module.exports = sgMail;

