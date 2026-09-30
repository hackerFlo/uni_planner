const express = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const db = require('../db');
const requireAuth = require('../middleware/auth');
const domainError = require('../middleware/domainError');
const { requestControls } = require('../domain/webMutation');
const { parse } = require('../domain/schemas');
const { DomainError } = require('../domain/errors');
const { createOperations } = require('../services/operations');
const operations = createOperations(db);
const router = express.Router();
router.use(requireAuth);
const reads = rateLimit({ windowMs: 60000, limit: 60, keyGenerator: req => String(req.user.id), standardHeaders: true, legacyHeaders: false });
const writes = rateLimit({ windowMs: 60000, limit: 30, keyGenerator: req => String(req.user.id), standardHeaders: true, legacyHeaders: false });
const context = req => ({ userId: req.user.id, actor: 'web' });

router.get('/version', reads, (req, res) => res.json({ version: operations.version(context(req)) }));
router.post('/undo', writes, (req, res) => {
  const { operationId } = parse(z.strictObject({ operationId: z.uuid() }), req.body);
  const controls = requestControls(req);
  if (!controls) throw new DomainError('VALIDATION_ERROR', 'Planner version and retry key required');
  res.json(operations.undo(context(req), operationId, controls));
});
for (const [path, name] of Object.entries({ move: 'move_planner_item', copy: 'copy_planner_item',
  reorder: 'reorder_day', 'create-divider': 'create_divider', 'delete-divider': 'delete_divider' })) {
  router.post(`/${path}`, writes, (req, res) => {
    const controls = requestControls(req);
    if (!controls) throw new DomainError('VALIDATION_ERROR', 'Planner version and retry key required');
    res.json(operations.execute(context(req), name, req.body, controls));
  });
}
router.use(domainError);
module.exports = router;
