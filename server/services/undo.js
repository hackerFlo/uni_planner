const { z } = require('zod');
const { DomainError } = require('../domain/errors');
const { dateSchema, parse } = require('../domain/schemas');

const noteInverse = z.strictObject({ date: dateSchema, note: z.string().max(200).nullable() });

function restoreNote(db, context, raw) {
  const { date, note } = parse(noteInverse, raw);
  if (note === null) db.prepare('DELETE FROM day_notes WHERE user_id=? AND date=?').run(context.userId, date);
  else db.prepare(`INSERT INTO day_notes(user_id,date,note) VALUES(?,?,?)
    ON CONFLICT(user_id,date) DO UPDATE SET note=excluded.note`).run(context.userId, date, note);
}

function loadOperation(db, context, id, current, now) {
  const row = db.prepare('SELECT * FROM planner_operations WHERE user_id=? AND id=?').get(context.userId, id);
  if (!row) throw new DomainError('NOT_FOUND', 'Operation not found', 404);
  if (row.expires_at <= now || !row.inverse) throw new DomainError('UNDO_EXPIRED', 'Undo has expired', 409);
  if (row.undone || row.epoch !== current.epoch || row.revision !== current.revision) {
    throw new DomainError('UNDO_CONFLICT', 'Planner changed after this operation', 409);
  }
  return row;
}

function createUndoService(db, mutations, { now = Date.now, handlers = {} } = {}) {
  const registry = Object.freeze({ day_note: (context, payload) => restoreNote(db, context, payload), ...handlers });
  function undo(context, operationId, controls) {
    parse(z.uuid(), operationId);
    return mutations.run(context, 'undo_operation', { operationId }, controls, () => {
      const row = loadOperation(db, context, operationId, mutations.version(context), now());
      const inverse = JSON.parse(row.inverse);
      if (!Object.hasOwn(registry, inverse.type)) throw new DomainError('FORBIDDEN', 'This operation cannot be undone', 403);
      registry[inverse.type](context, inverse.payload);
      db.prepare('UPDATE planner_operations SET undone=1, inverse=NULL WHERE user_id=? AND id=?')
        .run(context.userId, operationId);
      return { data: { undone: operationId }, changed: true };
    });
  }
  return { undo };
}

module.exports = { createUndoService };
