const express = require('express');
const router = express.Router();
const db = require('../db');
const requireAuth = require('../middleware/auth');

const backupJsonParser = express.json({ limit: '5mb' });

const VALID_LIST_TYPES = ['university', 'private', 'future'];

router.get('/', requireAuth, (req, res) => {
  const todos = db.prepare('SELECT * FROM todos WHERE user_id = ?').all(req.user.id);
  res.json({
    version: 1,
    exported_at: new Date().toISOString(),
    todos: todos.map(t => ({
      title: t.title,
      description: t.description,
      list_type: t.list_type,
      completed: t.completed,
      archived: t.archived,
      day_assigned: t.day_assigned,
      approx_time: t.approx_time,
      planner_order: t.planner_order,
      completed_at: t.completed_at,
      created_at: t.created_at,
    })),
  });
});

router.post('/restore', requireAuth, backupJsonParser, (req, res) => {
  const { todos } = req.body;
  if (!Array.isArray(todos)) return res.status(400).json({ error: 'Invalid backup file' });

  const existing = db.prepare('SELECT title, list_type, created_at FROM todos WHERE user_id = ?').all(req.user.id);
  const existingSet = new Set(existing.map(t => `${t.title}|${t.list_type}|${t.created_at}`));

  const insert = db.prepare(`
    INSERT INTO todos (user_id, title, description, list_type, completed, archived, day_assigned, approx_time, planner_order, completed_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let imported = 0;
  let skipped = 0;

  const run = db.transaction(() => {
    for (const t of todos) {
      if (!t.title || typeof t.title !== 'string' || t.title.trim().length === 0) { skipped++; continue; }
      if (!VALID_LIST_TYPES.includes(t.list_type)) { skipped++; continue; }
      const key = `${t.title}|${t.list_type}|${t.created_at}`;
      if (existingSet.has(key)) { skipped++; continue; }
      const now = new Date().toISOString();
      insert.run(
        req.user.id,
        t.title.trim().slice(0, 200),
        typeof t.description === 'string' ? t.description.slice(0, 5000) : '',
        t.list_type,
        t.completed ? 1 : 0,
        t.archived ? 1 : 0,
        t.day_assigned || null,
        t.approx_time ? String(t.approx_time).slice(0, 50) : null,
        Number.isInteger(t.planner_order) ? t.planner_order : null,
        t.completed_at || null,
        t.created_at || now,
        now,
      );
      imported++;
    }
  });

  run();
  res.json({ imported, skipped });
});

module.exports = router;
