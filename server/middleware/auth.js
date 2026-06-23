const jwt = require('jsonwebtoken');
const db = require('../db');

function requireAuth(req, res, next) {
  const token = req.cookies?.token ||
    (req.headers.authorization?.startsWith('Bearer ') && req.headers.authorization.slice(7));

  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = db.prepare('SELECT token_version FROM users WHERE id = ?').get(payload.id);
    if (!user || (payload.tv ?? 0) !== user.token_version) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    req.user = payload;
    next();
  } catch (err) {
    console.warn('[auth] jwt verify failed:', err.message);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = requireAuth;
