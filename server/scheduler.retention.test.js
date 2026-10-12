const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-scheduler-retention-'));
process.env.DATABASE_PATH = path.join(dir, 'planner.db');
process.env.LOG_LEVEL = 'error';
const db = require('./db');
const { maintainPlanners } = require('./scheduler');
let seq = 0;
function account(timezone = 'UTC') {
  const userId = db.prepare('INSERT INTO users(email,password_hash,notify_tz) VALUES(?,?,?)')
    .run(`scheduler-${++seq}@example.com`, 'synthetic', timezone).lastInsertRowid;
  const listId = db.prepare('INSERT INTO lists(user_id,name) VALUES(?,?)').run(userId, 'Tasks').lastInsertRowid;
  return { userId, listId };
}
function task(owner, date, completed = 0) {
  return db.prepare('INSERT INTO todos(user_id,list_id,title,day_assigned,completed) VALUES(?,?,?,?,?)')
    .run(owner.userId, owner.listId, 'Synthetic', date, completed).lastInsertRowid;
}
const read = id => db.prepare('SELECT * FROM todos WHERE id=?').get(id);
test.after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test('scheduler catches up away from midnight for accounts with no recurring tasks', async () => {
  const owner = account();
  const expired = task(owner, '2026-10-11');
  const retained = [task(owner, '2026-10-12'), task(owner, null), task(owner, '2026-01-01', 1)];
  const originals = retained.map(read);
  const now = new Date('2026-10-19T12:30:00Z');
  await maintainPlanners(now);
  assert.equal(read(expired), undefined);
  assert.deepEqual(retained.map(read), originals);
  const version = db.prepare('SELECT revision FROM planner_versions WHERE user_id=?').get(owner.userId);
  await maintainPlanners(now);
  assert.deepEqual(db.prepare('SELECT revision FROM planner_versions WHERE user_id=?').get(owner.userId), version);
});

test('scheduler honors local Monday rollover and retries failed owners without blocking others', async () => {
  const alice = account('Europe/Berlin');
  const bob = account('America/Los_Angeles');
  const oldAlice = task(alice, '2026-10-18');
  const oldBob = task(bob, '2026-10-11');
  const retainedBob = task(bob, '2026-10-12');
  db.exec(`CREATE TEMP TRIGGER fail_owner_cleanup BEFORE DELETE ON todos WHEN OLD.user_id=${alice.userId}
    BEGIN SELECT RAISE(ABORT,'synthetic owner cleanup failure'); END`);
  const now = new Date('2026-10-25T23:30:00Z');
  try {
    await maintainPlanners(now);
    assert.ok(read(oldAlice));
    assert.equal(read(oldBob), undefined);
    assert.ok(read(retainedBob));
  } finally { db.exec('DROP TRIGGER fail_owner_cleanup'); }
  await maintainPlanners(now);
  assert.equal(read(oldAlice), undefined);
});
