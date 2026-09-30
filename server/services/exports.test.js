const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-exports-'));
process.env.DATABASE_PATH = path.join(directory, 'test.db');
process.env.LOG_LEVEL = 'error';
const db = require('../db');
const { migrateExports } = require('../domain/exportsMigration');
const { createExportService } = require('./exports');
const { buildSnapshot } = require('./backupSnapshot');
const { createPreferenceService } = require('./preferences');
migrateExports(db);
migrateExports(db);
let clock = 1000000;
const service = createExportService(db, { now: () => clock });
const user = () => ({ userId: Number(db.prepare('INSERT INTO users(email,password_hash) VALUES(?,?)').run(`${randomUUID()}@example.com`, 'x').lastInsertRowid) });
test.after(() => { db.close(); fs.rmSync(directory, { recursive: true, force: true }); });

test('chunks reconstruct one frozen shared snapshot despite later planner changes', () => {
  const ctx = user();
  const list = db.prepare('INSERT INTO lists(user_id,name,color) VALUES(?,?,?)').run(ctx.userId, 'Shared', 'indigo').lastInsertRowid;
  db.prepare('INSERT INTO todos(user_id,list_id,title,description) VALUES(?,?,?,?)').run(ctx.userId, list, 'Original', 'é'.repeat(60000));
  createPreferenceService(db).create(ctx, { id: randomUUID(), label: 'Browser', settings: { theme: 'dark' } });
  const expected = buildSnapshot(db, ctx.userId);
  const artifact = service.prepare(ctx);
  db.prepare('UPDATE todos SET title=? WHERE user_id=?').run('Changed', ctx.userId);
  const parts = [];
  let offset = 0;
  do {
    const chunk = service.readChunk(ctx, { id: artifact.id, offset });
    parts.push(Buffer.from(chunk.data, 'base64'));
    assert.equal(chunk.checksum, artifact.checksum);
    assert.equal(chunk.totalBytes, artifact.size);
    assert.ok(chunk.length <= 49152);
    offset = chunk.nextOffset;
  } while (offset !== null);
  const bytes = Buffer.concat(parts);
  assert.equal(bytes.length, artifact.size);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), artifact.checksum);
  const snapshot = JSON.parse(bytes);
  expected.exported_at = snapshot.exported_at;
  assert.deepEqual(snapshot, expected);
  assert.equal(snapshot.version, 9);
  assert.equal(snapshot.preference_profiles[0].settings.theme, 'dark');
  const columns = Object.keys(snapshot);
  for (const excluded of ['agent_links', 'sessions', 'export_artifacts', 'planner_operations', 'planner_receipts', 'password_hash']) assert.ok(!columns.includes(excluded));
});

test('artifacts reject foreign users, unknown IDs and expired reads with the same error', () => {
  const owner = user();
  const artifact = service.prepare(owner);
  for (const [ctx, id] of [[user(), artifact.id], [owner, randomUUID()]]) {
    assert.throws(() => service.readChunk(ctx, { id, offset: 0 }), { code: 'NOT_FOUND' });
  }
  clock += 600000;
  assert.throws(() => service.readChunk(owner, { id: artifact.id, offset: 0 }), { code: 'NOT_FOUND' });
});

test('two live artifacts per user expire after ten minutes and quota is owner-scoped', () => {
  const owner = user();
  const first = service.prepare(owner);
  service.prepare(owner);
  assert.throws(() => service.prepare(owner), { code: 'RATE_LIMITED' });
  assert.ok(service.prepare(user()).id);
  assert.equal(first.expiresAt, clock + 600000);
  clock += 600000;
  assert.ok(service.prepare(owner).id);
  assert.equal(db.prepare('SELECT count(*) AS n FROM export_artifacts WHERE user_id=?').get(owner.userId).n, 1);
});

test('oversized UTF-8 snapshots fail without retaining an artifact', () => {
  const ctx = user();
  const list = db.prepare('INSERT INTO lists(user_id,name,color) VALUES(?,?,?)').run(ctx.userId, 'Big', 'indigo').lastInsertRowid;
  db.prepare('INSERT INTO todos(user_id,list_id,title,description) VALUES(?,?,?,?)').run(ctx.userId, list, 'Big', 'é'.repeat(3 * 1024 * 1024));
  assert.throws(() => service.prepare(ctx), { code: 'RESULT_TOO_LARGE' });
  assert.equal(db.prepare('SELECT count(*) AS n FROM export_artifacts WHERE user_id=?').get(ctx.userId).n, 0);
});

test('chunk bounds reject coercion, unknown fields, overflow and hostile IDs', () => {
  const ctx = user();
  const artifact = service.prepare(ctx);
  for (const patch of [{ id: "' OR 1=1 --" }, { offset: -1 }, { offset: '0' }, { offset: 0.5 },
    { offset: Number.MAX_SAFE_INTEGER + 1 }, { offset: artifact.size + 1 }, { length: 0 }, { length: 49153 },
    { length: '2' }, { user_id: ctx.userId }]) {
    assert.throws(() => service.readChunk(ctx, { id: artifact.id, offset: 0, ...patch }), { code: 'VALIDATION_ERROR' });
  }
  assert.deepEqual(service.readChunk(ctx, { id: artifact.id, offset: artifact.size }).data, '');
  assert.equal(service.readChunk(ctx, { id: artifact.id, offset: artifact.size }).nextOffset, null);
});

test('snapshot filters foreign preferences and stale foreign quote dislikes', () => {
  const owner = user(), foreign = user();
  createPreferenceService(db).create(foreign, { id: randomUUID(), label: 'Private', settings: {} });
  const quote = db.prepare('INSERT INTO quotes(user_id,text,author) VALUES(?,?,?)').run(foreign.userId, 'Foreign private quote', 'Author').lastInsertRowid;
  db.prepare('INSERT INTO quote_state(user_id,quote_id,disliked) VALUES(?,?,1)').run(owner.userId, quote);
  const snapshot = buildSnapshot(db, owner.userId);
  assert.deepEqual(snapshot.preference_profiles, []);
  assert.deepEqual(snapshot.quote_dislikes, []);
});

test('exports persist across service restart without advancing planner version', () => {
  const owner = user();
  const before = db.prepare('SELECT epoch,revision FROM planner_versions WHERE user_id=?').get(owner.userId);
  const artifact = service.prepare(owner);
  const restarted = createExportService(db, { now: () => clock });
  assert.deepEqual(restarted.readChunk(owner, { id: artifact.id, offset: 0 }), service.readChunk(owner, { id: artifact.id, offset: 0 }));
  assert.deepEqual(db.prepare('SELECT epoch,revision FROM planner_versions WHERE user_id=?').get(owner.userId), before);
  assert.throws(() => service.prepare(owner, { user_id: user().userId }), { code: 'VALIDATION_ERROR' });
  assert.throws(() => service.prepare({ userId: Number.MAX_SAFE_INTEGER }), { code: 'NOT_FOUND' });
});
