const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-retention-maintenance-'));
process.env.DATABASE_PATH = path.join(dir, 'planner.db');
process.env.LOG_LEVEL = 'error';
const db = require('../db');
const { createTodoService } = require('./todos');
const { createMutationService } = require('../domain/mutation');
const service = createTodoService(db);
const mutations = createMutationService(db);
const now = new Date('2026-10-25T23:30:00Z');
function account(name, timezone = 'Europe/Berlin') {
  const userId = db.prepare('INSERT INTO users(email,password_hash,notify_tz) VALUES(?,?,?)')
    .run(`${name}@example.com`, 'synthetic', timezone).lastInsertRowid;
  const listId = db.prepare('INSERT INTO lists(user_id,name,color) VALUES(?,?,?)').run(userId, 'Tasks', 'indigo').lastInsertRowid;
  return { userId, listId, actor: 'web' };
}
const alice = account('alice');
const bob = account('bob', 'America/Los_Angeles');
function task(context, day, extra = {}) {
  const fields = { user_id: context.userId, list_id: context.listId, title: 'Synthetic', day_assigned: day, ...extra };
  return db.prepare(`INSERT INTO todos(${Object.keys(fields).join(',')}) VALUES(${Object.keys(fields).map(() => '?').join(',')})`)
    .run(...Object.values(fields)).lastInsertRowid;
}
const rows = () => db.prepare('SELECT * FROM todos ORDER BY id').all();
const maintain = (context, date = now) => mutations.maintain(context, () => ({ data: service.materialize(context, date), changed: false }));
test.beforeEach(() => db.prepare('DELETE FROM todos').run());
test.after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test('maintenance deletes only expired open assignments using the account calendar and one revision', () => {
  task(alice, '2026-10-18');
  const retained = [task(alice, '2026-10-19'), task(alice, '2027-01-01'), task(alice, null),
    task(alice, '2026-10-01', { completed: 1 }), task(alice, '2026-10-01', { archived: 1 }), task(bob, '2026-10-18')];
  const original = rows().filter(row => retained.includes(row.id));
  const before = mutations.version(alice);
  const result = maintain(alice);
  assert.equal(result.data.expiredTaskCount, 1);
  assert.equal(result.version.revision, before.revision + 1);
  assert.deepEqual(rows(), original);
  assert.deepEqual(maintain(alice).version, result.version);
});

test('the same instant does not expire a previous-week assignment in a western timezone', () => {
  const retained = task(bob, '2026-10-12');
  const expired = task(bob, '2026-10-11');
  maintain(bob);
  assert.deepEqual(rows().map(row => row.id), [retained]);
  assert.equal(service.get(bob, retained).todo.day_assigned, '2026-10-12');
  assert.throws(() => service.get(bob, expired), { code: 'NOT_FOUND' });
});

test('maintenance materializes then expires old recurring occurrences without stopping the series', () => {
  const root = task(alice, '2026-10-01', { recurrence_interval_days: 3 });
  maintain(alice);
  assert.equal(rows().some(row => row.id === root), false);
  const dates = rows().map(row => row.day_assigned);
  assert.deepEqual(dates, ['2026-10-28', '2026-10-31', '2026-11-03', '2026-11-06']);
  const before = rows();
  maintain(alice);
  assert.deepEqual(rows(), before);
  maintain(alice, new Date('2026-11-09T12:00:00Z'));
  assert.ok(rows().some(row => row.day_assigned === '2026-11-21'));
});

test('cleanup and recurrence materialization roll back together if expiration fails', () => {
  task(alice, '2026-10-01', { recurrence_interval_days: 1 });
  db.exec(`CREATE TEMP TRIGGER reject_expiration BEFORE DELETE ON todos
    BEGIN SELECT RAISE(ABORT,'synthetic expiration failure'); END`);
  const before = rows();
  const version = mutations.version(alice);
  try {
    assert.throws(() => maintain(alice), /synthetic expiration failure/);
    assert.deepEqual(rows(), before);
    assert.deepEqual(mutations.version(alice), version);
  } finally { db.exec('DROP TRIGGER reject_expiration'); }
});

test('ordinary task reads neither delete nor generate occurrences', () => {
  const root = task(alice, '2026-01-01', { recurrence_interval_days: 1 });
  const before = rows();
  service.list(alice);
  service.page(alice, {});
  service.get(alice, root);
  assert.deepEqual(rows(), before);
});

test('changing a retained historical recurrence after cleanup leaves only the intended series active', () => {
  const root = task(alice, '2026-10-01', { recurrence_interval_days: 1 });
  const done = task(alice, '2026-10-05', { recurrence_parent_id: root, completed: 1, archived: 1,
    completed_at: '2026-10-05T09:00:00.000Z' });
  const archived = task(alice, '2026-10-06', { recurrence_parent_id: root, archived: 1 });
  maintain(alice);
  service.update(alice, { id: archived, recurrence_interval_days: 3, recurrence_pattern: null });
  assert.deepEqual(rows().filter(row => row.recurrence_interval_days !== null).map(row => row.id), [archived]);
  assert.equal(rows().some(row => row.id === root), false);
  assert.equal(service.get(alice, done).todo.recurrence_interval_days, null);
  assert.equal(service.get(alice, done).todo.completed_at, '2026-10-05T09:00:00.000Z');
});
