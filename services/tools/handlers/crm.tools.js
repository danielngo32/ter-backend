const crmRepository = require('../../../data/repositories/crm.repository');

const formatCustomer = (c, includeMetadata = false) => {
  const customer = {
    id: c._id.toString(),
    name: c.name,
    phone1: c.phone1 || null,
    phone2: c.phone2 || null,
    email1: c.email1 || null,
    email2: c.email2 || null,
    gender: c.gender || null,
    birthday: c.birthday || null,
    avatarUrl: c.avatarUrl || null,
    address: c.address ? {
      addressLine: c.address.addressLine || null,
      provinceName: c.address.provinceName || null,
      provinceCode: c.address.provinceCode || null,
      wardName: c.address.wardName || null,
      wardCode: c.address.wardCode || null,
    } : null,
  };

  if (includeMetadata) {
    customer.createdAt = c.createdAt;
    customer.updatedAt = c.updatedAt;
    customer.createdBy = c.createdBy ? {
      id: c.createdBy._id?.toString(),
      fullName: c.createdBy.fullName,
      email: c.createdBy.email,
      avatarUrl: c.createdBy.avatarUrl,
    } : null;
    customer.updatedBy = c.updatedBy ? {
      id: c.updatedBy._id?.toString(),
      fullName: c.updatedBy.fullName,
      email: c.updatedBy.email,
      avatarUrl: c.updatedBy.avatarUrl,
    } : null;
  }

  return customer;
};

const buildCustomerFilter = (args) => {
  const {
    query,
    gender,
    provinceName,
    phone1,
    phone2,
    email1,
    email2,
  } = args;

  const filter = {};

  if (query && query.trim().length > 0) {
    filter.$or = [
      { name: { $regex: query.trim(), $options: 'i' } },
      { phone1: { $regex: query.trim(), $options: 'i' } },
      { phone2: { $regex: query.trim(), $options: 'i' } },
      { email1: { $regex: query.trim(), $options: 'i' } },
      { email2: { $regex: query.trim(), $options: 'i' } },
    ];
  }

  if (gender) {
    filter.gender = gender;
  }

  if (provinceName) {
    filter['address.provinceName'] = { $regex: provinceName.trim(), $options: 'i' };
  }

  if (phone1) {
    filter.$or = filter.$or || [];
    filter.$or.push(
      { phone1: { $regex: phone1.trim(), $options: 'i' } },
      { phone2: { $regex: phone1.trim(), $options: 'i' } }
    );
  }

  if (phone2) {
    filter.$or = filter.$or || [];
    filter.$or.push(
      { phone1: { $regex: phone2.trim(), $options: 'i' } },
      { phone2: { $regex: phone2.trim(), $options: 'i' } }
    );
  }

  if (email1) {
    filter.$or = filter.$or || [];
    filter.$or.push(
      { email1: { $regex: email1.trim().toLowerCase(), $options: 'i' } },
      { email2: { $regex: email1.trim().toLowerCase(), $options: 'i' } }
    );
  }

  if (email2) {
    filter.$or = filter.$or || [];
    filter.$or.push(
      { email1: { $regex: email2.trim().toLowerCase(), $options: 'i' } },
      { email2: { $regex: email2.trim().toLowerCase(), $options: 'i' } }
    );
  }

  return filter;
};

const getCustomersWithPagination = async (tenantId, filter, limit, skip) => {
  const customers = await crmRepository.listCustomers(tenantId, filter, limit, skip);
  const total = await crmRepository.countCustomers(tenantId, filter);

  return {
    customers: customers.map((c) => formatCustomer(c)),
    total,
    limit,
    skip,
  };
};

const searchCustomers = async (args, context) => {
  const { query, limit = 10, gender, provinceName } = args;
  const { tenantId } = context;

  if (!tenantId) {
    throw new Error('Tenant ID is required');
  }

  const filter = buildCustomerFilter({ query, gender, provinceName });
  const result = await getCustomersWithPagination(tenantId, filter, limit, 0);

  return {
    ...result,
    message: `Found ${result.total} customer(s)`,
  };
};

const getCustomerById = async (args, context) => {
  const { customerId } = args;
  const { tenantId } = context;

  if (!tenantId) {
    throw new Error('Tenant ID is required');
  }

  if (!customerId) {
    return { found: false, message: 'Customer ID is required' };
  }

  const customer = await crmRepository.findCustomerById(customerId);

  if (!customer) {
    return { found: false, message: 'Customer not found' };
  }

  if (customer.tenantId?.toString() !== tenantId.toString()) {
    return { found: false, message: 'Customer not found' };
  }

  return {
    found: true,
    customer: formatCustomer(customer, true),
  };
};

const getCustomerByPhone = async (args, context) => {
  const { phone } = args;
  const { tenantId } = context;

  if (!tenantId) {
    throw new Error('Tenant ID is required');
  }

  if (!phone || phone.trim().length === 0) {
    return { found: false, message: 'Phone number is required' };
  }

  const filter = {
    $or: [
      { phone1: phone.trim() },
      { phone2: phone.trim() },
    ],
  };

  const customers = await crmRepository.listCustomers(tenantId, filter, 1, 0);

  if (!customers || customers.length === 0) {
    return { found: false, message: 'Customer not found' };
  }

  return {
    found: true,
    customer: formatCustomer(customers[0]),
  };
};

const getCustomerByEmail = async (args, context) => {
  const { email } = args;
  const { tenantId } = context;

  if (!tenantId) {
    throw new Error('Tenant ID is required');
  }

  if (!email || email.trim().length === 0) {
    return { found: false, message: 'Email is required' };
  }

  const filter = {
    $or: [
      { email1: email.trim().toLowerCase() },
      { email2: email.trim().toLowerCase() },
    ],
  };

  const customers = await crmRepository.listCustomers(tenantId, filter, 1, 0);

  if (!customers || customers.length === 0) {
    return { found: false, message: 'Customer not found' };
  }

  return {
    found: true,
    customer: formatCustomer(customers[0]),
  };
};

const listCustomers = async (args, context) => {
  const {
    query,
    gender,
    provinceName,
    phone1,
    phone2,
    email1,
    email2,
    limit = 50,
    skip = 0,
  } = args;
  const { tenantId } = context;

  if (!tenantId) {
    throw new Error('Tenant ID is required');
  }

  const filter = buildCustomerFilter({
    query,
    gender,
    provinceName,
    phone1,
    phone2,
    email1,
    email2,
  });

  const result = await getCustomersWithPagination(tenantId, filter, limit, skip);

  return {
    ...result,
    message: `Found ${result.total} customer(s)`,
  };
};

const checkCustomerExists = async (args, context) => {
  const { phone1, phone2, email1, email2 } = args;
  const { tenantId } = context;

  if (!tenantId) {
    throw new Error('Tenant ID is required');
  }

  if (!phone1 && !phone2 && !email1 && !email2) {
    return { exists: false, message: 'At least one phone or email is required' };
  }

  const customer = await crmRepository.findCustomerByPhonesOrEmails(
    tenantId,
    phone1,
    phone2,
    email1,
    email2
  );

  if (!customer) {
    return { exists: false, message: 'Customer does not exist' };
  }

  return {
    exists: true,
    customer: formatCustomer(customer),
    message: 'Customer already exists',
  };
};

const createCustomer = async (args, context) => {
  const {
    name,
    phone1,
    phone2,
    email1,
    email2,
    gender,
    birthday,
    address,
    note,
  } = args;
  const { tenantId, userId } = context;

  if (!tenantId || !userId) {
    throw new Error('Tenant ID and User ID are required');
  }

  if (!name && !phone1 && !phone2 && !email1 && !email2) {
    return { success: false, message: 'At least name, phone, or email is required' };
  }

  // Check if customer already exists
  if (phone1 || phone2 || email1 || email2) {
    const existingCustomer = await crmRepository.findCustomerByPhonesOrEmails(
      tenantId,
      phone1,
      phone2,
      email1,
      email2
    );

    if (existingCustomer) {
      return {
        success: false,
        customer: formatCustomer(existingCustomer),
        message: 'Customer already exists',
      };
    }
  }

  const { generateDefaultAvatarUrl } = require('../../../utils/avatarGenerator');

  const payload = {
    tenantId,
    name: name || 'Khách hàng',
    phone1: phone1 || null,
    phone2: phone2 || null,
    email1: email1 ? email1.toLowerCase() : null,
    email2: email2 ? email2.toLowerCase() : null,
    gender: gender || 'other',
    birthday: birthday ? new Date(birthday) : null,
    address: address || null,
    note: note || null,
    createdBy: userId,
  };

  const customer = await crmRepository.createCustomer(payload);

  // Clear updatedAt and updatedBy for new customer
  await crmRepository.CustomerModel.findByIdAndUpdate(
    customer._id,
    { $unset: { updatedAt: 1, updatedBy: 1 } },
    { timestamps: false }
  );

  // Generate default avatar
  if (!customer.avatarUrl && customer.name) {
    customer.avatarUrl = generateDefaultAvatarUrl(customer.name);
    await customer.save();
  }

  const populatedCustomer = await crmRepository.findCustomerById(customer._id);

  return {
    success: true,
    customer: formatCustomer(populatedCustomer, true),
    message: 'Customer created successfully',
  };
};

module.exports = {
  searchCustomers,
  getCustomerById,
  getCustomerByPhone,
  getCustomerByEmail,
  listCustomers,
  checkCustomerExists,
  createCustomer,
};
