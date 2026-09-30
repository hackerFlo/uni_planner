const { z } = require('zod');
const { createTodoService, todoListSchema } = require('../../services/todos');
const { orderedItemPage } = require('../../services/planner');
const { createMutationService } = require('../../domain/mutation');
const { idSchema, dateSchema } = require('../../domain/schemas');
const { DomainError } = require('../../domain/errors');
const { pageFields, pageWindow } = require('../pagination');

function materialize(db, context, requested, config, readVersion, authorize) {
  if (!requested) return false;
  const maintenance = createMutationService(db, { authorize: ctx => {
    if (!config.writesEnabled || !ctx.capabilities?.includes('planner_write') || !authorize) {
      throw new DomainError('FORBIDDEN', 'Materialization requires enabled planner writes', 403);
    }
    authorize(ctx, 'materialize_tasks');
  } });
  maintenance.maintain(context, () => {
    const before = readVersion(context);
    const data = createTodoService(db).materialize(context);
    return { data, changed: readVersion(context).revision !== before.revision };
  });
  return true;
}

function safeTask(row, includeDescription) {
  const { user_id: _owner, description, ...data } = row;
  return { ...data, ...(includeDescription ? { description_html: description } : {}) };
}

function taskPage(db, context, args, config, readVersion, authorize) {
  pageWindow(context, { ...args, resource: 'tasks' }, readVersion(context));
  const materializationPerformed = materialize(db, context, args.materialize, config, readVersion, authorize);
  const page = pageWindow(context, { ...args, resource: 'tasks' }, readVersion(context));
  const { todos } = createTodoService(db).page(context, { status: args.status, filters: args.filters,
    query: args.query, limit: args.limit, offset: page.offset, includeDescription: args.includeDescription });
  const result = page.finish(todos);
  return { tasks: result.items.map(row => safeTask(row, args.includeDescription)), nextCursor: result.nextCursor, materializationPerformed };
}

function plannerContext(db, context, config, readVersion) {
  const { notify_tz: timezone } = db.prepare('SELECT notify_tz FROM users WHERE id=?').get(context.userId);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  const from = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 13);
  return { today, timezone, version: readVersion(context), capabilities: context.capabilities,
    writesEnabled: config.writesEnabled, recurrence: { intervalDays: [1, 2, 3, 4, 5, 6, 7], patterns: ['weekdays', 'weekends'] },
    materializationWindow: { from, to: date.toISOString().slice(0, 10) } };
}

function readCollection(db, context, args, key, readVersion) {
  if (Boolean(args.from) !== Boolean(args.to) || (args.from && args.to < args.from)) {
    throw new DomainError('VALIDATION_ERROR', 'Supply an ordered from/to date range');
  }
  const page = pageWindow(context, { ...args, resource: key }, readVersion(context));
  const columns = key === 'notes' ? 'date,note' : 'id,title,exam_date';
  const table = key === 'notes' ? 'day_notes' : 'exams';
  const date = key === 'notes' ? 'date' : 'exam_date';
  const range = args.from ? ` AND ${date}>=? AND ${date}<=?` : '';
  const order = key === 'notes' ? 'date ASC' : 'exam_date ASC,id ASC';
  const rows = db.prepare(`SELECT ${columns} FROM ${table} WHERE user_id=?${range} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .all(context.userId, ...(args.from ? [args.from, args.to] : []), args.limit + 1, page.offset);
  const result = page.finish(rows);
  return { [key]: result.items, nextCursor: result.nextCursor };
}
function weekItem(db, service, context, ref) {
  if (ref.kind !== 'divider') return { kind: ref.kind, ...safeTask(service.get(context, ref.id).todo, true) };
  return { kind: 'divider', ...db.prepare('SELECT id,date,planner_order FROM day_dividers WHERE user_id=? AND id=?')
    .get(context.userId, ref.id), day_assigned: ref.day };
}
function getWeek(db, context, args, config, readVersion, authorize) {
  const start = new Date(`${args.week_start}T12:00:00Z`);
  if (start.getUTCDay() !== 1) throw new DomainError('VALIDATION_ERROR', 'week_start must be a Monday');
  start.setUTCDate(start.getUTCDate() + 6);
  const to = start.toISOString().slice(0, 10);
  pageWindow(context, { ...args, resource: 'week' }, readVersion(context));
  const materializationPerformed = materialize(db, context, args.materialize, config, readVersion, authorize);
  const page = pageWindow(context, { ...args, resource: 'week' }, readVersion(context));
  const refs = orderedItemPage(db, context.userId, { from: args.week_start, to, limit: args.limit + 1, offset: page.offset });
  const result = page.finish(refs);
  const service = createTodoService(db);
  const range = { from: args.week_start, to, limit: 100 };
  const exams = readCollection(db, context, range, 'exams', readVersion);
  return { from: args.week_start, to, items: result.items.map(ref => weekItem(db, service, context, ref)), nextCursor: result.nextCursor,
    notes: readCollection(db, context, { ...range, limit: 7 }, 'notes', readVersion).notes,
    exams: exams.exams, examsTruncated: exams.nextCursor !== null,
    examsNextCursor: exams.nextCursor, materializationPerformed,
    materializationWindow: plannerContext(db, context, config, readVersion).materializationWindow };
}

function plannerReadTools(db, config, readVersion, { authorize } = {}) {
  const tasks = z.strictObject({ ...todoListSchema.shape, ...pageFields, includeDescription: z.boolean().default(false) });
  return [
    { name: 'get_planner_context', description: 'Read current planner timezone, permissions and the bounded recurrence window.', schema: z.strictObject({}),
      action: ctx => plannerContext(db, ctx, config, readVersion) },
    { name: 'get_task', description: 'Read an owned task, including sanitized HTML description and effective recurrence.', schema: z.strictObject({ id: idSchema }),
      action: (ctx, args) => ({ task: safeTask(createTodoService(db).get(ctx, args.id).todo, true) }) },
    { name: 'list_tasks', description: 'Read stored task summaries. Optional materialize creates current/next-week instances and requires write permission; single deleted or moved occurrences can regenerate.', schema: tasks, writes: true,
      action: (ctx, args) => taskPage(db, ctx, args, config, readVersion, authorize) },
    { name: 'search_tasks', description: 'Search owned task titles and descriptions for a literal substring.', schema: tasks.extend({ query: z.string().trim().min(1).max(200) }), writes: true,
      action: (ctx, args) => taskPage(db, ctx, args, config, readVersion, authorize) },
    { name: 'get_week', description: 'Read one Monday-based week in mixed item pages, at most seven notes and one hundred exams. Continue examsNextCursor via list_exams with the same from/to and limit=100. Optional recurrence materialization requires writes.',
      schema: z.strictObject({ week_start: dateSchema, materialize: z.boolean().default(false), ...pageFields }), writes: true,
      action: (ctx, args) => getWeek(db, ctx, args, config, readVersion, authorize) },
    ...[['list_day_notes', 'notes'], ['list_exams', 'exams']].map(([name, key]) => ({
      name, description: `Read owned ${key} in bounded pages, optionally restricted to an inclusive from/to date range.`,
      schema: z.strictObject({ ...pageFields, from: dateSchema.optional(), to: dateSchema.optional() }),
      action: (ctx, args) => readCollection(db, ctx, args, key, readVersion),
    })),
  ];
}

module.exports = { plannerReadTools };
