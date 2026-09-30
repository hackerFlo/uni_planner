const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { createExamService } = require('./exams');
let db, service;
const owner = { userId: 1, actor: 'web' };
const foreign = { userId: 2, actor: 'mcp' };
test.beforeEach(() => {
  db = new Database(':memory:');
  db.exec('CREATE TABLE exams(id INTEGER PRIMARY KEY, user_id INTEGER, title TEXT, exam_date TEXT, updated_at TEXT)');
  service = createExamService(db);
});
test.afterEach(() => db.close());

test('shared exams create, update, order, and delete with website semantics', () => {
  const late = service.create(owner, { title: ' Later ', exam_date: '2026-10-01' });
  const early = service.create(owner, { title: 'Earlier', exam_date: '2026-09-01' });
  assert.deepEqual(service.list(owner).map(e => e.id), [early.id, late.id]);
  assert.equal(late.title, 'Later');
  service.update(owner, { id: late.id, exam_date: '2026-08-01' });
  assert.equal(service.list(owner)[0].id, late.id);
  service.remove(owner, { id: early.id });
  assert.throws(() => service.remove(owner, { id: early.id }), { code: 'NOT_FOUND' });
});

test('foreign exams remain inaccessible and unchanged', () => {
  const exam = service.create(foreign, { title: 'Private', exam_date: '2026-09-01' });
  assert.deepEqual(service.list(owner), []);
  for (const id of [exam.id, 999]) {
    assert.throws(() => service.update(owner, { id, title: 'Nope' }), { code: 'NOT_FOUND' });
    assert.throws(() => service.remove(owner, { id }), { code: 'NOT_FOUND' });
  }
  assert.deepEqual(service.list(foreign), [exam]);
});

test('exam schemas reject invalid dates, identifiers, and extra fields', () => {
  for (const args of [{ title: 'Nope', exam_date: '2026-02-29' }, { title: ' ', exam_date: '2028-02-29' },
    { title: 'Nope', exam_date: '2028-02-29', user_id: 2 }]) {
    assert.throws(() => service.create(owner, args), { code: 'VALIDATION_ERROR' });
  }
  assert.throws(() => service.update(owner, { id: 1 }), { code: 'VALIDATION_ERROR' });
  assert.throws(() => service.remove(owner, { id: '1suffix' }), { code: 'VALIDATION_ERROR' });
});
