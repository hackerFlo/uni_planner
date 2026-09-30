const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { randomUUID } = require('node:crypto');
const { migrateDomain } = require('../domain/migrations');
const { createMutationService } = require('../domain/mutation');
const { createUndoService } = require('./undo');

function fixture() {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE users(id INTEGER PRIMARY KEY); INSERT INTO users VALUES(1),(2); CREATE TABLE day_notes(user_id INTEGER,date TEXT,note TEXT,PRIMARY KEY(user_id,date))');
  migrateDomain(db);
  let clock = 100000;
  const mutations = createMutationService(db, { now: () => clock });
  const context = { userId: 1, actor: 'web' };
  const control = () => ({ expectedVersion: mutations.version(context), idempotencyKey: randomUUID() });
  const undo = createUndoService(db, mutations, { now: () => clock });
  const originalControl = control();
  const action = () => {
    db.prepare('INSERT INTO day_notes VALUES(1,?,?)').run('2026-09-26', 'note');
    return { data: {}, inverse: { type: 'day_note', payload: { date: '2026-09-26', note: null } } };
  };
  const result = mutations.run(context, 'set_day_note', {}, originalControl, action);
  return { db, mutations, context, control, undo, result, action, originalControl, advance: () => { clock += 31000; } };
}

test('undo restores once; receipt replay does not invert twice or reapply original action', () => {
  const f = fixture();
  const controls = f.control();
  const undone = f.undo.undo(f.context, f.result.operationId, controls);
  assert.equal(f.db.prepare('SELECT count(*) n FROM day_notes').get().n, 0);
  assert.equal(undone.undoAvailable, false);
  assert.equal(f.undo.undo(f.context, f.result.operationId, controls).replayed, true);
  const replay = f.mutations.run(f.context, 'set_day_note', {}, f.originalControl, f.action);
  assert.equal(replay.operationUndone, true);
  assert.equal(replay.currentVersion.revision, undone.currentVersion.revision);
  assert.notEqual(replay.currentVersion.revision, replay.resultVersion.revision);
  f.db.close();
});

test('foreign, expired and concurrent edits prevent undo without touching data', () => {
  const f = fixture();
  const bob = { userId: 2, actor: 'web' };
  assert.throws(() => f.undo.undo(bob, f.result.operationId, {
    expectedVersion: f.mutations.version(bob), idempotencyKey: randomUUID(),
  }), { code: 'NOT_FOUND' });
  f.db.prepare('UPDATE day_notes SET note=? WHERE user_id=1').run('new human edit');
  assert.throws(() => f.undo.undo(f.context, f.result.operationId, f.control()), { code: 'UNDO_CONFLICT' });
  f.advance();
  assert.throws(() => f.undo.undo(f.context, f.result.operationId, f.control()), { code: 'UNDO_EXPIRED' });
  assert.equal(f.db.prepare('SELECT note FROM day_notes WHERE user_id=1').get().note, 'new human edit');
  f.db.close();
});
