const rateLimit = () => {
  const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
  const max = Number(process.env.RATE_LIMIT_MAX || 120);
  const store = new Map();

  const now = () => Date.now();

  return (req, res, next) => {
    const ip = String(req.ip || '').trim() || 'unknown';
    const t = now();
    const cur = store.get(ip);
    if (!cur || cur.resetAt <= t) {
      store.set(ip, { count: 1, resetAt: t + windowMs });
      return next();
    }

    cur.count += 1;
    if (cur.count > max) {
      const retryAfter = Math.max(0, Math.ceil((cur.resetAt - t) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ success: false, error: 'Too Many Requests' });
    }
    next();
  };
};

module.exports = rateLimit;

