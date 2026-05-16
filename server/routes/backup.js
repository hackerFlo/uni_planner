const express = require('express');
const router = express.Router();
const db = require('../db');
const requireAuth = require('../middleware/auth');
const { validateDayAssigned } = require('../middleware/validate');

const backupJsonParser = express.json({ limit: '5mb' });

const PALETTE = ['indigo', 'emerald', 'amber', 'rose', 'sky', 'violet', 'pink', 'slate'];
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const cleanIsoDatetime = (v) => (typeof v === 'string' && ISO_DATETIME.test(v) ? v : null);

// Legacy list_type → display name mapping for old backup files
const LEGACY_LIST_NAMES = { university: 'University', private: 'Private', future: 'Future' };
const LEGACY_LIST_COLORS = { university: 'indigo', private: 'emerald', future: 'amber' };

router.get('/', requireAuth, (req, res) => {
  const lists = db.prepare(
    'SELECT id, name, color, sort_order FROM lists WHERE user_id = ? ORDER BY sort_order ASC'
  ).all(req.user.id);

  const todos = db.prepare(
    `SELECT t.title, t.description, l.name AS list_name, t.completed, t.archived,
            t.day_assigned, t.approx_time, t.planner_order, t.completed_at, t.created_at
     FROM todos t JOIN lists l ON l.id = t.list_id
     WHERE t.user_id = ?`
  ).all(req.user.id);

  const exams = db.prepare(
    'SELECT title, exam_date, created_at FROM exams WHERE user_id = ?'
  ).all(req.user.id);

  res.json({
    version: 3,
    exported_at: new Date().toISOString(),
    lists: lists.map(l => ({ name: l.name, color: l.color, sort_order: l.sort_order })),
    todos,
    exams,
  });
});

router.post('/restore', requireAuth, backupJsonParser, (req, res) => {
  const { todos, lists: backupLists, exams: backupExams, version } = req.body;
  if (!Array.isArray(todos)) return res.status(400).json({ error: 'Invalid backup file' });

  // Build a name→id map for existing user lists
  const existingLists = db.prepare(
    'SELECT id, name FROM lists WHERE user_id = ? ORDER BY sort_order ASC'
  ).all(req.user.id);
  const listNameToId = new Map(existingLists.map(l => [l.name.toLowerCase(), l.id]));

  // Ensure lists from backup exist (create if missing)
  const insertList = db.prepare(
    'INSERT INTO lists (user_id, name, color, sort_order) VALUES (?, ?, ?, ?)'
  );
  const getMaxOrder = () => {
    const r = db.prepare('SELECT MAX(sort_order) AS m FROM lists WHERE user_id = ?').get(req.user.id);
    return (r?.m ?? -1) + 1;
  };

  function ensureList(name, color) {
    const key = name.toLowerCase();
    if (listNameToId.has(key)) return listNameToId.get(key);
    const safeColor = PALETTE.includes(color) ? color : 'slate';
    const result = insertList.run(req.user.id, name, safeColor, getMaxOrder());
    listNameToId.set(key, result.lastInsertRowid);
    return result.lastInsertRowid;
  }

  // Pre-create lists from backup manifest (version 2)
  if (Array.isArray(backupLists)) {
    for (const l of backupLists) {
      if (typeof l.name === 'string' && l.name.trim().length > 0) {
        ensureList(l.name.trim().slice(0, 40), l.color);
      }
    }
  }

  // Determine list_name for each todo row
  function resolveListName(t) {
    if (typeof t.list_name === 'string' && t.list_name.trim()) return t.list_name.trim();
    // Legacy v1: list_type field
    if (typeof t.list_type === 'string' && LEGACY_LIST_NAMES[t.list_type]) {
      return LEGACY_LIST_NAMES[t.list_type];
    }
    return null;
  }
  function resolveListColor(t) {
    if (typeof t.list_type === 'string' && LEGACY_LIST_COLORS[t.list_type]) return LEGACY_LIST_COLORS[t.list_type];
    return 'slate';
  }

  const existing = db.prepare(
    `SELECT t.title, l.name AS list_name, t.created_at FROM todos t JOIN lists l ON l.id = t.list_id WHERE t.user_id = ?`
  ).all(req.user.id);
  const existingSet = new Set(existing.map(t => `${t.title}|${t.list_name?.toLowerCase()}|${t.created_at}`));

  const existingExams = db.prepare(
    'SELECT title, exam_date FROM exams WHERE user_id = ?'
  ).all(req.user.id);
  const existingExamSet = new Set(existingExams.map(e => `${e.title}|${e.exam_date}`));

  const insert = db.prepare(`
    INSERT INTO todos (user_id, title, description, list_id, completed, archived, day_assigned, approx_time, planner_order, completed_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertExam = db.prepare(
    'INSERT INTO exams (user_id, title, exam_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  );

  let imported = 0;
  let skipped = 0;
  let examsImported = 0;
  let examsSkipped = 0;

  const run = db.transaction(() => {
    for (const t of todos) {
      if (!t.title || typeof t.title !== 'string' || t.title.trim().length === 0) { skipped++; continue; }
      const listName = resolveListName(t);
      if (!listName) { skipped++; continue; }
      const day = validateDayAssigned(t.day_assigned);
      if (day === false) { skipped++; continue; }
      const key = `${t.title}|${listName.toLowerCase()}|${t.created_at}`;
      if (existingSet.has(key)) { skipped++; continue; }
      const listId = ensureList(listName.slice(0, 40), resolveListColor(t));
      const now = new Date().toISOString();
      insert.run(
        req.user.id,
        t.title.trim().slice(0, 200),
        typeof t.description === 'string' ? t.description.slice(0, 5000) : '',
        listId,
        t.completed ? 1 : 0,
        t.archived ? 1 : 0,
        day,
        t.approx_time ? String(t.approx_time).slice(0, 50) : null,
        Number.isInteger(t.planner_order) ? t.planner_order : null,
        cleanIsoDatetime(t.completed_at),
        cleanIsoDatetime(t.created_at) || now,
        now,
      );
      imported++;
    }

    if (Array.isArray(backupExams)) {
      for (const e of backupExams) {
        if (!e.title || typeof e.title !== 'string' || e.title.trim().length === 0) { examsSkipped++; continue; }
        const examDate = validateDayAssigned(e.exam_date);
        if (examDate === false) { examsSkipped++; continue; }
        const key = `${e.title.trim().slice(0, 200)}|${examDate}`;
        if (existingExamSet.has(key)) { examsSkipped++; continue; }
        const now = new Date().toISOString();
        insertExam.run(
          req.user.id,
          e.title.trim().slice(0, 200),
          examDate,
          cleanIsoDatetime(e.created_at) || now,
          now,
        );
        existingExamSet.add(key);
        examsImported++;
      }
    }
  });

  run();
  res.json({ imported, skipped, examsImported, examsSkipped });
});

module.exports = router;
