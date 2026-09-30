const { z } = require('zod');
const { idSchema, dateSchema, parse } = require('../domain/schemas');
const { DomainError } = require('../domain/errors');
const { createDayDividerService } = require('./dayDividers');

const itemSchema = z.strictObject({ kind: z.enum(['task', 'divider']), id: idSchema });
const indexSchema = z.number().int().nonnegative().safe();
const placementSchema = z.strictObject({ item: itemSchema, day: dateSchema.nullable(), index: indexSchema });
const plannerSchemas = {
  move: placementSchema,
  copy: placementSchema,
  reorder: z.strictObject({ day: dateSchema.nullable(), items: z.array(itemSchema).max(10000) }),
  createDivider: z.strictObject({ day: dateSchema, index: indexSchema }),
  deleteDivider: z.strictObject({ id: idSchema }),
};
const key = item => `${item.kind}:${item.id}`;
const itemDay = item => item.kind === 'divider' ? item.date : item.day_assigned;

function ownedTask(db, userId, id) {
  const row = db.prepare(`SELECT t.* FROM todos t JOIN lists l ON l.id=t.list_id AND l.user_id=t.user_id
    WHERE t.id=? AND t.user_id=? AND t.completed=0 AND t.archived=0`).get(id, userId);
  if (!row) throw new DomainError('NOT_FOUND', 'Task not found', 404);
  const { user_id: _userId, ...task } = row;
  return { kind: 'task', ...task };
}

function getItem(db, dividers, context, item) {
  return item.kind === 'task' ? ownedTask(db, context.userId, item.id)
    : { kind: 'divider', ...dividers.get(context, { id: item.id }) };
}

function orderedReferences(db, userId, range, includeCompleted, paging = []) {
  const predicate = column => range.day !== undefined ? `${column} IS ?` : `${column}>=? AND ${column}<=?`;
  const dates = range.day !== undefined ? [range.day] : [range.from, range.to];
  const active = `SELECT 'task' kind,id,planner_order,day_assigned day,created_at,NULL completed_at,0 done
    FROM todos WHERE user_id=? AND completed=0 AND archived=0 AND ${predicate('day_assigned')}`;
  const dividers = `SELECT 'divider' kind,id,planner_order,date day,NULL created_at,NULL completed_at,0 done
    FROM day_dividers WHERE user_id=? AND ${predicate('date')}`;
  const completed = `SELECT 'completed_task' kind,id,NULL planner_order,day_assigned day,NULL created_at,completed_at,1 done
    FROM todos WHERE user_id=? AND completed=1 AND ${predicate('day_assigned')}`;
  const queries = includeCompleted ? [active, dividers, completed] : [active, dividers];
  const params = queries.flatMap(() => [userId, ...dates]);
  // Same stable browser ordering: active tasks precede divider ties, then
  // newest task timestamp and ascending ID; completed rows follow the board.
  return db.prepare(`SELECT * FROM (${queries.join(' UNION ALL ')}) ORDER BY day ASC,done ASC,
    planner_order IS NULL ASC,planner_order ASC,CASE kind WHEN 'task' THEN 0 ELSE 1 END ASC,
    created_at DESC,completed_at ASC,id ASC${paging.length ? ' LIMIT ? OFFSET ?' : ''}`).all(...params, ...paging);
}
function orderedItems(db, userId, day) {
  return orderedReferences(db, userId, { day }, false).map(({ id, planner_order, kind }) => ({ id, planner_order, kind }));
}
function orderedItemPage(db, userId, args) {
  const input = parse(z.strictObject({ from: dateSchema, to: dateSchema,
    limit: z.number().int().min(1).max(101), offset: z.number().int().nonnegative().safe() }), args);
  return orderedReferences(db, userId, input, true, [input.limit, input.offset]);
}

function renumber(db, userId, items) {
  const task = db.prepare(`UPDATE todos SET planner_order=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id=? AND user_id=? AND completed=0 AND archived=0`);
  const divider = db.prepare('UPDATE day_dividers SET planner_order=? WHERE id=? AND user_id=?');
  items.forEach((item, index) => (item.kind === 'task' ? task : divider).run(index, item.id, userId));
}

function insertAt(items, item, index) {
  const result = items.filter(existing => key(existing) !== key(item));
  result.splice(Math.min(index, result.length), 0, item);
  return result;
}

function setDay(db, dividers, context, item, day) {
  if (item.kind === 'divider') {
    if (day === null) throw new DomainError('VALIDATION_ERROR', 'Dividers cannot move to backlog');
    dividers.update(context, { id: item.id, date: day });
  } else {
    const marker = context.actor === 'mcp' && item.day_assigned !== day
      ? { at: new Date().toISOString(), action: 'moved' } : null;
    db.prepare(`UPDATE todos SET day_assigned=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
      agent_activity_at=CASE WHEN ? THEN ? ELSE agent_activity_at END,
      agent_activity_action=CASE WHEN ? THEN ? ELSE agent_activity_action END
      WHERE id=? AND user_id=? AND completed=0 AND archived=0`)
      .run(day, Number(marker !== null), marker?.at ?? null, Number(marker !== null), marker?.action ?? null, item.id, context.userId);
  }
}

function move(db, dividers, context, { item: ref, day, index }) {
  const item = getItem(db, dividers, context, ref);
  const from = itemDay(item);
  const original = orderedItems(db, context.userId, from).findIndex(entry => key(entry) === key(item));
  const target = orderedItems(db, context.userId, day);
  setDay(db, dividers, context, item, day);
  if (from !== day) renumber(db, context.userId, orderedItems(db, context.userId, from));
  renumber(db, context.userId, insertAt(target, item, index));
  const final = orderedItems(db, context.userId, day).findIndex(entry => key(entry) === key(item));
  if (context.actor === 'web' && item.kind === 'task' && (from !== day || original !== final)) {
    db.prepare('UPDATE todos SET agent_activity_at=NULL,agent_activity_action=NULL WHERE id=? AND user_id=?')
      .run(item.id, context.userId);
  }
  return { item: getItem(db, dividers, context, ref), affectedDays: [...new Set([from, day])] };
}

function copyItem(db, dividers, context, source, day) {
  if (source.kind === 'divider') {
    if (day === null) throw new DomainError('VALIDATION_ERROR', 'Dividers cannot be copied to backlog');
    return { kind: 'divider', ...dividers.create(context, { date: day, planner_order: 0 }) };
  }
  const result = db.prepare(`INSERT INTO todos(user_id,list_id,title,description,approx_time,day_assigned,
    completed,archived,recurrence_interval_days,recurrence_pattern,recurrence_parent_id,completed_at,
    agent_activity_at,agent_activity_action)
    VALUES(?,?,?,?,?,?,0,0,NULL,NULL,NULL,NULL,?,?)`).run(context.userId, source.list_id, source.title,
    source.description, source.approx_time, day, context.actor === 'mcp' ? new Date().toISOString() : null,
    context.actor === 'mcp' ? 'created' : null);
  return ownedTask(db, context.userId, result.lastInsertRowid);
}

function copy(db, dividers, context, { item: ref, day, index }) {
  const source = getItem(db, dividers, context, ref);
  const target = orderedItems(db, context.userId, day);
  const item = copyItem(db, dividers, context, source, day);
  renumber(db, context.userId, insertAt(target, item, index));
  return { item: getItem(db, dividers, context, item), affectedDays: [day] };
}

function reorder(db, context, { day, items }) {
  const before = orderedItems(db, context.userId, day);
  const existing = new Set(before.map(key));
  const requested = new Set(items.map(key));
  if (existing.size !== items.length || requested.size !== items.length || items.some(item => !existing.has(key(item)))) {
    throw new DomainError('VALIDATION_ERROR', 'items must contain exactly the active items on this day');
  }
  renumber(db, context.userId, items);
  if (context.actor === 'web') {
    const clear = db.prepare('UPDATE todos SET agent_activity_at=NULL,agent_activity_action=NULL WHERE id=? AND user_id=?');
    items.filter((item, index) => item.kind === 'task' && key(before[index]) !== key(item))
      .forEach(item => clear.run(item.id, context.userId));
  }
  return { items, affectedDays: [day] };
}

function createDivider(db, dividers, context, { day, index }) {
  const target = orderedItems(db, context.userId, day);
  const item = { kind: 'divider', ...dividers.create(context, { date: day, planner_order: 0 }) };
  renumber(db, context.userId, insertAt(target, item, index));
  return { item: getItem(db, dividers, context, item), affectedDays: [day] };
}

function deleteDivider(db, dividers, context, { id }) {
  const item = { kind: 'divider', ...dividers.get(context, { id }) };
  dividers.remove(context, { id });
  renumber(db, context.userId, orderedItems(db, context.userId, item.date));
  return { item, affectedDays: [item.date] };
}

function createPlannerService(db) {
  const dividers = createDayDividerService(db);
  const transactional = (schema, mutate) => (context, args) => {
    const input = parse(schema, args);
    return db.transaction(() => mutate(context, input))();
  };
  return {
    move: transactional(plannerSchemas.move, (context, args) => move(db, dividers, context, args)),
    copy: transactional(plannerSchemas.copy, (context, args) => copy(db, dividers, context, args)),
    reorder: transactional(plannerSchemas.reorder, (context, args) => reorder(db, context, args)),
    createDivider: transactional(plannerSchemas.createDivider, (context, args) => createDivider(db, dividers, context, args)),
    deleteDivider: transactional(plannerSchemas.deleteDivider, (context, args) => deleteDivider(db, dividers, context, args)),
  };
}

module.exports = { orderedItemPage, createPlannerService, plannerSchemas, orderedItems };
