const express = require('express');
const requireAuth = require('../middleware/auth');
const domainError = require('../middleware/domainError');
const { createPreferenceService, preferenceSchemas } = require('../services/preferences');
const { parse } = require('../domain/schemas');
const { createMutationService } = require('../domain/mutation');
const { requestControls } = require('../domain/webMutation');
const { DomainError } = require('../domain/errors');
const schemas = { create_preference_profile: preferenceSchemas.create,
  update_preferences: preferenceSchemas.update, reset_preferences: preferenceSchemas.reset };

function writeProfile(mutations, req, name, args, action) {
  args = parse(schemas[name], args);
  const context = { userId: req.user.id, actor: 'web' };
  const controls = requestControls(req);
  if (!controls) {
    if (process.env.MCP_WRITES_ENABLED === 'true') throw new DomainError('CONFLICT', 'Reload preferences before editing', 409);
    return { profile: action(context, args), version: mutations.version(context) };
  }
  const result = mutations.run(context, name, args, controls, () => {
    const before = mutations.version(context).revision;
    const profile = action(context, args);
    return { data: { profile }, changed: mutations.version(context).revision !== before };
  });
  return { ...result.data, ...result, version: result.currentVersion };
}

function createPreferencesRouter(db) {
  const router = express.Router();
  const service = createPreferenceService(db);
  const mutations = createMutationService(db);
  const context = req => ({ userId: req.user.id, actor: 'web' });
  router.use(requireAuth);
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/profiles', (req, res) => {
    const args = { ...req.query, ...(req.query.limit === undefined ? {} : { limit: Number(req.query.limit) }) };
    res.json({ ...service.list(context(req), args), version: mutations.version(context(req)) });
  });
  router.get('/profiles/:id', (req, res) => res.json({ profile: service.get(context(req), { id: req.params.id }), version: mutations.version(context(req)) }));
  router.post('/profiles', (req, res) => res.status(201).json(writeProfile(mutations, req, 'create_preference_profile', req.body, service.create)));
  router.patch('/profiles/:id', (req, res) => res.json(writeProfile(mutations, req, 'update_preferences',
    { id: req.params.id, patch: req.body }, service.update)));
  router.post('/profiles/:id/reset', (req, res) => {
    if (!req.body || Array.isArray(req.body) || Object.keys(req.body).length) throw new DomainError('VALIDATION_ERROR', 'Reset takes no preference fields');
    res.json(writeProfile(mutations, req, 'reset_preferences', { id: req.params.id }, service.reset));
  });
  router.use(domainError);
  return router;
}

module.exports = { createPreferencesRouter };
