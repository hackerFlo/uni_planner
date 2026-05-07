const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');
const { sanitizeDayNote } = require('../middleware/validate');

const router = express.Router();
router.use(requireAuth);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

router.get('/', (req, res) => {
  const notes = db.prepare('SELECT date, note FROM day_notes WHERE user_id = ? ORDER BY date ASC').all(req.user.id);
  res.json({ notes });
});

router.put('/:date', (req, res) => {
  const { date } = req.params;
  if (!DATE_RE.test(date)) return res.status(400).json({ error: 'Invalid date format (expected YYYY-MM-DD)' });

  const note = sanitizeDayNote(req.body.note ?? '');

  if (note === '') {
    db.prepare('DELETE FROM day_notes WHERE user_id = ? AND date = ?').run(req.user.id, date);
  } else {
    db.prepare(
      `INSERT INTO day_notes (user_id, date, note, updated_at)
       VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       ON CONFLICT(user_id, date) DO UPDATE SET note = excluded.note, updated_at = excluded.updated_at`
    ).run(req.user.id, date, note);
  }

  res.json({ date, note });
});

module.exports = router;
