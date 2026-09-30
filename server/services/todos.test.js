const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-todo-service-'));
process.env.DATABASE_PATH = path.join(dir, 'isolated.db');
process.env.LOG_LEVEL = 'error';
const db = require('../db');
const { createTodoService } = require('./todos');
const { getWindowBounds, addDays } = require('../recurrence');
const service = createTodoService(db);
const user = name => db.prepare('INSERT INTO users(email,password_hash) VALUES(?,?)').run(`${name}@example.com`, 'synthetic').lastInsertRowid;
const list = id => db.prepare('INSERT INTO lists(user_id,name,color,sort_order) VALUES(?,?,?,?)').run(id, 'Tasks', 'indigo', 0).lastInsertRowid;
const alice = { userId: user('alice'), actor: 'web' };
const bob = { userId: user('bob'), actor: 'web' };
const aliceList = list(alice.userId);
const bobList = list(bob.userId);
const { windowStart } = getWindowBounds('UTC');
const start = addDays(windowStart, -20);
const daily = { recurrence_interval_days: 1, recurrence_pattern: null };
const create = (args = {}) => service.create(alice, { title: 'Task', list_id: aliceList, ...args });
test.beforeEach(() => db.prepare('DELETE FROM todos').run());
test.after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test('shared service preserves sanitized content and defaults', () => {
  const result = create({ title: ' Trimmed ', description: '<strong onclick="bad()">safe</strong><img src=x onerror=bad()>' });
  assert.equal(result.todo.title, 'Trimmed');
  assert.equal(result.todo.description, '<strong>safe</strong>');
  assert.equal(result.todo.day_assigned, null);
  assert.deepEqual(result.materialized, []);
});

test('strict create/update inputs reject coercions, foreign IDs and impossible dates atomically', () => {
  const { todo } = create();
  const invalid = [{ completed: 'false' }, { archived: 1 }, { list_id: bobList }, { list_id: `${aliceList}` },
    { day_assigned: '2026-02-30' }, { approx_time: {} }, { recurrence_interval_days: '2' },
    { user_id: bob.userId }, { planner_order: -1 }, { title: ' ' }, { description: 42 }];
  for (const patch of invalid) assert.throws(() => service.update(alice, { id: todo.id, ...patch }), { code: 'VALIDATION_ERROR' });
  for (const args of [{ user_id: bob.userId }, { list_id: bobList }, { day_assigned: '2026-02-30' },
    { ...daily, day_assigned: null }, { recurrence_interval_days: 2, recurrence_pattern: 'weekdays' }]) {
    assert.throws(() => create(args), { code: 'VALIDATION_ERROR' });
  }
  assert.equal(db.prepare('SELECT count(*) n FROM todos').get().n, 1);
});

test('foreign task IDs are indistinguishable from missing IDs for read update and delete', () => {
  const { todo } = service.create(bob, { title: 'Private', list_id: bobList });
  for (const id of [todo.id, 999999]) {
    assert.throws(() => service.get(alice, id), { code: 'NOT_FOUND' });
    assert.throws(() => service.update(alice, { id, title: 'stolen' }), { code: 'NOT_FOUND' });
    assert.throws(() => service.remove(alice, { id, scope: 'all' }), { code: 'NOT_FOUND' });
  }
  assert.equal(service.list(alice).todos.length, 0);
});

test('stored-only reads never materialize while explicit materialization uses the same owner window', () => {
  const { todo } = create({ day_assigned: start, ...daily });
  db.prepare('DELETE FROM todos WHERE recurrence_parent_id=?').run(todo.id);
  const stored = service.list(alice, { materialize: false });
  assert.equal(stored.todos.length, 1);
  assert.equal(stored.materializationPerformed, false);
  const expanded = service.list(alice, { materialize: true });
  assert.ok(expanded.todos.length > 1);
  assert.equal(expanded.materializationPerformed, true);
  assert.equal(service.list(bob, { materialize: true }).todos.length, 0);
});

test('unchanged effective child recurrence preserves row IDs and updates all series content', () => {
  const { todo, materialized } = create({ day_assigned: start, ...daily });
  const pivot = materialized[2];
  const beforeIds = db.prepare('SELECT id FROM todos ORDER BY id').all();
  const result = service.update(alice, { id: pivot.id, title: 'Series name', ...daily });
  assert.equal(result.todo.recurrence_parent_id, todo.id);
  assert.deepEqual(result.removedIds, []);
  assert.deepEqual(db.prepare('SELECT id FROM todos ORDER BY id').all(), beforeIds);
  assert.deepEqual(db.prepare('SELECT DISTINCT title FROM todos').all(), [{ title: 'Series name' }]);
});

test('changing a child rule detaches earlier history, promotes the child and preserves completed later rows', () => {
  const { todo, materialized } = create({ day_assigned: start, ...daily });
  const [earlier, pivot, later] = materialized;
  service.update(alice, { id: later.id, completed: true });
  const result = service.update(alice, { id: pivot.id, recurrence_interval_days: 2, recurrence_pattern: null });
  assert.equal(result.todo.recurrence_parent_id, null);
  assert.equal(service.get(alice, earlier.id).todo.recurrence_parent_id, null);
  assert.equal(service.get(alice, todo.id).todo.recurrence_interval_days, null);
  assert.equal(service.get(alice, later.id).todo.completed, 1);
  assert.equal(result.removedIds.includes(later.id), false);
});

test('completion and restoration are occurrence-local and preserve series content semantics', () => {
  const { todo, materialized } = create({ day_assigned: start, ...daily });
  const child = materialized[0];
  const completed = service.update(alice, { id: child.id, completed: true }).todo;
  assert.equal(completed.archived, 1);
  assert.ok(completed.completed_at);
  assert.equal(service.get(alice, todo.id).todo.completed, 0);
  const reopened = service.update(alice, { id: child.id, archived: false }).todo;
  assert.deepEqual([reopened.completed, reopened.archived, reopened.completed_at], [0, 0, null]);
});

test('single occurrence deletion may regenerate, all-series deletion removes exactly owned members', () => {
  const { todo, materialized } = create({ day_assigned: start, ...daily });
  const removedDay = materialized[0].day_assigned;
  assert.deepEqual(service.remove(alice, { id: materialized[0].id, scope: 'single' }).removedIds, [materialized[0].id]);
  assert.ok(service.list(alice, { materialize: true }).todos.some(row => row.day_assigned === removedDay));
  const ownIds = service.list(alice, { status: 'all' }).todos.map(row => row.id).sort((a, b) => a - b);
  const foreign = service.create(bob, { title: 'Other', list_id: bobList });
  const result = service.remove(alice, { id: todo.id, scope: 'all' });
  assert.deepEqual(result.removedIds.sort((a, b) => a - b), ownIds);
  assert.equal(service.get(bob, foreign.todo.id).todo.title, 'Other');
});

test('completed queries require a real bounded range and retain assignment-day behavior', () => {
  const { todo } = create({ day_assigned: '2026-09-01' });
  service.update(alice, { id: todo.id, completed: true });
  assert.equal(service.list(alice, { status: 'completed', filters: { from: '2026-09-01', to: '2026-09-02' } }).todos[0].id, todo.id);
  for (const filters of [{}, { from: '2026-02-30', to: '2026-03-01' },
    { from: '2026-09-02', to: '2026-09-01' }, { from: '2026-01-01', to: '2026-09-01' }]) {
    assert.throws(() => service.list(alice, { status: 'completed', filters }), { code: 'VALIDATION_ERROR' });
  }
});

test('recurring create rolls back the template if child insertion fails', () => {
  db.exec(`CREATE TEMP TRIGGER fail_child BEFORE INSERT ON todos WHEN NEW.recurrence_parent_id IS NOT NULL
    BEGIN SELECT RAISE(ABORT,'injected materialization failure'); END`);
  try {
    assert.throws(() => create({ day_assigned: start, ...daily }), /injected materialization failure/);
    assert.equal(db.prepare('SELECT count(*) n FROM todos').get().n, 0);
  } finally { db.exec('DROP TRIGGER fail_child'); }
});

test('task reorder validates all ownership and duplicate IDs before changing any position', () => {
  const first = create().todo;
  const second = create().todo;
  const foreign = service.create(bob, { title: 'Foreign', list_id: bobList }).todo;
  for (const items of [[{ id: first.id, planner_order: 1 }, { id: foreign.id, planner_order: 0 }],
    [{ id: first.id, planner_order: 0 }, { id: first.id, planner_order: 1 }]]) {
    assert.throws(() => service.reorder(alice, { items }));
    assert.equal(service.get(alice, first.id).todo.planner_order, null);
  }
  assert.deepEqual(service.reorder(alice, { items: [{ id: first.id, planner_order: 1 },
    { id: second.id, planner_order: 0 }] }), { ok: true });
  assert.equal(service.get(alice, first.id).todo.planner_order, 1);
  assert.equal(service.get(alice, second.id).todo.planner_order, 0);
});

test('far-future recurrence never materializes invented occurrences into the current window', () => {
  const { todo, materialized } = create({ day_assigned: '9999-12-31', ...daily });
  assert.equal(todo.day_assigned, '9999-12-31');
  assert.deepEqual(materialized, []);
});

test('deleting just the template preserves orphaned children without inventing a recurrence rule', () => {
  const { todo, materialized } = create({ day_assigned: start, ...daily });
  service.remove(alice, { id: todo.id, scope: 'single' });
  const child = service.get(alice, materialized[0].id).todo;
  assert.equal(child.recurrence_parent_id, todo.id);
  assert.equal(child.recurrence_interval_days, null);
  assert.equal(service.list(alice, { materialize: true }).todos.length, materialized.length);
});

test('series description, list and time edits also update completed siblings', () => {
  const { materialized } = create({ day_assigned: start, ...daily });
  service.update(alice, { id: materialized[1].id, completed: true });
  const otherList = list(alice.userId);
  service.update(alice, { id: materialized[0].id, description: '<b>shared</b>', list_id: otherList, approx_time: ' 10m ' });
  const sibling = service.get(alice, materialized[1].id).todo;
  assert.deepEqual([sibling.description, sibling.list_id, sibling.approx_time, sibling.completed],
    ['<strong>shared</strong>', otherList, '10m', 1]);
});

test('oversized sanitized descriptions and empty updates are rejected without changes', () => {
  const todo = create().todo;
  assert.throws(() => service.update(alice, { id: todo.id }), { code: 'VALIDATION_ERROR' });
  assert.throws(() => service.update(alice, { id: todo.id, description: 'x'.repeat(5001) }), { code: 'VALIDATION_ERROR' });
  assert.equal(service.get(alice, todo.id).todo.description, '');
});

test('creation appends after existing mixed day items in the same shared transaction', () => {
  const day = '2026-11-02';
  const existing = create({ day_assigned: day }).todo;
  db.prepare('UPDATE todos SET planner_order=4 WHERE user_id=? AND id=?').run(alice.userId, existing.id);
  db.prepare('INSERT INTO day_dividers(user_id,date,planner_order) VALUES(?,?,?)').run(alice.userId, day, 8);
  const created = create({ day_assigned: day }).todo;
  assert.equal(created.planner_order, 2);
});

test('bounded read pages share list ownership, effective rules, ordering and literal search', () => {
  const insert = db.prepare('INSERT INTO todos(user_id,list_id,title,description,created_at) VALUES(?,?,?,?,?)');
  for (let index = 0; index < 125; index++) insert.run(alice.userId, aliceList, `Task ${index}`, index === 50 ? 'Literal %_ NÄDEL needle' : '', '2026-01-01');
  insert.run(bob.userId, bobList, 'Foreign needle', '', '2026-01-01');
  const page = service.page(alice, { limit: 10, offset: 0 });
  assert.equal(page.todos.length, 11);
  assert.deepEqual(page.todos.map(row => row.id), service.list(alice).todos.slice(0, 11).map(row => row.id));
  assert.equal(service.page(alice, { query: '%_', limit: 10, offset: 0 }).todos.length, 1);
  assert.equal(service.page(alice, { query: 'NEEDLE', limit: 10, offset: 0 }).todos.length, 1);
  assert.equal(service.page(alice, { query: 'nädel', limit: 10, offset: 0 }).todos.length, 1);
  assert.throws(() => service.page(alice, { filters: { list_id: bobList } }), { code: 'VALIDATION_ERROR' });
  assert.throws(() => service.page(alice, { limit: 101 }), { code: 'VALIDATION_ERROR' });
});

test('create-as-completed is one atomic service operation with completion timestamp', () => {
  const { todo } = create({ title: 'Logged work', day_assigned: '2026-11-04', completed: true });
  assert.equal(todo.completed, 1);
  assert.equal(todo.archived, 1);
  assert.ok(!Number.isNaN(Date.parse(todo.completed_at)));
  assert.equal(service.list(alice, { status: 'active' }).todos.some(row => row.id === todo.id), false);
});

test('agent creation and actual reassignment stamp only the intended task', () => {
  const agent = { ...alice, actor: 'mcp' };
  const { todo } = service.create(agent, { title: 'Agent task', list_id: aliceList });
  assert.equal(todo.agent_activity_action, 'created');
  assert.ok(!Number.isNaN(Date.parse(todo.agent_activity_at)));
  const original = todo.agent_activity_at;
  service.update(agent, { id: todo.id, day_assigned: null });
  assert.equal(service.get(alice, todo.id).todo.agent_activity_at, original);
  service.update(agent, { id: todo.id, day_assigned: '2026-11-04' });
  assert.equal(service.get(alice, todo.id).todo.agent_activity_action, 'moved');
  service.update(agent, { id: todo.id, title: 'Renamed' });
  assert.equal(service.get(alice, todo.id).todo.agent_activity_action, 'moved');
});

test('website edits and dismissal clear only owned markers', () => {
  const agent = { ...alice, actor: 'mcp' };
  const first = service.create(agent, { title: 'First', list_id: aliceList }).todo;
  const second = service.create(agent, { title: 'Second', list_id: aliceList }).todo;
  service.update(alice, { id: first.id, completed: true });
  assert.equal(service.get(alice, first.id).todo.agent_activity_at, null);
  assert.equal(service.get(alice, second.id).todo.agent_activity_action, 'created');
  assert.throws(() => service.dismiss(bob, { id: second.id }), { code: 'NOT_FOUND' });
  service.dismiss(alice, { id: second.id });
  assert.equal(service.get(alice, second.id).todo.agent_activity_at, null);
  assert.equal(service.dismiss(alice, { id: second.id }).todo.agent_activity_at, null);
});

test('explicit agent recurrence children are marked but later automatic children are not', () => {
  const agent = { ...alice, actor: 'mcp' };
  const { todo, materialized } = service.create(agent, { title: 'Daily', list_id: aliceList,
    day_assigned: start, ...daily });
  assert.ok(materialized.length > 0);
  assert.ok(materialized.every(child => child.agent_activity_action === 'created'));
  db.prepare('DELETE FROM todos WHERE id=? AND user_id=?').run(materialized[0].id, alice.userId);
  service.materialize(alice);
  const replaced = db.prepare('SELECT agent_activity_at FROM todos WHERE user_id=? AND recurrence_parent_id=? AND day_assigned=?')
    .get(alice.userId, todo.id, materialized[0].day_assigned);
  assert.equal(replaced.agent_activity_at, null);
});
