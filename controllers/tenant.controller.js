const multer = require('multer');
const authHelper = require('../utils/authHelper');
const ApiError = require('../utils/apiError');
const tenantRepository = require('../data/repositories/tenant.repository');
const userRepository = require('../data/repositories/user.repository');
const { generateDefaultAvatarUrl } = require('../utils/avatarGenerator');
const { generateFileName, getStoragePath, uploadFile, deleteFile, extractKeyFromUrl } = require('../utils/storageHelper');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB for logos
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ApiError(400, `File type ${file.mimetype} is not allowed. Only images are allowed.`), false);
    }
  },
});

const generateSlug = (name) => {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

const ensureUniqueSlug = async (baseSlug) => {
  let slug = baseSlug;
  let counter = 1;
  
  while (await tenantRepository.findTenantBySlug(slug)) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
  
  return slug;
};

const getCurrentUserId = (req) => {
  const token = req.cookies.accessToken || (req.headers.authorization ? req.headers.authorization.split(' ')[1] : null);
  if (!token) {
    throw new ApiError(401, 'Authorization token missing');
  }
  return authHelper.getCurrentUserId(token);
};

const checkTenantAccess = (tenant, userId, requiredRole = null) => {
  if (!tenant) {
    throw new ApiError(404, 'Tenant not found');
  }

  const isOwner = tenant.ownerId && tenant.ownerId.toString() === userId.toString();

  if (requiredRole === 'owner' && !isOwner) {
    throw new ApiError(403, 'Owner access required');
  }

  if (!isOwner) {
    throw new ApiError(403, 'Access denied');
  }

  return { isOwner };
};

const createWorkspace = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const { name, businessCategoryId, modules } = req.body;

    if (!businessCategoryId) {
      throw new ApiError(400, 'businessCategoryId is required');
    }

    const baseSlug = generateSlug(name);
    const slug = await ensureUniqueSlug(baseSlug);

    const logoUrl = generateDefaultAvatarUrl(name);

    const tenant = await tenantRepository.createTenant({
      name,
      slug,
      logoUrl,
      ownerId: userId,
      businessCategoryId,
      modules: modules || [],
    });

    res.status(201).json(tenant);
  } catch (error) {
    next(error);
  }
};

const getWorkspaceById = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const { id } = req.params;

    const tenant = await tenantRepository.findTenantById(id);
    checkTenantAccess(tenant, userId);

    res.json(tenant);
  } catch (error) {
    next(error);
  }
};

const getWorkspaceBySlug = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const { slug } = req.params;

    const tenant = await tenantRepository.findTenantBySlug(slug);
    checkTenantAccess(tenant, userId);

    res.json(tenant);
  } catch (error) {
    next(error);
  }
};

const listWorkspaces = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      return res.json({ items: [], total: 0 });
    }

    const tenant = await tenantRepository.findTenantById(user.tenantId);
    res.json({
      items: tenant ? [tenant] : [],
      total: tenant ? 1 : 0,
    });
  } catch (error) {
    next(error);
  }
};

const updateMetadata = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const { id } = req.params;

    const tenant = await tenantRepository.findTenantById(id);
    checkTenantAccess(tenant, userId, 'owner');

    const updatePayload = { ...req.body };

    if (req.body.name && req.body.name !== tenant.name) {
      const baseSlug = generateSlug(req.body.name);
      const slug = await ensureUniqueSlug(baseSlug);
      updatePayload.slug = slug;
    }

    if (req.body.logoUrl !== undefined) {
      if (req.body.logoUrl === null || req.body.logoUrl === '') {
        if (tenant.logoUrl) {
          const oldKey = extractKeyFromUrl(tenant.logoUrl);
          if (oldKey) {
            try {
              await deleteFile(oldKey);
            } catch (error) {
              console.error('Failed to delete old logo:', error);
            }
          }
        }
        updatePayload.logoUrl = null;
      } else {
        updatePayload.logoUrl = req.body.logoUrl;
      }
    }

    const updated = await tenantRepository.updateTenant(id, updatePayload);
    res.json(updated);
  } catch (error) {
    next(error);
  }
};

const updateModules = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const { id } = req.params;

    const tenant = await tenantRepository.findTenantById(id);
    checkTenantAccess(tenant, userId, 'owner');

    const updated = await tenantRepository.updateTenant(id, { modules: req.body });
    res.json(updated);
  } catch (error) {
    next(error);
  }
};


const uploadLogo = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const { id } = req.params;

    const tenant = await tenantRepository.findTenantById(id);
    checkTenantAccess(tenant, userId, 'owner');

    if (!req.file) {
      throw new ApiError(400, 'No file uploaded');
    }

    if (tenant.logoUrl) {
      const oldKey = extractKeyFromUrl(tenant.logoUrl);
      if (oldKey) {
        try {
          await deleteFile(oldKey);
        } catch (error) {
          console.error('Failed to delete old logo:', error);
        }
      }
    }

    const tenantId = tenant._id || id;
    const fileName = generateFileName(req.file.originalname);
    const key = getStoragePath(tenantId.toString(), 'tenant_logo', {
      fileName,
    });

    const url = await uploadFile(req.file.buffer, key, req.file.mimetype);
    const updated = await tenantRepository.updateTenant(id, { logoUrl: url });

    res.json({ url, key, tenant: updated });
  } catch (error) {
    next(error);
  }
};

const deleteLogo = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const { id } = req.params;

    const tenant = await tenantRepository.findTenantById(id);
    checkTenantAccess(tenant, userId, 'owner');

    if (!tenant.logoUrl) {
      throw new ApiError(400, 'No logo to delete');
    }

    const key = extractKeyFromUrl(tenant.logoUrl);
    if (key) {
      await deleteFile(key);
    }

    const updated = await tenantRepository.updateTenant(id, { logoUrl: null });
    res.json({ message: 'Logo deleted successfully', tenant: updated });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  upload,
  createWorkspace,
  getWorkspaceById,
  getWorkspaceBySlug,
  listWorkspaces,
  updateMetadata,
  updateModules,
  uploadLogo,
  deleteLogo,
};

