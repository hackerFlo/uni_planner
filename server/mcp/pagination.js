const { createHash } = require('node:crypto');
const { z } = require('zod');
const { DomainError } = require('../domain/errors');
const pageFields = { limit: z.number().int().min(1).max(100).default(50), cursor: z.string().max(1024).optional() };
const cursorSchema = z.strictObject({ digest: z.string().regex(/^[a-f0-9]{64}$/), offset: z.number().int().min(0).safe() });

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

function pageWindow(context, args, version) {
  const { cursor, ...filters } = args;
  const digest = createHash('sha256').update(JSON.stringify(canonical([context.userId, version, filters]))).digest('hex');
  let offset = 0;
  if (cursor) {
    let decoded;
    try { decoded = cursorSchema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))); }
    catch { throw new DomainError('VALIDATION_ERROR', 'Invalid cursor'); }
    if (decoded.digest !== digest) throw new DomainError('CONFLICT', 'Data changed; restart pagination', 409);
    offset = decoded.offset;
  }
  return { offset, finish(rows) {
    const items = rows.slice(0, args.limit);
    return { items, nextCursor: rows.length > args.limit
      ? Buffer.from(JSON.stringify({ digest, offset: offset + items.length })).toString('base64url') : null };
  } };
}

function paginate(rows, context, args, version) {
  const page = pageWindow(context, args, version);
  return page.finish(rows.slice(page.offset, page.offset + args.limit + 1));
}

module.exports = { paginate, pageWindow, pageFields };
