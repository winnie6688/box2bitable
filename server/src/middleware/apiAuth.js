const crypto = require('crypto');

const getHeader = (req, name) => {
  const v = req.headers && req.headers[name];
  if (Array.isArray(v)) return v[0] || '';
  return v || '';
};

const extractApiKey = (req) => {
  const direct = String(getHeader(req, 'x-api-key') || '').trim();
  if (direct) return direct;
  const auth = String(getHeader(req, 'authorization') || '').trim();
  if (!auth) return '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? String(m[1] || '').trim() : '';
};

const timingSafeEqualStr = (a, b) => {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  const max = Math.max(aa.length, bb.length);
  const pa = Buffer.concat([aa, Buffer.alloc(max - aa.length)]);
  const pb = Buffer.concat([bb, Buffer.alloc(max - bb.length)]);
  const eq = crypto.timingSafeEqual(pa, pb);
  return eq && aa.length === bb.length;
};

const apiAuth = () => {
  const expected = String(process.env.API_KEY || '').trim();
  const required = process.env.NODE_ENV === 'production';

  return (req, res, next) => {
    if (!expected) {
      if (required) {
        return res.status(503).json({ success: false, error: 'API_KEY is not configured' });
      }
      return next();
    }

    const got = extractApiKey(req);
    if (!got || !timingSafeEqualStr(got, expected)) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    next();
  };
};

module.exports = apiAuth;

