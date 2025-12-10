const {
  BusinessCategoryModel,
  AppModuleModel,
  ProvinceModel,
  WardModel,
  ShippingPartnerModel,
  PaymentPartnerModel,
} = require('../schemas/system.schema');

const findBusinessCategoryById = async (id) => {
  return await BusinessCategoryModel.findById(id);
};

const findActiveBusinessCategories = async () => {
  return await BusinessCategoryModel.find({ isActive: true })
    .sort({ parentCode: 1, order: 1 });
};

const findParentBusinessCategories = async () => {
  return await BusinessCategoryModel.find({ 
    isActive: true,
    $or: [
      { parentCode: { $exists: false } },
      { parentCode: null },
      { parentCode: '' }
    ]
  })
    .sort({ order: 1 });
};

const findSubBusinessCategoriesByParentId = async (parentId) => {
  const parent = await BusinessCategoryModel.findById(parentId);
  if (!parent || !parent.isActive) {
    return [];
  }
  return await BusinessCategoryModel.find({ 
    isActive: true,
    parentCode: parent.code
  })
    .sort({ order: 1 });
};

const findDefaultAppModules = async () => {
  return await AppModuleModel.find({ isDefaultForNewTenant: true });
};

const findAllProvinces = async () => {
  return await ProvinceModel.find({}).sort({ name: 1 });
};

const findProvinceByCode = async (code) => {
  return await ProvinceModel.findOne({ code });
};

const findProvinceById = async (id) => {
  return await ProvinceModel.findById(id);
};

const findAllWards = async () => {
  return await WardModel.find({}).sort({ name: 1 });
};

const findWardsByProvinceId = async (provinceId) => {
  return await WardModel.find({ province: provinceId }).sort({ name: 1 });
};

const findWardsByProvinceCode = async (provinceCode) => {
  const province = await ProvinceModel.findOne({ code: provinceCode });
  if (!province) {
    return [];
  }
  return await WardModel.find({ province: province._id }).sort({ name: 1 });
};

const findWardByCode = async (code) => {
  return await WardModel.findOne({ code });
};

const findWardById = async (id) => {
  return await WardModel.findById(id).populate('province');
};

const findAllShippingPartners = async () => {
  return await ShippingPartnerModel.find({ isEnabled: true })
    .sort({ order: 1 });
};

const findShippingPartnerByCode = async (code) => {
  return await ShippingPartnerModel.findOne({ code, isEnabled: true });
};

const findShippingPartnerById = async (id) => {
  return await ShippingPartnerModel.findById(id);
};

const findAllPaymentPartners = async () => {
  return await PaymentPartnerModel.find({ isEnabled: true })
    .sort({ order: 1 });
};

const findPaymentPartnerByCode = async (code) => {
  return await PaymentPartnerModel.findOne({ code, isEnabled: true });
};

const findPaymentPartnerById = async (id) => {
  return await PaymentPartnerModel.findById(id);
};

module.exports = {
  findBusinessCategoryById,
  findActiveBusinessCategories,
  findParentBusinessCategories,
  findSubBusinessCategoriesByParentId,
  findDefaultAppModules,
  findAllProvinces,
  findProvinceByCode,
  findProvinceById,
  findAllWards,
  findWardsByProvinceId,
  findWardsByProvinceCode,
  findWardByCode,
  findWardById,
  findAllShippingPartners,
  findShippingPartnerByCode,
  findShippingPartnerById,
  findAllPaymentPartners,
  findPaymentPartnerByCode,
  findPaymentPartnerById,
};

