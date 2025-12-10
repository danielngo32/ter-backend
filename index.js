require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const morgan = require('morgan');
const connectMongoose = require('./config/database');
const { seedSystemData } = require('./data/seed/system.seed');
const ApiError = require('./utils/apiError');
const { CORS_CONFIG, CONNECTION_SETTINGS } = require('./config/websocket');
const setupWebSocket = require('./services/websocket');

const authRoutes = require('./routes/auth.routes');
const profileRoutes = require('./routes/profile.routes');
const systemRoutes = require('./routes/system.routes');
const productRoutes = require('./routes/product.routes');
const tenantRoutes = require('./routes/tenant.routes');
const storageRoutes = require('./routes/storage.routes');
const crmRoutes = require('./routes/crm.routes');
const aiRoutes = require('./routes/ai.routes');

const app = express();
const port = process.env.PORT;

connectMongoose();

if (process.env.SEED_SYSTEM_DATA === 'true') {
  seedSystemData().catch((err) => {
    if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
      console.error('Seed system data error:', err);
    }
  });
}

app.set('trust proxy', true);

const getAllowedOrigins = () => {
  if (process.env.ALLOWED_ORIGINS) {
    return process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean);
  }

  if (process.env.FRONTEND_URL) {
    return [process.env.FRONTEND_URL];
  }

  return ['https://ter.vn', 'https://www.ter.vn', 'http://localhost:3000'];
};

const allowedOrigins = getAllowedOrigins();

// Check if origin is a subdomain of ter.vn
const isTerVnSubdomain = (origin) => {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    const hostname = url.hostname.toLowerCase();
    // Remove www if present
    const cleanHostname = hostname.startsWith('www.') ? hostname.substring(4) : hostname;
    // Check if it's ter.vn or a subdomain of ter.vn
    const result = cleanHostname === 'ter.vn' || cleanHostname.endsWith('.ter.vn');
    return result;
  } catch (e) {
    console.error('Error parsing origin:', origin, e);
    return false;
  }
};

// CORS configuration
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      callback(null, true);
      return;
    }
    
    const isLocalhost = origin.includes('localhost');
    const isSubdomain = isTerVnSubdomain(origin);
    
    const isAllowedOrigin = allowedOrigins.some(allowed => {
      if (typeof allowed === 'string') {
        return origin === allowed || origin.startsWith(allowed);
      }
      return false;
    });
    
    // Log for debugging (only in development or when CORS fails)
    if (process.env.NODE_ENV !== 'production' || !isLocalhost && !isAllowedOrigin && !isSubdomain) {
      console.log('CORS check:', {
        origin,
        isLocalhost,
        isSubdomain,
        isAllowedOrigin,
        allowedOrigins,
      });
    }
    
    if (isLocalhost || isAllowedOrigin || isSubdomain) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('CORS allowed:', origin);
      }
      callback(null, true);
    } else {
      console.error('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  exposedHeaders: ['Set-Cookie'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cookie'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/products', productRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/storage', storageRoutes);
app.use('/api/crm', crmRoutes);
app.use('/api/ai', aiRoutes);

app.use((req, res, next) => {
  next(new ApiError(404, 'Route not found'));
});

app.use((err, req, res, next) => {
  const status = err.statusCode || err.status || 500;
  const message = err.message || 'Internal Server Error';
  
  if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
    console.error('Error:', err);
  }
  
  res.status(status).json({
    message,
    details: err.details,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
});

if (process.env.NODE_ENV !== 'test' && !module.parent) {
  const httpServer = http.createServer(app);
  
  const io = new Server(httpServer, {
    cors: CORS_CONFIG,
    ...CONNECTION_SETTINGS,
  });

  setupWebSocket(io);

  httpServer.listen(port, () => {
    console.log(`Server is running on port ${port}`);
    console.log(`WebSocket server is ready`);
  });
}

module.exports = app;

