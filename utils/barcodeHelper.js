const crypto = require("crypto");

const generateInternalBarcode = (tenantId, prefix = "INT") => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
};

const generateEAN13 = () => {
  let code = "2" + Math.floor(Math.random() * 100000000000).toString().padStart(11, "0");
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(code[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return code + checkDigit;
};

const validateBarcode = (barcode, type) => {
  if (!barcode || typeof barcode !== "string") {
    return { valid: false, error: "Barcode must be a non-empty string" };
  }

  const trimmed = barcode.trim();
  if (!trimmed) {
    return { valid: false, error: "Barcode cannot be empty" };
  }

  switch (type) {
    case "EAN-13":
      if (!/^\d{13}$/.test(trimmed)) {
        return { valid: false, error: "EAN-13 must be exactly 13 digits" };
      }
      let sum = 0;
      for (let i = 0; i < 12; i++) {
        sum += parseInt(trimmed[i]) * (i % 2 === 0 ? 1 : 3);
      }
      const checkDigit = (10 - (sum % 10)) % 10;
      if (parseInt(trimmed[12]) !== checkDigit) {
        return { valid: false, error: "Invalid EAN-13 check digit" };
      }
      return { valid: true };

    case "EAN-8":
      if (!/^\d{8}$/.test(trimmed)) {
        return { valid: false, error: "EAN-8 must be exactly 8 digits" };
      }
      return { valid: true };

    case "UPC-A":
      if (!/^\d{12}$/.test(trimmed)) {
        return { valid: false, error: "UPC-A must be exactly 12 digits" };
      }
      return { valid: true };

    case "UPC-E":
      if (!/^\d{8}$/.test(trimmed)) {
        return { valid: false, error: "UPC-E must be exactly 8 digits" };
      }
      return { valid: true };

    case "Code128":
    case "Code39":
    case "internal":
    case "other":
      if (trimmed.length > 100) {
        return { valid: false, error: "Barcode too long (max 100 characters)" };
      }
      return { valid: true };

    default:
      return { valid: true };
  }
};

const ensurePrimaryBarcode = (barcodes) => {
  if (!barcodes || barcodes.length === 0) {
    return [];
  }

  const hasPrimary = barcodes.some((bc) => bc.isPrimary === true);
  if (!hasPrimary && barcodes.length > 0) {
    barcodes[0].isPrimary = true;
  }

  return barcodes;
};

module.exports = {
  generateInternalBarcode,
  generateEAN13,
  validateBarcode,
  ensurePrimaryBarcode,
};

