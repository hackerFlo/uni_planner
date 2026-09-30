const express = require('express');
const { validCapabilities, CAPABILITIES } = require('../mcp/links');
const bcrypt = require('bcrypt');
const requireAuth = require('../middleware/auth');
const { asyncHandler } = require('../middleware/asyncHandler');
const { authLimiter, sessionLimiter } = require('../middleware/rateLimiter');
const { findLiveSession } = require('../sessions');
const { DomainError, publicError } = require('../domain/errors');
const { AccessAuthError } = require('../mcp/access');
const { log } = require('../logger');

function connectionStatus(config, links, userId) {
  const configured = Boolean(config.enabled && config.publicUrl && config.webOrigin
    && config.issuer && config.webAudience && config.mcpAudience);
  return { enabled: config.enabled, configured, writesEnabled: Boolean(config.writesEnabled), availableCapabilities: CAPABILITIES, publicUrl: config.publicUrl ?? null, ...links.status(userId) };
}

function browserMutation(config) {
  return (req, _res, next) => {
    if (!config.webOrigin || req.get('Origin') !== config.webOrigin
      || req.get('X-Requested-With') !== 'XMLHttpRequest' || !req.is('application/json')) {
      throw new DomainError('FORBIDDEN', 'A same-origin browser request is required.', 403);
    }
    next();
  };
}

function validateEnrollment(body) {
  if (!body || Array.isArray(body) || Object.keys(body).some(key => !['password', 'consent', 'capabilities'].includes(key))
    || typeof body.password !== 'string' || body.password.length < 1 || body.password.length > 128
    || body.consent !== true || !validCapabilities(body.capabilities)) {
    throw new DomainError('VALIDATION_ERROR', 'Current password and explicit consent to the selected planner permissions are required.', 400);
  }
}

function assertCurrentProof(db, req, previousUser) {
  const current = db.prepare('SELECT token_version, password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!current || current.token_version !== (req.user.tv ?? 0)
    || current.password_hash !== previousUser.password_hash || !findLiveSession(req.user.sid, req.user.id)) {
    throw new DomainError('AUTH_REQUIRED', 'Sign in again before enrolling this connection.', 401);
  }
}

function enrollmentHandler({ db, config, verifyAssertion, links }) {
  return asyncHandler(async (req, res) => {
    if (!config.enabled) throw new DomainError('NOT_FOUND', 'Agent connections are disabled.', 404);
    validateEnrollment(req.body);
    const identity = await verifyAssertion(req, config.webAudience);
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    if (!user || !await bcrypt.compare(req.body.password, user.password_hash)) {
      throw new DomainError('AUTH_REQUIRED', 'The current password is incorrect.', 401);
    }
    // Async assertion/password checks must not outlive browser credential revocation.
    assertCurrentProof(db, req, user);
    links.enroll(req.user.id, identity, req.body.capabilities);
    (req.log || log).info('agent connection enrolled', { userId: req.user.id, outcome: 'success' });
    res.json(connectionStatus(config, links, req.user.id));
  });
}

function revokeHandler(config, links) {
  return (req, res) => {
    if (!req.body || Array.isArray(req.body) || Object.keys(req.body).length) {
      throw new DomainError('VALIDATION_ERROR', 'Revocation does not accept account selectors.', 400);
    }
    links.revoke(req.user.id);
    (req.log || log).info('all agent access disabled', { userId: req.user.id, outcome: 'success' });
    res.json(connectionStatus(config, links, req.user.id));
  };
}

function connectionError(error, req, res, _next) {
  if (error instanceof AccessAuthError) error = new DomainError('AUTH_REQUIRED', 'Authentication required.', 401);
  const parserStatus = { 'entity.too.large': 413, 'entity.parse.failed': 400, 'encoding.unsupported': 415 };
  const status = error instanceof DomainError ? error.status : (parserStatus[error.type] || 500);
  const safe = error instanceof DomainError ? publicError(error)
    : { code: status < 500 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR', message: 'The connection request could not be completed.' };
  (req.log || log).warn('agent connection rejected', { userId: req.user?.id, outcome: safe.code });
  res.status(status).json({ error: safe.message, code: safe.code });
}

function createAgentConnectionsRouter(options) {
  const { config, links } = options;
  const router = express.Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(requireAuth);
  router.get('/', sessionLimiter, (req, res) => res.json(connectionStatus(config, links, req.user.id)));
  const parse = express.json({ limit: '2kb', inflate: false });
  router.post('/', authLimiter, browserMutation(config), parse, enrollmentHandler(options));
  router.delete('/', sessionLimiter, browserMutation(config), parse, revokeHandler(config, links));
  router.use(connectionError);
  return router;
}

module.exports = { createAgentConnectionsRouter };
