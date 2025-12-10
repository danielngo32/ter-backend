const path = require('path');
const crypto = require('crypto');
const { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { s3Client, BUCKET_NAME, getPublicUrl } = require('../config/storage');

const generateFileName = (originalName, prefix = '') => {
  const ext = path.extname(originalName);
  const name = path.basename(originalName, ext);
  const timestamp = Date.now();
  const random = crypto.randomBytes(4).toString('hex');
  const sanitizedName = name.replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 50);
  return `${prefix}${timestamp}-${random}-${sanitizedName}${ext}`;
};

const getStoragePath = (tenantId, type, options = {}) => {
  const { 
    productId, 
    variantId, 
    userId, 
    customerId, 
    employeeId, 
    transactionId, 
    roomId, 
    messageId, 
    chatId, 
    accountId, 
    conversationId, 
    jobId, 
    candidateId,
    documentType,
    fileType,
    subPath,
    fileName 
  } = options;

  const basePath = tenantId ? `${tenantId}` : '';

  switch (type) {
    case 'product_image':
      if (!productId || !fileName) throw new Error('productId and fileName are required');
      return `${basePath}/products/${productId}/images/${fileName}`;
    
    case 'user_avatar':
      if (!userId || !fileName) throw new Error('userId and fileName are required');
      return `${basePath}/users/${userId}/avatar/${fileName}`;
    
    case 'tenant_logo':
      if (!fileName) throw new Error('fileName is required');
      return `${basePath}/tenants/${tenantId}/logo/${fileName}`;
    
    case 'customer_avatar':
      if (!customerId || !fileName) throw new Error('customerId and fileName are required');
      return `${basePath}/crm/customers/${customerId}/avatar/${fileName}`;
    
    case 'employee_document':
      if (!employeeId || !fileName) throw new Error('employeeId and fileName are required');
      const validDocumentTypes = ['id_card_front', 'id_card_back', 'passport', 'contract', 'other'];
      const docType = documentType && validDocumentTypes.includes(documentType) ? documentType : 'other';
      return `${basePath}/hr/employees/${employeeId}/documents/${docType}/${fileName}`;
    
    case 'finance_attachment':
      if (!transactionId || !fileName) throw new Error('transactionId and fileName are required');
      return `${basePath}/finance/transactions/${transactionId}/attachments/${fileName}`;
    
    case 'messaging_attachment':
      if (!roomId || !messageId || !fileName) throw new Error('roomId, messageId and fileName are required');
      return `${basePath}/messaging/rooms/${roomId}/messages/${messageId}/attachments/${fileName}`;
    
    case 'ai_attachment':
      if (!chatId || !fileName) throw new Error('chatId and fileName are required');
      const validFileTypes = ['files', 'images', 'audio', 'video', 'other'];
      const fType = fileType && validFileTypes.includes(fileType) ? fileType : 'other';
      return `${basePath}/ai/chats/${chatId}/attachments/${fType}/${fileName}`;
    
    case 'zalo_account_avatar':
      if (!accountId || !fileName) throw new Error('accountId and fileName are required');
      return `${basePath}/channels/zalo/accounts/${accountId}/avatar/${fileName}`;
    
    case 'zalo_message_attachment':
      if (!conversationId || !messageId || !fileName) throw new Error('conversationId, messageId and fileName are required');
      return `${basePath}/channels/zalo/conversations/${conversationId}/messages/${messageId}/attachments/${fileName}`;
    
    case 'recruitment_job_attachment':
      if (!jobId || !fileName) throw new Error('jobId and fileName are required');
      return `${basePath}/recruitment/jobs/${jobId}/attachments/${fileName}`;
    
    case 'recruitment_candidate_attachment':
      if (!candidateId || !fileName) throw new Error('candidateId and fileName are required');
      const validCandidateDocTypes = ['resume', 'portfolio', 'certificate', 'other'];
      const candidateDocType = documentType && validCandidateDocTypes.includes(documentType) ? documentType : 'other';
      return `${basePath}/recruitment/candidates/${candidateId}/attachments/${candidateDocType}/${fileName}`;
    
    case 'storage_file':
      if (!userId || !fileName) throw new Error('userId and fileName are required');
      const pathSegment = subPath ? subPath.replace(/^\/+|\/+$/g, '') : '';
      const storagePath = pathSegment ? `${basePath}/storage/${userId}/${pathSegment}/${fileName}` : `${basePath}/storage/${userId}/${fileName}`;
      return storagePath;
    
    default:
      throw new Error(`Unknown storage type: ${type}`);
  }
};

const uploadFile = async (fileBuffer, key, contentType) => {
  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
    });

    await s3Client.send(command);
    return getPublicUrl(key);
  } catch (error) {
    throw new Error(`Failed to upload file: ${error.message}`);
  }
};

const deleteFile = async (key) => {
  try {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    await s3Client.send(command);
    return true;
  } catch (error) {
    throw new Error(`Failed to delete file: ${error.message}`);
  }
};

const getPresignedUrl = async (key, expiresIn = 3600) => {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn });
    return url;
  } catch (error) {
    throw new Error(`Failed to generate presigned URL: ${error.message}`);
  }
};

const extractKeyFromUrl = (url) => {
  try {
    const domain = process.env.R2_CUSTOM_DOMAIN || process.env.R2_PUBLIC_DOMAIN;
    if (!domain) return null;
    
    const urlObj = new URL(url);
    if (urlObj.hostname === domain || urlObj.hostname.endsWith(`.${domain}`)) {
      const key = urlObj.pathname.substring(1);
      return key || null;
    }
    return null;
  } catch (error) {
    return null;
  }
};

module.exports = {
  generateFileName,
  getStoragePath,
  uploadFile,
  deleteFile,
  getPresignedUrl,
  extractKeyFromUrl,
  getPublicUrl,
};