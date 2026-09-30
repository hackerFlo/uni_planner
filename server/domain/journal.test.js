const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { createJournal } = require('./journal');

test('journal restores exact affected rows and leaves other owners untouched', () => {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE exams(id INTEGER PRIMARY KEY,user_id INTEGER,title TEXT);
    INSERT INTO exams VALUES(1,1,'old'),(2,2,'foreign');`);
  const journal = createJournal(db);
  const ctx = { userId: 1 };
  const result = journal.capture(ctx, ['exams'], () => {
    db.prepare('DELETE FROM exams WHERE id=1 AND user_id=1').run();
    db.prepare('INSERT INTO exams VALUES(3,1,?)').run('new');
    return { ok: true };
  });
  journal.restore(ctx, result.inverse.payload);
  assert.deepEqual(db.prepare('SELECT * FROM exams ORDER BY id').all(), [
    { id: 1, user_id: 1, title: 'old' }, { id: 2, user_id: 2, title: 'foreign' },
  ]);
  db.close();
});

test('journal rejects wrong owners, altered rows and unapproved tables before restoration', () => {
  const db = new Database(':memory:');
  db.exec("CREATE TABLE exams(id INTEGER PRIMARY KEY,user_id INTEGER,title TEXT); INSERT INTO exams VALUES(1,1,'old')");
  const journal = createJournal(db);
  const ctx = { userId: 1 };
  const result = journal.capture(ctx, ['exams'], () => {
    db.prepare("UPDATE exams SET title='new' WHERE user_id=1").run();
    return {};
  });
  assert.throws(() => journal.restore({ userId: 2 }, result.inverse.payload), { code: 'UNDO_CONFLICT' });
  db.prepare("UPDATE exams SET title='human' WHERE user_id=1").run();
  assert.throws(() => journal.restore(ctx, result.inverse.payload), { code: 'UNDO_CONFLICT' });
  assert.throws(() => journal.capture(ctx, ['users'], () => {}), { code: 'FORBIDDEN' });
  assert.equal(db.prepare('SELECT title FROM exams WHERE id=1').get().title, 'human');
  db.close();
});

test('combined multi-table changes beyond recovery limit never advertise unusable undo', () => {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE exams(id INTEGER PRIMARY KEY,user_id INTEGER,title TEXT); CREATE TABLE lists(id INTEGER PRIMARY KEY,user_id INTEGER,name TEXT)');
  db.transaction(() => { for (let id = 1; id <= 2501; id++) {
    db.prepare("INSERT INTO exams VALUES(?,1,'a')").run(id);
    db.prepare("INSERT INTO lists VALUES(?,1,'a')").run(id);
  } })();
  const result = createJournal(db).capture({ userId: 1 }, ['exams', 'lists'], () => {
    db.exec("UPDATE exams SET title='b' WHERE user_id=1; UPDATE lists SET name='b' WHERE user_id=1");
    return { ok: true };
  });
  assert.equal(result.inverse, undefined);
  assert.equal(result.undoReason, 'Operation exceeds recovery limits');
  db.close();
});
