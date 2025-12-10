const formatCurrency = (amount) => {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return '0 VNĐ';
  }

  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  if (isNaN(numAmount)) {
    return '0 VNĐ';
  }

  const formatted = Math.round(numAmount).toLocaleString('vi-VN');
  return `${formatted} VNĐ`;
};

const formatCurrencySimple = (amount) => {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return '0 nghìn';
  }

  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  if (isNaN(numAmount)) {
    return '0 nghìn';
  }

  const absAmount = Math.abs(numAmount);

  if (absAmount < 1000) {
    return `${Math.round(numAmount)} nghìn`;
  } else if (absAmount < 1000000) {
    const thousands = (numAmount / 1000).toFixed(1);
    return `${thousands.replace('.0', '')} nghìn`;
  } else if (absAmount < 1000000000) {
    const millions = (numAmount / 1000000).toFixed(1);
    return `${millions.replace('.0', '')} triệu`;
  } else {
    const billions = (numAmount / 1000000000).toFixed(1);
    return `${billions.replace('.0', '')} tỷ`;
  }
};

const formatDate = (date) => {
  if (!date) return '';

  const d = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(d.getTime())) {
    return '';
  }

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();

  return `${day}/${month}/${year}`;
};

const formatDateTime = (date) => {
  if (!date) return '';

  const d = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(d.getTime())) {
    return '';
  }

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');

  return `${day}/${month}/${year} ${hours}:${minutes}`;
};

const formatProduct = (product) => {
  if (!product) return '';

  const parts = [];
  
  if (product.name) parts.push(product.name);
  if (product.sku) parts.push(`(SKU: ${product.sku})`);
  if (product.price !== undefined) parts.push(`- ${formatCurrency(product.price)}`);
  if (product.stock !== undefined) parts.push(`- Tồn kho: ${product.stock}`);

  return parts.join(' ');
};

const formatCustomer = (customer) => {
  if (!customer) return '';

  const parts = [];
  
  if (customer.name) parts.push(customer.name);
  if (customer.phone1) parts.push(`ĐT: ${customer.phone1}`);
  if (customer.email1) parts.push(`Email: ${customer.email1}`);

  return parts.join(' - ');
};

const formatOrder = (order) => {
  if (!order) return '';

  const parts = [];
  
  if (order.orderNumber) parts.push(`Đơn #${order.orderNumber}`);
  if (order.totals?.grandTotal !== undefined) {
    parts.push(`Tổng: ${formatCurrency(order.totals.grandTotal)}`);
  }
  if (order.status) parts.push(`Trạng thái: ${order.status}`);

  return parts.join(' - ');
};

const buildContext = (messages, maxMessages = 10) => {
  if (!messages || !Array.isArray(messages)) return '';

  const recentMessages = messages.slice(-maxMessages);
  
  return recentMessages
    .map((msg) => {
      const role = msg.role === 'user' ? 'Người dùng' : 'Hệ thống';
      return `${role}: ${msg.content || ''}`;
    })
    .join('\n');
};

const sanitizeInput = (input) => {
  if (!input || typeof input !== 'string') return '';
  
  return input
    .trim()
    .replace(/\s+/g, ' ')
    .substring(0, 5000);
};

const parseAmount = (text) => {
  if (!text || typeof text !== 'string') return null;

  const cleaned = text.trim().toLowerCase();
  
  let amountStr = cleaned.replace(/vnđ|vnd|đ|dong/gi, '').trim();
  
  amountStr = amountStr.replace(/\./g, '').replace(/\s/g, '');
  
  if (amountStr.includes('k') || amountStr.includes('nghìn') || amountStr.includes('thousand')) {
    amountStr = amountStr.replace(/k|nghìn|thousand/gi, '');
    const num = parseFloat(amountStr);
    if (!isNaN(num)) {
      return Math.round(num * 1000);
    }
  }
  
  if (amountStr.includes('triệu') || amountStr.includes('million')) {
    amountStr = amountStr.replace(/triệu|million/gi, '');
    const num = parseFloat(amountStr);
    if (!isNaN(num)) {
      return Math.round(num * 1000000);
    }
  }
  
  if (amountStr.includes('tỷ') || amountStr.includes('billion')) {
    amountStr = amountStr.replace(/tỷ|billion/gi, '');
    const num = parseFloat(amountStr);
    if (!isNaN(num)) {
      return Math.round(num * 1000000000);
    }
  }
  
  const num = parseFloat(amountStr);
  if (!isNaN(num)) {
    return Math.round(num);
  }
  
  return null;
};

module.exports = {
  formatCurrency,
  formatCurrencySimple,
  formatDate,
  formatDateTime,
  formatProduct,
  formatCustomer,
  formatOrder,
  buildContext,
  sanitizeInput,
  parseAmount,
};
