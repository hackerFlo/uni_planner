const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');
const requireAuth = require('../middleware/auth');
const { validateEmail, validateIdentifier } = require('../middleware/validate');
const { encryptEmail, decryptEmail } = require('../crypto');

const router = express.Router();

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

router.post('/login', async (req, res) => {
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

  const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });

  res.cookie('token', token, COOKIE_OPTS);
  res.json({ user: { id: user.id, email: user.email, created_at: user.created_at } });
});

router.post('/logout', (_req, res) => {
  res.clearCookie('token', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, email, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

router.patch('/me', requireAuth, async (req, res) => {
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

  db.prepare('UPDATE users SET email = ?, password_hash = ? WHERE id = ?').run(email, passwordHash, req.user.id);

  const token = jwt.sign({ id: req.user.id, email }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });
  res.cookie('token', token, COOKIE_OPTS);
  res.json({ user: { id: req.user.id, email, created_at: user.created_at } });
});

router.get('/notification-settings', requireAuth, (req, res) => {
  const user = db.prepare(
    'SELECT notify_enabled, notify_time, notify_email_enc FROM users WHERE id = ?'
  ).get(req.user.id);
  let notify_email = '';
  if (user.notify_email_enc) {
    try { notify_email = decryptEmail(user.notify_email_enc); } catch {}
  }
  res.json({
    notify_enabled: !!user.notify_enabled,
    notify_time: user.notify_time || '22:00',
    notify_email,
  });
});

router.patch('/notification-settings', requireAuth, (req, res) => {
  const { notify_enabled, notify_time, notify_email } = req.body;
  const updates = {};

  if (notify_enabled !== undefined) {
    updates.notify_enabled = notify_enabled ? 1 : 0;
  }
  if (notify_time !== undefined) {
    if (!/^\d{2}:\d{2}$/.test(notify_time)) {
      return res.status(400).json({ error: 'Invalid time format, expected HH:MM' });
    }
    updates.notify_time = notify_time;
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

module.exports = router;
