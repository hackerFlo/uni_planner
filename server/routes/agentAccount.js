const express = require('express');
const bcrypt = require('bcrypt');
const { z } = require('zod');
const db = require('../db');
const { log } = require('../logger');
const requireAuth = require('../middleware/auth');
const { sendAgentForbidden } = require('../middleware/agentScope');
const { asyncHandler } = require('../middleware/asyncHandler');
const { validateIdentifier } = require('../middleware/validate');
const { authLimiter, sessionLimiter } = require('../middleware/rateLimiter');
const { findLiveSession } = require('../sessions');
const { createAgentAccountService } = require('../services/agentAccounts');

const router = express.Router();
const agentAccounts = createAgentAccountService(db);

const reauth = z.strictObject({ currentPassword: z.string().min(1).max(128) });
const createSchema = reauth.extend({ email: z.string().max(100).refine(validateIdentifier) });
const patchSchema = z.strictObject({ disabled: z.boolean() });
const emptySchema = z.strictObject({});

// requireAuth already denies agent sessions (this path is not in the allowlist);
// repeating it here keeps the router safe even if that list is ever widened.
const ownerOnly = (req, res, next) => (req.principal.kind === 'owner' ? next() : sendAgentForbidden(res));
router.use(requireAuth, ownerOnly);

const invalid = res => res.status(400).json({ error: 'Invalid agent account request' });

// Same status and shape as PATCH /api/auth/me for a wrong current password. The
// session is rechecked afterwards because bcrypt yields the event loop: a logout
// or credential change that lands meanwhile must not still authorise the change.
async function confirmOwnerPassword(req, res, currentPassword) {
  const owner = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!owner) { res.status(401).json({ error: 'Invalid or expired token' }); return false; }
  if (!await bcrypt.compare(currentPassword, owner.password_hash)) {
    res.status(403).json({ error: 'Current password is incorrect' });
    return false;
  }
  if (!findLiveSession(req.user.sid, req.user.id)) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return false;
  }
  return true;
}

router.get('/', sessionLimiter, (req, res) => res.json({ account: agentAccounts.find(req.user.id) }));

router.post('/', authLimiter, asyncHandler(async (req, res) => {
  const input = createSchema.safeParse(req.body);
  if (!input.success) return invalid(res);
  if (!await confirmOwnerPassword(req, res, input.data.currentPassword)) return undefined;
  const password = agentAccounts.generatePassword();
  const account = agentAccounts.create(req.user.id, agentAccounts.normalizeEmail(input.data.email), await bcrypt.hash(password, 12));
  if (!account) return res.status(409).json({ error: 'Agent account already exists or the email is already in use' });
  (req.log || log).info('agent account created', { userId: req.user.id });
  return res.status(201).json({ account, password });
}));

router.post('/reset-password', authLimiter, asyncHandler(async (req, res) => {
  const input = reauth.safeParse(req.body);
  if (!input.success) return invalid(res);
  if (!await confirmOwnerPassword(req, res, input.data.currentPassword)) return undefined;
  const password = agentAccounts.generatePassword();
  if (!agentAccounts.resetPassword(req.user.id, await bcrypt.hash(password, 12))) {
    return res.status(404).json({ error: 'No agent account' });
  }
  (req.log || log).info('agent account password reset', { userId: req.user.id });
  return res.json({ password });
}));

router.patch('/', sessionLimiter, (req, res) => {
  const input = patchSchema.safeParse(req.body);
  if (!input.success) return invalid(res);
  const account = agentAccounts.setDisabled(req.user.id, input.data.disabled);
  if (!account) return res.status(404).json({ error: 'No agent account' });
  (req.log || log).info('agent account updated', { userId: req.user.id, disabled: input.data.disabled });
  return res.json({ account });
});

router.post('/sign-out', sessionLimiter, (req, res) => {
  if (!emptySchema.safeParse(req.body ?? {}).success) return invalid(res);
  if (!agentAccounts.signOut(req.user.id)) return res.status(404).json({ error: 'No agent account' });
  (req.log || log).info('agent account signed out', { userId: req.user.id });
  return res.json({ ok: true });
});

router.delete('/', authLimiter, asyncHandler(async (req, res) => {
  const input = reauth.safeParse(req.body);
  if (!input.success) return invalid(res);
  if (!await confirmOwnerPassword(req, res, input.data.currentPassword)) return undefined;
  if (!agentAccounts.remove(req.user.id)) return res.status(404).json({ error: 'No agent account' });
  (req.log || log).info('agent account deleted', { userId: req.user.id });
  return res.json({ ok: true });
}));

module.exports = router;
