const { TenantModel } = require("../schemas/tenant.schema");

const createTenant = (payload) => TenantModel.create(payload);

const findTenantById = (id) => TenantModel.findById(id);

const findTenantBySlug = (slug) => TenantModel.findOne({ slug });

const updateTenant = (id, updates) =>
  TenantModel.findByIdAndUpdate(id, { $set: updates }, { new: true });

const listTenantsByPlan = (plan) => TenantModel.find({ plan });

const getWarehouses = async (tenantId) => {
  const tenant = await TenantModel.findById(tenantId);
  if (!tenant) return [];
  return tenant.branches.filter(branch => branch.isActive);
};

const getBranchById = async (tenantId, branchId) => {
  const tenant = await TenantModel.findById(tenantId);
  if (!tenant) return null;
  
  return tenant.branches.id(branchId);
};

module.exports = {
  createTenant,
  findTenantById,
  findTenantBySlug,
  updateTenant,
  listTenantsByPlan,
  getWarehouses,
  getBranchById,
};


