const express = require('express');
const ApiError = require('../utils/apiError');
const authHelper = require('../utils/authHelper');
const customerRepository = require('../data/repositories/crm.repository');
const userRepository = require('../data/repositories/user.repository');
const systemRepository = require('../data/repositories/system.repository');
const multer = require('multer');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const { Readable } = require('stream');
const {
  generateFileName,
  getStoragePath,
  uploadFile,
  deleteFile,
  extractKeyFromUrl,
} = require('../utils/storageHelper');
const { generateDefaultAvatarUrl } = require('../utils/avatarGenerator');

const importFileFilter = (req, file, cb) => {
  const allowedMimes = [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ];
  if (allowedMimes.includes(file.mimetype) || file.originalname.endsWith('.csv') || file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls')) {
    cb(null, true);
  } else {
    cb(new ApiError(400, `File type ${file.mimetype} is not allowed. Only CSV and Excel files are allowed.`), false);
  }
};

const uploadImport = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: importFileFilter,
});

const uploadAvatar = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const parseCSV = (buffer) => {
  return new Promise((resolve, reject) => {
    const results = [];
    const stream = Readable.from(buffer);
    stream
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
};

const parseExcel = (buffer) => {
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const rows = [];
  workbook.SheetNames.forEach((sheetName) => {
    const sheetRows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName] || {});
    rows.push(...sheetRows);
  });
  return rows;
};

const formatBirthday = (date) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

const parseBirthday = (dateStr) => {
  if (!dateStr || typeof dateStr !== 'string') return undefined;
  const trimmed = dateStr.trim();
  if (!trimmed) return undefined;
  
  // Try DD/MM/YYYY format
  const ddmmyyyySlash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyySlash) {
    const day = parseInt(ddmmyyyySlash[1], 10);
    const month = parseInt(ddmmyyyySlash[2], 10) - 1;
    const year = parseInt(ddmmyyyySlash[3], 10);
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) return date.toISOString();
  }
  
  // Try DD-MM-YYYY format
  const ddmmyyyyDash = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddmmyyyyDash) {
    const day = parseInt(ddmmyyyyDash[1], 10);
    const month = parseInt(ddmmyyyyDash[2], 10) - 1;
    const year = parseInt(ddmmyyyyDash[3], 10);
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) return date.toISOString();
  }
  
  // Try YYYY-MM-DD format (fallback)
  const yyyymmdd = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (yyyymmdd) {
    const year = parseInt(yyyymmdd[1], 10);
    const month = parseInt(yyyymmdd[2], 10) - 1;
    const day = parseInt(yyyymmdd[3], 10);
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) return date.toISOString();
  }
  
  // Try parsing as Date (fallback)
  const date = new Date(trimmed);
  if (!isNaN(date.getTime())) return date.toISOString();
  
  return undefined;
};

const validatePhone = (phone) => {
  if (!phone || typeof phone !== 'string') return true; // Optional field
  const cleaned = phone.trim().replace(/\D/g, ''); // Remove non-digits
  return cleaned.length >= 9;
};

const validateEmail = (email) => {
  if (!email || typeof email !== 'string') return true; // Optional field
  const trimmed = email.trim();
  if (!trimmed) return true; // Empty is valid (optional)
  return trimmed.includes('@') && trimmed.includes('.') && trimmed.length > 5;
};

const findProvinceByName = async (provinceName) => {
  if (!provinceName || typeof provinceName !== 'string') return null;
  const trimmed = provinceName.trim();
  if (!trimmed) return null;
  
  const provinces = await systemRepository.findAllProvinces();
  const normalized = trimmed.toLowerCase();
  
  for (const province of provinces) {
    const fullNameNormalized = (province.fullName || '').toLowerCase();
    const nameNormalized = (province.name || '').toLowerCase();
    
    if (fullNameNormalized === normalized || nameNormalized === normalized) {
      return {
        code: province.code,
        fullName: province.fullName || province.name,
        name: province.name,
      };
    }
  }
  
  return null;
};

const getCurrentUserId = (req) => {
  const token = req.cookies.accessToken || (req.headers.authorization ? req.headers.authorization.split(' ')[1] : null);
  if (!token) {
    throw new ApiError(401, 'Authorization token missing');
  }
  return authHelper.getCurrentUserId(token);
};

const ensureTenantUser = async (req) => {
  const userId = getCurrentUserId(req);
  const user = await userRepository.findById(userId);
  if (!user || !user.tenantId) {
    throw new ApiError(404, 'User or tenant not found');
  }
  return { userId, tenantId: user.tenantId };
};

const listCustomers = async (req, res, next) => {
  try {
    const { tenantId } = await ensureTenantUser(req);
    const { page = 1, limit = 50, search } = req.query;
    const filter = { tenantId };
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone1: { $regex: search, $options: 'i' } },
        { phone2: { $regex: search, $options: 'i' } },
        { email1: { $regex: search, $options: 'i' } },
        { email2: { $regex: search, $options: 'i' } },
      ];
    }
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const items = await customerRepository.listCustomers(tenantId, filter, parseInt(limit), skip);
    const total = await customerRepository.countCustomers(tenantId, filter);
    res.json({
      items,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    next(error);
  }
};

const getCustomerById = async (req, res, next) => {
  try {
    const { tenantId } = await ensureTenantUser(req);
    const { id } = req.params;
    const customer = await customerRepository.findCustomerById(id);
    if (!customer || customer.tenantId.toString() !== tenantId.toString()) {
      throw new ApiError(404, 'Customer not found');
    }
    res.json(customer);
  } catch (error) {
    next(error);
  }
};

const handleAvatarUpload = async (tenantId, customerId, file) => {
  if (!file) return null;
  const fileName = generateFileName(file.originalname);
  const key = getStoragePath(tenantId, 'customer_avatar', { customerId, fileName });
  const url = await uploadFile(file.buffer, key, file.mimetype || 'application/octet-stream');
  return url;
};

const maybeDeleteOldAvatar = async (oldUrl) => {
  if (!oldUrl) return;
  const key = extractKeyFromUrl(oldUrl);
  if (key) {
    try {
      await deleteFile(key);
    } catch (err) {
      // ignore deletion errors to avoid blocking main flow
    }
  }
};

const createCustomer = async (req, res, next) => {
  try {
    const { tenantId, userId } = await ensureTenantUser(req);
    
    // Validate phone and email
    if (req.body.phone1 && !validatePhone(req.body.phone1)) {
      throw new ApiError(400, 'Phone 1 must be at least 9 digits');
    }
    if (req.body.phone2 && !validatePhone(req.body.phone2)) {
      throw new ApiError(400, 'Phone 2 must be at least 9 digits');
    }
    if (req.body.email1 && !validateEmail(req.body.email1)) {
      throw new ApiError(400, 'Email 1 is invalid');
    }
    if (req.body.email2 && !validateEmail(req.body.email2)) {
      throw new ApiError(400, 'Email 2 is invalid');
    }
    
    const payload = {
      ...req.body,
      tenantId,
      createdBy: userId,
    };
    const doc = await customerRepository.createCustomer(payload);
    
    // Clear updatedAt and updatedBy for new customer (using direct model update to bypass timestamps)
    await customerRepository.CustomerModel.findByIdAndUpdate(
      doc._id,
      { $unset: { updatedAt: 1, updatedBy: 1 } },
      { timestamps: false }
    );
    const updatedDoc = await customerRepository.findCustomerById(doc._id);

    let finalDoc = updatedDoc || doc;
    
    if (req.file) {
      const avatarUrl = await handleAvatarUpload(tenantId, finalDoc._id, req.file);
      if (avatarUrl) {
        finalDoc.avatarUrl = avatarUrl;
        await finalDoc.save();
      }
    } else if (!finalDoc.avatarUrl && finalDoc.name) {
      // Generate default avatar if no avatar provided
      finalDoc.avatarUrl = generateDefaultAvatarUrl(finalDoc.name);
      await finalDoc.save();
    }

    res.status(201).json(finalDoc);
  } catch (error) {
    next(error);
  }
};

const updateCustomer = async (req, res, next) => {
  try {
    const { tenantId, userId } = await ensureTenantUser(req);
    const { id } = req.params;
    const customer = await customerRepository.findCustomerById(id);
    if (!customer || customer.tenantId.toString() !== tenantId.toString()) {
      throw new ApiError(404, 'Customer not found');
    }
    
    // Validate phone and email
    if (req.body.phone1 !== undefined && req.body.phone1 && !validatePhone(req.body.phone1)) {
      throw new ApiError(400, 'Phone 1 must be at least 9 digits');
    }
    if (req.body.phone2 !== undefined && req.body.phone2 && !validatePhone(req.body.phone2)) {
      throw new ApiError(400, 'Phone 2 must be at least 9 digits');
    }
    if (req.body.email1 !== undefined && req.body.email1 && !validateEmail(req.body.email1)) {
      throw new ApiError(400, 'Email 1 is invalid');
    }
    if (req.body.email2 !== undefined && req.body.email2 && !validateEmail(req.body.email2)) {
      throw new ApiError(400, 'Email 2 is invalid');
    }
    
    const updates = { ...req.body, updatedBy: userId };
    const updated = await customerRepository.updateCustomer(id, updates);

    if (req.file) {
      const avatarUrl = await handleAvatarUpload(tenantId, id, req.file);
      if (avatarUrl) {
        const oldAvatar = updated.avatarUrl;
        updated.avatarUrl = avatarUrl;
        await updated.save();
        await maybeDeleteOldAvatar(oldAvatar);
      }
    }

    res.json(updated);
  } catch (error) {
    next(error);
  }
};

const deleteCustomer = async (req, res, next) => {
  try {
    const { tenantId } = await ensureTenantUser(req);
    const { id } = req.params;
    const customer = await customerRepository.findCustomerById(id);
    if (!customer || customer.tenantId.toString() !== tenantId.toString()) {
      throw new ApiError(404, 'Customer not found');
    }
    
    // Delete avatar if exists
    if (customer.avatarUrl) {
      await maybeDeleteOldAvatar(customer.avatarUrl);
    }
    
    await customerRepository.deleteCustomer(id);
    res.json({ message: 'Customer deleted successfully' });
  } catch (error) {
    next(error);
  }
};

const deleteCustomersBulk = async (req, res, next) => {
  try {
    const { tenantId } = await ensureTenantUser(req);
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw new ApiError(400, 'Customer IDs array is required');
    }

    const customers = await Promise.all(
      ids.map(id => customerRepository.findCustomerById(id))
    );

    const validCustomers = customers.filter(c => c && c.tenantId.toString() === tenantId.toString());
    
    if (validCustomers.length === 0) {
      throw new ApiError(404, 'No valid customers found to delete');
    }

    for (const customer of validCustomers) {
      if (customer.avatarUrl) {
        await maybeDeleteOldAvatar(customer.avatarUrl);
      }
      await customerRepository.deleteCustomer(customer._id);
    }

    res.json({ 
      message: `Successfully deleted ${validCustomers.length} customer(s)`,
      deletedCount: validCustomers.length 
    });
  } catch (error) {
    next(error);
  }
};

const buildExportFilter = (tenantId, query) => {
  const { search, filters } = query;
  const baseFilter = { tenantId };

  const orFromSearch = [];
  if (search) {
    orFromSearch.push(
      { name: { $regex: search, $options: 'i' } },
      { phone1: { $regex: search, $options: 'i' } },
      { phone2: { $regex: search, $options: 'i' } },
      { email1: { $regex: search, $options: 'i' } },
      { email2: { $regex: search, $options: 'i' } },
    );
  }

  if (filters) {
    let parsedFilters = filters;
    if (typeof filters === 'string') {
      try {
        parsedFilters = JSON.parse(filters);
      } catch (e) {
        parsedFilters = [];
      }
    }
    if (Array.isArray(parsedFilters) && parsedFilters.length > 0) {
      const allowedFields = ['name', 'phone1', 'phone2', 'email1', 'email2', 'gender', 'provinceName'];
      const andConditions = [];
      const orConditions = [];

      const toRegexCond = (field, val) => {
        if (field === 'provinceName') {
          return { 'address.provinceName': { $regex: val, $options: 'i' } };
        }
        return { [field]: { $regex: val, $options: 'i' } };
      };
      const toEqCond = (field, val) => {
        if (field === 'provinceName') {
          return { 'address.provinceName': val };
        }
        return { [field]: val };
      };
      const toInCond = (field, arr) => {
        if (field === 'provinceName') {
          return { 'address.provinceName': { $in: arr } };
        }
        return { [field]: { $in: arr } };
      };

      const buildCondition = (f) => {
        if (!f || !allowedFields.includes(f.field) || f.value === undefined) return null;
        const joiner = f.joiner === 'or' ? 'or' : 'and';
        const val = f.value;
        const operator = f.operator || 'contains';
        const field = f.field;

        let condition = null;
        switch (field) {
          case 'name':
          case 'phone1':
          case 'phone2':
          case 'email1':
          case 'email2':
          case 'provinceName':
            if (Array.isArray(val)) {
              const conds = val.filter(Boolean).map(x => operator === 'contains' ? toRegexCond(field, x) : toEqCond(field, x));
              condition = conds.length > 1 ? { $or: conds } : conds[0];
            } else {
              condition = operator === 'contains' ? toRegexCond(field, val) : toEqCond(field, val);
            }
            break;
          case 'gender':
            if (Array.isArray(val)) {
              condition = toInCond(field, val);
            } else {
              condition = toEqCond(field, val);
            }
            break;
          default:
            condition = null;
        }

        if (!condition) return null;
        return { condition, joiner };
      };

      parsedFilters
        .map(buildCondition)
        .filter(Boolean)
        .forEach((entry) => {
          if (entry.joiner === 'or') {
            orConditions.push(entry.condition);
          } else {
            andConditions.push(entry.condition);
          }
        });

      const mergedOr = [...orFromSearch, ...orConditions];

      if (andConditions.length > 0 && mergedOr.length > 0) {
        baseFilter.$and = [...andConditions, { $or: mergedOr }];
      } else if (andConditions.length > 0) {
        baseFilter.$and = andConditions;
      } else if (mergedOr.length > 0) {
        baseFilter.$or = mergedOr;
      }
    } else if (orFromSearch.length > 0) {
      baseFilter.$or = orFromSearch;
    }
  } else if (orFromSearch.length > 0) {
    baseFilter.$or = orFromSearch;
  }

  return baseFilter;
};

const exportCustomers = async (req, res, next) => {
  try {
    const { tenantId } = await ensureTenantUser(req);
    const { columns, filters } = req.query;

    const filter = buildExportFilter(tenantId, req.query);

    const allColumns = [
      'name',
      'avatarUrl',
      'gender',
      'birthday',
      'phone1',
      'phone2',
      'email1',
      'email2',
      'addressLine',
      'provinceCode',
      'provinceName',
      'wardCode',
      'wardName',
      'note',
      'lastActivityAt',
    ];

    let cols = allColumns;
    if (columns) {
      if (Array.isArray(columns)) {
        cols = columns.filter((c) => allColumns.includes(c));
      } else if (typeof columns === 'string') {
        cols = columns.split(',').map((c) => c.trim()).filter((c) => allColumns.includes(c));
      }
      if (cols.length === 0) cols = allColumns;
    }

    const customers = await customerRepository.listCustomersForExport(tenantId, filter);
    const data = customers.map((c) => {
      const row = {};
      const addr = c.address || {};
      const map = {
        name: c.name || '',
        avatarUrl: c.avatarUrl || '',
        gender: c.gender || '',
        birthday: formatBirthday(c.birthday),
        phone1: c.phone1 || '',
        phone2: c.phone2 || '',
        email1: c.email1 || '',
        email2: c.email2 || '',
        addressLine: addr.addressLine || '',
        provinceCode: addr.provinceCode || '',
        provinceName: addr.provinceName || '',
        wardCode: addr.wardCode || '',
        wardName: addr.wardName || '',
        note: c.note || '',
        lastActivityAt: c.lastActivityAt || '',
      };
      cols.forEach((col) => {
        row[col] = map[col] !== undefined ? map[col] : '';
      });
      return row;
    });

    const worksheet = xlsx.utils.json_to_sheet(data);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Customers');
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="customers-export.xlsx"');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

const importCustomers = async (req, res, next) => {
  try {
    const { tenantId, userId } = await ensureTenantUser(req);
    const {
      mode = 'create',
      duplicateContactAction = 'upsert',
    } = req.query;

    if (!req.file) {
      throw new ApiError(400, 'No file uploaded');
    }

    const file = req.file;
    let rows = [];
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      rows = await parseCSV(file.buffer);
    } else if (
      file.mimetype.includes('excel') ||
      file.mimetype.includes('spreadsheet') ||
      file.originalname.endsWith('.xlsx') ||
      file.originalname.endsWith('.xls')
    ) {
      rows = parseExcel(file.buffer);
    } else {
      throw new ApiError(400, 'Unsupported file format. Only CSV and Excel files are supported.');
    }

    if (!rows || rows.length === 0) {
      throw new ApiError(400, 'File is empty or could not be parsed');
    }

    const results = {
      total: rows.length,
      success: 0,
      failed: 0,
      errors: [],
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const name = (row.name || row.Name || '').trim();
        if (!name) {
          throw new Error(`Row ${i + 1}: name is required`);
        }
        const phone1 = (row.phone1 || row.Phone1 || row.phone || row.Phone || '').trim() || undefined;
        const phone2 = (row.phone2 || row.Phone2 || '').trim() || undefined;
        const email1 = (row.email1 || row.Email1 || row.email || row.Email || '').trim().toLowerCase() || undefined;
        const email2 = (row.email2 || row.Email2 || '').trim().toLowerCase() || undefined;

        // Validate phone and email
        if (phone1 && !validatePhone(phone1)) {
          throw new Error(`Row ${i + 1}: Phone 1 must be at least 9 digits`);
        }
        if (phone2 && !validatePhone(phone2)) {
          throw new Error(`Row ${i + 1}: Phone 2 must be at least 9 digits`);
        }
        if (email1 && !validateEmail(email1)) {
          throw new Error(`Row ${i + 1}: Email 1 is invalid`);
        }
        if (email2 && !validateEmail(email2)) {
          throw new Error(`Row ${i + 1}: Email 2 is invalid`);
        }

        const birthdayStr = row.birthday || row.Birthday || '';
        const birthday = parseBirthday(birthdayStr);

        // Validate and resolve province
        const provinceNameInput = (row.provinceName || row.ProvinceName || '').trim();
        let provinceCode = row.provinceCode || row.ProvinceCode || '';
        let provinceName = provinceNameInput;
        
        if (provinceNameInput) {
          const province = await findProvinceByName(provinceNameInput);
          if (!province) {
            throw new Error(`Row ${i + 1}: Province "${provinceNameInput}" not found in system`);
          }
          provinceCode = province.code;
          provinceName = province.fullName || province.name;
        }

        const payload = {
          tenantId,
          createdBy: userId,
          name,
          avatarUrl: row.avatarUrl || row.AvatarUrl || undefined,
          gender: (row.gender || row.Gender || 'other').toLowerCase(),
          birthday,
          phone1,
          phone2,
          email1,
          email2,
          address: {
            addressLine: row.addressLine || row.AddressLine || '',
            provinceCode,
            provinceName,
            wardCode: row.wardCode || row.WardCode || '',
            wardName: row.wardName || row.WardName || '',
          },
          note: row.note || row.Note || '',
          lastActivityAt: row.lastActivityAt || row.LastActivityAt || undefined,
        };

        const existingByContact = await customerRepository.findCustomerByPhonesOrEmails(tenantId, phone1, phone2, email1, email2);
        const targetExisting = existingByContact;

        if (mode === 'create') {
          if (targetExisting) {
            throw new Error(`Row ${i + 1}: phone/email already exists`);
          }
          const newCustomer = await customerRepository.createCustomer(payload);
          // Clear updatedAt and updatedBy for new customer (using direct model update to bypass timestamps)
          await customerRepository.CustomerModel.findByIdAndUpdate(
            newCustomer._id,
            { $unset: { updatedAt: 1, updatedBy: 1 } },
            { timestamps: false }
          );
          const updatedCustomer = await customerRepository.findCustomerById(newCustomer._id);
          // Generate default avatar if no avatar provided
          if (!updatedCustomer.avatarUrl && updatedCustomer.name) {
            updatedCustomer.avatarUrl = generateDefaultAvatarUrl(updatedCustomer.name);
            await updatedCustomer.save();
          }
          results.success++;
        } else {
          // upsert
          if (existingByContact && duplicateContactAction === 'stop') {
            throw new Error(`Row ${i + 1}: contact (phone/email) already exists`);
          }

          const target = existingByContact && duplicateContactAction !== 'skip' ? existingByContact : null;

          if (target) {
            await customerRepository.updateCustomer(target._id, {
              ...payload,
              updatedBy: userId,
            });
            results.success++;
          } else {
            const newCustomer = await customerRepository.createCustomer(payload);
            // Clear updatedAt and updatedBy for new customer (using direct model update to bypass timestamps)
            await customerRepository.CustomerModel.findByIdAndUpdate(
              newCustomer._id,
              { $unset: { updatedAt: 1, updatedBy: 1 } },
              { timestamps: false }
            );
            const updatedCustomer = await customerRepository.findCustomerById(newCustomer._id);
            // Generate default avatar if no avatar provided
            if (!updatedCustomer.avatarUrl && updatedCustomer.name) {
              updatedCustomer.avatarUrl = generateDefaultAvatarUrl(updatedCustomer.name);
              await updatedCustomer.save();
            }
            results.success++;
          }
        }
      } catch (err) {
        results.failed++;
        results.errors.push(err.message);
      }
    }

    res.json({
      success: true,
      message: `Import completed: ${results.success} success, ${results.failed} failed`,
      data: results,
    });
  } catch (error) {
    next(error);
  }
};

const generateSampleCustomers = async (req, res, next) => {
  try {
    const sample = [
      {
        name: 'Nguyễn Văn A',
        gender: 'male',
        birthday: '01/01/1990',
        phone1: '0901234567',
        phone2: '0912345678',
        email1: 'a@example.com',
        email2: '',
        addressLine: '123 Lê Lợi',
        provinceName: 'Hà Nội',
        wardName: 'Ba Đình',
        note: 'Khách VIP',
      },
      {
        name: 'Trần Thị B',
        gender: 'female',
        birthday: '20/05/1992',
        phone1: '0987654321',
        phone2: '',
        email1: 'b@example.com',
        email2: 'bb@example.com',
        addressLine: '456 Nguyễn Huệ',
        provinceName: 'TP HCM',
        wardName: 'Quận 1',
        note: 'Khách lẻ',
      },
    ];
    const worksheet = xlsx.utils.json_to_sheet(sample);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Sample');
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="customers-import-sample.xlsx"');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  deleteCustomersBulk,
  uploadImport,
  uploadAvatar,
  exportCustomers,
  importCustomers,
  generateSampleCustomers,
};
