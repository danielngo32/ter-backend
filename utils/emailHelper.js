const sgMail = require('../config/mail');

const sendEmailVerificationCode = async (email, fullName, verifyCode, expire = '10 phút') => {
  const msg = {
    to: email,
    from: {
      email: process.env.SENDGRID_FROM_EMAIL,
      name: 'TER Platform',
    },
    templateId: process.env.SENDGRID_VERIFICATION_TEMPLATE_ID,
    dynamicTemplateData: {
      fullName,
      verifyCode,
      expire,
    },
  };
  
  try {
    await sgMail.send(msg);
    return true;
  } catch (error) {
    return false;
  }
};

const sendWorkspaceInvitation = async (email, workspaceName, inviteUrl, expire) => {
  const msg = {
    to: email,
    from: {
      email: process.env.SENDGRID_FROM_EMAIL,
      name: 'TER Platform',
    },
    templateId: 'd-59dd7986a52c4e44a7fb1f0dcd1a612a',
    dynamicTemplateData: {
      workspaceName,
      inviteUrl,
      expire,
    },
  };
  
  try {
    await sgMail.send(msg);
    return true;
  } catch (error) {
    return false;
  }
};

module.exports = {
  sendEmailVerificationCode,
  sendWorkspaceInvitation,
};