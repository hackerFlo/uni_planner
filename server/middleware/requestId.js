const { randomUUID } = require('node:crypto');
const { log } = require('../logger');

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

// Cloudflare stamps every request with CF-Ray, so reusing it lets one log line
// here be matched against the Cloudflare dashboard. An inbound value is
// validated before it is echoed into a response header (AR-1) -- it is
// attacker-controlled input like any other.
function requestId(req, res, next) {
  const inbound = req.get('cf-ray') || req.get('x-request-id');
  req.id = inbound && ID_PATTERN.test(inbound) ? inbound : randomUUID().slice(0, 8);
  req.log = log.child({ reqId: req.id });
  res.setHeader('X-Request-Id', req.id);
  next();
}

module.exports = requestId;
