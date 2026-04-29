const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadDir = process.env.VERCEL
  ? path.join('/tmp', 'uploads')
  : path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const allowedExts = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const isSafeUploadName = (name) => {
  const s = String(name || '').trim();
  if (!s) return false;
  if (s.length > 200) return false;
  if (s !== path.basename(s)) return false;
  if (s.includes('/') || s.includes('\\')) return false;
  return /^[A-Za-z0-9._-]+$/.test(s);
};

const resolveUploadPath = (name) => {
  if (!isSafeUploadName(name)) return null;
  const root = path.resolve(uploadDir);
  const p = path.resolve(uploadDir, name);
  if (p === root) return null;
  if (!p.startsWith(root + path.sep)) return null;
  return p;
};

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const ok = allowedMimeTypes.has(file.mimetype) && allowedExts.has(ext);
    if (!ok) return cb(new Error('Unsupported file type'));
    cb(null, true);
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

module.exports = {
  upload,
  uploadDir,
  isSafeUploadName,
  resolveUploadPath,
};
