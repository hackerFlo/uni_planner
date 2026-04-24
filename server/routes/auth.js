const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');
const requireAuth = require('../middleware/auth');
const { validateEmail, validateIdentifier } = require('../middleware/validate');

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

module.exports = router;
