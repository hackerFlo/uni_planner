const express = require('express');
const router = express.Router();
const db = require('../db');
const requireAuth = require('../middleware/auth');
const {
  validateDayAssigned,
  validateRecurrenceInterval,
  validateRecurrencePattern,
  sanitizeDayNote,
  sanitizeTitle,
  sanitizeDescription,
} = require('../middleware/validate');

const backupJsonParser = express.json({ limit: '5mb' });

const PALETTE = ['indigo', 'emerald', 'amber', 'rose', 'sky', 'violet', 'pink', 'slate'];
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const cleanIsoDatetime = (v) => (typeof v === 'string' && ISO_DATETIME.test(v) ? v : null);

// Legacy list_type → display name mapping for old backup files
const LEGACY_LIST_NAMES = { university: 'University', private: 'Private', future: 'Future' };
const LEGACY_LIST_COLORS = { university: 'indigo', private: 'emerald', future: 'amber' };

// Row ids do not survive an export, so todos are identified across databases by
// this triple -- used both for de-duplication and for relinking a recurring
// instance to its template on restore.
const todoKey = (title, listName, createdAt) => `${title}|${listName?.toLowerCase()}|${createdAt}`;

router.get('/', requireAuth, (req, res) => {
  const lists = db.prepare(
    'SELECT id, name, color, sort_order FROM lists WHERE user_id = ? ORDER BY sort_order ASC'
  ).all(req.user.id);

  // The template's own identity travels with each generated instance, because
  // recurrence_parent_id is a local row id and means nothing after a restore.
  const todos = db.prepare(
    `SELECT t.title, t.description, l.name AS list_name, t.completed, t.archived,
            t.day_assigned, t.approx_time, t.planner_order, t.completed_at, t.created_at,
            t.recurrence_interval_days, t.recurrence_pattern,
            parent.title      AS recurrence_parent_title,
            parent.created_at AS recurrence_parent_created_at,
            pl.name           AS recurrence_parent_list_name
       FROM todos t
       JOIN lists l ON l.id = t.list_id
       LEFT JOIN todos parent ON parent.id = t.recurrence_parent_id AND parent.user_id = t.user_id
       LEFT JOIN lists pl     ON pl.id = parent.list_id            AND pl.user_id = t.user_id
      WHERE t.user_id = ?`
  ).all(req.user.id);

  const exams = db.prepare(
    'SELECT title, exam_date, created_at FROM exams WHERE user_id = ?'
  ).all(req.user.id);

  const dayNotes = db.prepare(
    'SELECT date, note, updated_at FROM day_notes WHERE user_id = ? ORDER BY date ASC'
  ).all(req.user.id);

  res.json({
    version: 4,
    exported_at: new Date().toISOString(),
    lists: lists.map(l => ({ name: l.name, color: l.color, sort_order: l.sort_order })),
    todos,
    exams,
    day_notes: dayNotes,
  });
});

router.post('/restore', requireAuth, backupJsonParser, (req, res) => {
  const { todos, lists: backupLists, exams: backupExams, day_notes: backupNotes } = req.body;
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

  // A Map rather than a Set: a template that is already present must still be
  // reachable as a relink target for instances arriving in this file.
  const existing = db.prepare(
    `SELECT t.id, t.title, l.name AS list_name, t.created_at FROM todos t JOIN lists l ON l.id = t.list_id WHERE t.user_id = ?`
  ).all(req.user.id);
  const existingIds = new Map(existing.map(t => [todoKey(t.title, t.list_name, t.created_at), t.id]));

  const existingExams = db.prepare(
    'SELECT title, exam_date FROM exams WHERE user_id = ?'
  ).all(req.user.id);
  const existingExamSet = new Set(existingExams.map(e => `${e.title}|${e.exam_date}`));

  const insert = db.prepare(`
    INSERT INTO todos (user_id, title, description, list_id, completed, archived, day_assigned, approx_time, planner_order, completed_at, created_at, updated_at, recurrence_interval_days, recurrence_pattern)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const linkToTemplate = db.prepare(
    'UPDATE todos SET recurrence_parent_id = ? WHERE id = ? AND user_id = ?'
  );

  const insertExam = db.prepare(
    'INSERT INTO exams (user_id, title, exam_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  );

  const insertNote = db.prepare(`
    INSERT INTO day_notes (user_id, date, note, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, date) DO NOTHING
  `);

  let imported = 0;
  let skipped = 0;
  let examsImported = 0;
  let examsSkipped = 0;
  let notesImported = 0;
  let notesSkipped = 0;

  const run = db.transaction(() => {
    const importedIds = new Map();
    const pendingLinks = [];

    for (const t of todos) {
      // A backup file is untrusted input like any other body (AR-1), so it goes
      // through the same sanitisers as POST /todos rather than a bare slice().
      const title = sanitizeTitle(t.title);
      if (title === null) { skipped++; continue; }
      const description = sanitizeDescription(t.description);
      if (description === null) { skipped++; continue; }
      const listName = resolveListName(t);
      if (!listName) { skipped++; continue; }
      const day = validateDayAssigned(t.day_assigned);
      if (day === false) { skipped++; continue; }
      const key = todoKey(title, listName, t.created_at);
      if (existingIds.has(key)) { skipped++; continue; }
      const listId = ensureList(listName.slice(0, 40), resolveListColor(t));
      const now = new Date().toISOString();
      // A malformed recurrence field costs the recurrence, never the whole todo.
      const interval = validateRecurrenceInterval(t.recurrence_interval_days);
      const pattern = validateRecurrencePattern(t.recurrence_pattern);
      const result = insert.run(
        req.user.id,
        title,
        description,
        listId,
        t.completed ? 1 : 0,
        t.archived ? 1 : 0,
        day,
        t.approx_time ? String(t.approx_time).slice(0, 50) : null,
        Number.isInteger(t.planner_order) ? t.planner_order : null,
        cleanIsoDatetime(t.completed_at),
        cleanIsoDatetime(t.created_at) || now,
        now,
        interval === false ? null : interval,
        pattern === false ? null : pattern,
      );
      importedIds.set(key, result.lastInsertRowid);
      if (t.recurrence_parent_created_at) {
        pendingLinks.push({
          id: result.lastInsertRowid,
          parentKey: todoKey(
            t.recurrence_parent_title,
            t.recurrence_parent_list_name,
            t.recurrence_parent_created_at,
          ),
        });
      }
      imported++;
    }

    // Second pass: the template may have been inserted after its instances.
    // Without this the scheduler cannot see the instances, and materialises
    // duplicates for days that are already filled.
    for (const link of pendingLinks) {
      const parentId = importedIds.get(link.parentKey) ?? existingIds.get(link.parentKey);
      if (parentId && parentId !== link.id) linkToTemplate.run(parentId, link.id, req.user.id);
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

    if (Array.isArray(backupNotes)) {
      for (const n of backupNotes) {
        const date = validateDayAssigned(n.date);
        const note = sanitizeDayNote(n.note ?? '');
        if (!date || note === '') { notesSkipped++; continue; }
        const result = insertNote.run(
          req.user.id,
          date,
          note,
          cleanIsoDatetime(n.updated_at) || new Date().toISOString(),
        );
        if (result.changes > 0) notesImported++; else notesSkipped++;
      }
    }
  });

  run();
  res.json({ imported, skipped, examsImported, examsSkipped, notesImported, notesSkipped });
});

module.exports = router;
