const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const db = require('../db');
const { log } = require('../logger');
const requireAuth = require('../middleware/auth');
const { asyncHandler } = require('../middleware/asyncHandler');

const { validateIdentifier } = require('../middleware/validate');
const { randomUUID } = require('node:crypto');
const { createNotificationService, notificationSchemas } = require('../services/notifications');
const { createMutationService } = require('../domain/mutation');
const { requestControls } = require('../domain/webMutation');
const { DomainError } = require('../domain/errors');
const { parse } = require('../domain/schemas');
const domainError = require('../middleware/domainError');
const notifications = createNotificationService(db);
const notificationMutations = createMutationService(db);
const { SESSION_COOKIE_NAME, sessionCookieOptions, clearSessionCookieOptions } = require('../config');
const { authLimiter, sessionLimiter } = require('../middleware/rateLimiter');
const {
  createSession, deleteSession, deleteAllSessions, sweepExpiredSessions, findLiveSession,
} = require('../sessions');

const router = express.Router();

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const credentialSchema = z.strictObject({
  currentPassword: z.string().min(1).max(128),
  newEmail: z.string().max(100).refine(validateIdentifier).optional(),
  newPassword: z.string().min(8).max(128).optional(),
}).refine(input => input.newEmail !== undefined || input.newPassword !== undefined);

function credentialsUnchanged(user) {
  const current = db.prepare('SELECT email, password_hash, token_version FROM users WHERE id = ?').get(user.id);
  return current && current.email === user.email && current.password_hash === user.password_hash
    && current.token_version === user.token_version;
}

function commitCredentialChange(req, user, email, passwordHash) {
  return db.transaction(() => {
    if (!credentialsUnchanged(user) || req.user.tv !== user.token_version
      || req.user.exp <= Math.floor(Date.now() / 1000) || !findLiveSession(req.user.sid, user.id)) {
      return { status: 401, error: 'Invalid or expired token' };
    }
    const taken = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, user.id);
    if (taken) return { status: 409, error: 'Username or email already in use' };
    const tokenVersion = user.token_version + 1;
    db.prepare('UPDATE users SET email = ?, password_hash = ?, token_version = ? WHERE id = ?')
      .run(email, passwordHash, tokenVersion, user.id);
    deleteAllSessions(user.id);
    return { sid: createSession(user.id), tokenVersion };
  })();
}

router.post('/login', authLimiter, asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // The identifier itself is never logged -- it is an email address (S-5). The
  // reason is what makes a failed login diagnosable; userId once it is known.
  const rlog = req.log || log;

  if (!validateIdentifier(email) || typeof password !== 'string' || password.length < 1 || password.length > 128) {
    rlog.warn('login failed', { reason: 'invalid-input' });
    return res.status(400).json({ error: 'Invalid credentials' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (!user) {
    await bcrypt.hash('dummy', 12); // constant-time defense
    rlog.warn('login failed', { reason: 'unknown-identifier' });
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    rlog.warn('login failed', { reason: 'bad-password', userId: user.id });
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  // Cheap housekeeping on a route that runs rarely, so the table cannot grow
  // without bound from devices that simply stopped coming back.
  const sid = db.transaction(() => {
    if (!credentialsUnchanged(user)) return null;
    sweepExpiredSessions();
    return createSession(user.id);
  })();
  if (!sid) return res.status(401).json({ error: 'Invalid email or password' });
  const token = jwt.sign({ id: user.id, email: user.email, tv: user.token_version, sid }, process.env.JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });

  res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions(req));
  rlog.info('login ok', { userId: user.id, secure: sessionCookieOptions(req).secure });
  res.json({ user: { id: user.id, email: user.email, created_at: user.created_at } });
}));

router.post('/register', authLimiter, asyncHandler(async (req, res) => {
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
  const sid = createSession(user.id);
  const token = jwt.sign({ id: user.id, email: user.email, tv: user.token_version, sid }, process.env.JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });

  res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions(req));
  res.status(201).json({ user: { id: user.id, email: user.email, created_at: user.created_at } });
}));

// Clearing the cookie alone left the JWT valid for its remaining 7 days, so a
// copied token outlived the sign-out. Deleting the session row named by `sid`
// revokes it -- and only it, so signing out on a phone leaves the desktop signed
// in. Best effort by design: logout has no requireAuth and must still answer 200
// when the cookie is missing, expired or forged.
function revokeThisDevice(req) {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (!token) return;
  const rlog = req.log || log;
  try {
    const { id, sid } = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    const revoked = sid ? deleteSession(sid, id) > 0 : false;
    rlog.info('logout ok', { userId: id, deviceRevoked: revoked });
  } catch (err) {
    rlog.warn('logout without a valid session', { reason: 'jwt-verify-failed', err });
  }
}

router.post('/logout', sessionLimiter, (req, res) => {
  revokeThisDevice(req);
  res.clearCookie(SESSION_COOKIE_NAME, clearSessionCookieOptions(req));
  res.json({ ok: true });
});

router.get('/me', sessionLimiter, requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, email, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

router.patch('/me', authLimiter, requireAuth, asyncHandler(async (req, res) => {
  const input = credentialSchema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Invalid account change' });
  const { currentPassword, newEmail, newPassword } = input.data;

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(401).json({ error: 'Invalid or expired token' });
  const match = await bcrypt.compare(currentPassword, user.password_hash);
  if (!match) return res.status(401).json({ error: 'Current password is incorrect' });

  let email = user.email;
  let passwordHash = user.password_hash;

  if (newEmail) {
    email = newEmail.trim().toLowerCase();
  }

  if (newPassword) {
    passwordHash = await bcrypt.hash(newPassword, 12);
  }

  // Unlike logout, this revokes EVERY device. Changing a password or the login
  // identifier is the "someone may have my credentials" lever, and a lever that
  // spared some devices would not be one. Both mechanisms are used: the bumped
  // token_version kills tokens already in flight, and dropping the session rows
  // means a stolen `sid` cannot be replayed either. The device making the change
  // gets a fresh session immediately, so it stays signed in.
  const result = commitCredentialChange(req, user, email, passwordHash);
  if (result.error) return res.status(result.status).json({ error: result.error });
  const token = jwt.sign({ id: req.user.id, email, tv: result.tokenVersion, sid: result.sid }, process.env.JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions(req));
  res.json({ user: { id: req.user.id, email, created_at: user.created_at } });
}));

const notificationContext = req => ({ userId: req.user.id, actor: 'web' });
function notificationControls(req) {
  const controls = requestControls(req);
  if (!controls && process.env.MCP_WRITES_ENABLED === 'true') {
    throw new DomainError('CONFLICT', 'Reload the planner before editing', 409);
  }
  return controls;
}

router.get('/notification-settings', sessionLimiter, requireAuth, (req, res) => {
  res.json({ ...notifications.settings(notificationContext(req)), version: notificationMutations.version(notificationContext(req)) });
});

router.patch('/notification-settings', sessionLimiter, requireAuth, (req, res) => {
  const context = notificationContext(req);
  const controls = notificationControls(req);
  const input = parse(notificationSchemas.update, req.body);
  if (!controls) {
    notifications.update(context, input);
    return res.json({ ok: true });
  }
  const result = notificationMutations.run(context, 'update_notification_settings', input, controls,
    () => ({ data: notifications.update(context, input), changed: true }));
  res.json({ ok: true, ...result, version: result.currentVersion });
});

router.post('/test-email', authLimiter, requireAuth, asyncHandler(async (req, res) => {
  const context = notificationContext(req);
  const controls = notificationControls(req);
  if (!req.body || Array.isArray(req.body) || Object.keys(req.body).length) {
    throw new DomainError('VALIDATION_ERROR', 'Test email uses only the saved notification recipient');
  }
  const input = controls || { expectedVersion: notificationMutations.version(context), idempotencyKey: randomUUID() };
  const result = await notifications.sendTest(context, input);
  res.json(result);
}));

router.use(['/notification-settings', '/test-email'], domainError);
module.exports = router;
