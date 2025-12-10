const systemRepository = require('../data/repositories/system.repository');
const ApiError = require('../utils/apiError');

const getProvinces = async (req, res, next) => {
  try {
    const provinces = await systemRepository.findAllProvinces();
    res.json({
      success: true,
      data: provinces,
    });
  } catch (error) {
    next(new ApiError(500, 'Failed to fetch provinces', error.message));
  }
};

const getProvinceByCode = async (req, res, next) => {
  try {
    const { code } = req.params;
    const province = await systemRepository.findProvinceByCode(code);
    if (!province) {
      return next(new ApiError(404, 'Province not found'));
    }
    res.json({
      success: true,
      data: province,
    });
  } catch (error) {
    next(new ApiError(500, 'Failed to fetch province', error.message));
  }
};

const getWards = async (req, res, next) => {
  try {
    const { provinceCode, provinceId } = req.query;
    
    let wards;
    if (provinceCode) {
      wards = await systemRepository.findWardsByProvinceCode(provinceCode);
    } else if (provinceId) {
      wards = await systemRepository.findWardsByProvinceId(provinceId);
    } else {
      wards = await systemRepository.findAllWards();
    }
    
    res.json({
      success: true,
      data: wards,
    });
  } catch (error) {
    next(new ApiError(500, 'Failed to fetch wards', error.message));
  }
};

const getWardByCode = async (req, res, next) => {
  try {
    const { code } = req.params;
    const ward = await systemRepository.findWardByCode(code);
    if (!ward) {
      return next(new ApiError(404, 'Ward not found'));
    }
    res.json({
      success: true,
      data: ward,
    });
  } catch (error) {
    next(new ApiError(500, 'Failed to fetch ward', error.message));
  }
};

const getBusinessCategories = async (req, res, next) => {
  try {
    const categories = await systemRepository.findActiveBusinessCategories();
    res.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    next(new ApiError(500, 'Failed to fetch business categories', error.message));
  }
};

const getParentBusinessCategories = async (req, res, next) => {
  try {
    const categories = await systemRepository.findParentBusinessCategories();
    res.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    next(new ApiError(500, 'Failed to fetch parent business categories', error.message));
  }
};

const getSubBusinessCategories = async (req, res, next) => {
  try {
    const { parentId } = req.params;
    if (!parentId) {
      return next(new ApiError(400, 'Parent category ID is required'));
    }
    const categories = await systemRepository.findSubBusinessCategoriesByParentId(parentId);
    res.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    next(new ApiError(500, 'Failed to fetch sub business categories', error.message));
  }
};

const getAppModules = async (req, res, next) => {
  try {
    const modules = await systemRepository.findDefaultAppModules();
    res.json({
      success: true,
      data: modules,
    });
  } catch (error) {
    next(new ApiError(500, 'Failed to fetch app modules', error.message));
  }
};

module.exports = {
  getProvinces,
  getProvinceByCode,
  getWards,
  getWardByCode,
  getBusinessCategories,
  getParentBusinessCategories,
  getSubBusinessCategories,
  getAppModules,
};

