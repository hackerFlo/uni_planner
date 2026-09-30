const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');
const domainError = require('../middleware/domainError');
const { createDayDividerService } = require('../services/dayDividers');
const service = createDayDividerService(db);
const { createMutationService } = require('../domain/mutation');
const mutations = createMutationService(db);
const { legacyBoardMutation } = require('../domain/webMutation');
const router = express.Router();
router.use(requireAuth);

const context = req => ({ userId: req.user.id, actor: 'web' });
const routeId = value => typeof value === 'string' && /^[1-9]\d*$/.test(value) ? Number(value) : NaN;
router.get('/', (req, res) => res.json({ dividers: service.list(context(req)), version: mutations.version(context(req)) }));
router.post('/', legacyBoardMutation, (req, res) => res.status(201).json({ divider: service.create(context(req), req.body) }));
// Compatibility for the website's partial divider half of a mixed reorder.
// Atomic board operations use the complete typed membership in planner.js.
router.patch('/reorder', legacyBoardMutation, (req, res) => res.json(service.reorder(context(req), req.body)));
router.patch('/:id', legacyBoardMutation, (req, res) => {
  res.json({ divider: service.update(context(req), { ...req.body, id: routeId(req.params.id) }) });
});
router.delete('/:id', legacyBoardMutation, (req, res) => res.json(service.remove(context(req), { id: routeId(req.params.id) })));
router.use(domainError);
module.exports = router;
