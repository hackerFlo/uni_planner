const jwt = require('jsonwebtoken');
const db = require('../db');
const { log } = require('../logger');
const { SESSION_COOKIE_NAME } = require('../config');

function requireAuth(req, res, next) {
  const rlog = req.log || log;
  const token = req.cookies?.[SESSION_COOKIE_NAME] ||
    (req.headers.authorization?.startsWith('Bearer ') && req.headers.authorization.slice(7));

  if (!token) {
    // Method and path only -- never the cookie, header or token (AR-6).
    rlog.warn('auth rejected', { reason: 'no-token', method: req.method, path: req.originalUrl.split('?')[0] });
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = db.prepare('SELECT token_version FROM users WHERE id = ?').get(payload.id);
    if (!user || (payload.tv ?? 0) !== user.token_version) {
      // A password change bumps token_version, so every other session lands
      // here. Silent until now, which made "it logged me out" unreadable.
      rlog.warn('auth rejected', { reason: user ? 'token-version-mismatch' : 'user-missing', userId: payload.id });
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    req.user = payload;
    next();
  } catch (err) {
    rlog.warn('auth rejected', { reason: 'jwt-verify-failed', err });
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = requireAuth;
