const jwt = require('jsonwebtoken');
const db = require('../db');
const { log } = require('../logger');
const { SESSION_COOKIE_NAME } = require('../config');
const { findLiveSession } = require('../sessions');

function requireAuth(req, res, next) {
  const rlog = req.log || log;
  // Cookie only. An Authorization: Bearer fallback used to be accepted here,
  // but nothing sends one (client/src/api/client.js is cookie-only) and it let a
  // caller bypass the SameSite protection the session cookie depends on.
  const token = req.cookies?.[SESSION_COOKIE_NAME];

  if (!token) {
    // Method and path only -- never the cookie, header or token (AR-6).
    rlog.warn('auth rejected', { reason: 'no-token', method: req.method, path: req.originalUrl.split('?')[0] });
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Pinning the algorithm is defence in depth, not a live hole: jsonwebtoken
    // v9 already rejects `alg: none` and refuses an asymmetric alg against a
    // string secret. It costs nothing and survives a future dependency change.
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    const user = db.prepare('SELECT token_version FROM users WHERE id = ?').get(payload.id);
    if (!user || (payload.tv ?? 0) !== user.token_version) {
      // A password or email change bumps token_version, so every session lands
      // here. Silent until now, which made "it logged me out" unreadable.
      rlog.warn('auth rejected', { reason: user ? 'token-version-mismatch' : 'user-missing', userId: payload.id });
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    // The per-device half. A token whose session row is gone was signed out on
    // that device specifically; other devices keep their own rows and their own
    // access. Tokens minted before sessions existed carry no `sid` and fail here,
    // which costs one re-login rather than leaving them permanently unrevocable.
    if (!findLiveSession(payload.sid, payload.id)) {
      rlog.warn('auth rejected', { reason: payload.sid ? 'session-revoked' : 'session-missing', userId: payload.id });
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
