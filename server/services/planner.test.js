const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { createPlannerService } = require('./planner');
let db, service;
const ctx = { userId: 1, actor: 'web' };
const MON = '2026-09-28';
const TUE = '2026-09-29';
const task = id => ({ kind: 'task', id });
const divider = id => ({ kind: 'divider', id });
test.beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`CREATE TABLE lists(id INTEGER PRIMARY KEY,user_id INTEGER);
    INSERT INTO lists VALUES(1,1),(2,2);
    CREATE TABLE todos(id INTEGER PRIMARY KEY,user_id INTEGER,list_id INTEGER,title TEXT,description TEXT DEFAULT '',
      approx_time TEXT,day_assigned TEXT,planner_order INTEGER,completed INTEGER DEFAULT 0,archived INTEGER DEFAULT 0,
      recurrence_interval_days INTEGER,recurrence_pattern TEXT,recurrence_parent_id INTEGER,completed_at TEXT,
      created_at TEXT DEFAULT '2026-09-01',updated_at TEXT,agent_activity_at TEXT,agent_activity_action TEXT);
    CREATE TABLE day_dividers(id INTEGER PRIMARY KEY,user_id INTEGER,date TEXT,planner_order INTEGER);
    INSERT INTO todos(id,user_id,list_id,title,day_assigned,planner_order) VALUES
      (1,1,1,'First','${MON}',0),(2,1,1,'Second','${MON}',NULL),(3,1,1,'Destination','${TUE}',4),
      (4,2,2,'Foreign','${MON}',0),(5,1,1,'Backlog',NULL,NULL);
    INSERT INTO day_dividers VALUES(1,1,'${MON}',1),(2,2,'${MON}',1)`);
  service = createPlannerService(db);
});
test.afterEach(() => db.close());

function positions(day) {
  const tasks = db.prepare('SELECT id,planner_order FROM todos WHERE user_id=1 AND day_assigned IS ? AND completed=0 AND archived=0').all(day).map(row => ({ ...row, kind: 'task' }));
  const dividers = db.prepare('SELECT id,planner_order FROM day_dividers WHERE user_id=1 AND date IS ?').all(day).map(row => ({ ...row, kind: 'divider' }));
  return [...tasks, ...dividers].sort((a, b) => a.planner_order - b.planner_order).map(({ kind, id, planner_order }) => [kind, id, planner_order]);
}

test('move atomically normalizes both days and retains typed id namespaces', () => {
  const result = service.move(ctx, { item: task(1), day: TUE, index: 0 });
  assert.deepEqual(result.affectedDays, [MON, TUE]);
  assert.deepEqual(positions(MON), [['divider', 1, 0], ['task', 2, 1]]);
  assert.deepEqual(positions(TUE), [['task', 1, 0], ['task', 3, 1]]);
  assert.equal(db.prepare('SELECT planner_order FROM todos WHERE user_id=2').get().planner_order, 0);
});

test('agent move marks only real date changes while website reorder clears only selected cards', () => {
  const agent = { ...ctx, actor: 'mcp' };
  service.move(agent, { item: task(1), day: TUE, index: 0 });
  const marked = db.prepare('SELECT agent_activity_at,agent_activity_action FROM todos WHERE id=1').get();
  assert.equal(marked.agent_activity_action, 'moved');
  service.move(agent, { item: task(1), day: TUE, index: 1 });
  assert.equal(db.prepare('SELECT agent_activity_at FROM todos WHERE id=1').get().agent_activity_at, marked.agent_activity_at);
  service.move(ctx, { item: task(3), day: TUE, index: 0 });
  assert.equal(db.prepare('SELECT agent_activity_action FROM todos WHERE id=1').get().agent_activity_action, 'moved');
  service.reorder(ctx, { day: TUE, items: [task(3), task(1)] });
  assert.equal(db.prepare('SELECT agent_activity_action FROM todos WHERE id=1').get().agent_activity_action, 'moved');
  service.reorder(ctx, { day: TUE, items: [task(1), task(3)] });
  assert.equal(db.prepare('SELECT agent_activity_at FROM todos WHERE id=1').get().agent_activity_at, null);
});

test('agent task copies are marked created without copying the source marker', () => {
  const agent = { ...ctx, actor: 'mcp' };
  const copy = service.copy(agent, { item: task(1), day: TUE, index: 0 });
  assert.equal(copy.item.agent_activity_action, 'created');
  assert.equal(db.prepare('SELECT agent_activity_action FROM todos WHERE id=1').get().agent_activity_action, null);
});

test('same-day insertion preserves null-last order and task-before-divider stable ties', () => {
  db.prepare('UPDATE day_dividers SET planner_order=0 WHERE user_id=1').run();
  const result = service.createDivider(ctx, { day: MON, index: 999 });
  assert.deepEqual(positions(MON), [['task', 1, 0], ['divider', 1, 1], ['task', 2, 2], ['divider', result.item.id, 3]]);
  service.move(ctx, { item: divider(1), day: MON, index: 0 });
  assert.deepEqual(positions(MON).map(row => row.slice(0, 2)), [['divider', 1], ['task', 1], ['task', 2], ['divider', result.item.id]]);
});

test('equal/null task orders retain newest-created order before divider ties', () => {
  db.prepare('UPDATE todos SET planner_order=NULL,created_at=? WHERE id=?').run('2026-09-03', 1);
  db.prepare('UPDATE todos SET created_at=? WHERE id=?').run('2026-09-04', 2);
  db.prepare('UPDATE day_dividers SET planner_order=NULL WHERE user_id=1').run();
  service.createDivider(ctx, { day: MON, index: 99 });
  assert.deepEqual(positions(MON).slice(0, 3), [['task', 2, 0], ['task', 1, 1], ['divider', 1, 2]]);
});

test('reorder validates the entire exact active typed membership before writing', () => {
  const valid = [divider(1), task(2), task(1)];
  for (const items of [[task(1), task(1), divider(1)], [task(1)], [task(1), task(2), divider(2)]]) {
    assert.throws(() => service.reorder(ctx, { day: MON, items }), { code: 'VALIDATION_ERROR' });
    assert.equal(db.prepare('SELECT planner_order FROM todos WHERE id=1').get().planner_order, 0);
  }
  service.reorder(ctx, { day: MON, items: valid });
  assert.deepEqual(positions(MON), [['divider', 1, 0], ['task', 2, 1], ['task', 1, 2]]);
});

test('backlog supports task moves/reorder but refuses dividers', () => {
  service.move(ctx, { item: task(1), day: null, index: 0 });
  assert.deepEqual(positions(null), [['task', 1, 0], ['task', 5, 1]]);
  service.reorder(ctx, { day: null, items: [task(5), task(1)] });
  assert.equal(positions(null)[0][1], 5);
  assert.throws(() => service.move(ctx, { item: divider(1), day: null, index: 0 }), { code: 'VALIDATION_ERROR' });
  assert.throws(() => service.copy(ctx, { item: divider(1), day: null, index: 0 }), { code: 'VALIDATION_ERROR' });
});

test('copy task retains stored content but drops all recurrence and history fields', () => {
  db.prepare('UPDATE todos SET description=?,approx_time=?,recurrence_interval_days=2,recurrence_pattern=NULL,recurrence_parent_id=99 WHERE id=1')
    .run('<p>Content</p>', '30 min');
  const result = service.copy(ctx, { item: task(1), day: TUE, index: 1 });
  const row = db.prepare('SELECT * FROM todos WHERE id=?').get(result.item.id);
  assert.deepEqual([row.title,row.description,row.list_id,row.approx_time], ['First','<p>Content</p>',1,'30 min']);
  assert.deepEqual([row.recurrence_interval_days,row.recurrence_pattern,row.recurrence_parent_id,row.completed_at,row.completed,row.archived], [null,null,null,null,0,0]);
  assert.equal(db.prepare('SELECT day_assigned FROM todos WHERE id=1').get().day_assigned, MON);
});

test('all divider entry paths enforce the destination cap, including cross-day moves', () => {
  const insert = db.prepare('INSERT INTO day_dividers(user_id,date,planner_order) VALUES(1,?,?)');
  for (let n = 0; n < 20; n++) insert.run(TUE, n);
  for (const invoke of [() => service.createDivider(ctx, { day: TUE, index: 0 }),
    () => service.move(ctx, { item: divider(1), day: TUE, index: 0 }),
    () => service.copy(ctx, { item: divider(1), day: TUE, index: 0 })]) {
    assert.throws(invoke, { code: 'VALIDATION_ERROR' });
    assert.equal(db.prepare('SELECT date FROM day_dividers WHERE id=1').get().date, MON);
  }
  const sameDay = db.prepare('SELECT id FROM day_dividers WHERE user_id=1 AND date=? LIMIT 1').get(TUE);
  service.move(ctx, { item: divider(sameDay.id), day: TUE, index: 0 });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM day_dividers WHERE user_id=1 AND date=?').get(TUE).n, 20);
});

test('copy/delete divider normalizes destination and leaves original blank divider intact', () => {
  const copy = service.copy(ctx, { item: divider(1), day: TUE, index: 0 });
  assert.deepEqual(positions(TUE), [['divider', copy.item.id, 0], ['task', 3, 1]]);
  service.deleteDivider(ctx, { id: copy.item.id });
  assert.deepEqual(positions(TUE), [['task', 3, 0]]);
  assert.equal(db.prepare('SELECT date FROM day_dividers WHERE id=1').get().date, MON);
});

test('foreign, absent and inactive items are unavailable without side effects', () => {
  db.prepare('UPDATE todos SET completed=1,archived=1 WHERE id=2').run();
  for (const item of [task(4), task(999), task(2), divider(2), divider(999)]) {
    for (const method of ['move', 'copy']) assert.throws(() => service[method](ctx, { item, day: TUE, index: 0 }), { code: 'NOT_FOUND' });
  }
  assert.throws(() => service.deleteDivider(ctx, { id: 2 }), { code: 'NOT_FOUND' });
  assert.throws(() => service.reorder(ctx, { day: MON, items: [task(1), task(2), divider(1)] }), { code: 'VALIDATION_ERROR' });
});

test('a failure during renumbering rolls back the earlier move and all positions', () => {
  const before = db.prepare('SELECT * FROM todos ORDER BY id').all();
  db.exec(`CREATE TRIGGER fail_normalize BEFORE UPDATE OF planner_order ON todos
    WHEN NEW.id=3 BEGIN SELECT RAISE(ABORT,'synthetic failure'); END`);
  assert.throws(() => service.move(ctx, { item: task(1), day: TUE, index: 0 }), /synthetic failure/);
  assert.deepEqual(db.prepare('SELECT * FROM todos ORDER BY id').all(), before);
  assert.equal(db.prepare('SELECT planner_order FROM day_dividers WHERE id=1').get().planner_order, 1);
});

test('strict schemas reject extra properties, invalid calendar days and mixed id types', () => {
  for (const args of [{ item: task(1), day: '2026-02-30', index: 0 },
    { item: { kind: 'task', id: '1' }, day: TUE, index: 0 },
    { item: task(1), day: TUE, index: -1 }, { item: task(1), day: TUE, index: 0, user_id: 2 }]) {
    assert.throws(() => service.move(ctx, args), { code: 'VALIDATION_ERROR' });
  }
});
