const { createMutationService } = require('../domain/mutation');
const { createJournal } = require('../domain/journal');
const { z } = require('zod');
const { parse, idSchema } = require('../domain/schemas');
const { DomainError } = require('../domain/errors');
const { createListService, listSchemas } = require('./lists');
const { createDayNoteService, dayNoteSchemas } = require('./dayNotes');
const { createExamService, examSchemas } = require('./exams');
const { createUndoService } = require('./undo');
const { createTodoService, todoCreateSchema, todoUpdateSchema, todoRemoveSchema } = require('./todos');
const { createPlannerService, plannerSchemas } = require('./planner');
const { createPreferenceService, preferenceSchemas } = require('./preferences');
const { createQuoteService, quoteActionSchema, quoteImportSchema } = require('./quotes');
const { createNotificationService, notificationSchemas } = require('./notifications');

function peripheralDefinitions(db, options) {
  const preferences = createPreferenceService(db);
  const quotes = createQuoteService(db);
  const notifications = createNotificationService(db, { authorize: options.authorize });
  return {
    create_preference_profile: { schema: preferenceSchemas.create, noUndo: true, action: preferences.create },
    update_preferences: { schema: preferenceSchemas.update, noUndo: true, action: preferences.update },
    reset_preferences: { schema: preferenceSchemas.reset, noUndo: true, action: preferences.reset },
    dislike_quote: { schema: quoteActionSchema, tables: ['quote_state', 'quote_day'], action: quotes.dislike },
    restore_quote: { schema: quoteActionSchema, tables: ['quote_state', 'quote_day'], action: quotes.restore },
    restore_all_quotes: { schema: z.strictObject({}), noUndo: true, action: quotes.restoreAll },
    import_quotes_csv: { schema: quoteImportSchema, noUndo: true, action: quotes.importCsv },
    update_notification_settings: { schema: notificationSchemas.update, capability: 'notifications', noUndo: true, action: notifications.update },
  };
}

function focusedTaskDefinitions(todos) {
  const recurrence = z.strictObject({ id: idSchema,
    recurrence_interval_days: z.number().int().min(1).max(7).nullable(),
    recurrence_pattern: z.enum(['weekdays', 'weekends']).nullable(),
  }).refine(value => value.recurrence_interval_days === null || value.recurrence_pattern === null);
  return {
    set_task_completed: { schema: z.strictObject({ id: idSchema, completed: z.boolean() }), tables: ['todos'], action: todos.update },
    set_task_archived: { schema: z.strictObject({ id: idSchema, archived: z.boolean() }), tables: ['todos'], action: todos.update },
    set_task_recurrence: { schema: recurrence, tables: ['todos'], action: todos.update },
  };
}

function definitions(db, options) {
  const lists = createListService(db);
  const notes = createDayNoteService(db);
  const exams = createExamService(db);
  const todos = createTodoService(db);
  const board = createPlannerService(db);
  return {
    ...peripheralDefinitions(db, options),
    ...focusedTaskDefinitions(todos),
    create_list: { schema: listSchemas.create, tables: ['lists'], action: (ctx, args) => ({ list: lists.create(ctx, args) }) },
    update_list: { schema: listSchemas.update, tables: ['lists'], action: (ctx, args) => ({ list: lists.update(ctx, args) }) },
    reorder_lists: { schema: listSchemas.reorder, tables: ['lists'], action: lists.reorder },
    delete_list: { schema: listSchemas.remove, tables: ['lists', 'todos'], action: lists.remove },
    set_day_note: { schema: dayNoteSchemas.set, tables: ['day_notes'], action: notes.set },
    create_exam: { schema: examSchemas.create, tables: ['exams'], action: (ctx, args) => ({ exam: exams.create(ctx, args) }) },
    update_exam: { schema: examSchemas.update, tables: ['exams'], action: (ctx, args) => ({ exam: exams.update(ctx, args) }) },
    delete_exam: { schema: examSchemas.remove, tables: ['exams'], action: exams.remove },
    create_task: { schema: todoCreateSchema, tables: ['todos', 'day_dividers'], action: todos.create },
    update_task: { schema: todoUpdateSchema, tables: ['todos'], action: todos.update },
    delete_task: { schema: todoRemoveSchema, tables: ['todos'], action: todos.remove },
    dismiss_task_agent_activity: { schema: z.strictObject({ id: idSchema }), tables: ['todos'], action: todos.dismiss },
    move_planner_item: { schema: plannerSchemas.move, tables: ['todos', 'day_dividers'], action: board.move },
    copy_planner_item: { schema: plannerSchemas.copy, tables: ['todos', 'day_dividers'], action: board.copy },
    reorder_day: { schema: plannerSchemas.reorder, tables: ['todos', 'day_dividers'], action: board.reorder },
    create_divider: { schema: plannerSchemas.createDivider, tables: ['todos', 'day_dividers'], action: board.createDivider },
    delete_divider: { schema: plannerSchemas.deleteDivider, tables: ['todos', 'day_dividers'], action: board.deleteDivider },
  };
}

function createOperations(db, options = {}) {
  const registry = definitions(db, options);
  const mutations = createMutationService(db, options);
  const journal = createJournal(db);
  const undo = createUndoService(db, mutations, { handlers: { planner_rows: journal.restore } });
  function execute(context, name, args, controls) {
    const operation = registry[name];
    if (!operation || !Object.hasOwn(registry, name)) throw new DomainError('NOT_FOUND', 'Unknown operation', 404);
    const input = parse(operation.schema, args);
    return mutations.run(context, name, input, controls, () => {
      if (!operation.noUndo) return journal.capture(context, operation.tables, () => operation.action(context, input));
      const before = db.prepare('SELECT revision FROM planner_versions WHERE user_id=?').get(context.userId).revision;
      const data = operation.action(context, input);
      const after = db.prepare('SELECT revision FROM planner_versions WHERE user_id=?').get(context.userId).revision;
      return { data, changed: after !== before };
    });
  }
  return { execute, version: mutations.version, undo: undo.undo, definitions: registry };
}

module.exports = { createOperations };
