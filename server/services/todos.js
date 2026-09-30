const { z } = require('zod');
const { DomainError } = require('../domain/errors');
const { idSchema, parse } = require('../domain/schemas');
const { sanitizeDescription, validateDayAssigned } = require('../middleware/validate');
const { createRecurrenceService } = require('../recurrence');
const { createPlannerService } = require('./planner');

const daySchema = z.string().refine(value => Boolean(validateDayAssigned(value)), 'Invalid calendar date');
const commonFields = {
  title: z.string().trim().min(1).max(200), description: z.string().max(20000).nullable().optional(),
  list_id: idSchema, day_assigned: daySchema.nullable().optional(),
  approx_time: z.string().trim().max(50).nullable().optional(),
  recurrence_interval_days: z.number().int().min(1).max(7).nullable().optional(),
  recurrence_pattern: z.enum(['weekdays', 'weekends']).nullable().optional(),
};
const todoCreateSchema = z.strictObject({ ...commonFields, completed: z.boolean().default(false) });
const todoUpdateSchema = z.strictObject({ ...Object.fromEntries(Object.entries(commonFields).map(([key, schema]) => [key, schema.optional()])),
  id: idSchema, completed: z.boolean().optional(), archived: z.boolean().optional(),
  planner_order: z.number().int().nonnegative().safe().nullable().optional(),
});
const todoListSchema = z.strictObject({
  status: z.enum(['active', 'archived', 'completed', 'all']).default('active'), materialize: z.boolean().default(false),
  filters: z.strictObject({ from: daySchema.optional(), to: daySchema.optional(), list_id: idSchema.optional() }).default({}),
});
const todoRemoveSchema = z.strictObject({ id: idSchema, scope: z.enum(['single', 'all']).default('single') });
const todoReorderSchema = z.strictObject({ items: z.array(z.strictObject({ id: idSchema,
  planner_order: z.number().int().nonnegative().safe() })).max(1000) });
const TODO_SELECT = `SELECT t.id,t.user_id,t.list_id,t.title,t.description,t.completed,t.archived,
  t.day_assigned,t.created_at,t.updated_at,t.planner_order,t.approx_time,t.completed_at,t.recurrence_parent_id,
  t.agent_activity_at,t.agent_activity_action,
  COALESCE(t.recurrence_interval_days,p.recurrence_interval_days) AS recurrence_interval_days,
  COALESCE(t.recurrence_pattern,p.recurrence_pattern) AS recurrence_pattern
  FROM todos t LEFT JOIN todos p ON p.id=t.recurrence_parent_id AND p.user_id=t.user_id`;
const invalid = message => { throw new DomainError('VALIDATION_ERROR', message); };
const nowIso = () => new Date().toISOString();

function owner(context) { return parse(idSchema, context?.userId); }
function ownedTodo(db, userId, id) {
  const todo = db.prepare(`${TODO_SELECT} WHERE t.id=? AND t.user_id=?`).get(parse(idSchema, id), userId);
  if (!todo) throw new DomainError('NOT_FOUND', 'Todo not found', 404);
  return todo;
}
function ownedList(db, userId, id) {
  if (!db.prepare('SELECT id FROM lists WHERE id=? AND user_id=?').get(id, userId)) invalid('Invalid list_id');
}
function timezone(db, userId) {
  const row = db.prepare('SELECT notify_tz FROM users WHERE id=?').get(userId);
  if (!row) throw new DomainError('AUTH_REQUIRED', 'Authentication required', 401);
  return row.notify_tz || 'UTC';
}
function cleanDescription(value) {
  const description = sanitizeDescription(value);
  if (description === null) invalid('Description too long (max 5000 chars)');
  return description;
}
function ruleValues(args) {
  const interval = args.recurrence_interval_days ?? null;
  const pattern = args.recurrence_pattern ?? null;
  if (interval !== null && pattern !== null) invalid('Cannot set both recurrence_interval_days and recurrence_pattern');
  return { interval, pattern, recurring: interval !== null || pattern !== null };
}
function validRange(status, filters) {
  const { from, to } = filters;
  if (status === 'completed' && (!from || !to)) invalid('from and to must be YYYY-MM-DD dates');
  if (Boolean(from) !== Boolean(to)) invalid('from and to must be supplied together');
  if (from && (to < from || (Date.parse(to) - Date.parse(from)) / 86400000 > 62)) invalid('Invalid date range (maximum 62 days)');
}

const searchFunctions = new WeakSet();
function enableLiteralSearch(db) {
  if (searchFunctions.has(db)) return;
  db.function('planner_lower', { deterministic: true }, value => value.toLocaleLowerCase());
  searchFunctions.add(db);
}
function listQuery(db, context, { status, filters, query }) {
  const userId = owner(context);
  validRange(status, filters);
  if (filters.list_id !== undefined) ownedList(db, userId, filters.list_id);
  const conditions = ['t.user_id=?'];
  const params = [userId];
  const statusSql = { active: 't.archived=0', archived: 't.archived=1', completed: 't.completed=1' };
  if (statusSql[status]) conditions.push(statusSql[status]);
  if (filters.from) { conditions.push('t.day_assigned>=? AND t.day_assigned<=?'); params.push(filters.from, filters.to); }
  if (filters.list_id !== undefined) { conditions.push('t.list_id=?'); params.push(filters.list_id); }
  if (query) {
    enableLiteralSearch(db);
    conditions.push("instr(planner_lower(t.title || char(10) || coalesce(t.description,'')),planner_lower(?))>0");
    params.push(query);
  }
  const order = status === 'completed' ? 't.day_assigned ASC,t.completed_at ASC,t.id ASC'
    : status === 'archived' ? 't.updated_at DESC,t.id DESC' : 't.created_at DESC,t.id ASC';
  return { sql: `${TODO_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY ${order}`, params };
}

function materializeTodos(db, recurrence, context) {
  const userId = owner(context);
  recurrence.materializeWindowForUser(userId, timezone(db, userId));
  return { materializationPerformed: true };
}
function listTodos(db, recurrence, context, input) {
  const args = parse(todoListSchema, input);
  const query = listQuery(db, context, args);
  if (args.materialize) materializeTodos(db, recurrence, context);
  return { todos: db.prepare(query.sql).all(...query.params), materializationPerformed: args.materialize };
}
const todoPageSchema = z.strictObject({ ...todoListSchema.omit({ materialize: true }).shape,
  limit: z.number().int().min(1).max(100).default(50), offset: z.number().int().nonnegative().safe().default(0),
  query: z.string().trim().min(1).max(200).optional(), includeDescription: z.boolean().default(true),
});
function pageTodos(db, context, input) {
  const args = parse(todoPageSchema, input);
  const query = listQuery(db, context, args);
  const sql = args.includeDescription ? query.sql : query.sql.replace('t.description,', "NULL AS description,");
  return { todos: db.prepare(`${sql} LIMIT ? OFFSET ?`).all(...query.params, args.limit + 1, args.offset) };
}

function createTodo(db, recurrence, context, input) {
  const userId = owner(context);
  const args = parse(todoCreateSchema, input);
  const rule = ruleValues(args);
  const description = cleanDescription(args.description);
  ownedList(db, userId, args.list_id);
  if (rule.recurring && !args.day_assigned) invalid('A start day is required for recurring tasks');
  return db.transaction(() => {
    const { lastInsertRowid: id } = db.prepare(`INSERT INTO todos(user_id,list_id,title,description,day_assigned,
      approx_time,recurrence_interval_days,recurrence_pattern,completed,archived,completed_at,
      agent_activity_at,agent_activity_action) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(userId, args.list_id, args.title, description, args.day_assigned ?? null,
        args.approx_time || null, rule.interval, rule.pattern, Number(args.completed), Number(args.completed), args.completed ? nowIso() : null,
        context.actor === 'mcp' ? nowIso() : null, context.actor === 'mcp' ? 'created' : null);
    if (args.day_assigned && !args.completed) createPlannerService(db).move(context, { item: { kind: 'task', id }, day: args.day_assigned, index: Number.MAX_SAFE_INTEGER });
    if (rule.recurring) recurrence.materializeForTemplate(id, timezone(db, userId), userId);
    if (rule.recurring && context.actor === 'mcp') db.prepare(`UPDATE todos SET agent_activity_at=?,agent_activity_action='created'
      WHERE user_id=? AND recurrence_parent_id=?`).run(nowIso(), userId, id);
    return { todo: ownedTodo(db, userId, id), materialized: children(db, userId, id) };
  })();
}
function children(db, userId, id) {
  return db.prepare(`${TODO_SELECT} WHERE t.recurrence_parent_id=? AND t.user_id=? ORDER BY t.day_assigned,t.id`).all(id, userId);
}
function seriesPatch(db, userId, args) {
  const updates = {};
  if (args.title !== undefined) updates.title = args.title;
  if (args.description !== undefined) updates.description = cleanDescription(args.description);
  if (args.list_id !== undefined) { ownedList(db, userId, args.list_id); updates.list_id = args.list_id; }
  if (args.approx_time !== undefined) updates.approx_time = args.approx_time || null;
  return updates;
}
function instancePatch(args) {
  const updates = {};
  if (args.completed !== undefined) Object.assign(updates, { completed: Number(args.completed),
    archived: Number(args.completed), completed_at: args.completed ? nowIso() : null });
  if (args.archived !== undefined) {
    updates.archived = Number(args.archived);
    if (!args.archived) Object.assign(updates, { completed: 0, completed_at: null });
  }
  if (args.planner_order !== undefined) updates.planner_order = args.planner_order;
  if (args.day_assigned !== undefined) updates.day_assigned = args.day_assigned;
  return updates;
}
function writePatch(db, userId, id, updates, series = false) {
  if (!Object.keys(updates).length) return;
  const data = { ...updates, updated_at: nowIso() };
  const set = Object.keys(data).map(key => `${key}=?`).join(',');
  const predicate = series ? '(id=? OR recurrence_parent_id=?)' : 'id=?';
  db.prepare(`UPDATE todos SET ${set} WHERE user_id=? AND ${predicate}`)
    .run(...Object.values(data), userId, id, ...(series ? [id] : []));
}
function deleteRows(db, userId, predicate, params) {
  const where = `user_id=? AND ${predicate}`;
  const ids = db.prepare(`SELECT id FROM todos WHERE ${where} ORDER BY id`).all(userId, ...params).map(row => row.id);
  db.prepare(`DELETE FROM todos WHERE ${where}`).run(userId, ...params);
  return ids;
}
function detachEarlier(db, userId, existing) {
  const parentId = existing.recurrence_parent_id;
  const earlier = db.prepare(`SELECT id FROM todos WHERE user_id=? AND recurrence_parent_id=?
    AND day_assigned IS NOT NULL AND day_assigned<?`).all(userId, parentId, existing.day_assigned).map(row => row.id);
  db.prepare(`UPDATE todos SET recurrence_parent_id=NULL,updated_at=? WHERE user_id=? AND recurrence_parent_id=?
    AND day_assigned IS NOT NULL AND day_assigned<?`).run(nowIso(), userId, parentId, existing.day_assigned);
  const parent = db.prepare('SELECT day_assigned FROM todos WHERE id=? AND user_id=?').get(parentId, userId);
  if (parent && (!parent.day_assigned || parent.day_assigned < existing.day_assigned)) {
    earlier.push(parentId);
    writePatch(db, userId, parentId, { recurrence_interval_days: null, recurrence_pattern: null });
  }
  return earlier;
}
function applyRule(db, recurrence, userId, existing, rule) {
  const tz = timezone(db, userId);
  let detached = [];
  let removedIds;
  if (existing.recurrence_parent_id !== null) {
    detached = detachEarlier(db, userId, existing);
    removedIds = deleteRows(db, userId, `recurrence_parent_id=? AND completed=0 AND archived=0 AND day_assigned>=? AND id!=?`,
      [existing.recurrence_parent_id, existing.day_assigned, existing.id]);
  } else {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    removedIds = deleteRows(db, userId, 'recurrence_parent_id=? AND completed=0 AND archived=0 AND (day_assigned IS NULL OR day_assigned>=?)',
      [existing.id, today]);
  }
  writePatch(db, userId, existing.id, { recurrence_parent_id: null, recurrence_interval_days: rule.interval, recurrence_pattern: rule.pattern });
  if (rule.recurring) recurrence.materializeForTemplate(existing.id, tz, userId);
  return { detached, removedIds };
}
function recurrenceChanged(args, existing) {
  const provided = 'recurrence_interval_days' in args || 'recurrence_pattern' in args;
  if (!provided) return false;
  const rule = ruleValues(args);
  return rule.interval !== existing.recurrence_interval_days || rule.pattern !== existing.recurrence_pattern;
}
function updateTodo(db, recurrence, context, input) {
  const userId = owner(context);
  const args = parse(todoUpdateSchema, input);
  if (Object.keys(args).length === 1) invalid('No valid fields to update');
  return db.transaction(() => {
    const existing = ownedTodo(db, userId, args.id);
    const hasChange = recurrenceChanged(args, existing);
    const rule = hasChange ? ruleValues(args) : null;
    if (rule?.recurring && !(args.day_assigned !== undefined ? args.day_assigned : existing.day_assigned)) invalid('A start day is required for recurring tasks');
    const recurring = existing.recurrence_parent_id !== null || existing.recurrence_interval_days !== null || existing.recurrence_pattern !== null;
    const seriesUpdates = seriesPatch(db, userId, args);
    const instanceUpdates = instancePatch(args);
    if (context.actor === 'web' && Object.keys(seriesUpdates).length) {
      Object.assign(seriesUpdates, { agent_activity_at: null, agent_activity_action: null });
    }
    if (context.actor === 'web' && (Object.keys(instanceUpdates).length || hasChange)) {
      Object.assign(instanceUpdates, { agent_activity_at: null, agent_activity_action: null });
    }
    if (context.actor === 'mcp' && args.day_assigned !== undefined && args.day_assigned !== existing.day_assigned) {
      Object.assign(instanceUpdates, { agent_activity_at: nowIso(), agent_activity_action: 'moved' });
    }
    writePatch(db, userId, existing.recurrence_parent_id ?? existing.id, seriesUpdates, recurring);
    writePatch(db, userId, existing.id, instanceUpdates);
    const { detached, removedIds } = hasChange ? applyRule(db, recurrence, userId, existing, rule) : { detached: [], removedIds: [] };
    const todo = ownedTodo(db, userId, existing.id);
    const materialized = hasChange ? children(db, userId, existing.id) : [];
    if (hasChange && existing.recurrence_parent_id !== null) {
      materialized.unshift(todo);
      materialized.push(...detached.map(id => ownedTodo(db, userId, id)));
    }
    return { todo, materialized, removedIds };
  })();
}
function removeTodo(db, context, input) {
  const userId = owner(context);
  const { id, scope } = parse(todoRemoveSchema, input);
  return db.transaction(() => {
    const existing = ownedTodo(db, userId, id);
    const parent = existing.recurrence_parent_id ?? id;
    const removedIds = scope === 'all' ? deleteRows(db, userId, '(id=? OR recurrence_parent_id=?)', [parent, parent])
      : deleteRows(db, userId, 'id=?', [id]);
    return { ok: true, removedIds };
  })();
}
function reorderTodos(db, context, input) {
  const userId = owner(context);
  const { items } = parse(todoReorderSchema, input);
  if (new Set(items.map(item => item.id)).size !== items.length) invalid('Duplicate task IDs');
  return db.transaction(() => {
    for (const item of items) ownedTodo(db, userId, item.id);
    for (const item of items) {
      const before = ownedTodo(db, userId, item.id);
      writePatch(db, userId, item.id, { planner_order: item.planner_order,
        ...(context.actor === 'web' && before.planner_order !== item.planner_order
          ? { agent_activity_at: null, agent_activity_action: null } : {}) });
    }
    return { ok: true };
  })();
}
function dismissAgentActivity(db, context, input) {
  const { id } = parse(z.strictObject({ id: idSchema }), input);
  const userId = owner(context);
  ownedTodo(db, userId, id);
  db.prepare('UPDATE todos SET agent_activity_at=NULL,agent_activity_action=NULL WHERE id=? AND user_id=? AND agent_activity_at IS NOT NULL')
    .run(id, userId);
  return { todo: ownedTodo(db, userId, id) };
}
function createTodoService(db) {
  const recurrence = createRecurrenceService(db);
  return {
    list: (context, input = {}) => listTodos(db, recurrence, context, input),
    page: (context, input = {}) => pageTodos(db, context, input),
    materialize: context => materializeTodos(db, recurrence, context),
    get: (context, id) => ({ todo: ownedTodo(db, owner(context), id) }),
    create: (context, input) => createTodo(db, recurrence, context, input),
    update: (context, input) => updateTodo(db, recurrence, context, input),
    remove: (context, input) => removeTodo(db, context, input),
    reorder: (context, input) => reorderTodos(db, context, input),
    dismiss: (context, input) => dismissAgentActivity(db, context, input),
  };
}
module.exports = { createTodoService, todoCreateSchema, todoUpdateSchema, todoListSchema, todoRemoveSchema };
