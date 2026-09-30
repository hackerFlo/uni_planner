const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { createDayDividerService } = require('./dayDividers');
let db, service;
const ctx = { userId: 1, actor: 'web' };
test.beforeEach(() => {
  db = new Database(':memory:');
  db.exec('CREATE TABLE day_dividers(id INTEGER PRIMARY KEY,user_id INTEGER,date TEXT,planner_order INTEGER)');
  service = createDayDividerService(db);
});
test.afterEach(() => db.close());

test('legacy divider CRUD preserves explicit positions while isolating owners', () => {
  const row = service.create(ctx, { date: '2026-09-28', planner_order: 4 });
  assert.equal(row.planner_order, 4);
  assert.deepEqual(service.list({ userId: 2 }), []);
  assert.throws(() => service.update({ userId: 2 }, { id: row.id, date: '2026-09-29' }), { code: 'NOT_FOUND' });
  assert.equal(service.update(ctx, { id: row.id, date: '2026-09-29' }).planner_order, 4);
  service.remove(ctx, { id: row.id });
  assert.throws(() => service.remove(ctx, { id: row.id }), { code: 'NOT_FOUND' });
});

test('legacy partial reorder rejects the entire malformed/foreign batch', () => {
  const row = service.create(ctx, { date: '2026-09-28' });
  const foreign = service.create({ userId: 2 }, { date: '2026-09-28' });
  for (const items of [[{ id: row.id, planner_order: 3 }, { id: foreign.id, planner_order: 4 }],
    [{ id: row.id, planner_order: 3 }, { id: row.id, planner_order: 4 }],
    [{ id: row.id, planner_order: -1 }]]) {
    assert.throws(() => service.reorder(ctx, { items }));
    assert.equal(service.list(ctx)[0].planner_order, 0);
  }
  service.reorder(ctx, { items: [{ id: row.id, planner_order: 7 }] });
  assert.equal(service.list(ctx)[0].planner_order, 7);
});

test('legacy date changes enforce destination capacity and same-day edits stay allowed', () => {
  const source = service.create(ctx, { date: '2026-09-28' });
  for (let n = 0; n < 20; n++) service.create(ctx, { date: '2026-09-29', planner_order: n });
  assert.throws(() => service.create(ctx, { date: '2026-09-29' }), { code: 'VALIDATION_ERROR' });
  assert.throws(() => service.update(ctx, { id: source.id, date: '2026-09-29' }), { code: 'VALIDATION_ERROR' });
  const target = service.list(ctx).find(row => row.date === '2026-09-29');
  assert.equal(service.update(ctx, { id: target.id, date: target.date }).date, target.date);
});
