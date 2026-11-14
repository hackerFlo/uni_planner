const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');
const domainError = require('../middleware/domainError');
const { aiSuggestLimiter } = require('../middleware/rateLimiter');
const { DomainError } = require('../domain/errors');
const { parse } = require('../domain/schemas');
const config = require('../config');
const { log } = require('../logger');
const { aiListSettingsSchema, setEnabled } = require('../services/aiListSettings');
const { createListSuggester, suggestionInputSchema } = require('../services/aiListSuggester');

function defaultSuggester(database) {
  return createListSuggester(database, {
    isAvailable: () => config.AI_LIST_AVAILABLE,
    model: config.AI_LIST_MODEL,
    dailyLimit: config.AI_LIST_DAILY_LIMIT,
    createClient: () => require('../services/aiClient').createAnthropicClient({
      apiKey: config.ANTHROPIC_API_KEY, baseURL: config.ANTHROPIC_BASE_URL, timeoutMs: 10000 }),
  });
}

// Owner-only twice over: requireAuth already answers 403 to the agent account
// because these paths are deliberately absent from middleware/agentScope.js, and
// ownerOnly keeps that true even if someone lists them there later.
function ownerOnly(req, _res, next) {
  if (req.principal?.kind !== 'owner') throw new DomainError('FORBIDDEN', 'Not available to the agent account', 403);
  next();
}

function createAiRouter(database = db, { suggester = defaultSuggester(database), available = config.AI_LIST_AVAILABLE } = {}) {
  const router = express.Router();
  router.use(requireAuth, ownerOnly);
  router.patch('/settings', (req, res) => {
    const { enabled } = parse(aiListSettingsSchema, req.body);
    const result = setEnabled(database, req.user.id, enabled, { available });
    (req.log || log).info('ai_list.setting_changed', { userId: req.user.id, enabled });
    res.json(result);
  });
  router.post('/list-suggestion', aiSuggestLimiter, async (req, res, next) => {
    try {
      const input = parse(suggestionInputSchema, req.body);
      res.json({ listId: await suggester.suggest(req.user.id, input) });
    } catch (err) { next(err); }
  });
  router.use(domainError);
  return router;
}

module.exports = createAiRouter();
module.exports.createAiRouter = createAiRouter;
