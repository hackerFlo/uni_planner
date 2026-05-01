const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');
const { sanitizeTitle, sanitizeDescription, validateListType, validateDayAssigned } = require('../middleware/validate');

const router = express.Router();
router.use(requireAuth);

const NOW = () => new Date().toISOString();

router.get('/', (req, res) => {
  const todos = db.prepare(
    'SELECT * FROM todos WHERE user_id = ? AND archived = 0 ORDER BY created_at DESC'
  ).all(req.user.id);
  res.json({ todos });
});

router.get('/archived', (req, res) => {
  const todos = db.prepare(
    'SELECT * FROM todos WHERE user_id = ? AND archived = 1 ORDER BY updated_at DESC'
  ).all(req.user.id);
  res.json({ todos });
});

router.post('/', (req, res) => {
  const { title, description, list_type, day_assigned, approx_time } = req.body;

  const cleanTitle = sanitizeTitle(title);
  if (!cleanTitle) return res.status(400).json({ error: 'Title is required (max 200 chars)' });

  const cleanDesc = sanitizeDescription(description);
  if (cleanDesc === null) return res.status(400).json({ error: 'Description too long (max 5000 chars)' });

  const cleanListType = validateListType(list_type);
  if (!cleanListType) return res.status(400).json({ error: 'list_type must be university or private' });

  const cleanDay = validateDayAssigned(day_assigned);
  if (cleanDay === false) return res.status(400).json({ error: 'Invalid day_assigned value' });

  const cleanTime = approx_time ? String(approx_time).trim().slice(0, 50) || null : null;

  const result = db.prepare(
    'INSERT INTO todos (user_id, list_type, title, description, day_assigned, approx_time) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.user.id, cleanListType, cleanTitle, cleanDesc, cleanDay, cleanTime);

  const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ todo });
});

router.patch('/reorder', (req, res) => {
  const items = req.body.items;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items must be an array' });

  const stmt = db.prepare('UPDATE todos SET planner_order = ?, updated_at = ? WHERE id = ? AND user_id = ?');
  const now = NOW();

  const updateMany = db.transaction((rows) => {
    for (const { id, planner_order } of rows) {
      const numId = parseInt(id, 10);
      const numOrder = parseInt(planner_order, 10);
      if (!Number.isInteger(numId) || !Number.isInteger(numOrder)) continue;
      stmt.run(numOrder, now, numId, req.user.id);
    }
  });

  updateMany(items);
  res.json({ ok: true });
});

router.patch('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  const existing = db.prepare('SELECT * FROM todos WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Todo not found' });

  const updates = {};

  if (req.body.title !== undefined) {
    const t = sanitizeTitle(req.body.title);
    if (!t) return res.status(400).json({ error: 'Title is required (max 200 chars)' });
    updates.title = t;
  }

  if (req.body.description !== undefined) {
    const d = sanitizeDescription(req.body.description);
    if (d === null) return res.status(400).json({ error: 'Description too long' });
    updates.description = d;
  }

  if (req.body.list_type !== undefined) {
    const lt = validateListType(req.body.list_type);
    if (!lt) return res.status(400).json({ error: 'Invalid list_type' });
    updates.list_type = lt;
  }

  if (req.body.completed !== undefined) {
    updates.completed = req.body.completed ? 1 : 0;
    if (updates.completed === 1) {
      updates.archived = 1;
      updates.completed_at = NOW();
    }
  }

  if (req.body.archived !== undefined) {
    updates.archived = req.body.archived ? 1 : 0;
    if (updates.archived === 0) updates.completed = 0;
  }

  if (req.body.planner_order !== undefined) {
    const po = Number(req.body.planner_order);
    if (!Number.isInteger(po)) return res.status(400).json({ error: 'Invalid planner_order' });
    updates.planner_order = po;
  }

  if ('day_assigned' in req.body) {
    const d = validateDayAssigned(req.body.day_assigned);
    if (d === false) return res.status(400).json({ error: 'Invalid day_assigned value' });
    updates.day_assigned = d;
  }

  if ('approx_time' in req.body) {
    updates.approx_time = req.body.approx_time ? String(req.body.approx_time).trim().slice(0, 50) || null : null;
  }

  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields to update' });

  updates.updated_at = NOW();

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(updates), id, req.user.id];

  db.prepare(`UPDATE todos SET ${setClauses} WHERE id = ? AND user_id = ?`).run(...values);

  const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
  res.json({ todo });
});

router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  const result = db.prepare('DELETE FROM todos WHERE id = ? AND user_id = ?').run(id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Todo not found' });
  res.json({ ok: true });
});

module.exports = router;
