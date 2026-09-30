const { z } = require('zod');
const { idSchema, dateSchema, parse } = require('../domain/schemas');
const { DomainError } = require('../domain/errors');

const MAX_DIVIDERS_PER_DAY = 20;
const orderSchema = z.number().int().nonnegative().safe();
const dividerSchemas = {
  create: z.strictObject({ date: dateSchema, planner_order: orderSchema.nullish().transform(value => value ?? 0) }),
  update: z.strictObject({ id: idSchema, date: dateSchema }),
  remove: z.strictObject({ id: idSchema }),
  reorder: z.strictObject({ items: z.array(z.strictObject({ id: idSchema, planner_order: orderSchema })).max(10000) }),
};

function ownedDivider(db, userId, id) {
  const row = db.prepare('SELECT id,date,planner_order FROM day_dividers WHERE id=? AND user_id=?').get(id, userId);
  if (!row) throw new DomainError('NOT_FOUND', 'Divider not found', 404);
  return row;
}

function requireCapacity(db, userId, date) {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM day_dividers WHERE user_id=? AND date=?').get(userId, date);
  if (n >= MAX_DIVIDERS_PER_DAY) throw new DomainError('VALIDATION_ERROR', `A day can hold at most ${MAX_DIVIDERS_PER_DAY} dividers`);
}

function create(db, userId, { date, planner_order }) {
  return db.transaction(() => {
    requireCapacity(db, userId, date);
    const result = db.prepare('INSERT INTO day_dividers(user_id,date,planner_order) VALUES(?,?,?)').run(userId, date, planner_order);
    return ownedDivider(db, userId, result.lastInsertRowid);
  })();
}

function update(db, userId, { id, date }) {
  return db.transaction(() => {
    const before = ownedDivider(db, userId, id);
    if (date !== before.date) requireCapacity(db, userId, date);
    db.prepare('UPDATE day_dividers SET date=? WHERE id=? AND user_id=?').run(date, id, userId);
    return ownedDivider(db, userId, id);
  })();
}

function reorder(db, userId, { items }) {
  return db.transaction(() => {
    if (new Set(items.map(item => item.id)).size !== items.length) throw new DomainError('VALIDATION_ERROR', 'Duplicate divider ids');
    for (const item of items) ownedDivider(db, userId, item.id);
    const update = db.prepare('UPDATE day_dividers SET planner_order=? WHERE id=? AND user_id=?');
    for (const item of items) update.run(item.planner_order, item.id, userId);
    return { ok: true };
  })();
}

function remove(db, userId, { id }) {
  const result = db.prepare('DELETE FROM day_dividers WHERE id=? AND user_id=?').run(id, userId);
  if (!result.changes) throw new DomainError('NOT_FOUND', 'Divider not found', 404);
  return { ok: true };
}

function createDayDividerService(db) {
  return {
    list: ({ userId }) => db.prepare('SELECT id,date,planner_order FROM day_dividers WHERE user_id=? ORDER BY date ASC,planner_order ASC,id ASC').all(userId),
    get: ({ userId }, args) => ownedDivider(db, userId, parse(dividerSchemas.remove, args).id),
    create: ({ userId }, args) => create(db, userId, parse(dividerSchemas.create, args)),
    update: ({ userId }, args) => update(db, userId, parse(dividerSchemas.update, args)),
    reorder: ({ userId }, args) => reorder(db, userId, parse(dividerSchemas.reorder, args)),
    remove: ({ userId }, args) => remove(db, userId, parse(dividerSchemas.remove, args)),
  };
}

module.exports = { createDayDividerService, dividerSchemas, MAX_DIVIDERS_PER_DAY };
