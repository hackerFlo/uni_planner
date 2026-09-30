const { createHash, randomBytes, randomUUID } = require('node:crypto');
const { DomainError } = require('./errors');
const { mutationControlSchema, parse } = require('./schemas');

const RETENTION_MS = 24 * 60 * 60 * 1000;
// Reserve space for replay/version metadata and the MCP result envelope before committing.
const MAX_RECEIPT_BYTES = 252 * 1024;
const UNDO_MS = 30000;

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

function defaultAuthorize(context) {
  if (!Number.isSafeInteger(context?.userId) || context.userId < 1 || !['web', 'system'].includes(context.actor)) {
    throw new DomainError('FORBIDDEN', 'A trusted authorized principal is required', 403);
  }
}

function getVersion(db, userId) {
  const version = db.prepare('SELECT epoch, revision FROM planner_versions WHERE user_id = ?').get(userId);
  if (!version) throw new DomainError('AUTH_REQUIRED', 'Authentication required', 401);
  return version;
}

function assertVersion(actual, expected) {
  if (actual.epoch !== expected.epoch || actual.revision !== expected.revision) {
    const error = new DomainError('CONFLICT', 'Planner changed; reload before editing', 409);
    error.currentVersion = actual;
    throw error;
  }
}

function receipt(db, context, name, key, hash, version, now) {
  const row = db.prepare(`SELECT input_hash, response FROM mutation_receipts
    WHERE user_id=? AND epoch=? AND operation=? AND retry_key=? AND expires_at>?`)
    .get(context.userId, version.epoch, name, key, now);
  if (!row) return null;
  if (row.input_hash !== hash) throw new DomainError('CONFLICT', 'Retry key was used for different input', 409);
  const saved = JSON.parse(row.response);
  const undone = saved.operationId && db.prepare('SELECT undone FROM planner_operations WHERE user_id=? AND id=?')
    .get(context.userId, saved.operationId)?.undone;
  return { ...saved, currentVersion: version, replayed: true, operationUndone: Boolean(undone) };
}

function saveUndo(db, context, name, result, version, now) {
  if (!result.inverse) return { operationId: null, undoAvailable: false,
    ...(result.undoReason ? { undoReason: result.undoReason } : {}) };
  const inverse = JSON.stringify(result.inverse);
  if (Buffer.byteLength(inverse) > 1024 * 1024) return { operationId: null, undoAvailable: false, undoReason: 'Operation is too large for undo' };
  const operationId = randomUUID();
  const expires = now + UNDO_MS;
  db.prepare(`INSERT INTO planner_operations(id,user_id,operation,actor,epoch,revision,inverse,expires_at)
    VALUES(?,?,?,?,?,?,?,?)`).run(operationId, context.userId, name, context.actor, version.epoch, version.revision, inverse, expires);
  return { operationId, undoAvailable: true, undoExpiresAt: new Date(expires).toISOString() };
}

function advance(db, context, before, result) {
  const actual = getVersion(db, context.userId);
  const changed = result.changed !== false || actual.revision !== before.revision;
  const revision = before.revision + (changed ? 1 : 0);
  db.prepare('UPDATE planner_versions SET revision=? WHERE user_id=?').run(revision, context.userId);
  return { epoch: before.epoch, revision };
}

function reserveCapacity(db, userId, now, quota) {
  db.prepare('DELETE FROM mutation_receipts WHERE user_id=? AND expires_at<=?').run(userId, now);
  const count = db.prepare('SELECT count(*) AS count FROM mutation_receipts WHERE user_id=?').get(userId).count;
  if (count >= quota) throw new DomainError('RATE_LIMITED', 'Retry storage is full; try later', 429);
}

function commitMutation(db, context, name, args, controls, mutate, options) {
  const before = getVersion(db, context.userId);
  const hash = createHash('sha256').update(JSON.stringify(canonical({ args, expectedVersion: controls.expectedVersion }))).digest('hex');
  const replay = receipt(db, context, name, controls.idempotencyKey, hash, before, options.now);
  if (replay) return replay;
  assertVersion(before, controls.expectedVersion);
  reserveCapacity(db, context.userId, options.now, options.receiptQuota);
  const result = mutate();
  if (!result || typeof result.then === 'function') throw new Error('Mutations must be synchronous');
  const resultVersion = advance(db, context, before, result);
  const response = { data: result.data, resultVersion, currentVersion: resultVersion,
    ...saveUndo(db, context, name, result, resultVersion, options.now), replayed: false, operationUndone: false };
  const serialized = JSON.stringify(response);
  if (Buffer.byteLength(serialized) > MAX_RECEIPT_BYTES) throw new DomainError('RESULT_TOO_LARGE', 'Operation response is too large');
  db.prepare(`INSERT INTO mutation_receipts(user_id,epoch,operation,retry_key,input_hash,response,expires_at)
    VALUES(?,?,?,?,?,?,?)`).run(context.userId, before.epoch, name, controls.idempotencyKey, hash, serialized, options.now + RETENTION_MS);
  return response;
}

function createMutationService(db, { authorize = defaultAuthorize, now = Date.now, receiptQuota = 2000 } = {}) {
  function run(context, name, args, controls, mutate) {
    authorize(context, name);
    const validated = parse(mutationControlSchema, controls);
    return db.transaction(() => {
      authorize(context, name);
      return commitMutation(db, context, name, args, validated, mutate, { now: now(), receiptQuota });
    })();
  }
  function maintain(context, mutate) {
    authorize(context, 'maintenance');
    return db.transaction(() => {
      authorize(context, 'maintenance');
      const before = getVersion(db, context.userId);
      const result = mutate();
      if (!result || typeof result.then === 'function') throw new Error('Maintenance must be synchronous');
      return { data: result.data, version: advance(db, context, before, result) };
    })();
  }
  return { run, maintain, version(context) {
    authorize(context, 'read');
    return getVersion(db, context.userId);
  }, reset(context) {
    authorize(context, 'reset');
    return reset(db, context.userId);
  } };
}

function reset(db, userId) {
  return db.transaction(() => {
    db.prepare('DELETE FROM mutation_receipts WHERE user_id=?').run(userId);
    db.prepare('DELETE FROM planner_operations WHERE user_id=?').run(userId);
    for (const table of ['notification_attempts', 'export_artifacts']) {
      if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)) {
        db.prepare(`DELETE FROM ${table} WHERE user_id=?`).run(userId);
      }
    }
    db.prepare('UPDATE planner_versions SET epoch=?, revision=0 WHERE user_id=?').run(randomBytes(16).toString('hex'), userId);
  })();
}

module.exports = { createMutationService, assertVersion };
