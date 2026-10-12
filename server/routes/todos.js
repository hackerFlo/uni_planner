const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');
const domainError = require('../middleware/domainError');
const { createTodoService } = require('../services/todos');
const service = createTodoService(db);
const operations = require('../services/operations').createOperations(db);
const maintenance = require('../domain/mutation').createMutationService(db);
const { webMutation, legacyBoardMutation } = require('../domain/webMutation');
const router = express.Router();
router.use(requireAuth);

const context = req => ({ userId: req.user.id, actor: 'web' });
const routeId = value => typeof value === 'string' && /^[1-9]\d*$/.test(value) ? Number(value) : NaN;
function read(req, options) {
  const ctx = context(req);
  if (!options.materialize) return { ...service.list(ctx, options), version: operations.version(ctx) };
  const result = maintenance.maintain(ctx, () => ({ data: service.list(ctx, options), changed: false }));
  return { ...result.data, version: result.version };
}
router.get('/', (req, res) => res.json(read(req, { materialize: true })));
router.get('/archived', (req, res) => res.json(read(req, { status: 'archived' })));
router.get('/completed', (req, res) => res.json(read(req, {
  status: 'completed', filters: { from: req.query.from, to: req.query.to },
})));
router.post('/', (req, res) => res.status(201).json(webMutation(operations, req, 'create_task', req.body,
  () => service.create(context(req), req.body))));
router.patch('/reorder', legacyBoardMutation, (req, res) => res.json(service.reorder(context(req), req.body)));
router.post('/:id/dismiss-agent-activity', (req, res) => {
  const args = { ...req.body, id: routeId(req.params.id) };
  res.json(webMutation(operations, req, 'dismiss_task_agent_activity', args, () => service.dismiss(context(req), args)));
});
router.patch('/:id', (req, res) => {
  const args = { ...req.body, id: routeId(req.params.id) };
  res.json(webMutation(operations, req, 'update_task', args, () => service.update(context(req), args)));
});
router.delete('/:id', (req, res) => {
  const args = { id: routeId(req.params.id), scope: req.query.scope ?? 'single' };
  res.json(webMutation(operations, req, 'delete_task', args, () => service.remove(context(req), args)));
});
router.use(domainError);
module.exports = router;
