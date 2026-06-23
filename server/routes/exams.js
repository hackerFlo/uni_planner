const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');
const { sanitizeTitle, validateDayAssigned } = require('../middleware/validate');

const router = express.Router();
router.use(requireAuth);

function validateExamId(id) {
  const n = parseInt(id, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

router.get('/', (req, res) => {
  const exams = db.prepare(
    'SELECT id, title, exam_date FROM exams WHERE user_id = ? ORDER BY exam_date ASC'
  ).all(req.user.id);
  res.json({ exams });
});

router.post('/', (req, res) => {
  const title = sanitizeTitle(req.body.title);
  if (!title) return res.status(400).json({ error: 'Title is required (1–200 chars)' });

  const examDate = validateDayAssigned(req.body.exam_date);
  if (!examDate) return res.status(400).json({ error: 'exam_date must be a valid YYYY-MM-DD date' });

  const result = db.prepare(
    'INSERT INTO exams (user_id, title, exam_date) VALUES (?, ?, ?)'
  ).run(req.user.id, title, examDate);

  const exam = db.prepare('SELECT id, title, exam_date FROM exams WHERE id = ? AND user_id = ?').get(result.lastInsertRowid, req.user.id);
  res.status(201).json({ exam });
});

router.patch('/:id', (req, res) => {
  const examId = validateExamId(req.params.id);
  if (!examId) return res.status(400).json({ error: 'Invalid id' });

  const updates = {};
  if (req.body.title !== undefined) {
    const title = sanitizeTitle(req.body.title);
    if (!title) return res.status(400).json({ error: 'Title is required (1–200 chars)' });
    updates.title = title;
  }
  if (req.body.exam_date !== undefined) {
    const examDate = validateDayAssigned(req.body.exam_date);
    if (!examDate) return res.status(400).json({ error: 'exam_date must be a valid YYYY-MM-DD date' });
    updates.exam_date = examDate;
  }

  if (!Object.keys(updates).length) return res.status(400).json({ error: 'Nothing to update' });

  const set = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const result = db.prepare(
    `UPDATE exams SET ${set}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND user_id = ?`
  ).run(...Object.values(updates), examId, req.user.id);

  if (result.changes === 0) return res.status(404).json({ error: 'Exam not found' });

  const exam = db.prepare('SELECT id, title, exam_date FROM exams WHERE id = ? AND user_id = ?').get(examId, req.user.id);
  res.json({ exam });
});

router.delete('/:id', (req, res) => {
  const examId = validateExamId(req.params.id);
  if (!examId) return res.status(400).json({ error: 'Invalid id' });

  const result = db.prepare('DELETE FROM exams WHERE id = ? AND user_id = ?').run(examId, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Exam not found' });

  res.json({ ok: true });
});

module.exports = router;
