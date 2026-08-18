const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');
const requireAuth = require('../middleware/auth');
const { validateIdentifier } = require('../middleware/validate');
const { encryptEmail, decryptEmail } = require('../crypto');
const { sendDailySummary } = require('../mailer');
const { localDayBoundsUtc } = require('../time');
const { SESSION_COOKIE_NAME, sessionCookieOptions, clearSessionCookieOptions } = require('../config');
const { authLimiter, sessionLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!validateIdentifier(email) || typeof password !== 'string' || password.length < 1 || password.length > 128) {
    return res.status(400).json({ error: 'Invalid credentials' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (!user) {
    await bcrypt.hash('dummy', 12); // constant-time defense
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return res.status(401).json({ error: 'Invalid email or password' });

  const token = jwt.sign({ id: user.id, email: user.email, tv: user.token_version }, process.env.JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });

  res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions(req));
  res.json({ user: { id: user.id, email: user.email, created_at: user.created_at } });
});

router.post('/register', authLimiter, async (req, res) => {
  if (process.env.ALLOW_REGISTER !== 'true') {
    return res.status(403).json({ error: 'Registration is disabled' });
  }
  const { email, password } = req.body;

  if (!validateIdentifier(email)) return res.status(400).json({ error: 'Invalid username or email' });
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: 'Password must be 8–128 characters' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (existing) return res.status(409).json({ error: 'Username or email already in use' });

  const passwordHash = await bcrypt.hash(password, 12);

  const userId = db.transaction(() => {
    const result = db.prepare(
      'INSERT INTO users (email, password_hash) VALUES (?, ?)'
    ).run(email.trim().toLowerCase(), passwordHash);
    const newId = result.lastInsertRowid;
    db.prepare(
      'INSERT INTO lists (user_id, name, color, sort_order) VALUES (?, ?, ?, ?)'
    ).run(newId, 'Tasks', 'indigo', 0);
    return newId;
  })();

  const user = db.prepare('SELECT id, email, created_at, token_version FROM users WHERE id = ?').get(userId);
  const token = jwt.sign({ id: user.id, email: user.email, tv: user.token_version }, process.env.JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });

  res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions(req));
  res.status(201).json({ user: { id: user.id, email: user.email, created_at: user.created_at } });
});

router.post('/logout', sessionLimiter, (req, res) => {
  res.clearCookie(SESSION_COOKIE_NAME, clearSessionCookieOptions(req));
  res.json({ ok: true });
});

router.get('/me', sessionLimiter, requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, email, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

router.patch('/me', authLimiter, requireAuth, async (req, res) => {
  const { currentPassword, newEmail, newPassword } = req.body;

  if (!currentPassword || typeof currentPassword !== 'string') {
    return res.status(400).json({ error: 'Current password is required' });
  }
  if (!newEmail && !newPassword) {
    return res.status(400).json({ error: 'Provide a new email or new password' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const match = await bcrypt.compare(currentPassword, user.password_hash);
  if (!match) return res.status(401).json({ error: 'Current password is incorrect' });

  let email = user.email;
  let passwordHash = user.password_hash;

  if (newEmail) {
    if (!validateIdentifier(newEmail)) return res.status(400).json({ error: 'Invalid username or email' });
    const taken = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(newEmail.trim().toLowerCase(), req.user.id);
    if (taken) return res.status(409).json({ error: 'Username or email already in use' });
    email = newEmail.trim().toLowerCase();
  }

  if (newPassword) {
    if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }
    passwordHash = await bcrypt.hash(newPassword, 12);
  }

  const newTokenVersion = newPassword ? user.token_version + 1 : user.token_version;
  db.prepare('UPDATE users SET email = ?, password_hash = ?, token_version = ? WHERE id = ?').run(email, passwordHash, newTokenVersion, req.user.id);

  const token = jwt.sign({ id: req.user.id, email, tv: newTokenVersion }, process.env.JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions(req));
  res.json({ user: { id: req.user.id, email, created_at: user.created_at } });
});

router.get('/notification-settings', sessionLimiter, requireAuth, (req, res) => {
  const user = db.prepare(
    'SELECT notify_enabled, notify_time, notify_email_enc, notify_tz FROM users WHERE id = ?'
  ).get(req.user.id);
  let notify_email = '';
  if (user.notify_email_enc) {
    try { notify_email = decryptEmail(user.notify_email_enc); } catch (err) { console.warn('[auth] Failed to decrypt notification email for user', req.user.id, err.message); }
  }
  res.json({
    notify_enabled: !!user.notify_enabled,
    notify_time: user.notify_time || '22:00',
    notify_email,
    notify_tz: user.notify_tz || 'UTC',
  });
});

router.patch('/notification-settings', sessionLimiter, requireAuth, (req, res) => {
  const { notify_enabled, notify_time, notify_email, notify_tz } = req.body;
  const updates = {};

  if (notify_enabled !== undefined) {
    updates.notify_enabled = notify_enabled ? 1 : 0;
  }
  if (notify_time !== undefined) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(notify_time)) {
      return res.status(400).json({ error: 'Invalid time format, expected HH:MM' });
    }
    updates.notify_time = notify_time;
  }
  if (notify_tz !== undefined) {
    if (typeof notify_tz !== 'string' || notify_tz.length > 64 || !/^[A-Za-z_]+(?:\/[A-Za-z_+\-0-9]+){0,2}$/.test(notify_tz)) {
      return res.status(400).json({ error: 'Invalid timezone' });
    }
    try {
      new Intl.DateTimeFormat('en', { timeZone: notify_tz });
    } catch {
      return res.status(400).json({ error: 'Unknown timezone' });
    }
    updates.notify_tz = notify_tz;
  }
  if (notify_email !== undefined) {
    if (notify_email === '') {
      updates.notify_email_enc = null;
    } else {
      if (typeof notify_email !== 'string' || notify_email.length > 254) {
        return res.status(400).json({ error: 'Email too long' });
      }
      try {
        updates.notify_email_enc = encryptEmail(notify_email);
      } catch (err) {
        return res.status(500).json({ error: 'Encryption not configured' });
      }
    }
  }

  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: 'Nothing to update' });
  }

  const set = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE users SET ${set} WHERE id = ?`).run(...Object.values(updates), req.user.id);
  res.json({ ok: true });
});

router.post('/test-email', authLimiter, requireAuth, async (req, res) => {
  const user = db.prepare('SELECT notify_email_enc, email, notify_tz FROM users WHERE id = ?').get(req.user.id);
  if (!user || !user.notify_email_enc) {
    return res.status(400).json({ error: 'No notification email saved. Save your settings first.' });
  }

  let toEmail;
  try {
    toEmail = decryptEmail(user.notify_email_enc);
  } catch (err) {
    return res.status(500).json({ error: 'Encryption not configured on server.' });
  }

  const tz = user.notify_tz || 'UTC';
  const now = new Date();
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  const { startIso, endIso } = localDayBoundsUtc(today, tz);
  const tomorrowDate = new Date(today + 'T12:00:00Z');
  tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
  const tomorrow = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(tomorrowDate);

  const completedTodos = db.prepare(
    `SELECT t.title, t.approx_time, l.name AS list_name, l.color AS list_color
     FROM todos t JOIN lists l ON l.id = t.list_id
     WHERE t.user_id = ? AND t.completed = 1
       AND t.completed_at >= ? AND t.completed_at < ?`
  ).all(req.user.id, startIso, endIso);

  const uncompletedTodos = db.prepare(
    `SELECT t.title, t.approx_time, l.name AS list_name, l.color AS list_color
     FROM todos t JOIN lists l ON l.id = t.list_id
     WHERE t.user_id = ? AND t.day_assigned = ? AND t.completed = 0 AND t.archived = 0`
  ).all(req.user.id, today);

  const tomorrowTodos = db.prepare(
    `SELECT t.title, t.approx_time, l.name AS list_name, l.color AS list_color
     FROM todos t JOIN lists l ON l.id = t.list_id
     WHERE t.user_id = ? AND t.day_assigned = ? AND t.archived = 0
     ORDER BY t.planner_order ASC`
  ).all(req.user.id, tomorrow);

  const userName = (user.email || '').split('@')[0] || 'there';
  const dateStr = now.toLocaleDateString('en-GB', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const tomorrowStr = tomorrowDate.toLocaleDateString('en-GB', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' });

  try {
    const hour = parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: 'numeric', hour12: false }).format(now), 10);
    await sendDailySummary(toEmail, { completedTodos, uncompletedTodos, tomorrowTodos, dateStr, tomorrowStr, userName, hour });
    res.json({ ok: true, sentTo: toEmail });
  } catch (err) {
    console.error('[test-email] Send failed:', err.message);
    res.status(500).json({ error: 'Failed to send test email. Check server email configuration.' });
  }
});

module.exports = router;
