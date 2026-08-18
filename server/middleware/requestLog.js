const { log } = require('../logger');

function levelFor(status) {
  if (status >= 500) return 'error';
  if (status >= 400) return 'warn';
  return 'info';
}

// The query string is dropped: it is user input and could carry PII into the
// logs (S-5, EL-9). Path and method are enough to reconstruct a request.
function requestLog(req, res, next) {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const path = req.originalUrl.split('?')[0];
    // The container healthcheck polls /api/health every 30s. A passing probe is
    // not news; a failing one still surfaces at warn/error.
    const healthy = path === '/api/health' && res.statusCode === 200;
    log[healthy ? 'debug' : levelFor(res.statusCode)]('request', {
      method: req.method,
      path,
      status: res.statusCode,
      ms: Math.round(elapsedMs),
      reqId: req.id,
      userId: req.user?.id,
    });
  });
  next();
}

module.exports = requestLog;
