const { createHash } = require('node:crypto');
const { z } = require('zod');
const { DomainError } = require('../domain/errors');
const { idSchema, parse } = require('../domain/schemas');

const fields = { name: z.string().trim().min(1).max(40), color: z.enum(['indigo', 'emerald', 'teal', 'amber', 'rose', 'sky', 'violet', 'pink', 'slate']) };
const listSchemas = {
  create: z.strictObject(fields),
  update: z.strictObject({ id: idSchema, name: fields.name.optional(), color: fields.color.optional() })
    .refine(value => value.name !== undefined || value.color !== undefined),
  reorder: z.strictObject({ order: z.array(idSchema).min(1).max(10000) }),
  remove: z.strictObject({ id: idSchema, moveTo: idSchema.optional() }),
};

const pageSchema = z.strictObject({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().max(1024).optional(),
});
const cursorSchema = z.strictObject({
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().min(1).max(100),
});

function parseCursor(raw) {
  if (!raw) return null;
  try {
    return cursorSchema.parse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')));
  } catch {
    throw new DomainError('VALIDATION_ERROR', 'Invalid pagination cursor');
  }
}

function fingerprint(db, userId) {
  const hash = createHash('sha256').update(`[${JSON.stringify(userId)},[`);
  let count = 0;
  const rows = db.prepare('SELECT id, name, color, sort_order FROM lists WHERE user_id = ? ORDER BY sort_order ASC, id ASC').iterate(userId);
  for (const row of rows) {
    if (count++) hash.update(',');
    hash.update(JSON.stringify(row));
  }
  return { digest: hash.update(']]').digest('hex'), count };
}

function pageLists(db, userId, input) {
  const { digest, count } = fingerprint(db, userId);
  const cursor = parseCursor(input.cursor);
  if (cursor && (cursor.digest !== digest || cursor.limit !== input.limit)) {
    throw new DomainError('CONFLICT', 'Lists changed; restart pagination', 409);
  }
  const offset = cursor?.offset || 0;
  const end = offset + input.limit;
  const nextCursor = end < count
    ? Buffer.from(JSON.stringify({ digest, offset: end, limit: input.limit })).toString('base64url') : null;
  const lists = db.prepare(`SELECT id, name, color, sort_order FROM lists
    WHERE user_id = ? ORDER BY sort_order ASC, id ASC LIMIT ? OFFSET ?`).all(userId, input.limit, offset);
  return { lists, nextCursor };
}

function createListService(db) {
  const list = ({ userId }) => db.prepare(
    'SELECT id, name, color, sort_order FROM lists WHERE user_id = ? ORDER BY sort_order ASC, id ASC'
  ).all(userId);
  function page(context, args = {}) {
    const parsed = pageSchema.safeParse(args);
    if (!parsed.success) throw new DomainError('VALIDATION_ERROR', 'Invalid pagination input');
    parseCursor(parsed.data.cursor);
    return db.transaction(() => pageLists(db, context.userId, parsed.data))();
  }
  return { list, page,
    create: (context, args) => createList(db, context.userId, parse(listSchemas.create, args)),
    update: (context, args) => updateList(db, context.userId, parse(listSchemas.update, args)),
    reorder: (context, args) => reorderLists(db, context.userId, parse(listSchemas.reorder, args)),
    remove: (context, args) => removeList(db, context, parse(listSchemas.remove, args)),
  };
}

function ownedList(db, userId, id) {
  const list = db.prepare('SELECT id, name, color, sort_order FROM lists WHERE id = ? AND user_id = ?').get(id, userId);
  if (!list) throw new DomainError('NOT_FOUND', 'List not found', 404);
  return list;
}

function createList(db, userId, { name, color }) {
  return db.transaction(() => {
    const maxOrder = db.prepare('SELECT MAX(sort_order) AS m FROM lists WHERE user_id = ?').get(userId);
    const result = db.prepare('INSERT INTO lists (user_id, name, color, sort_order) VALUES (?, ?, ?, ?)')
      .run(userId, name, color, (maxOrder?.m ?? -1) + 1);
    return ownedList(db, userId, result.lastInsertRowid);
  })();
}

function updateList(db, userId, { id, ...updates }) {
  return db.transaction(() => {
    const before = ownedList(db, userId, id);
    db.prepare('UPDATE lists SET name = ?, color = ? WHERE id = ? AND user_id = ?')
      .run(updates.name ?? before.name, updates.color ?? before.color, id, userId);
    return ownedList(db, userId, id);
  })();
}

function reorderLists(db, userId, { order }) {
  return db.transaction(() => {
    const owned = db.prepare('SELECT id FROM lists WHERE user_id = ?').all(userId);
    const ids = new Set(owned.map(row => row.id));
    if (ids.size !== order.length || new Set(order).size !== order.length || order.some(id => !ids.has(id))) {
      throw new DomainError('VALIDATION_ERROR', 'order must contain exactly all of the user\'s list ids');
    }
    const update = db.prepare('UPDATE lists SET sort_order = ? WHERE id = ? AND user_id = ?');
    order.forEach((id, index) => update.run(index, id, userId));
    return { ok: true };
  })();
}

function validateRemoval(db, userId, id, moveTo) {
  ownedList(db, userId, id);
  const count = db.prepare('SELECT COUNT(*) AS n FROM lists WHERE user_id = ?').get(userId).n;
  if (count <= 1) throw new DomainError('VALIDATION_ERROR', 'Cannot delete your only list');
  if (moveTo !== undefined && (moveTo === id || !db.prepare('SELECT id FROM lists WHERE id = ? AND user_id = ?').get(moveTo, userId))) {
    throw new DomainError('VALIDATION_ERROR', 'Invalid moveTo list id');
  }
  const todoCount = db.prepare('SELECT COUNT(*) AS n FROM todos WHERE list_id = ? AND user_id = ?').get(id, userId).n;
  if (todoCount && moveTo === undefined) {
    const error = new DomainError('VALIDATION_ERROR', 'This list has todos. Provide moveTo=<listId> to move them first.');
    error.todoCount = todoCount;
    throw error;
  }
}

function removeList(db, context, { id, moveTo }) {
  const userId = context.userId;
  return db.transaction(() => {
    validateRemoval(db, userId, id, moveTo);
    if (moveTo !== undefined) db.prepare(`UPDATE todos SET list_id = ?,
      agent_activity_at=CASE WHEN ? THEN NULL ELSE agent_activity_at END,
      agent_activity_action=CASE WHEN ? THEN NULL ELSE agent_activity_action END
      WHERE list_id = ? AND user_id = ?`).run(moveTo, Number(context.actor === 'web'), Number(context.actor === 'web'), id, userId);
    db.prepare('DELETE FROM lists WHERE id = ? AND user_id = ?').run(id, userId);
    return { ok: true };
  })();
}

module.exports = { createListService, pageSchema, listSchemas };
