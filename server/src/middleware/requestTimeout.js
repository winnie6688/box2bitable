const requestTimeout = () => {
  const timeoutMs = Number(process.env.REQUEST_TIMEOUT_MS || 60_000);

  return (req, res, next) => {
    res.setTimeout(timeoutMs, () => {
      if (res.headersSent) return;
      res.status(504).json({ success: false, error: 'Request timeout' });
    });
    next();
  };
};

module.exports = requestTimeout;

