const {
  AppModuleModel,
  BusinessCategoryModel,
  AiModeModel,
  AiProviderModel,
  AiModelModel,
  ProvinceModel,
  WardModel,
  ShippingPartnerModel,
  PaymentPartnerModel,
} = require("../schemas/system.schema");
const { UserModel } = require("../schemas/user.schema");
const { TenantModel } = require("../schemas/tenant.schema");
const authHelper = require("../../utils/authHelper");
const avatarGenerator = require("../../utils/avatarGenerator");
const fs = require("fs");
const path = require("path");

const seedAppModules = async () => {
  const items = [
    { code: "crm", name: "CRM", description: "Customer relationship" },
    { code: "hr", name: "HR", description: "Human resources" },
    { code: "orders", name: "Orders", description: "Orders and POS" },
    { code: "product", name: "Product", description: "Inventory and products" },
    { code: "finance", name: "Finance", description: "Income and expenses" },
    { code: "messaging", name: "Messaging", description: "Internal chat" },
    { code: "channel", name: "Channels", description: "External channels" },
    { code: "ai", name: "AI", description: "AI assistant" },
  ];
  for (const item of items) {
    await AppModuleModel.updateOne(
      { code: item.code },
      { $set: item },
      { upsert: true }
    );
  }
};

const seedBusinessCategories = async () => {
  const items = [
    {
      code: "ban_buon_ban_le",
      nameVi: "Bán buôn, bán lẻ",
      nameEn: "Retail & Wholesale",
      order: 1,
    },
    {
      code: "thoi_trang",
      nameVi: "Thời trang",
      nameEn: "Fashion",
      parentCode: "ban_buon_ban_le",
      order: 1,
    },
    {
      code: "dien_thoai_dien_may",
      nameVi: "Điện thoại & Điện máy",
      nameEn: "Phones & Electronics",
      parentCode: "ban_buon_ban_le",
      order: 2,
    },
    {
      code: "vat_lieu_xay_dung",
      nameVi: "Vật liệu xây dựng",
      nameEn: "Building Materials",
      parentCode: "ban_buon_ban_le",
      order: 3,
    },
    {
      code: "tap_hoa_sieu_thi",
      nameVi: "Tạp hóa & Siêu thị",
      nameEn: "Grocery & Supermarket",
      parentCode: "ban_buon_ban_le",
      order: 4,
    },
    {
      code: "an_uong_giai_tri",
      nameVi: "Ăn uống, giải trí",
      nameEn: "Food & Beverage, Entertainment",
      order: 2,
    },
    {
      code: "nha_hang",
      nameVi: "Nhà hàng",
      nameEn: "Restaurant",
      parentCode: "an_uong_giai_tri",
      order: 1,
    },
    {
      code: "quan_an",
      nameVi: "Quán ăn",
      nameEn: "Eatery",
      parentCode: "an_uong_giai_tri",
      order: 2,
    },
    {
      code: "cafe_tra_sua",
      nameVi: "Cafe, Trà sữa",
      nameEn: "Cafe, Milk Tea",
      parentCode: "an_uong_giai_tri",
      order: 3,
    },
    {
      code: "luu_tru_lam_dep",
      nameVi: "Lưu trú, làm đẹp",
      nameEn: "Accommodation, Beauty",
      order: 3,
    },
    {
      code: "beauty_spa",
      nameVi: "Beauty Spa & Massage",
      nameEn: "Beauty Spa & Massage",
      parentCode: "luu_tru_lam_dep",
      order: 1,
    },
    {
      code: "hair_salon",
      nameVi: "Hair Salon & Nails",
      nameEn: "Hair Salon & Nails",
      parentCode: "luu_tru_lam_dep",
      order: 2,
    },
    {
      code: "khach_san",
      nameVi: "Khách sạn & Nhà nghỉ",
      nameEn: "Hotel & Guesthouse",
      parentCode: "luu_tru_lam_dep",
      order: 3,
    },
  ];
  for (const item of items) {
    await BusinessCategoryModel.updateOne(
      { code: item.code },
      { $set: item },
      { upsert: true }
    );
  }
};

const seedAi = async () => {
  const modes = [
    { name: "ask", description: "Q&A mode" },
    { name: "agent", description: "Agent mode" },
    { name: "plan", description: "Planning mode" },
  ];
  for (const m of modes) {
    await AiModeModel.updateOne(
      { name: m.name },
      { $set: m },
      { upsert: true }
    );
  }

  const providers = [{ name: "openai" }, { name: "google" }];
  const providerDocs = [];
  for (const p of providers) {
    const doc = await AiProviderModel.findOneAndUpdate(
      { name: p.name },
      { $set: p },
      { new: true, upsert: true }
    );
    providerDocs.push(doc);
  }

  const providerMap = providerDocs.reduce(
    (acc, p) => ({ ...acc, [p.name]: p._id }),
    {}
  );

  const models = [
    {
      provider: providerMap.openai,
      modelId: "gpt-5",
      name: "GPT-5",
    },
    {
      provider: providerMap.openai,
      modelId: "gpt-4.1",
      name: "GPT-4.1",
    },
    {
      provider: providerMap.openai,
      modelId: "gpt-4",
      name: "GPT-4",
    },
    {
      provider: providerMap.openai,
      modelId: "gpt-4o",
      name: "GPT-4o",
    },
  ].filter((m) => m.provider);

  for (const model of models) {
    await AiModelModel.updateOne(
      { modelId: model.modelId },
      { $set: model },
      { upsert: true }
    );
  }
};

const seedProvinces = async () => {
  const provincesPath = path.join(__dirname, "provinces.json");
  const provincesData = JSON.parse(fs.readFileSync(provincesPath, "utf8"));

  const provinceMap = {};

  for (const province of provincesData) {
    const result = await ProvinceModel.findOneAndUpdate(
      { code: province.code },
      { $set: province },
      { upsert: true, new: true }
    );
    provinceMap[province.code] = result._id;
  }

  return provinceMap;
};

const seedWards = async (provinceMap) => {
  const wardsPath = path.join(__dirname, "wards.json");
  const wardsData = JSON.parse(fs.readFileSync(wardsPath, "utf8"));

  const batchSize = 1000;
  for (let i = 0; i < wardsData.length; i += batchSize) {
    const batch = wardsData.slice(i, i + batchSize);
    const operations = batch.map((ward) => {
      const provinceId = provinceMap[ward.provinceCode];

      let wardName = ward.name;
      if (ward.fullName) {
        const commaIndex = ward.fullName.indexOf(",");
        wardName =
          commaIndex !== -1
            ? ward.fullName.substring(0, commaIndex).trim()
            : ward.fullName.trim();
      }

      return {
        updateOne: {
          filter: { code: ward.code },
          update: {
            $set: {
              code: ward.code,
              name: wardName,
              slug: ward.slug,
              type: ward.type,
              province: provinceId,
            },
          },
          upsert: true,
        },
      };
    });

    await WardModel.bulkWrite(operations);
  }
};

const seedShippingPartners = async () => {
  const items = [
    {
      name: "Giao Hàng Nhanh",
      apiEndpoint: "https://dev-online-gateway.ghn.vn",
      isEnabled: true,
    },
  ];
  for (const item of items) {
    await ShippingPartnerModel.updateOne(
      { name: item.name },
      { $set: item },
      { upsert: true }
    );
  }
};

const seedPaymentPartners = async () => {
  const items = [
    {
      name: "VNPay",
      apiEndpoint: "https://sandbox.vnpayment.vn",
      isEnabled: true,
    },
  ];
  for (const item of items) {
    await PaymentPartnerModel.updateOne(
      { name: item.name },
      { $set: item },
      { upsert: true }
    );
  }
};

const seedUsersAndTenants = async () => {
  const defaultCategory = await BusinessCategoryModel.findOne({ code: "thoi_trang" });
  const defaultModules = await AppModuleModel.find({});
  const modules = defaultModules.map((m) => ({
    moduleId: m._id,
    isEnabled: true,
  }));

  const usersData = [
    {
      email: "anhtuan030203@gmail.com",
      password: "Anhtuan32@",
      fullName: "Ngô Anh Tuấn",
      tenantName: "ABC Shop",
      slug: "abc",
    },
    {
      email: "anhtuanakp03@gmail.com",
      password: "Anhtuan32@",
      fullName: "Ngô Anh Tuấn",
      tenantName: "Anh Tuan",
      slug: "anh-tuan",
    },
  ];

  for (const userData of usersData) {
    const existingUser = await UserModel.findOne({ email: userData.email });
    if (existingUser) {
      console.log(`User ${userData.email} already exists, skipping`);
      continue;
    }

    const existingTenant = await TenantModel.findOne({ slug: userData.slug });
    if (existingTenant) {
      console.log(`Tenant with slug ${userData.slug} already exists, skipping`);
      continue;
    }

    const passwordHash = await authHelper.hashPassword(userData.password);
    const avatarUrl = avatarGenerator.generateDefaultAvatarUrl(userData.fullName);
    const logoUrl = avatarGenerator.generateDefaultAvatarUrl(userData.tenantName);

    const tenant = await TenantModel.create({
      name: userData.tenantName,
      slug: userData.slug,
      ownerId: null,
      businessCategoryId: defaultCategory._id,
      modules,
      logoUrl,
    });

    const user = await UserModel.create({
      tenantId: tenant._id,
      fullName: userData.fullName,
      email: userData.email,
      passwordHash,
      avatarUrl,
      role: "owner",
    });

    await TenantModel.findByIdAndUpdate(tenant._id, { ownerId: user._id });

    console.log(`Created user ${userData.email} and tenant ${userData.tenantName}`);
  }
};

const seedSystemData = async () => {
  await seedAppModules();
  await seedBusinessCategories();
  await seedAi();
  await seedShippingPartners();
  await seedPaymentPartners();
  const provinceMap = await seedProvinces();
  await seedWards(provinceMap);
  await seedUsersAndTenants();
};

module.exports = {
  seedSystemData,
};
