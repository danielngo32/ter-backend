const express = require("express");
const crmController = require("../controllers/crm.controller");
const validator = require("../validators/crm.validator");

const router = express.Router();

router.get(
  "/customers",
  validator.validateListCustomersQuery,
  crmController.listCustomers
);

router.get(
  "/customers/export",
  validator.validateExportCustomersQuery,
  crmController.exportCustomers
);

router.get(
  "/customers/import/sample",
  crmController.generateSampleCustomers
);

router.post(
  "/customers",
  crmController.uploadAvatar.single('avatar'),
  validator.validateCreateCustomer,
  crmController.createCustomer
);

router.post(
  "/customers/import",
  crmController.uploadImport.single('file'),
  validator.validateImportCustomersQuery,
  crmController.importCustomers
);

router.get(
  "/customers/:id",
  validator.validateCustomerIdParam,
  crmController.getCustomerById
);

router.put(
  "/customers/:id",
  crmController.uploadAvatar.single('avatar'),
  validator.validateCustomerIdParam,
  validator.validateUpdateCustomer,
  crmController.updateCustomer
);

router.delete(
  "/customers/:id",
  validator.validateCustomerIdParam,
  crmController.deleteCustomer
);

router.delete(
  "/customers",
  validator.validateDeleteCustomersBulk,
  crmController.deleteCustomersBulk
);


module.exports = router;
