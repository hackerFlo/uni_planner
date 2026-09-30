const { randomUUID, createHash } = require('node:crypto');
const { z } = require('zod');
const { DomainError } = require('../domain/errors');
const { parse, idSchema } = require('../domain/schemas');
const { buildSnapshot } = require('./backupSnapshot');
const { log } = require('../logger');
const MAX_SNAPSHOT_BYTES = 5 * 1024 * 1024;
const EXPORT_TTL_MS = 10 * 60 * 1000;
const exportSchemas = {
  prepare: z.strictObject({}),
  readChunk: z.strictObject({ id: z.uuid(), offset: z.number().int().nonnegative().safe(),
    length: z.number().int().min(1).max(49152).default(49152) }),
};

function prepareSnapshot(db, userId, timestamp) {
  if (!db.prepare('SELECT 1 FROM users WHERE id=?').get(userId)) throw new DomainError('NOT_FOUND', 'Account not found', 404);
  db.prepare('DELETE FROM export_artifacts WHERE user_id=? AND expires_at<=?').run(userId, timestamp);
  if (db.prepare('SELECT count(*) AS n FROM export_artifacts WHERE user_id=?').get(userId).n >= 2) {
    throw new DomainError('RATE_LIMITED', 'Export limit reached; try again after expiry', 429);
  }
  const payload = Buffer.from(JSON.stringify(buildSnapshot(db, userId, log)), 'utf8');
  if (payload.length > MAX_SNAPSHOT_BYTES) throw new DomainError('RESULT_TOO_LARGE', 'Backup exceeds the export size limit', 413);
  const result = { id: randomUUID(), size: payload.length,
    checksum: createHash('sha256').update(payload).digest('hex'), expiresAt: timestamp + EXPORT_TTL_MS };
  db.prepare('INSERT INTO export_artifacts(id,user_id,payload,byte_count,checksum,created_at,expires_at) VALUES(?,?,?,?,?,?,?)')
    .run(result.id, userId, payload, result.size, result.checksum, timestamp, result.expiresAt);
  return result;
}

function readChunk(db, userId, input, timestamp) {
  const row = db.prepare(`SELECT byte_count,checksum,substr(payload,?,?) AS chunk FROM export_artifacts
    WHERE user_id=? AND id=? AND expires_at>?`).get(input.offset + 1, input.length, userId, input.id, timestamp);
  if (!row) throw new DomainError('NOT_FOUND', 'Export not found or expired', 404);
  if (input.offset > row.byte_count) throw new DomainError('VALIDATION_ERROR', 'Invalid chunk offset');
  const next = input.offset + row.chunk.length;
  return { id: input.id, offset: input.offset, length: row.chunk.length, data: row.chunk.toString('base64'), encoding: 'base64',
    nextOffset: next < row.byte_count ? next : null, totalBytes: row.byte_count, checksum: row.checksum };
}

function createExportService(db, { now = Date.now } = {}) {
  return {
    prepare: ({ userId }, args = {}) => {
      parse(exportSchemas.prepare, args);
      return db.transaction(() => prepareSnapshot(db, parse(idSchema, userId), now()))();
    },
    readChunk: ({ userId }, args) => readChunk(db, parse(idSchema, userId), parse(exportSchemas.readChunk, args), now()),
  };
}
module.exports = { createExportService, exportSchemas };
