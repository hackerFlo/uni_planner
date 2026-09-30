const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');
const domainError = require('../middleware/domainError');
const { createDayNoteService } = require('../services/dayNotes');
const service = createDayNoteService(db);
const operations = require('../services/operations').createOperations(db);
const { webMutation } = require('../domain/webMutation');
const router = express.Router();
router.use(requireAuth);

const context = req => ({ userId: req.user.id, actor: 'web' });
router.get('/', (req, res) => res.json({ notes: service.list(context(req)), version: operations.version(context(req)) }));
router.put('/:date', (req, res) => {
  const args = { ...req.body, date: req.params.date, note: req.body.note ?? '' };
  res.json(webMutation(operations, req, 'set_day_note', args, () => service.set(context(req), args)));
});
router.use(domainError);
module.exports = router;
