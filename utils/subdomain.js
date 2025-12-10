const ApiError = require('./apiError');

const getSubdomain = (hostname) => {
  if (!hostname || typeof hostname !== 'string') {
    return null;
  }

  const normalized = hostname.toLowerCase().trim();
  const hostnameWithoutPort = normalized.split(':')[0];
  
  const frontendUrl = process.env.FRONTEND_URL;
  if (frontendUrl) {
    try {
      const url = new URL(frontendUrl);
      const baseHostname = url.hostname.toLowerCase();
      
      if (hostnameWithoutPort === baseHostname) {
        return null;
      }
      
      if (hostnameWithoutPort.endsWith(`.${baseHostname}`)) {
        const subdomain = hostnameWithoutPort.replace(`.${baseHostname}`, '');
        return subdomain || null;
      }
      
      return null;
    } catch {
      // Silent fallback
    }
  }
  
  if (!hostnameWithoutPort.includes('.')) {
    return null;
  }

  const parts = hostnameWithoutPort.split('.');
  if (parts.length >= 2) {
    return parts[0];
  }

  return null;
};

const isMainDomain = (hostname) => {
  if (!hostname || typeof hostname !== 'string') {
    return false;
  }

  const normalized = hostname.toLowerCase().trim();
  const hostnameWithoutPort = normalized.split(':')[0];
  
  const frontendUrl = process.env.FRONTEND_URL;
  if (frontendUrl) {
    try {
      const url = new URL(frontendUrl);
      const baseHostname = url.hostname.toLowerCase();
      return hostnameWithoutPort === baseHostname;
    } catch {
      // Silent fallback
    }
  }
  
  if (hostnameWithoutPort.includes('.')) {
    return false;
  }

  return true;
};

const isSubdomain = (hostname) => {
  return getSubdomain(hostname) !== null;
};

const isValidSlug = (slug) => {
  if (!slug || typeof slug !== 'string') {
    return false;
  }

  const slugRegex = /^[a-z0-9-]{2,100}$/;
  if (!slugRegex.test(slug)) {
    return false;
  }

  if (slug.startsWith('-') || slug.endsWith('-')) {
    return false;
  }

  if (slug.includes('--')) {
    return false;
  }

  return true;
};

const buildSubdomainUrl = (slug, path = '') => {
  if (!slug || typeof slug !== 'string') {
    throw new Error('Slug is required');
  }

  const frontendUrl = process.env.FRONTEND_URL;
  
  const url = new URL(frontendUrl);
  const protocol = url.protocol;
  const port = url.port ? `:${url.port}` : '';
  const hostname = url.hostname;

  const subdomainHost = `${slug}.${hostname}${port}`;

  const normalizedPath = path ? (path.startsWith('/') ? path : `/${path}`) : '';

  return `${protocol}//${subdomainHost}${normalizedPath}`;
};


const extractTenantSlug = (req) => {
  let hostname = req.hostname;
  
  if (!hostname) {
    const host = req.get('host') || req.headers.host || '';
    hostname = host.split(':')[0];
  }
  
  if (!hostname || typeof hostname !== 'string') {
    return null;
  }
  
  return getSubdomain(hostname);
};

const requireMainDomain = (req, res, next) => {
  const host = req.get('host') || '';
  const hostname = req.hostname || host.split(':')[0];
  
  if (isSubdomain(hostname)) {
    throw new ApiError(403, 'This action is only available on the main domain');
  }
  
  next();
};

module.exports = {
  getSubdomain,
  isMainDomain,
  isSubdomain,
  isValidSlug,
  buildSubdomainUrl,
  extractTenantSlug,
  requireMainDomain,
};

