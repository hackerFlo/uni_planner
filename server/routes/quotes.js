const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');
const domainError = require('../middleware/domainError');
const { quoteImportLimiter } = require('../middleware/rateLimiter');
const { createQuoteService } = require('../services/quotes');
const { createOperations } = require('../services/operations');
const { createMutationService } = require('../domain/mutation');
const { webMutation } = require('../domain/webMutation');
const { parse } = require('../domain/schemas');
const { z } = require('zod');
const service = createQuoteService(db);
const operations = createOperations(db);
const mutations = createMutationService(db);
const emptyBody = z.strictObject({});
const router = express.Router();
router.use(requireAuth);
const context = req => ({ userId: req.user.id, actor: 'web' });
const routeId = value => typeof value === 'string' && /^[1-9]\d*$/.test(value) ? Number(value) : NaN;
router.get('/today', (req, res) => {
  const ctx = context(req);
  const result = mutations.maintain(ctx, () => {
    const before = mutations.version(ctx).revision;
    const data = service.daily(ctx, { date: req.query.date, select: true });
    return { data, changed: mutations.version(ctx).revision !== before };
  });
  res.json({ ...result.data, version: result.version });
});
router.get('/stats', (req, res) => res.json({ ...service.stats(context(req)), version: operations.version(context(req)) }));
router.post('/restore-all', (req, res) => {
  const args = parse(emptyBody, req.body || {});
  res.json(webMutation(operations, req, 'restore_all_quotes', args, () => service.restoreAll(context(req))));
});
// The generic parser exempts this route; nginx shares its 1 MiB envelope limit.
router.post('/import', quoteImportLimiter, express.json({ limit: '1mb', inflate: false }),
  (req, res) => res.json(webMutation(operations, req, 'import_quotes_csv', req.body, () => service.importCsv(context(req), req.body))));
for (const action of ['dislike', 'restore']) {
  router.post(`/:id/${action}`, (req, res) => {
    parse(emptyBody, req.body || {});
    const args = { id: routeId(req.params.id), date: req.query.date };
    res.json(webMutation(operations, req, `${action}_quote`, args, () => service[action](context(req), args)));
  });
}
router.use((error, _req, res, next) => {
  if (!error.importErrors) return next(error);
  res.status(error.status).json({ error: error.message, errors: error.importErrors, errorCount: error.errorCount });
});
router.use(domainError);
module.exports = router;
