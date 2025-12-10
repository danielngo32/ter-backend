const parseFormData = (req, res, next) => {
  if (!req.body || typeof req.body !== 'object') {
    return next();
  }

  Object.keys(req.body).forEach(key => {
    const value = req.body[key];
    
    if (typeof value === 'string') {
      if (value === 'true' || value === 'false') {
        req.body[key] = value === 'true';
      } else if (value === 'null' || value === '') {
        req.body[key] = null;
      } else if (!isNaN(value) && value !== '') {
        const num = parseFloat(value);
        if (!isNaN(num)) {
          req.body[key] = num;
        }
      } else if ((value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']'))) {
        try {
          req.body[key] = JSON.parse(value);
        } catch (e) {
        }
      }
    }
  });

  if (req.body.basePricing && typeof req.body.basePricing === 'object') {
    Object.keys(req.body.basePricing).forEach(key => {
      if (typeof req.body.basePricing[key] === 'string') {
        if (!isNaN(req.body.basePricing[key]) && req.body.basePricing[key] !== '') {
          req.body.basePricing[key] = parseFloat(req.body.basePricing[key]);
        }
      }
    });
  }

  if (req.body.baseInventory && typeof req.body.baseInventory === 'object') {
    Object.keys(req.body.baseInventory).forEach(key => {
      if (typeof req.body.baseInventory[key] === 'string' && !isNaN(req.body.baseInventory[key]) && req.body.baseInventory[key] !== '') {
        req.body.baseInventory[key] = parseFloat(req.body.baseInventory[key]);
      }
    });
  }

  if (req.body.variants && Array.isArray(req.body.variants)) {
    req.body.variants.forEach((variant, index) => {
      if (variant.attributes && typeof variant.attributes === 'string') {
        try {
          req.body.variants[index].attributes = JSON.parse(variant.attributes);
        } catch (e) {
        }
      }
    });
  }
  
  next();
};

module.exports = parseFormData;

