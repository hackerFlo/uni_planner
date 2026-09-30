const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { migrateDomain } = require('./migrations');
const { createMutationService } = require('./mutation');

function fixture() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec('CREATE TABLE users(id INTEGER PRIMARY KEY); INSERT INTO users VALUES(1),(2); CREATE TABLE items(id INTEGER PRIMARY KEY,user_id INTEGER,value TEXT)');
  migrateDomain(db);
  return { db, service: createMutationService(db), context: { userId: 1, actor: 'web' } };
}
const KEY = '11111111-1111-4111-8111-111111111111';

test('atomic receipt replay never executes twice and rejects a changed request', () => {
  const { db, service, context } = fixture();
  const control = { expectedVersion: service.version(context), idempotencyKey: KEY };
  let calls = 0;
  const mutate = () => { calls++; return { data: { id: 1 }, changed: true }; };
  const first = service.run(context, 'create_item', { title: 'One' }, control, mutate);
  const retry = service.run(context, 'create_item', { title: 'One' }, control, mutate);
  assert.equal(calls, 1);
  assert.deepEqual(retry.data, first.data);
  assert.equal(retry.replayed, true);
  assert.throws(() => service.run(context, 'create_item', { title: 'Two' }, control, mutate), { code: 'CONFLICT' });
  db.close();
});

test('stale writes and failed writes cannot commit data or receipts', () => {
  const { db, service, context } = fixture();
  const version = service.version(context);
  const control = { expectedVersion: version, idempotencyKey: KEY };
  assert.throws(() => service.run(context, 'update_item', {}, control, () => {
    db.prepare('INSERT INTO items VALUES(1,1,?)').run('new');
    throw new Error('injected failure');
  }));
  assert.equal(db.prepare('SELECT count(*) n FROM items').get().n, 0);
  assert.equal(db.prepare('SELECT count(*) n FROM mutation_receipts').get().n, 0);
  service.run(context, 'update_item', {}, control, () => ({ data: {}, changed: true }));
  assert.throws(() => service.run(context, 'update_item', {}, { ...control, idempotencyKey: '22222222-2222-4222-8222-222222222222' }, () => {}), { code: 'CONFLICT' });
  db.close();
});

test('receipt replay reauthorizes and is isolated by account and epoch', () => {
  const { db, service, context } = fixture();
  const control = { expectedVersion: service.version(context), idempotencyKey: KEY };
  service.run(context, 'create_item', {}, control, () => ({ data: { private: true }, changed: true }));
  const denied = createMutationService(db, { authorize: () => { throw Object.assign(new Error(), { code: 'FORBIDDEN' }); } });
  assert.throws(() => denied.run(context, 'create_item', {}, control, () => {}), { code: 'FORBIDDEN' });
  assert.throws(() => service.run({ userId: 2, actor: 'web' }, 'create_item', {}, control, () => {}), { code: 'CONFLICT' });
  service.reset(context);
  assert.throws(() => service.run(context, 'create_item', {}, control, () => {}), { code: 'CONFLICT' });
  db.close();
});

test('quota preserves unexpired receipts and maintenance increments only on actual change', () => {
  const { db, context } = fixture();
  const service = createMutationService(db, { receiptQuota: 1 });
  const version = service.version(context);
  service.maintain(context, () => ({ data: {}, changed: false }));
  assert.deepEqual(service.version(context), version);
  service.maintain(context, () => ({ data: {}, changed: true }));
  assert.equal(service.version(context).revision, version.revision + 1);
  const control = { expectedVersion: service.version(context), idempotencyKey: KEY };
  service.run(context, 'update_item', {}, control, () => ({ data: {}, changed: true }));
  assert.throws(() => service.run(context, 'update_item', {}, { expectedVersion: service.version(context), idempotencyKey: '22222222-2222-4222-8222-222222222222' }, () => {}), { code: 'RATE_LIMITED' });
  db.close();
});

const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const DAY_MS = 24 * 60 * 60 * 1000;

function trackedFixture(t, options = {}) {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.pragma('foreign_keys = ON');
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY); INSERT INTO users VALUES(1),(2);
    CREATE TABLE lists(id INTEGER PRIMARY KEY,user_id INTEGER,name TEXT);
    INSERT INTO lists VALUES(1,1,'first'),(2,1,'second'),(3,2,'foreign');`);
  migrateDomain(db);
  return { db, context: { userId: 1, actor: 'web' }, service: createMutationService(db, options) };
}
const controlsFor = (service, context, idempotencyKey = randomUUID()) => ({ expectedVersion: service.version(context), idempotencyKey });

function rename(db, name = 'edited') {
  db.prepare('UPDATE lists SET name=? WHERE user_id=?').run(name, 1);
  return { data: { name }, changed: true };
}

test('one wrapped multi-row mutation produces one revision while legacy SQL remains visible', t => {
  const { db, context, service } = trackedFixture(t);
  const controls = controlsFor(service, context);
  const result = service.run(context, 'rename_lists', {}, controls, () => rename(db));
  assert.equal(result.resultVersion.revision, controls.expectedVersion.revision + 1);
  assert.equal(service.version({ userId: 2, actor: 'web' }).revision, 0);
  db.prepare('UPDATE lists SET name=? WHERE id=?').run('legacy', 1);
  assert.equal(service.version(context).revision, result.resultVersion.revision + 1);
  const replay = service.run(context, 'rename_lists', {}, controls, () => { throw new Error('must not execute'); });
  assert.deepEqual(replay.resultVersion, result.resultVersion);
  assert.equal(replay.currentVersion.revision, result.resultVersion.revision + 1);
  assert.equal(db.prepare('SELECT name FROM lists WHERE id=1').get().name, 'legacy');
});

test('canonical object key order replays but array order and changed preconditions conflict', t => {
  const { context, service } = trackedFixture(t);
  const controls = controlsFor(service, context);
  const mutate = () => ({ data: { ok: true }, changed: true });
  service.run(context, 'edit', { title: 'x', patch: { b: 2, a: 1 }, ids: [1, 2] }, controls, mutate);
  const replay = service.run(context, 'edit', { ids: [1, 2], patch: { a: 1, b: 2 }, title: 'x' }, controls,
    () => { throw new Error('must not execute'); });
  assert.equal(replay.replayed, true);
  assert.throws(() => service.run(context, 'edit', { title: 'x', patch: { b: 2, a: 1 }, ids: [2, 1] }, controls, mutate), { code: 'CONFLICT' });
  assert.throws(() => service.run(context, 'edit', { title: 'x', patch: { b: 2, a: 1 }, ids: [1, 2] },
    { ...controls, expectedVersion: service.version(context) }, mutate), { code: 'CONFLICT' });
});

test('authorization runs outside and inside the transaction before executing or replaying', t => {
  const states = [];
  let denyInside = false;
  const { db, context } = trackedFixture(t);
  const service = createMutationService(db, { authorize: () => {
    states.push(db.inTransaction);
    if (denyInside && db.inTransaction) throw Object.assign(new Error('revoked'), { code: 'FORBIDDEN' });
  } });
  const controls = controlsFor(service, context);
  states.length = 0;
  service.run(context, 'edit', {}, controls, () => rename(db));
  assert.deepEqual(states, [false, true]);
  denyInside = true;
  states.length = 0;
  assert.throws(() => service.run(context, 'edit', {}, controls, () => { throw new Error('must not execute'); }), { code: 'FORBIDDEN' });
  assert.deepEqual(states, [false, true]);
  assert.equal(db.prepare('SELECT count(*) n FROM mutation_receipts').get().n, 1);
});

test('default authorization rejects MCP and invalid principals before their mutation can execute', t => {
  const { context, service } = trackedFixture(t);
  const controls = controlsFor(service, context);
  for (const bad of [{ userId: 1, actor: 'mcp' }, { userId: 0, actor: 'web' }, { userId: '1', actor: 'web' }, {}]) {
    assert.throws(() => service.run(bad, 'edit', {}, controls, () => { throw new Error('must not execute'); }), { code: 'FORBIDDEN' });
  }
});

test('same retry key is scoped to account and operation', t => {
  const { service, context } = trackedFixture(t);
  const bob = { userId: 2, actor: 'web' };
  const first = service.run(context, 'first', {}, controlsFor(service, context, KEY), () => ({ data: 'alice' }));
  const second = service.run(bob, 'first', {}, controlsFor(service, bob, KEY), () => ({ data: 'bob' }));
  const third = service.run(context, 'second', {}, controlsFor(service, context, KEY), () => ({ data: 'another operation' }));
  assert.deepEqual([first.data, second.data, third.data], ['alice', 'bob', 'another operation']);
  assert.equal(second.replayed || third.replayed, false);
});

test('response limit failure rolls back real rows, trigger changes, undo and receipt together', t => {
  const { db, service, context } = trackedFixture(t);
  const before = service.version(context);
  assert.throws(() => service.run(context, 'edit', {}, controlsFor(service, context), () => {
    rename(db);
    return { data: 'x'.repeat(256 * 1024), inverse: { type: 'rename', name: 'first' } };
  }), { code: 'RESULT_TOO_LARGE' });
  assert.equal(db.prepare('SELECT name FROM lists WHERE id=1').get().name, 'first');
  assert.deepEqual(service.version(context), before);
  assert.equal(db.prepare('SELECT count(*) n FROM mutation_receipts').get().n, 0);
  assert.equal(db.prepare('SELECT count(*) n FROM planner_operations').get().n, 0);
});

test('changed false preserves version for a pure no-op but cannot mask tracked SQL writes', t => {
  const { db, service, context } = trackedFixture(t);
  const before = service.version(context);
  const noOp = service.run(context, 'noop', {}, controlsFor(service, context), () => ({ data: null, changed: false }));
  assert.deepEqual(noOp.resultVersion, before);
  const actual = service.run(context, 'edit', {}, controlsFor(service, context), () => {
    rename(db); return { data: null, changed: false };
  });
  assert.equal(actual.resultVersion.revision, before.revision + 1);
});

test('bounded undo metadata is persisted with account/version and expires after thirty seconds', t => {
  const timestamp = 100000;
  const { db, service, context } = trackedFixture(t, { now: () => timestamp });
  const inverse = { type: 'rename_lists', lists: [{ id: 1, name: 'first' }] };
  const result = service.run(context, 'edit', {}, controlsFor(service, context), () => ({ ...rename(db), inverse }));
  assert.equal(result.undoAvailable, true);
  assert.equal(result.undoExpiresAt, new Date(timestamp + 30000).toISOString());
  const row = db.prepare('SELECT * FROM planner_operations WHERE user_id=? AND id=?').get(context.userId, result.operationId);
  assert.equal(row.epoch, result.resultVersion.epoch);
  assert.equal(row.revision, result.resultVersion.revision);
  assert.deepEqual(JSON.parse(row.inverse), inverse);
  assert.equal(row.expires_at, timestamp + 30000);
});

test('oversized inverse commits the requested edit with truthful unavailable-undo metadata', t => {
  const { db, service, context } = trackedFixture(t);
  const result = service.run(context, 'edit', {}, controlsFor(service, context), () => ({
    ...rename(db), inverse: { data: 'x'.repeat(1024 * 1024) },
  }));
  assert.equal(result.undoAvailable, false);
  assert.equal(result.operationId, null);
  assert.match(result.undoReason, /too large/);
  assert.equal(db.prepare('SELECT name FROM lists WHERE id=1').get().name, 'edited');
  assert.equal(db.prepare('SELECT count(*) n FROM planner_operations').get().n, 0);
});

test('quota admits valid replay but blocks fresh work without evicting live receipts', t => {
  const { db, service, context } = trackedFixture(t, { receiptQuota: 1 });
  const controls = controlsFor(service, context);
  service.run(context, 'edit', {}, controls, () => rename(db));
  assert.equal(service.run(context, 'edit', {}, controls, () => { throw new Error('must not execute'); }).replayed, true);
  assert.throws(() => service.run(context, 'edit', {}, controlsFor(service, context), () => rename(db, 'blocked')), { code: 'RATE_LIMITED' });
  assert.equal(db.prepare('SELECT count(*) n FROM mutation_receipts').get().n, 1);
  assert.equal(db.prepare('SELECT name FROM lists WHERE id=1').get().name, 'edited');
});

test('expired receipt cannot replay a stale write and fresh work frees only expired capacity', t => {
  let timestamp = 100000;
  const { db, service, context } = trackedFixture(t, { receiptQuota: 1, now: () => timestamp });
  const controls = controlsFor(service, context);
  service.run(context, 'edit', {}, controls, () => rename(db));
  timestamp += DAY_MS;
  assert.throws(() => service.run(context, 'edit', {}, controls, () => rename(db, 'stale')), { code: 'CONFLICT' });
  const result = service.run(context, 'edit', {}, controlsFor(service, context, KEY), () => rename(db, 'fresh'));
  assert.equal(result.replayed, false);
  assert.equal(db.prepare('SELECT count(*) n FROM mutation_receipts').get().n, 1);
  assert.equal(db.prepare('SELECT name FROM lists WHERE id=1').get().name, 'fresh');
});

test('receipts replay after an actual database close/reopen with no duplicate mutation', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-mutation-restart-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'isolated.db');
  let db = new Database(file);
  t.after(() => { if (db.open) db.close(); });
  db.exec('CREATE TABLE users(id INTEGER PRIMARY KEY); INSERT INTO users VALUES(1); CREATE TABLE lists(id INTEGER PRIMARY KEY,user_id INTEGER,name TEXT)');
  migrateDomain(db);
  const context = { userId: 1, actor: 'web' };
  let service = createMutationService(db);
  const controls = controlsFor(service, context);
  const first = service.run(context, 'create_list', { name: 'one' }, controls, () => {
    db.prepare('INSERT INTO lists VALUES(1,1,?)').run('one'); return { data: { id: 1 } };
  });
  db.close();
  db = new Database(file);
  migrateDomain(db);
  service = createMutationService(db);
  const replay = service.run(context, 'create_list', { name: 'one' }, controls, () => { throw new Error('must not execute'); });
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.data, first.data);
  assert.equal(db.prepare('SELECT count(*) n FROM lists').get().n, 1);
});

test('reset rotates only the owner epoch and discards only the owner receipts and undo state', t => {
  const { db, service, context } = trackedFixture(t);
  const other = { userId: 2, actor: 'web' };
  const mutate = () => ({ data: null, inverse: { type: 'test', before: [] } });
  service.run(context, 'edit', {}, controlsFor(service, context), mutate);
  service.run(other, 'edit', {}, controlsFor(service, other), mutate);
  const before = service.version(context);
  const otherVersion = service.version(other);
  service.reset(context);
  assert.notEqual(service.version(context).epoch, before.epoch);
  assert.equal(service.version(context).revision, 0);
  assert.deepEqual(service.version(other), otherVersion);
  assert.deepEqual(db.prepare('SELECT user_id FROM mutation_receipts').all(), [{ user_id: 2 }]);
  assert.deepEqual(db.prepare('SELECT user_id FROM planner_operations').all(), [{ user_id: 2 }]);
});

test('maintenance authorizes again inside the transaction and coalesces tracked changes once', t => {
  const { db, context } = trackedFixture(t);
  const observed = [];
  let denyInside = false;
  const service = createMutationService(db, { authorize: (_context, operation) => {
    if (operation === 'maintenance') observed.push(db.inTransaction);
    if (denyInside && db.inTransaction) throw Object.assign(new Error('revoked'), { code: 'FORBIDDEN' });
  } });
  const before = service.version(context);
  const result = service.maintain(context, () => rename(db));
  assert.deepEqual(observed, [false, true]);
  assert.equal(result.version.revision, before.revision + 1);
  denyInside = true;
  assert.throws(() => service.maintain(context, () => rename(db, 'denied')), { code: 'FORBIDDEN' });
  assert.equal(db.prepare('SELECT name FROM lists WHERE id=1').get().name, 'edited');
});

test('read/reset require authorization and cannot clear receipts with an untrusted actor', t => {
  const { db, service, context } = trackedFixture(t);
  service.run(context, 'edit', {}, controlsFor(service, context), () => rename(db));
  const untrusted = { userId: context.userId, actor: 'mcp' };
  assert.throws(() => service.version(untrusted), { code: 'FORBIDDEN' });
  assert.throws(() => service.reset(untrusted), { code: 'FORBIDDEN' });
  assert.equal(db.prepare('SELECT count(*) n FROM mutation_receipts').get().n, 1);
});

test('malformed controls never reach mutation or produce a receipt', t => {
  const { db, service, context } = trackedFixture(t);
  const valid = controlsFor(service, context);
  for (const controls of [undefined, {}, { ...valid, user_id: 2 }, { ...valid, idempotencyKey: 'not-uuid' },
    { ...valid, expectedVersion: { ...valid.expectedVersion, revision: -1 } },
    { ...valid, expectedVersion: { ...valid.expectedVersion, revision: Number.MAX_SAFE_INTEGER + 1 } },
    { ...valid, expectedVersion: { ...valid.expectedVersion, epoch: 'not-epoch' } }]) {
    assert.throws(() => service.run(context, 'edit', {}, controls, () => { throw new Error('must not execute'); }), { code: 'VALIDATION_ERROR' });
  }
  assert.equal(db.prepare('SELECT count(*) n FROM mutation_receipts').get().n, 0);
});

test('promised or absent mutation results roll back synchronous writes and revisions', t => {
  const { db, service, context } = trackedFixture(t);
  const before = service.version(context);
  for (const result of [undefined, Promise.resolve({ data: null })]) {
    assert.throws(() => service.run(context, 'edit', {}, controlsFor(service, context), () => {
      rename(db); return result;
    }), /synchronous/);
  }
  assert.equal(db.prepare('SELECT name FROM lists WHERE id=1').get().name, 'first');
  assert.deepEqual(service.version(context), before);
});

test('historical receipt replay reports an undone operation and never reapplies it', t => {
  const { db, service, context } = trackedFixture(t);
  const controls = controlsFor(service, context);
  const first = service.run(context, 'edit', {}, controls, () => ({ ...rename(db), inverse: { type: 'test' } }));
  db.prepare('UPDATE planner_operations SET undone=1 WHERE user_id=? AND id=?').run(context.userId, first.operationId);
  db.prepare('UPDATE lists SET name=? WHERE user_id=?').run('restored', context.userId);
  const replay = service.run(context, 'edit', {}, controls, () => { throw new Error('must not execute'); });
  assert.equal(replay.operationUndone, true);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.resultVersion, first.resultVersion);
  assert.deepEqual(replay.currentVersion, service.version(context));
  assert.equal(db.prepare('SELECT name FROM lists WHERE id=1').get().name, 'restored');
});

test('receipt ceiling reserves MCP envelope space and rolls back before an undeliverable commit', t => {
  const { db, service, context } = trackedFixture(t);
  const before = service.version(context);
  assert.throws(() => service.run(context, 'large_result', {}, controlsFor(service, context), () => {
    rename(db, 'must roll back');
    return { data: { payload: 'x'.repeat(256 * 1024 - 500) }, changed: true };
  }), { code: 'RESULT_TOO_LARGE' });
  assert.equal(db.prepare('SELECT name FROM lists WHERE id=1').get().name, 'first');
  assert.deepEqual(service.version(context), before);
  assert.equal(db.prepare('SELECT count(*) n FROM mutation_receipts').get().n, 0);
});
