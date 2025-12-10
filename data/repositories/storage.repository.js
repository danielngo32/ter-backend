const { StorageItemModel } = require("../schemas/storage.schema");

const createItem = (payload) => StorageItemModel.create(payload);

const findItemById = (id) => StorageItemModel.findById(id);

const findItemByIdAndTenant = (id, tenantId) =>
  StorageItemModel.findOne({ _id: id, tenantId });

const listItemsByParent = (tenantId, ownerId, parentId = null) =>
  StorageItemModel.find({ tenantId, ownerId, parentId, isDeleted: false }).sort({
    type: 1,
    name: 1,
  });

const listTrashItems = (tenantId, ownerId) =>
  StorageItemModel.find({ tenantId, ownerId, isDeleted: true }).sort({
    deletedAt: -1,
  });

const listSharedWithUser = (tenantId, userId) =>
  StorageItemModel.find({
    tenantId,
    isDeleted: false,
    visibility: "shared",
    $or: [
      { "shares.tenantWide": true },
      { "shares.userIds": userId },
      { "shares.departmentIds": { $exists: true } },
    ],
  }).sort({ type: 1, name: 1 });

const updateItem = (id, updates) =>
  StorageItemModel.findByIdAndUpdate(id, { $set: updates }, { new: true });

const moveToTrash = (id) =>
  StorageItemModel.findByIdAndUpdate(
    id,
    { $set: { isDeleted: true, deletedAt: new Date() } },
    { new: true }
  );

const restoreFromTrash = (id) =>
  StorageItemModel.findByIdAndUpdate(
    id,
    { $set: { isDeleted: false, deletedAt: null } },
    { new: true }
  );

const deletePermanently = (id) => StorageItemModel.findByIdAndDelete(id);

const checkNameExists = (tenantId, ownerId, parentId, name, excludeId = null) => {
  const query = {
    tenantId,
    ownerId,
    parentId: parentId || null,
    name,
    isDeleted: false,
  };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  return StorageItemModel.findOne(query);
};

const countChildren = (parentId) =>
  StorageItemModel.countDocuments({ parentId, isDeleted: false });

module.exports = {
  createItem,
  findItemById,
  findItemByIdAndTenant,
  listItemsByParent,
  listTrashItems,
  listSharedWithUser,
  updateItem,
  moveToTrash,
  restoreFromTrash,
  deletePermanently,
  checkNameExists,
  countChildren,
};


