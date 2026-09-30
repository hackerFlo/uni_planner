const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { createListService } = require('./lists');

test('list reads and pagination are owner-scoped and reject stale or foreign cursors', () => {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE lists(id INTEGER PRIMARY KEY, user_id INTEGER, name TEXT, color TEXT, sort_order INTEGER)');
  const insert = db.prepare('INSERT INTO lists VALUES (?, ?, ?, ?, ?)');
  insert.run(1, 1, 'First', 'indigo', 0);
  insert.run(2, 2, 'Private', 'rose', 0);
  insert.run(3, 1, 'Second', 'sky', 1);
  const service = createListService(db);
  assert.deepEqual(service.list({ userId: 1 }).map(l => l.id), [1, 3]);
  const first = service.page({ userId: 1 }, { limit: 1 });
  assert.deepEqual(service.page({ userId: 1 }, { cursor: first.nextCursor, limit: 1 }).lists.map(l => l.id), [3]);
  assert.throws(() => service.page({ userId: 2 }, { cursor: first.nextCursor, limit: 1 }), { code: 'CONFLICT' });
  db.prepare('UPDATE lists SET name = ? WHERE id = ?').run('Changed', 1);
  assert.throws(() => service.page({ userId: 1 }, { cursor: first.nextCursor, limit: 1 }), { code: 'CONFLICT' });
  db.close();
});

test('list pagination rejects malformed and over-limit input', () => {
  const service = createListService({});
  for (const input of [{ limit: 101 }, { limit: 0 }, { user_id: 2 }, { cursor: 'invalid' }]) {
    assert.throws(() => service.page({ userId: 1 }, input), { code: 'VALIDATION_ERROR' });
  }
});

test.describe('shared list mutations', () => {
  let db, service;
  const owner = { userId: 1, actor: 'web' };
  const foreign = { userId: 2, actor: 'web' };
  test.beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`CREATE TABLE lists(id INTEGER PRIMARY KEY, user_id INTEGER, name TEXT, color TEXT, sort_order INTEGER);
      CREATE TABLE todos(id INTEGER PRIMARY KEY, user_id INTEGER, list_id INTEGER, archived INTEGER,
        agent_activity_at TEXT,agent_activity_action TEXT);
      INSERT INTO lists VALUES(1,1,'First','teal',0),(2,1,'Second','sky',1),(3,2,'Foreign','rose',0);
      INSERT INTO todos(id,user_id,list_id,archived) VALUES(1,1,1,0),(2,1,1,1),(3,2,3,0)`);
    service = createListService(db);
  });
  test.afterEach(() => db.close());

  test('create/update normalize names and reject unknown fields', () => {
    const list = service.create(owner, { name: ' Third ', color: 'pink' });
    assert.deepEqual(list, { id: 4, name: 'Third', color: 'pink', sort_order: 2 });
    assert.equal(service.update(owner, { id: list.id, name: ' Renamed ' }).name, 'Renamed');
    assert.throws(() => service.create(owner, { name: 'Nope', color: 'pink', userId: 2 }), { code: 'VALIDATION_ERROR' });
  });

  test('foreign and absent lists have identical mutation errors', () => {
    for (const id of [3, 999]) {
      assert.throws(() => service.update(owner, { id, name: 'Nope' }), { code: 'NOT_FOUND' });
      assert.throws(() => service.remove(owner, { id }), { code: 'NOT_FOUND' });
    }
    assert.equal(service.list(foreign)[0].name, 'Foreign');
  });

  test('reorder demands a strict exact permutation before making any changes', () => {
    for (const order of [[1, 1], [1], [1, 3], ['1', 2], [1, 2, 3]]) {
      assert.throws(() => service.reorder(owner, { order }), { code: 'VALIDATION_ERROR' });
      assert.deepEqual(service.list(owner).map(l => l.id), [1, 2]);
    }
    service.reorder(owner, { order: [2, 1] });
    assert.deepEqual(service.list(owner).map(l => [l.id, l.sort_order]), [[2, 0], [1, 1]]);
  });

  test('remove requires an owned distinct destination and moves archived tasks too', () => {
    assert.throws(() => service.remove(owner, { id: 1 }), { code: 'VALIDATION_ERROR', todoCount: 2 });
    for (const moveTo of [1, 3, 999]) assert.throws(() => service.remove(owner, { id: 1, moveTo }), { code: 'VALIDATION_ERROR' });
    service.remove(owner, { id: 1, moveTo: 2 });
    assert.deepEqual(db.prepare('SELECT list_id FROM todos WHERE user_id = ?').all(1), [{ list_id: 2 }, { list_id: 2 }]);
    assert.equal(db.prepare('SELECT list_id FROM todos WHERE user_id = ?').get(2).list_id, 3);
    assert.throws(() => service.remove(owner, { id: 2 }), { code: 'VALIDATION_ERROR' });
  });

  test('failed deletion rolls back the preceding task transfer', () => {
    db.exec(`CREATE TRIGGER fail_delete BEFORE DELETE ON lists BEGIN SELECT RAISE(ABORT,'synthetic failure'); END`);
    assert.throws(() => service.remove(owner, { id: 1, moveTo: 2 }), /synthetic failure/);
    assert.deepEqual(db.prepare('SELECT list_id FROM todos WHERE user_id = ?').all(1), [{ list_id: 1 }, { list_id: 1 }]);
  });
});
