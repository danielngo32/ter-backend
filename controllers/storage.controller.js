const multer = require('multer');
const ApiError = require('../utils/apiError');
const authHelper = require('../utils/authHelper');
const storageRepository = require('../data/repositories/storage.repository');
const userRepository = require('../data/repositories/user.repository');
const { generateFileName, getStoragePath, uploadFile: uploadFileToR2, deleteFile, extractKeyFromUrl } = require('../utils/storageHelper');

const getCurrentUserId = (req) => {
  const token = req.cookies.accessToken || (req.headers.authorization ? req.headers.authorization.split(' ')[1] : null);
  if (!token) {
    throw new ApiError(401, 'Authorization token missing');
  }
  return authHelper.getCurrentUserId(token);
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'text/csv',
      'video/mp4',
      'video/quicktime',
      'video/x-msvideo',
      'audio/mpeg',
      'audio/wav',
      'audio/mp3',
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ApiError(400, `File type ${file.mimetype} is not allowed`), false);
    }
  },
});

const listItems = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    const { parentId, shared } = req.query;
    const parentIdValue = parentId === 'null' || parentId === '' ? null : parentId;

    let items;
    if (shared === 'true') {
      items = await storageRepository.listSharedWithUser(user.tenantId, userId);
    } else {
      items = await storageRepository.listItemsByParent(user.tenantId, userId, parentIdValue);
    }

    res.json(items);
  } catch (error) {
    next(error);
  }
};

const getItem = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    const { id } = req.params;
    const item = await storageRepository.findItemByIdAndTenant(id, user.tenantId);

    if (!item) {
      throw new ApiError(404, 'Item not found');
    }

    if (item.ownerId.toString() !== userId.toString() && item.visibility !== 'shared' && item.visibility !== 'public') {
      throw new ApiError(403, 'Access denied');
    }

    res.json(item);
  } catch (error) {
    next(error);
  }
};

const createFolder = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    const { name, parentId, visibility, shares: sharesRaw } = req.body;
    const parentIdValue = parentId === 'null' || parentId === '' ? null : parentId;
    
    let shares = {};
    if (sharesRaw) {
      try {
        shares = typeof sharesRaw === 'string' ? JSON.parse(sharesRaw) : sharesRaw;
      } catch (e) {
        shares = {};
      }
    }

    if (parentIdValue) {
      const parent = await storageRepository.findItemByIdAndTenant(parentIdValue, user.tenantId);
      if (!parent) {
        throw new ApiError(404, 'Parent folder not found');
      }
      if (parent.type !== 'folder') {
        throw new ApiError(400, 'Parent must be a folder');
      }
      if (parent.ownerId.toString() !== userId.toString()) {
        throw new ApiError(403, 'Access denied to parent folder');
      }
    }

    const existing = await storageRepository.checkNameExists(user.tenantId, userId, parentIdValue, name);
    if (existing) {
      throw new ApiError(409, 'Folder with this name already exists');
    }

    const folder = await storageRepository.createItem({
      tenantId: user.tenantId,
      ownerId: userId,
      type: 'folder',
      name: name.trim(),
      parentId: parentIdValue,
      visibility: visibility || 'private',
      shares: shares,
    });

    res.status(201).json(folder);
  } catch (error) {
    next(error);
  }
};

const buildPathFromParent = async (parentId, tenantId) => {
  const pathParts = [];
  let currentId = parentId;

  while (currentId) {
    const parent = await storageRepository.findItemByIdAndTenant(currentId, tenantId);
    if (!parent) break;
    pathParts.unshift(parent.name);
    currentId = parent.parentId;
  }

  return pathParts.join('/');
};

const uploadFile = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    if (!req.file) {
      throw new ApiError(400, 'No file uploaded');
    }

    const { parentId, visibility, shares: sharesRaw } = req.body;
    const parentIdValue = parentId === 'null' || parentId === '' ? null : parentId;
    
    let shares = {};
    if (sharesRaw) {
      try {
        shares = typeof sharesRaw === 'string' ? JSON.parse(sharesRaw) : sharesRaw;
      } catch (e) {
        shares = {};
      }
    }

    if (parentIdValue) {
      const parent = await storageRepository.findItemByIdAndTenant(parentIdValue, user.tenantId);
      if (!parent) {
        throw new ApiError(404, 'Parent folder not found');
      }
      if (parent.type !== 'folder') {
        throw new ApiError(400, 'Parent must be a folder');
      }
      if (parent.ownerId.toString() !== userId.toString()) {
        throw new ApiError(403, 'Access denied to parent folder');
      }
    }

    const existing = await storageRepository.checkNameExists(user.tenantId, userId, parentIdValue, req.file.originalname);
    if (existing) {
      throw new ApiError(409, 'File with this name already exists');
    }

    const fileName = generateFileName(req.file.originalname);
    const subPath = parentIdValue ? await buildPathFromParent(parentIdValue, user.tenantId) : '';
    const key = getStoragePath(user.tenantId, 'storage_file', {
      userId: userId.toString(),
      fileName,
      subPath,
    });

    const url = await uploadFileToR2(req.file.buffer, key, req.file.mimetype);

    const fileItem = await storageRepository.createItem({
      tenantId: user.tenantId,
      ownerId: userId,
      type: 'file',
      name: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      url,
      path: key,
      parentId: parentIdValue,
      visibility: visibility || 'private',
      shares: shares || {},
    });

    res.status(201).json(fileItem);
  } catch (error) {
    next(error);
  }
};

const updateItem = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    const { id } = req.params;
    const item = await storageRepository.findItemByIdAndTenant(id, user.tenantId);

    if (!item) {
      throw new ApiError(404, 'Item not found');
    }

    if (item.ownerId.toString() !== userId.toString()) {
      throw new ApiError(403, 'Access denied');
    }

    const { name, parentId, visibility, shares: sharesRaw } = req.body;
    const updates = {};
    
    let shares = undefined;
    if (sharesRaw !== undefined) {
      try {
        shares = typeof sharesRaw === 'string' ? JSON.parse(sharesRaw) : sharesRaw;
      } catch (e) {
        shares = {};
      }
    }

    if (name !== undefined) {
      const parentIdValue = item.parentId ? item.parentId.toString() : null;
      const existing = await storageRepository.checkNameExists(user.tenantId, userId, parentIdValue, name.trim(), id);
      if (existing) {
        throw new ApiError(409, 'Item with this name already exists');
      }
      updates.name = name.trim();
    }

    if (parentId !== undefined) {
      const parentIdValue = parentId === 'null' || parentId === '' ? null : parentId;
      if (parentIdValue) {
        const parent = await storageRepository.findItemByIdAndTenant(parentIdValue, user.tenantId);
        if (!parent) {
          throw new ApiError(404, 'Parent folder not found');
        }
        if (parent.type !== 'folder') {
          throw new ApiError(400, 'Parent must be a folder');
        }
        if (parent.ownerId.toString() !== userId.toString()) {
          throw new ApiError(403, 'Access denied to parent folder');
        }
        if (parentIdValue === id) {
          throw new ApiError(400, 'Cannot move item into itself');
        }
        
        if (item.type === 'folder') {
          let checkId = parentIdValue;
          while (checkId) {
            if (checkId.toString() === id.toString()) {
              throw new ApiError(400, 'Cannot move folder into its own subfolder');
            }
            const checkParent = await storageRepository.findItemByIdAndTenant(checkId, user.tenantId);
            if (!checkParent || !checkParent.parentId) break;
            checkId = checkParent.parentId;
          }
        }
      }
      updates.parentId = parentIdValue;
    }

    if (visibility !== undefined) {
      updates.visibility = visibility;
    }

    if (shares !== undefined) {
      updates.shares = shares;
    }

    const updated = await storageRepository.updateItem(id, updates);
    res.json(updated);
  } catch (error) {
    next(error);
  }
};

const shareItem = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    const { id } = req.params;
    const { visibility, shares: sharesRaw } = req.body;
    
    let shares = undefined;
    if (sharesRaw !== undefined) {
      try {
        shares = typeof sharesRaw === 'string' ? JSON.parse(sharesRaw) : sharesRaw;
      } catch (e) {
        shares = {};
      }
    }

    const item = await storageRepository.findItemByIdAndTenant(id, user.tenantId);
    if (!item) {
      throw new ApiError(404, 'Item not found');
    }

    if (item.ownerId.toString() !== userId.toString()) {
      throw new ApiError(403, 'Access denied');
    }

    const updated = await storageRepository.updateItem(id, { visibility, shares });
    res.json(updated);
  } catch (error) {
    next(error);
  }
};

const moveToTrash = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    const { id } = req.params;
    const item = await storageRepository.findItemByIdAndTenant(id, user.tenantId);

    if (!item) {
      throw new ApiError(404, 'Item not found');
    }

    if (item.ownerId.toString() !== userId.toString()) {
      throw new ApiError(403, 'Access denied');
    }

    const childrenCount = await storageRepository.countChildren(id);
    if (childrenCount > 0) {
      throw new ApiError(400, 'Cannot move folder with items to trash. Please empty the folder first.');
    }

    await storageRepository.moveToTrash(id);
    res.json({ message: 'Item moved to trash successfully' });
  } catch (error) {
    next(error);
  }
};

const restoreFromTrash = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    const { id } = req.params;
    const item = await storageRepository.findItemByIdAndTenant(id, user.tenantId);

    if (!item) {
      throw new ApiError(404, 'Item not found');
    }

    if (item.ownerId.toString() !== userId.toString()) {
      throw new ApiError(403, 'Access denied');
    }

    await storageRepository.restoreFromTrash(id);
    res.json({ message: 'Item restored successfully' });
  } catch (error) {
    next(error);
  }
};

const deletePermanently = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    const { id } = req.params;
    const item = await storageRepository.findItemByIdAndTenant(id, user.tenantId);

    if (!item) {
      throw new ApiError(404, 'Item not found');
    }

    if (item.ownerId.toString() !== userId.toString()) {
      throw new ApiError(403, 'Access denied');
    }

    if (item.type === 'file' && item.url) {
      const key = extractKeyFromUrl(item.url) || item.path;
      if (key) {
        try {
          await deleteFile(key);
        } catch (error) {
          console.error('Failed to delete file from storage:', error);
        }
      }
    }

    await storageRepository.deletePermanently(id);
    res.json({ message: 'Item deleted permanently' });
  } catch (error) {
    next(error);
  }
};

const listTrash = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const user = await userRepository.findById(userId);
    if (!user || !user.tenantId) {
      throw new ApiError(404, 'User or tenant not found');
    }

    const items = await storageRepository.listTrashItems(user.tenantId, userId);
    res.json(items);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  upload,
  listItems,
  getItem,
  createFolder,
  uploadFile,
  updateItem,
  shareItem,
  moveToTrash,
  restoreFromTrash,
  deletePermanently,
  listTrash,
};
