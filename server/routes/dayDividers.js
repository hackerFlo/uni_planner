const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');
const { validateDayAssigned } = require('../middleware/validate');

const router = express.Router();
router.use(requireAuth);

// A divider is a caesura, not a list: past a handful per day the column is the
// separator. The cap is what stops a scripted client filling the table.
const MAX_DIVIDERS_PER_DAY = 20;

const DIVIDER_SELECT = 'SELECT id, date, planner_order FROM day_dividers';

// validateDayAssigned returns null for an absent date, which every route here
// has to reject: a divider with no day has nowhere to be drawn.
function requireDate(value) {
  const date = validateDayAssigned(value);
  return date === false || date === null ? null : date;
}

function parsePlannerOrder(value) {
  if (value === undefined || value === null) return 0;
  return Number.isSafeInteger(value) && value >= 0 ? value : false;
}

router.get('/', (req, res) => {
  const dividers = db.prepare(
    `${DIVIDER_SELECT} WHERE user_id = ? ORDER BY date ASC, planner_order ASC`
  ).all(req.user.id);
  res.json({ dividers });
});

router.post('/', (req, res) => {
  const date = requireDate(req.body.date);
  if (!date) return res.status(400).json({ error: 'Invalid date format (expected YYYY-MM-DD)' });

  const plannerOrder = parsePlannerOrder(req.body.planner_order);
  if (plannerOrder === false) return res.status(400).json({ error: 'planner_order must be a non-negative integer' });

  const { n } = db.prepare(
    'SELECT COUNT(*) AS n FROM day_dividers WHERE user_id = ? AND date = ?'
  ).get(req.user.id, date);
  if (n >= MAX_DIVIDERS_PER_DAY) {
    return res.status(400).json({ error: `A day can hold at most ${MAX_DIVIDERS_PER_DAY} dividers` });
  }

  const { lastInsertRowid } = db.prepare(
    'INSERT INTO day_dividers (user_id, date, planner_order) VALUES (?, ?, ?)'
  ).run(req.user.id, date, plannerOrder);

  const divider = db.prepare(`${DIVIDER_SELECT} WHERE id = ? AND user_id = ?`).get(lastInsertRowid, req.user.id);
  res.status(201).json({ divider });
});

// Before PATCH /:id, or Express matches "reorder" as an id and the reorder
// never runs -- routes/todos.js:278 carries the same warning.
router.patch('/reorder', (req, res) => {
  const items = req.body.items;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items must be an array' });

  const stmt = db.prepare('UPDATE day_dividers SET planner_order = ? WHERE id = ? AND user_id = ?');
  const updateMany = db.transaction((rows) => {
    for (const { id, planner_order } of rows) {
      const numId = parseInt(id, 10);
      const numOrder = parseInt(planner_order, 10);
      if (!Number.isInteger(numId) || !Number.isInteger(numOrder)) continue;
      stmt.run(numOrder, numId, req.user.id);
    }
  });

  updateMany(items);
  res.json({ ok: true });
});

router.patch('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid id' });

  const date = requireDate(req.body.date);
  if (!date) return res.status(400).json({ error: 'Invalid date format (expected YYYY-MM-DD)' });

  const { changes } = db.prepare('UPDATE day_dividers SET date = ? WHERE id = ? AND user_id = ?')
    .run(date, id, req.user.id);
  if (changes === 0) return res.status(404).json({ error: 'Divider not found' });

  const divider = db.prepare(`${DIVIDER_SELECT} WHERE id = ? AND user_id = ?`).get(id, req.user.id);
  res.json({ divider });
});

router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid id' });

  const { changes } = db.prepare('DELETE FROM day_dividers WHERE id = ? AND user_id = ?').run(id, req.user.id);
  if (changes === 0) return res.status(404).json({ error: 'Divider not found' });

  res.json({ ok: true });
});

module.exports = router;
