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
  const { title, description, list_type, day_assigned } = req.body;

  const cleanTitle = sanitizeTitle(title);
  if (!cleanTitle) return res.status(400).json({ error: 'Title is required (max 200 chars)' });

  const cleanDesc = sanitizeDescription(description);
  if (cleanDesc === null) return res.status(400).json({ error: 'Description too long (max 5000 chars)' });

  const cleanListType = validateListType(list_type);
  if (!cleanListType) return res.status(400).json({ error: 'list_type must be university or private' });

  const cleanDay = validateDayAssigned(day_assigned);
  if (cleanDay === false) return res.status(400).json({ error: 'Invalid day_assigned value' });

  const result = db.prepare(
    'INSERT INTO todos (user_id, list_type, title, description, day_assigned) VALUES (?, ?, ?, ?, ?)'
  ).run(req.user.id, cleanListType, cleanTitle, cleanDesc, cleanDay);

  const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ todo });
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
    if (updates.completed === 1) updates.archived = 1;
  }

  if (req.body.archived !== undefined) {
    updates.archived = req.body.archived ? 1 : 0;
    if (updates.archived === 0) updates.completed = 0;
  }

  if ('day_assigned' in req.body) {
    const d = validateDayAssigned(req.body.day_assigned);
    if (d === false) return res.status(400).json({ error: 'Invalid day_assigned value' });
    updates.day_assigned = d;
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
