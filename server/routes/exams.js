const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');
const domainError = require('../middleware/domainError');
const { createExamService } = require('../services/exams');
const service = createExamService(db);
const operations = require('../services/operations').createOperations(db);
const { webMutation } = require('../domain/webMutation');
const router = express.Router();
router.use(requireAuth);

const context = req => ({ userId: req.user.id, actor: 'web' });
const routeId = value => typeof value === 'string' && /^[1-9]\d*$/.test(value) ? Number(value) : NaN;
router.get('/', (req, res) => res.json({ exams: service.list(context(req)), version: operations.version(context(req)) }));
router.post('/', (req, res) => res.status(201).json(webMutation(operations, req, 'create_exam', req.body,
  () => ({ exam: service.create(context(req), req.body) }))));
router.patch('/:id', (req, res) => {
  const args = { ...req.body, id: routeId(req.params.id) };
  res.json(webMutation(operations, req, 'update_exam', args, () => ({ exam: service.update(context(req), args) })));
});
router.delete('/:id', (req, res) => {
  const args = { id: routeId(req.params.id) };
  res.json(webMutation(operations, req, 'delete_exam', args, () => service.remove(context(req), args)));
});
router.use(domainError);
module.exports = router;
