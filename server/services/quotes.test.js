const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { createQuoteService } = require('./quotes');
const DAY = '2026-09-27';
const alice = { userId: 1, actor: 'web' };
const bob = { userId: 2, actor: 'web' };
let db, service;
test.beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY); INSERT INTO users VALUES(1),(2);
    CREATE TABLE quotes(id INTEGER PRIMARY KEY,user_id INTEGER,text TEXT,author TEXT,wikipedia TEXT,source TEXT);
    CREATE UNIQUE INDEX quotes_unique ON quotes(COALESCE(user_id,0),text);
    CREATE TABLE quote_state(user_id INTEGER,quote_id INTEGER,disliked INTEGER DEFAULT 0,shown_cycle INTEGER,last_shown_at TEXT,PRIMARY KEY(user_id,quote_id));
    CREATE TABLE quote_day(user_id INTEGER,day TEXT,quote_id INTEGER,PRIMARY KEY(user_id,day));
    INSERT INTO quotes VALUES(1,NULL,'Built in','Author',NULL,NULL),(2,1,'Alice private','Alice',NULL,NULL),(3,2,'Bob private','Bob',NULL,NULL);`);
  service = createQuoteService(db);
});
test.afterEach(() => db.close());
const state = () => ({ pins: db.prepare('SELECT * FROM quote_day ORDER BY user_id,day').all(),
  rotation: db.prepare('SELECT * FROM quote_state ORDER BY user_id,quote_id').all() });

test('stored-only daily reads are pure and distinguish missing selection from a visible pin', () => {
  const before = state();
  assert.deepEqual(service.daily(alice, { date: DAY }), { quote: null, selectionRequired: true });
  assert.deepEqual(state(), before);
  const selected = service.daily(alice, { date: DAY, select: true });
  const after = state();
  assert.deepEqual(service.daily(alice, { date: DAY }), selected);
  assert.equal(selected.selectionRequired, false);
  assert.deepEqual(state(), after);
});

test('private quote visibility applies even to an invalid stored day pin', () => {
  db.prepare('INSERT INTO quote_day VALUES(?,?,?)').run(1, DAY, 3);
  assert.deepEqual(service.daily(alice, { date: DAY }), { quote: null, selectionRequired: true });
  assert.deepEqual(service.stats(alice), { stats: { total: 2, disliked: 0, uploaded: 1, available: 2 } });
  for (const method of ['dislike', 'restore']) assert.throws(() => service[method](alice, { id: 3, date: DAY }), { code: 'NOT_FOUND' });
});

test('dislike replacement and restore pin follow the same atomic owner rotation', () => {
  const first = service.daily(alice, { date: DAY, select: true }).quote;
  const replacement = service.dislike(alice, { id: first.id, date: DAY }).quote;
  assert.notEqual(replacement.id, first.id);
  assert.equal(service.restore(alice, { id: first.id, date: DAY }).quote.id, first.id);
  assert.equal(service.stats(bob).stats.disliked, 0);
});

test('replacement failure rolls back dislike and cleared pin together', () => {
  const first = service.daily(alice, { date: DAY, select: true }).quote;
  const before = state();
  db.exec(`CREATE TRIGGER block_pin BEFORE INSERT ON quote_day BEGIN SELECT RAISE(ABORT,'synthetic pin failure'); END`);
  assert.throws(() => service.dislike(alice, { id: first.id, date: DAY }), /synthetic pin failure/);
  assert.deepEqual(state(), before);
});

test('restore-all clears only the requester dislikes and preserves selected pins', () => {
  service.dislike(alice, { id: 1, date: DAY });
  service.dislike(bob, { id: 1, date: DAY });
  const pin = service.daily(alice, { date: DAY }).quote;
  assert.equal(service.restoreAll(alice).restored, 1);
  assert.equal(service.daily(alice, { date: DAY }).quote.id, pin.id);
  assert.equal(service.stats(bob).stats.disliked, 1);
});

test('CSV import bounds errors and deduplicates owned/built-in quotes without using foreign uploads', () => {
  const csv = 'Quote,Author\nNew,Author\nBuilt in,Author\nBob private,Author\n' + Array(20).fill(',Missing').join('\n');
  const first = service.importCsv(alice, { csv });
  assert.equal(first.added, 2);
  assert.equal(first.skipped, 1);
  assert.equal(first.errors.length, 10);
  assert.equal(first.errorCount, 20);
  assert.equal(first.maxRows, 5000);
  assert.equal(service.importCsv(alice, { csv }).added, 0);
  assert.equal(service.stats(bob).stats.uploaded, 1);
});

test('strict inputs reject invalid calendar dates, coercions, ownership fields and oversized CSV', () => {
  for (const args of [{ date: '2026-02-30' }, { date: DAY, select: 'true' }, { date: DAY, user_id: 2 }]) {
    assert.throws(() => service.daily(alice, args), { code: 'VALIDATION_ERROR' });
  }
  for (const csv of ['', 'x'.repeat(1024 * 1024 + 1), 'Quote,Author\n' + Array(5001).fill('Q,A').join('\n')]) {
    assert.throws(() => service.importCsv(alice, { csv }), { code: 'VALIDATION_ERROR' });
  }
  assert.throws(() => service.dislike(alice, { id: '1', date: DAY }), { code: 'VALIDATION_ERROR' });
  assert.throws(() => service.importCsv(alice, { csv: 'Quote,Author\nQ,A', url: 'https://evil.example' }), { code: 'VALIDATION_ERROR' });
});

test('CSV envelope bound counts UTF-8 bytes and JSON escapes, not only characters', () => {
  for (const csv of ['é'.repeat(600000), '\n'.repeat(600000)]) {
    assert.throws(() => service.importCsv(alice, { csv }), { code: 'VALIDATION_ERROR' });
  }
  assert.equal(service.stats(alice).stats.uploaded, 1);
});

test('selection after exhausting the visible library starts another cycle while all-disliked stays empty', () => {
  const first = service.daily(alice, { date: DAY, select: true }).quote;
  const second = service.daily(alice, { date: '2026-09-28', select: true }).quote;
  assert.notEqual(first.id, second.id);
  assert.ok(service.daily(alice, { date: '2026-09-29', select: true }).quote);
  service.dislike(alice, { id: first.id, date: DAY });
  service.dislike(alice, { id: second.id, date: DAY });
  assert.deepEqual(service.daily(alice, { date: DAY, select: true }), { quote: null, selectionRequired: false });
});
