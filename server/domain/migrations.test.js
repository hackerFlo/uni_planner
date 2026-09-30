const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { migrateDomain } = require('./migrations');

function legacy(t) {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.pragma('foreign_keys = ON');
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY);
    INSERT INTO users VALUES(1),(2);
    CREATE TABLE lists(id INTEGER PRIMARY KEY,user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,name TEXT);
    INSERT INTO lists VALUES(1,1,'existing'),(2,2,'other');
    CREATE TABLE day_notes(user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,date TEXT,note TEXT,PRIMARY KEY(user_id,date));
    INSERT INTO day_notes VALUES(1,'2026-09-27','existing note');`);
  return db;
}
const version = (db, id) => db.prepare('SELECT epoch,revision FROM planner_versions WHERE user_id=?').get(id);

test('legacy migration preserves content and creates distinct valid account epochs', t => {
  const db = legacy(t);
  migrateDomain(db);
  assert.deepEqual(db.prepare('SELECT * FROM lists ORDER BY id').all(), [
    { id: 1, user_id: 1, name: 'existing' }, { id: 2, user_id: 2, name: 'other' },
  ]);
  assert.match(version(db, 1).epoch, /^[a-f0-9]{32}$/);
  assert.match(version(db, 2).epoch, /^[a-f0-9]{32}$/);
  assert.notEqual(version(db, 1).epoch, version(db, 2).epoch);
  assert.equal(version(db, 1).revision, 0);
});

test('running migration twice preserves versions, receipts and undo records', t => {
  const db = legacy(t);
  migrateDomain(db);
  db.prepare('UPDATE lists SET name=? WHERE id=1').run('updated');
  const before = version(db, 1);
  db.prepare('INSERT INTO mutation_receipts VALUES(?,?,?,?,?,?,?)')
    .run(1, before.epoch, 'update_list', 'retry-key', 'hash', '{}', 1000);
  db.prepare('INSERT INTO planner_operations VALUES(?,?,?,?,?,?,?,?,?)')
    .run('operation', 1, 'update_list', 'web', before.epoch, before.revision, '{}', 1000, 0);
  migrateDomain(db);
  assert.deepEqual(version(db, 1), before);
  assert.equal(db.prepare('SELECT count(*) n FROM mutation_receipts').get().n, 1);
  assert.equal(db.prepare('SELECT count(*) n FROM planner_operations').get().n, 1);
  db.prepare('UPDATE lists SET name=? WHERE id=1').run('updated again');
  assert.equal(version(db, 1).revision, before.revision + 1);
});

test('legacy insert, update and delete each advance only the owning account', t => {
  const db = legacy(t);
  migrateDomain(db);
  const other = version(db, 2);
  db.prepare('INSERT INTO lists VALUES(3,1,?)').run('new');
  assert.equal(version(db, 1).revision, 1);
  db.prepare('UPDATE lists SET name=? WHERE id=3').run('edited');
  assert.equal(version(db, 1).revision, 2);
  db.prepare('DELETE FROM lists WHERE id=3').run();
  assert.equal(version(db, 1).revision, 3);
  assert.deepEqual(version(db, 2), other);
});

test('legacy composite-key rows participate and rollback their trigger revisions atomically', t => {
  const db = legacy(t);
  migrateDomain(db);
  db.prepare('UPDATE day_notes SET note=? WHERE user_id=? AND date=?').run('new note', 1, '2026-09-27');
  const before = version(db, 1);
  assert.throws(db.transaction(() => {
    db.prepare('DELETE FROM day_notes WHERE user_id=?').run(1);
    throw new Error('rollback');
  }), /rollback/);
  assert.deepEqual(version(db, 1), before);
  assert.equal(db.prepare('SELECT note FROM day_notes WHERE user_id=1').get().note, 'new note');
});

test('accounts created after migration receive a version and deletions cascade ephemeral state', t => {
  const db = legacy(t);
  migrateDomain(db);
  db.prepare('INSERT INTO users VALUES(?)').run(3);
  assert.match(version(db, 3).epoch, /^[a-f0-9]{32}$/);
  assert.equal(version(db, 3).revision, 0);
  db.prepare('INSERT INTO mutation_receipts VALUES(?,?,?,?,?,?,?)')
    .run(3, version(db, 3).epoch, 'create', 'retry', 'hash', '{}', 1000);
  db.prepare('INSERT INTO planner_operations VALUES(?,?,?,?,?,?,?,?,?)')
    .run('operation', 3, 'create', 'web', version(db, 3).epoch, 0, '{}', 1000, 0);
  db.prepare('DELETE FROM users WHERE id=?').run(3);
  assert.equal(version(db, 3), undefined);
  assert.equal(db.prepare('SELECT count(*) n FROM mutation_receipts WHERE user_id=3').get().n, 0);
  assert.equal(db.prepare('SELECT count(*) n FROM planner_operations WHERE user_id=3').get().n, 0);
});

test('rerunning migration installs tracking for tables introduced in later milestones', t => {
  const db = legacy(t);
  migrateDomain(db);
  db.exec('CREATE TABLE preference_profiles(id TEXT PRIMARY KEY,user_id INTEGER,settings TEXT)');
  migrateDomain(db);
  db.prepare('INSERT INTO preference_profiles VALUES(?,?,?)').run('profile', 1, '{}');
  assert.equal(version(db, 1).revision, 1);
  assert.equal(version(db, 2).revision, 0);
});

for (const table of ['todos', 'day_dividers', 'exams', 'quotes', 'quote_state', 'quote_day']) {
  test(`legacy ${table} rows participate in revision tracking`, t => {
    const db = legacy(t);
    db.exec(`CREATE TABLE ${table}(id INTEGER PRIMARY KEY,user_id INTEGER,value TEXT);
      INSERT INTO ${table} VALUES(1,1,'before')`);
    migrateDomain(db);
    db.prepare(`UPDATE ${table} SET value=? WHERE id=?`).run('after', 1);
    assert.equal(version(db, 1).revision, 1);
    db.prepare(`DELETE FROM ${table} WHERE id=?`).run(1);
    assert.equal(version(db, 1).revision, 2);
    db.prepare(`INSERT INTO ${table} VALUES(?,?,?)`).run(2, 1, 'created');
    assert.equal(version(db, 1).revision, 3);
    assert.equal(version(db, 2).revision, 0);
  });
}

test('notification settings advance the owner revision only when values actually change', t => {
  const db = legacy(t);
  for (const column of ['notify_enabled INTEGER', 'notify_time TEXT', 'notify_email_enc TEXT', 'notify_tz TEXT', 'token_version INTEGER']) {
    db.exec(`ALTER TABLE users ADD COLUMN ${column}`);
  }
  migrateDomain(db);
  migrateDomain(db);
  db.prepare('UPDATE users SET notify_enabled=?,notify_time=?,notify_email_enc=?,notify_tz=? WHERE id=?')
    .run(1, '09:00', 'synthetic-encrypted-value', 'UTC', 1);
  assert.equal(version(db, 1).revision, 1);
  db.prepare('UPDATE users SET notify_tz=? WHERE id=?').run('UTC', 1);
  assert.equal(version(db, 1).revision, 1);
  db.prepare('UPDATE users SET notify_tz=? WHERE id=?').run('Europe/Berlin', 1);
  assert.equal(version(db, 1).revision, 2);
  db.prepare('UPDATE users SET token_version=? WHERE id=?').run(1, 1);
  assert.equal(version(db, 1).revision, 2);
  assert.equal(version(db, 2).revision, 0);
});
