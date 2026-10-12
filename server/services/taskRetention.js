const { z } = require('zod');
const { idSchema, dateSchema, parse } = require('../domain/schemas');
const { DomainError } = require('../domain/errors');
const { isRecurrenceDay } = require('../recurrence');

const cleanupSchema = z.strictObject({ before: dateSchema });
const EXPIRED_OPEN = 'user_id=? AND completed=0 AND archived=0 AND day_assigned<?';

function replacementRoot(db, userId, template, before) {
  const candidates = db.prepare(`SELECT * FROM todos WHERE user_id=? AND recurrence_parent_id=?
    AND day_assigned IS NOT NULL AND (day_assigned>=? OR completed=1 OR archived=1)
    ORDER BY day_assigned,id`).iterate(userId, template.id, before);
  for (const candidate of candidates) {
    if (isRecurrenceDay(template, candidate.day_assigned)) return candidate;
  }
  throw new DomainError('CONFLICT', 'Materialize recurring tasks before removing expired tasks', 409);
}

function promoteRoot(db, userId, template, before) {
  const replacement = replacementRoot(db, userId, template, before);
  db.prepare(`UPDATE todos SET recurrence_parent_id=NULL,recurrence_interval_days=?,recurrence_pattern=?
    WHERE user_id=? AND id=?`).run(template.recurrence_interval_days, template.recurrence_pattern, userId, replacement.id);
  db.prepare('UPDATE todos SET recurrence_parent_id=? WHERE user_id=? AND recurrence_parent_id=?')
    .run(replacement.id, userId, template.id);
}

function cleanup(db, context, input) {
  const userId = parse(idSchema, context?.userId);
  const { before } = parse(cleanupSchema, input);
  // The caller must materialize the current/next week first so an expired rule
  // carrier can be deleted without stopping its series or shifting its cadence.
  return db.transaction(() => {
    const roots = db.prepare(`SELECT * FROM todos WHERE ${EXPIRED_OPEN} AND recurrence_parent_id IS NULL
      AND (recurrence_interval_days IS NOT NULL OR recurrence_pattern IS NOT NULL) ORDER BY id`).all(userId, before);
    for (const template of roots) promoteRoot(db, userId, template, before);
    const removedIds = db.prepare(`SELECT id FROM todos WHERE ${EXPIRED_OPEN} ORDER BY id`)
      .all(userId, before).map(row => row.id);
    db.prepare(`DELETE FROM todos WHERE ${EXPIRED_OPEN}`).run(userId, before);
    return { removedIds };
  })();
}

function createTaskRetentionService(db) {
  return { cleanup: (context, input) => cleanup(db, context, input) };
}

module.exports = { createTaskRetentionService };
