const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-task-retention-'));
process.env.DATABASE_PATH = path.join(dir, 'isolated.db');
process.env.LOG_LEVEL = 'error';
const db = require('../db');
const { createTaskRetentionService } = require('./taskRetention');
const { createRecurrenceService, getWindowBounds, addDays } = require('../recurrence');
const service = createTaskRetentionService(db);
const BEFORE = '2026-10-12';
function account(name) {
  const userId = db.prepare('INSERT INTO users(email,password_hash) VALUES(?,?)').run(`${name}@example.com`, 'synthetic').lastInsertRowid;
  const listId = db.prepare('INSERT INTO lists(user_id,name,color,sort_order) VALUES(?,?,?,0)').run(userId, 'Tasks', 'indigo').lastInsertRowid;
  return { userId, listId, actor: 'system' };
}
const alice = account('alice');
const bob = account('bob');
function task(context = alice, overrides = {}) {
  const row = { user_id: context.userId, list_id: context.listId, title: 'Synthetic task', description: '<b>Keep content</b>',
    day_assigned: null, completed: 0, archived: 0, recurrence_parent_id: null,
    recurrence_interval_days: null, recurrence_pattern: null, ...overrides };
  const columns = Object.keys(row);
  return db.prepare(`INSERT INTO todos(${columns.join(',')}) VALUES(${columns.map(() => '?').join(',')})`)
    .run(...Object.values(row)).lastInsertRowid;
}
const read = id => db.prepare('SELECT * FROM todos WHERE id=?').get(id);
const snapshot = () => db.prepare('SELECT * FROM todos ORDER BY id').all();
test.beforeEach(() => db.prepare('DELETE FROM todos').run());
test.after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test('cleanup deletes only the owner\'s old assigned open tasks before the inclusive retained boundary', () => {
  const expired = task(alice, { day_assigned: '2026-10-11' });
  const retained = [task(alice, { day_assigned: BEFORE }), task(alice, { day_assigned: '2027-01-01' }),
    task(), task(alice, { day_assigned: '2026-09-01', completed: 1 }),
    task(alice, { day_assigned: '2026-09-01', archived: 1 }), task(bob, { day_assigned: '2026-09-01' })];
  const originals = retained.map(read);
  assert.deepEqual(service.cleanup(alice, { before: BEFORE }), { removedIds: [expired] });
  assert.deepEqual(snapshot(), originals);
});

test('cleanup is idempotent and a no-op leaves the owner revision unchanged', () => {
  const expired = task(alice, { day_assigned: '2026-10-11' });
  service.cleanup(alice, { before: BEFORE });
  const version = db.prepare('SELECT revision FROM planner_versions WHERE user_id=?').get(alice.userId);
  assert.deepEqual(service.cleanup(alice, { before: BEFORE }), { removedIds: [] });
  assert.deepEqual(db.prepare('SELECT revision FROM planner_versions WHERE user_id=?').get(alice.userId), version);
  assert.equal(read(expired), undefined);
});

for (const [rule, date] of [
  [{ recurrence_interval_days: 1 }, BEFORE],
  [{ recurrence_interval_days: 3 }, '2026-10-13'],
  [{ recurrence_interval_days: 7 }, BEFORE],
  [{ recurrence_pattern: 'weekdays' }, BEFORE],
  [{ recurrence_pattern: 'weekends' }, '2026-10-17'],
]) {
  test(`cleanup preserves the series by promoting its earliest retained ${JSON.stringify(rule)} occurrence`, () => {
    const root = task(alice, { day_assigned: '2026-09-28', ...rule });
    const expiredChild = task(alice, { day_assigned: '2026-10-01', recurrence_parent_id: root });
    const promoted = task(alice, { day_assigned: date, recurrence_parent_id: root });
    const sibling = task(alice, { day_assigned: '2026-10-18', recurrence_parent_id: root });
    assert.deepEqual(service.cleanup(alice, { before: BEFORE }).removedIds, [root, expiredChild]);
    assert.equal(read(promoted).recurrence_parent_id, null);
    assert.equal(read(promoted).recurrence_interval_days, rule.recurrence_interval_days ?? null);
    assert.equal(read(promoted).recurrence_pattern, rule.recurrence_pattern ?? null);
    assert.equal(read(sibling).recurrence_parent_id, promoted);
  });
}

test('promotion skips an earlier moved child off the original interval cadence', () => {
  const root = task(alice, { day_assigned: '2026-09-28', recurrence_interval_days: 3 });
  const moved = task(alice, { day_assigned: BEFORE, recurrence_parent_id: root });
  const matching = task(alice, { day_assigned: '2026-10-13', recurrence_parent_id: root });
  service.cleanup(alice, { before: BEFORE });
  assert.equal(read(moved).recurrence_parent_id, matching);
  assert.equal(read(matching).recurrence_parent_id, null);
});

test('promotion skips a moved weekday occurrence on a weekend', () => {
  const root = task(alice, { day_assigned: '2026-09-28', recurrence_pattern: 'weekdays' });
  const moved = task(alice, { day_assigned: '2026-10-17', recurrence_parent_id: root });
  const matching = task(alice, { day_assigned: '2026-10-19', recurrence_parent_id: root });
  service.cleanup(alice, { before: BEFORE });
  assert.equal(read(moved).recurrence_parent_id, matching);
  assert.equal(read(matching).recurrence_parent_id, null);
});

test('promotion retains completed archived and unassigned siblings with only their parent reference changed', () => {
  const root = task(alice, { day_assigned: '2026-09-28', recurrence_interval_days: 3 });
  const promoted = task(alice, { day_assigned: '2026-10-13', recurrence_parent_id: root, completed: 1, archived: 1,
    completed_at: '2026-10-13T09:00:00.000Z' });
  const siblings = [task(alice, { day_assigned: '2026-09-29', recurrence_parent_id: root, completed: 1 }),
    task(alice, { day_assigned: '2026-09-30', recurrence_parent_id: root, archived: 1 }),
    task(alice, { recurrence_parent_id: root })];
  const beforePromotion = read(promoted);
  const beforeSiblings = siblings.map(read);
  service.cleanup(alice, { before: BEFORE });
  assert.deepEqual(read(promoted), { ...beforePromotion, recurrence_parent_id: null, recurrence_interval_days: 3 });
  assert.deepEqual(siblings.map(read), beforeSiblings.map(row => ({ ...row, recurrence_parent_id: promoted })));
});

test('promotion prefers the earliest retained completed or archived cadence occurrence before the cutoff', () => {
  const root = task(alice, { day_assigned: '2026-09-28', recurrence_interval_days: 1 });
  const expiredChild = task(alice, { day_assigned: '2026-09-30', recurrence_parent_id: root });
  const done = task(alice, { day_assigned: '2026-10-01', recurrence_parent_id: root, completed: 1, archived: 1 });
  const archived = task(alice, { day_assigned: '2026-10-02', recurrence_parent_id: root, archived: 1 });
  const current = task(alice, { day_assigned: BEFORE, recurrence_parent_id: root });
  const doneBefore = read(done);
  const otherBefore = [archived, current].map(read);
  assert.deepEqual(service.cleanup(alice, { before: BEFORE }), { removedIds: [root, expiredChild] });
  assert.deepEqual(read(done), { ...doneBefore, recurrence_parent_id: null, recurrence_interval_days: 1 });
  assert.deepEqual([archived, current].map(read), otherBefore.map(row => ({ ...row, recurrence_parent_id: done })));
});

test('completed and archived recurring roots remain unchanged and keep their children', () => {
  const roots = [task(alice, { day_assigned: '2026-09-28', recurrence_interval_days: 1, completed: 1 }),
    task(alice, { day_assigned: '2026-09-28', recurrence_pattern: 'weekends', archived: 1 })];
  roots.forEach(id => task(alice, { day_assigned: BEFORE, recurrence_parent_id: id }));
  const beforeCleanup = snapshot();
  assert.deepEqual(service.cleanup(alice, { before: BEFORE }), { removedIds: [] });
  assert.deepEqual(snapshot(), beforeCleanup);
});

test('promotion cannot select or reparent foreign children even if their stored parent references the owned root', () => {
  const root = task(alice, { day_assigned: '2026-09-28', recurrence_interval_days: 1 });
  const foreign = task(bob, { day_assigned: BEFORE, recurrence_parent_id: root });
  const matching = task(alice, { day_assigned: '2026-10-13', recurrence_parent_id: root });
  const foreignBefore = read(foreign);
  service.cleanup(alice, { before: BEFORE });
  assert.deepEqual(read(foreign), foreignBefore);
  assert.equal(read(matching).recurrence_parent_id, null);
});

test('missing materialized cadence child rolls back earlier promotions deletions and revisions', () => {
  const root = task(alice, { day_assigned: '2026-09-28', recurrence_interval_days: 1 });
  task(alice, { day_assigned: BEFORE, recurrence_parent_id: root });
  task(alice, { day_assigned: '2026-09-28', recurrence_interval_days: 3 });
  const beforeCleanup = snapshot();
  const version = db.prepare('SELECT revision FROM planner_versions WHERE user_id=?').get(alice.userId);
  assert.throws(() => service.cleanup(alice, { before: BEFORE }), { code: 'CONFLICT' });
  assert.deepEqual(snapshot(), beforeCleanup);
  assert.deepEqual(db.prepare('SELECT revision FROM planner_versions WHERE user_id=?').get(alice.userId), version);
});

test('materializing before cleanup continues a series whose children were all moved without resurrecting expired dates', () => {
  const now = new Date('2026-10-21T12:00:00.000Z');
  const { windowStart } = getWindowBounds('UTC', now);
  const before = addDays(windowStart, -7);
  const root = task(alice, { day_assigned: addDays(before, -14), recurrence_interval_days: 3 });
  const moved = task(alice, { day_assigned: null, recurrence_parent_id: root });
  const recurrence = createRecurrenceService(db);
  recurrence.materializeWindowForUser(alice.userId, 'UTC', now);
  service.cleanup(alice, { before });
  const afterCleanup = snapshot();
  assert.equal(read(root), undefined);
  assert.notEqual(read(moved).recurrence_parent_id, root);
  assert.equal(recurrence.materializeWindowForUser(alice.userId, 'UTC', now), 0);
  assert.deepEqual(snapshot(), afterCleanup);
  assert.ok(afterCleanup.filter(row => row.day_assigned).every(row => row.day_assigned >= before));
  assert.equal(recurrence.materializeWindowForUser(alice.userId, 'UTC', new Date('2026-11-04T12:00:00.000Z')), 5);
  assert.deepEqual(snapshot().filter(row => row.day_assigned >= '2026-11-02').map(row => row.day_assigned),
    ['2026-11-03', '2026-11-06', '2026-11-09', '2026-11-12', '2026-11-15']);
});

test('strict owner and calendar boundary validation rejects invalid inputs before any deletion', () => {
  task(alice, { day_assigned: '2026-09-28' });
  const beforeCleanup = snapshot();
  for (const context of [null, {}, { userId: 0 }, { userId: String(alice.userId) }]) {
    assert.throws(() => service.cleanup(context, { before: BEFORE }), { code: 'VALIDATION_ERROR' });
  }
  for (const input of [{}, { before: '2026-02-30' }, { before: '0000-01-01' }, { before: BEFORE, user_id: bob.userId }]) {
    assert.throws(() => service.cleanup(alice, input), { code: 'VALIDATION_ERROR' });
  }
  assert.deepEqual(snapshot(), beforeCleanup);
});
