const { z } = require('zod');
const { DomainError } = require('../domain/errors');
const { idSchema, parse } = require('../domain/schemas');
const { validateDayAssigned } = require('../middleware/validate');
const { createQuoteStore } = require('../quotes');
const { MAX_ROWS } = require('../utils/csv');

const date = z.string().refine(value => Boolean(validateDayAssigned(value)), 'Invalid calendar date');
const quoteDailySchema = z.strictObject({ date, select: z.boolean().default(false) });
const quoteActionSchema = z.strictObject({ id: idSchema, date });
const quoteImportSchema = z.strictObject({ csv: z.string().min(1).max(1024 * 1024) });

function account(db, context) {
  const userId = parse(idSchema, context?.userId);
  if (!db.prepare('SELECT id FROM users WHERE id=?').get(userId)) throw new DomainError('AUTH_REQUIRED', 'Authentication required', 401);
  return userId;
}
function daily(store, userId, input) {
  const args = parse(quoteDailySchema, input);
  if (args.select) return { quote: store.quoteForDay(userId, args.date) ?? null, selectionRequired: false };
  const quote = store.readDay(userId, args.date) ?? null;
  return { quote, selectionRequired: quote === null };
}
function changeQuote(db, store, userId, input, disliked) {
  const { id, date } = parse(quoteActionSchema, input);
  return db.transaction(() => {
    if (!store.setDisliked(userId, id, disliked)) throw new DomainError('NOT_FOUND', 'Quote not found', 404);
    store.clearDay(userId, date);
    if (!disliked) store.pinDay(userId, date, id);
    return { quote: store.quoteForDay(userId, date) ?? null };
  })();
}
function importCsv(store, userId, input) {
  const { csv } = parse(quoteImportSchema, input);
  if (!csv.trim() || Buffer.byteLength(JSON.stringify({ csv })) > 1024 * 1024) {
    throw new DomainError('VALIDATION_ERROR', 'CSV content must fit within 1 MiB');
  }
  const result = store.importCsv(userId, csv);
  const errors = result.errors.slice(0, 10);
  if (!result.added && !result.skipped && errors.length) {
    const error = new DomainError('VALIDATION_ERROR', errors[0]);
    error.importErrors = errors;
    error.errorCount = result.errors.length;
    throw error;
  }
  return { added: result.added, skipped: result.skipped, errors, errorCount: result.errors.length,
    maxRows: MAX_ROWS, stats: store.stats(userId) };
}
function createQuoteService(db) {
  const store = createQuoteStore(db);
  return {
    stats: context => ({ stats: store.stats(account(db, context)) }),
    daily: (context, args) => daily(store, account(db, context), args),
    dislike: (context, args) => changeQuote(db, store, account(db, context), args, true),
    restore: (context, args) => changeQuote(db, store, account(db, context), args, false),
    restoreAll(context) {
      const userId = account(db, context);
      return db.transaction(() => ({ restored: store.restoreAll(userId), stats: store.stats(userId) }))();
    },
    importCsv: (context, args) => importCsv(store, account(db, context), args),
  };
}
module.exports = { createQuoteService, quoteDailySchema, quoteActionSchema, quoteImportSchema };
