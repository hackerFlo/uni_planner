const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { createDayNoteService } = require('./dayNotes');
let db, service;
const owner = { userId: 1, actor: 'web' };
const foreign = { userId: 2, actor: 'mcp' };
test.beforeEach(() => {
  db = new Database(':memory:');
  db.exec('CREATE TABLE day_notes(user_id INTEGER, date TEXT, note TEXT, updated_at TEXT, PRIMARY KEY(user_id,date))');
  service = createDayNoteService(db);
});
test.afterEach(() => db.close());

test('notes preserve trim/truncation/clear semantics and isolate matching dates', () => {
  service.set(owner, { date: '2028-02-29', note: '  Owner  ' });
  service.set(foreign, { date: '2028-02-29', note: 'Foreign' });
  assert.deepEqual(service.list(owner), [{ date: '2028-02-29', note: 'Owner' }]);
  service.set(owner, { date: '2028-02-29', note: 'x'.repeat(250) });
  assert.equal(service.list(owner)[0].note.length, 200);
  service.set(owner, { date: '2028-02-29', note: '' });
  assert.deepEqual(service.list(owner), []);
  assert.deepEqual(service.list(foreign), [{ date: '2028-02-29', note: 'Foreign' }]);
});

test('notes reject invalid dates, non-text notes, and arbitrary owner fields', () => {
  for (const args of [{ date: '2026-02-29', note: 'No' }, { date: '0000-01-01', note: 'No' },
    { date: '2028-02-29', note: {} }, { date: '2028-02-29', note: 'No', user_id: 2 }]) {
    assert.throws(() => service.set(owner, args), { code: 'VALIDATION_ERROR' });
  }
  assert.deepEqual(service.list(owner), []);
});
