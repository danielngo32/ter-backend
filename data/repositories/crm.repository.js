const {
  CustomerModel,
} = require("../schemas/crm.schema");

const createCustomer = (payload) => CustomerModel.create(payload);

const findCustomerById = (id) => CustomerModel.findById(id)
  .populate('createdBy', '_id fullName email avatarUrl')
  .populate('updatedBy', '_id fullName email avatarUrl');

const findCustomerByPhonesOrEmails = async (tenantId, phone1, phone2, email1, email2) => {
  const phoneNumbers = [phone1, phone2].filter(Boolean);
  const emailAddresses = [email1, email2].filter(Boolean);
  if (phoneNumbers.length === 0 && emailAddresses.length === 0) return null;
  const or = [];
  if (phoneNumbers.length > 0) {
    or.push({ phone1: { $in: phoneNumbers } });
    or.push({ phone2: { $in: phoneNumbers } });
  }
  if (emailAddresses.length > 0) {
    or.push({ email1: { $in: emailAddresses } });
    or.push({ email2: { $in: emailAddresses } });
  }
  return CustomerModel.findOne({ tenantId, $or: or });
};

const listCustomers = (tenantId, filter = {}, limit = 50, skip = 0) =>
  CustomerModel.find({ tenantId, ...filter })
    .populate('createdBy', '_id fullName email avatarUrl')
    .populate('updatedBy', '_id fullName email avatarUrl')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

const listCustomersForExport = (tenantId, filter = {}) =>
  CustomerModel.find({ tenantId, ...filter }).lean();

const countCustomers = (tenantId, filter = {}) =>
  CustomerModel.countDocuments({ tenantId, ...filter });

const updateCustomer = (id, updates) =>
  CustomerModel.findByIdAndUpdate(id, { $set: updates }, { new: true })
    .populate('createdBy', '_id fullName email avatarUrl')
    .populate('updatedBy', '_id fullName email avatarUrl');

const deleteCustomer = (id) => CustomerModel.findByIdAndDelete(id);

module.exports = {
  CustomerModel,
  createCustomer,
  findCustomerById,
  findCustomerByPhonesOrEmails,
  listCustomers,
  listCustomersForExport,
  countCustomers,
  updateCustomer,
  deleteCustomer,
};


