const { z } = require('zod');
const { dateSchema, parse } = require('../domain/schemas');
const { sanitizeDayNote } = require('../middleware/validate');

const dayNoteSchemas = { set: z.strictObject({ date: dateSchema, note: z.string().max(32768).transform(sanitizeDayNote) }) };

function setNote(db, userId, { date, note }) {
  if (!note) db.prepare('DELETE FROM day_notes WHERE user_id = ? AND date = ?').run(userId, date);
  else db.prepare(`INSERT INTO day_notes (user_id, date, note, updated_at)
    VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(user_id, date) DO UPDATE SET note = excluded.note, updated_at = excluded.updated_at`)
    .run(userId, date, note);
  return { date, note };
}

function createDayNoteService(db) {
  return {
    list: ({ userId }) => db.prepare('SELECT date, note FROM day_notes WHERE user_id = ? ORDER BY date ASC').all(userId),
    set: ({ userId }, args) => setNote(db, userId, parse(dayNoteSchemas.set, args)),
  };
}

module.exports = { createDayNoteService, dayNoteSchemas };
