const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-read-adapters-'));
process.env.DATABASE_PATH = path.join(temp, 'planner.db');
process.env.LOG_LEVEL = 'error';
const db = require('../../db');
const { plannerReadTools } = require('./planner');
const { orderedItems } = require('../../services/planner');
const { getWindowBounds, addDays } = require('../../recurrence');
const { DomainError } = require('../../domain/errors');
let seq = 0;
function account() {
  const userId = db.prepare('INSERT INTO users(email,password_hash) VALUES(?,?)').run(`reader-${++seq}@example.com`, 'synthetic').lastInsertRowid;
  const listId = db.prepare('INSERT INTO lists(user_id,name,color,sort_order) VALUES(?,?,?,0)').run(userId, 'Tasks', 'indigo').lastInsertRowid;
  return { userId, listId, actor: 'mcp', capabilities: ['planner_read', 'planner_write'] };
}
const version = ctx => db.prepare('SELECT epoch,revision FROM planner_versions WHERE user_id=?').get(ctx.userId);
function tools(writesEnabled = false, authorize = () => {}) {
  return Object.fromEntries(plannerReadTools(db, { writesEnabled }, version, { authorize }).map(tool => [tool.name, tool]));
}
function call(tool, ctx, args = {}) { return tool.action(ctx, tool.schema.parse(args)); }
function task(ctx, title, day = null, order = null) {
  return db.prepare('INSERT INTO todos(user_id,list_id,title,description,day_assigned,planner_order,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(ctx.userId, ctx.listId, title, 'x'.repeat(5000), day, order, '2026-01-01').lastInsertRowid;
}
test.after(() => { db.close(); fs.rmSync(temp, { recursive: true, force: true }); });

test('SQL task pages stay bounded and cursors bind owner filters version and operation', () => {
  const ctx = account();
  const other = account();
  for (let i = 0; i < 125; i++) task(ctx, `Task ${i}`);
  task(other, 'Foreign task');
  const all = tools();
  const first = call(all.list_tasks, ctx, { limit: 100 });
  assert.equal(first.tasks.length, 100);
  assert.equal(Object.hasOwn(first.tasks[0], 'description_html'), false);
  assert.equal(Object.hasOwn(first.tasks[0], 'user_id'), false);
  assert.equal(call(all.list_tasks, ctx, { limit: 100, cursor: first.nextCursor }).tasks.length, 25);
  assert.throws(() => call(all.list_tasks, other, { limit: 100, cursor: first.nextCursor }), { code: 'CONFLICT' });
  assert.throws(() => call(all.list_tasks, ctx, { status: 'all', limit: 100, cursor: first.nextCursor }), { code: 'CONFLICT' });
  assert.throws(() => call(all.search_tasks, ctx, { query: 'Task', limit: 100, cursor: first.nextCursor }), { code: 'CONFLICT' });
  assert.equal(call(all.list_tasks, ctx, { includeDescription: true, limit: 1 }).tasks[0].description_html.length, 5000);
  task(ctx, 'New task');
  assert.throws(() => call(all.list_tasks, ctx, { limit: 100, cursor: first.nextCursor }), { code: 'CONFLICT' });
  assert.throws(() => call(all.list_tasks, ctx, { cursor: 'invalid' }), { code: 'VALIDATION_ERROR' });
});

test('weekly mixed pages match shared board ties and bound exams with an explicit continuation', () => {
  const ctx = account();
  const day = '2026-09-21';
  task(ctx, 'First null', day);
  task(ctx, 'Second null', day);
  task(ctx, 'Position zero', day, 0);
  db.prepare('INSERT INTO day_dividers(user_id,date,planner_order) VALUES(?,?,?)').run(ctx.userId, day, 0);
  const completed = task(ctx, 'Completed', day, 0);
  db.prepare('UPDATE todos SET completed=1,archived=1,completed_at=? WHERE id=? AND user_id=?').run('2026-09-21T12:00:00Z', completed, ctx.userId);
  for (let i = 0; i < 105; i++) db.prepare('INSERT INTO exams(user_id,title,exam_date) VALUES(?,?,?)').run(ctx.userId, `Exam ${i}`, day);
  const all = tools();
  const response = call(all.get_week, ctx, { week_start: day, limit: 2 });
  const items = [...response.items];
  let cursor = response.nextCursor;
  while (cursor) { const page = call(all.get_week, ctx, { week_start: day, limit: 2, cursor }); items.push(...page.items); cursor = page.nextCursor; }
  assert.deepEqual(items.slice(0, -1).map(({ kind, id }) => ({ kind, id })), orderedItems(db, ctx.userId, day).map(({ kind, id }) => ({ kind, id })));
  assert.equal(items.at(-1).id, completed);
  assert.equal(response.exams.length, 100);
  assert.equal(response.examsTruncated, true);
  assert.equal(call(all.list_exams, ctx, { from: day, to: response.to, limit: 100, cursor: response.examsNextCursor }).exams.length, 5);
  assert.equal(call(all.list_exams, ctx, { limit: 100 }).exams.length, 100);
  assert.throws(() => call(all.get_week, ctx, { week_start: '2026-09-22' }), { code: 'VALIDATION_ERROR' });
});

test('materialization reauthorizes at transaction entry and coalesces version changes', () => {
  const ctx = account();
  const { windowStart } = getWindowBounds('UTC');
  const id = task(ctx, 'Recurring', addDays(windowStart, -20));
  db.prepare('UPDATE todos SET recurrence_interval_days=1 WHERE id=? AND user_id=?').run(id, ctx.userId);
  assert.throws(() => call(tools().list_tasks, ctx, { materialize: true }), { code: 'FORBIDDEN' });
  let checks = 0;
  const revoked = tools(true, () => { if (++checks === 2) throw new DomainError('FORBIDDEN', 'Revoked', 403); });
  assert.throws(() => call(revoked.list_tasks, ctx, { materialize: true }), { code: 'FORBIDDEN' });
  assert.equal(db.prepare('SELECT count(*) n FROM todos WHERE user_id=?').get(ctx.userId).n, 1);
  const before = version(ctx);
  const result = call(tools(true).list_tasks, ctx, { materialize: true });
  assert.equal(result.materializationPerformed, true);
  assert.ok(result.tasks.length > 1);
  assert.equal(version(ctx).revision, before.revision + 1);
  call(tools(true).list_tasks, ctx, { materialize: true });
  assert.equal(version(ctx).revision, before.revision + 1);
});


test('pure adapters never collect an unbounded SQL result before slicing', () => {
  const ctx = account();
  for (let i = 0; i < 120; i++) task(ctx, `Bounded ${i}`, '2026-09-21');
  const bounded = { prepare(sql) {
    const statement = db.prepare(sql);
    return { get: statement.get.bind(statement), all(...args) {
      assert.match(sql, /LIMIT \?/, 'Read must be bounded in SQL');
      const rows = statement.all(...args);
      assert.ok(rows.length <= 101);
      return rows;
    } };
  } };
  const all = Object.fromEntries(plannerReadTools(bounded, { writesEnabled: false }, version).map(tool => [tool.name, tool]));
  assert.equal(call(all.list_tasks, ctx, { limit: 100 }).tasks.length, 100);
  assert.equal(call(all.get_week, ctx, { week_start: '2026-09-21', limit: 100 }).items.length, 100);
});

test('individual task/context reads and range collection validation remain owner scoped', () => {
  const ctx = account();
  const other = account();
  const id = task(ctx, 'Owned');
  const all = tools();
  assert.equal(call(all.get_task, ctx, { id }).task.id, id);
  assert.throws(() => call(all.get_task, other, { id }), { code: 'NOT_FOUND' });
  assert.equal(call(all.get_planner_context, ctx).version.epoch, version(ctx).epoch);
  for (const args of [{ from: '2026-09-21' }, { from: '2026-09-22', to: '2026-09-21' }]) {
    assert.throws(() => call(all.list_day_notes, ctx, args), { code: 'VALIDATION_ERROR' });
  }
  db.prepare('INSERT INTO day_notes(user_id,date,note) VALUES(?,?,?)').run(ctx.userId, '2026-09-21', 'Owned note');
  assert.equal(call(all.list_day_notes, ctx).notes.length, 1);
  assert.equal(call(all.list_day_notes, other).notes.length, 0);
});
