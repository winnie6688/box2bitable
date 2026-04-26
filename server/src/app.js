const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const apiAuth = require('./middleware/apiAuth');
const rateLimit = require('./middleware/rateLimit');
const requestTimeout = require('./middleware/requestTimeout');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.set('trust proxy', 1);

const allowedOrigins = new Set(
  String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.size === 0) {
      const allowAny = process.env.NODE_ENV !== 'production';
      return cb(null, allowAny);
    }
    return cb(null, allowedOrigins.has(origin));
  },
}));
app.use(requestTimeout());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Basic health check route
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api', rateLimit());
app.use('/api', apiAuth());
app.use('/api/recognition', require('./routes/recognition'));
app.use('/api/sync', require('./routes/sync'));
app.use('/api/query', require('./routes/query'));

// Error handling middleware
app.use((err, req, res, next) => {
  if (err && err.message === 'Unsupported file type') {
    return res.status(400).json({ success: false, error: '不支持的文件类型' });
  }
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

if (require.main === module) {
  const server = app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
  server.requestTimeout = Number(process.env.SERVER_REQUEST_TIMEOUT_MS || 65_000);
  server.headersTimeout = Number(process.env.SERVER_HEADERS_TIMEOUT_MS || 70_000);
}

module.exports = app;
