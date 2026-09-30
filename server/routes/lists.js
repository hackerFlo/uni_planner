const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');
const domainError = require('../middleware/domainError');
const { createListService } = require('../services/lists');
const service = createListService(db);
const operations = require('../services/operations').createOperations(db);
const { webMutation } = require('../domain/webMutation');
const router = express.Router();
router.use(requireAuth);

const context = req => ({ userId: req.user.id, actor: 'web' });
const routeId = value => typeof value === 'string' && /^[1-9]\d*$/.test(value) ? Number(value) : NaN;

router.get('/', (req, res) => res.json({ lists: service.list(context(req)), version: operations.version(context(req)) }));
router.post('/', (req, res) => res.status(201).json(webMutation(operations, req, 'create_list', req.body,
  () => ({ list: service.create(context(req), req.body) }))));
router.patch('/reorder', (req, res) => res.json(webMutation(operations, req, 'reorder_lists', req.body,
  () => service.reorder(context(req), req.body))));
router.patch('/:id', (req, res) => {
  const args = { ...req.body, id: routeId(req.params.id) };
  res.json(webMutation(operations, req, 'update_list', args, () => ({ list: service.update(context(req), args) })));
});
router.delete('/:id', (req, res) => {
  const args = { id: routeId(req.params.id) };
  if (req.query.moveTo !== undefined) args.moveTo = routeId(req.query.moveTo);
  res.json(webMutation(operations, req, 'delete_list', args, () => service.remove(context(req), args)));
});

router.use(domainError);
module.exports = router;
