const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
process.env.LOG_LEVEL = 'error';
delete process.env.GMAIL_USER;
delete process.env.GMAIL_APP_PASSWORD;
const Database = require('better-sqlite3');
const { migrateDomain } = require('../domain/migrations');
const { migrateNotifications } = require('../domain/notificationsMigration');
const { createNotificationService } = require('./notifications');
let db, service, time, sends;
const ctx = { userId: 1, actor: 'web' };
const foreign = { userId: 2, actor: 'web' };
const version = userId => db.prepare('SELECT epoch,revision FROM planner_versions WHERE user_id=?').get(userId);
const controls = userId => ({ expectedVersion: version(userId), idempotencyKey: randomUUID() });
test.beforeEach(() => {
  process.env.NOTIFICATION_ENCRYPT_KEY = 'a'.repeat(64);
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT,notify_enabled INTEGER DEFAULT 0,
    notify_time TEXT DEFAULT '22:00',notify_tz TEXT DEFAULT 'UTC',notify_email_enc TEXT);
    INSERT INTO users(id,email) VALUES(1,'synthetic-owner@example.com'),(2,'synthetic-foreign@example.com');
    CREATE TABLE lists(id INTEGER PRIMARY KEY,user_id INTEGER,name TEXT,color TEXT);
    INSERT INTO lists VALUES(1,1,'Owner list','teal'),(2,2,'Foreign list','rose');
    CREATE TABLE todos(id INTEGER PRIMARY KEY,user_id INTEGER,list_id INTEGER,title TEXT,approx_time TEXT,
      completed INTEGER,archived INTEGER,completed_at TEXT,day_assigned TEXT,planner_order INTEGER);
    INSERT INTO todos VALUES(1,1,1,'Owner task','30 min',0,0,NULL,'2026-09-27',0),
      (2,2,2,'PRIVATE FOREIGN TASK',NULL,0,0,NULL,'2026-09-27',0);`);
  migrateDomain(db);
  migrateNotifications(db);
  time = Date.parse('2026-09-27T12:00:00Z');
  sends = [];
  service = createNotificationService(db, { now: () => time, sendTestEmail: async (...args) => {
    assert.equal(db.inTransaction, false);
    sends.push(args);
  } });
  service.update(ctx, { notify_email: 'recipient-canary@example.com' });
});
test.afterEach(() => { db.close(); delete process.env.NOTIFICATION_ENCRYPT_KEY; });

test('settings encrypt email and expose only owned normalized fields', () => {
  service.update(ctx, { notify_enabled: true, notify_time: '07:30', notify_tz: 'Europe/Berlin' });
  assert.deepEqual(service.settings(ctx), { notify_enabled: true, notify_time: '07:30', notify_tz: 'Europe/Berlin', notify_email: 'recipient-canary@example.com' });
  assert.equal(service.settings(foreign).notify_email, '');
  assert.equal(db.prepare('SELECT notify_email_enc FROM users WHERE id=1').get().notify_email_enc.includes('recipient-canary'), false);
});

test('settings strictly reject malformed booleans, times, zones, recipients and extra fields', () => {
  for (const args of [{ notify_enabled: 'true' }, { notify_time: '25:00' }, { notify_tz: 'Mars/Olympus' },
    { notify_email: 'a@example.com\r\nBcc: b@example.com' }, { notify_email: 'bad' }, { user_id: 2 }, {}]) {
    assert.throws(() => service.update(ctx, args), { code: 'VALIDATION_ERROR' });
  }
  assert.equal(service.settings(ctx).notify_enabled, false);
});

test('missing encryption configuration cannot store plaintext or send', async () => {
  delete process.env.NOTIFICATION_ENCRYPT_KEY;
  assert.throws(() => service.update(ctx, { notify_email: 'plaintext@example.com' }), { code: 'UPSTREAM_UNAVAILABLE' });
  await assert.rejects(service.sendTest(ctx, controls(1)), { code: 'UPSTREAM_UNAVAILABLE' });
  assert.equal(sends.length, 0);
});

test('send uses only saved recipient and owned content outside the transaction', async () => {
  const input = controls(1);
  const before = version(1);
  const result = await service.sendTest(ctx, input);
  assert.equal(result.status, 'sent');
  assert.equal(sends[0][0], 'recipient-canary@example.com');
  assert.deepEqual(sends[0][1].uncompletedTodos.map(t => t.title), ['Owner task']);
  assert.match(sends[0][1].messageId, /^<notification-[a-f0-9-]+@uni-planner\.invalid>$/);
  assert.deepEqual(version(1), before);
  const stored = JSON.stringify(db.prepare('SELECT * FROM notification_attempts').all());
  assert.equal(/recipient-canary|Owner task|PRIVATE FOREIGN|password|smtp/i.test(stored), false);
});

test('successful retries never resend and changed request versions conflict', async () => {
  const input = controls(1);
  await service.sendTest(ctx, input);
  const replay = await service.sendTest(ctx, input);
  assert.equal(replay.replayed, true);
  assert.equal(sends.length, 1);
  service.update(ctx, { notify_time: '08:00' });
  await assert.rejects(service.sendTest(ctx, { ...input, expectedVersion: version(1) }), { code: 'CONFLICT' });
  assert.equal(sends.length, 1);
});

test('foreign retry keys never access another owner attempt', async () => {
  const input = controls(1);
  await service.sendTest(ctx, input);
  service.update(foreign, { notify_email: 'other@example.com' });
  const result = await service.sendTest(foreign, { ...controls(2), idempotencyKey: input.idempotencyKey });
  assert.equal(result.replayed, false);
  assert.deepEqual(sends.map(args => args[0]), ['recipient-canary@example.com', 'other@example.com']);
});

test('stale preconditions, caller recipients, and absent recipients fail without sending', async () => {
  const input = controls(1);
  service.update(ctx, { notify_time: '09:00' });
  await assert.rejects(service.sendTest(ctx, input), { code: 'CONFLICT' });
  await assert.rejects(service.sendTest(ctx, { ...controls(1), recipient: 'attacker@example.com' }), { code: 'VALIDATION_ERROR' });
  await assert.rejects(service.sendTest(foreign, controls(2)), { code: 'VALIDATION_ERROR' });
  assert.equal(sends.length, 0);
});

test('concurrent retry observes pending and never starts a second delivery', async () => {
  let finish;
  const pendingSender = new Promise(resolve => { finish = resolve; });
  const pending = createNotificationService(db, { now: () => time, sendTestEmail: async () => pendingSender });
  const input = controls(1);
  const first = pending.sendTest(ctx, input);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await pending.sendTest(ctx, input)).status, 'in_progress');
  finish();
  assert.equal((await first).status, 'sent');
});

test('transport errors and timeouts are ambiguous and the same key is never resent', async () => {
  let called = 0;
  const ambiguous = createNotificationService(db, { now: () => time, sendTestEmail: async () => { called++; throw new Error('recipient-canary secret upstream error'); } });
  const input = controls(1);
  await assert.rejects(ambiguous.sendTest(ctx, input), { code: 'DELIVERY_UNKNOWN' });
  await assert.rejects(ambiguous.sendTest(ctx, input), { code: 'DELIVERY_UNKNOWN' });
  assert.equal(called, 1);
  const timeout = createNotificationService(db, { now: () => time, timeoutMs: 5, sendTestEmail: () => new Promise(() => {}) });
  await assert.rejects(timeout.sendTest(ctx, controls(1)), { code: 'DELIVERY_UNKNOWN' });
});

test('revocation before send marks known failure and denies receipt replay', async () => {
  let checks = 0;
  const denied = createNotificationService(db, { now: () => time, sendTestEmail: async () => sends.push('unsafe'),
    authorize: () => { if (++checks >= 3) { const { DomainError } = require('../domain/errors'); throw new DomainError('FORBIDDEN', 'Revoked', 403); } } });
  const input = controls(1);
  await assert.rejects(denied.sendTest(ctx, input), { code: 'FORBIDDEN' });
  assert.equal(db.prepare('SELECT state FROM notification_attempts WHERE user_id=1').get().state, 'failed');
  await assert.rejects(denied.sendTest(ctx, input), { code: 'FORBIDDEN' });
  assert.equal(sends.length, 0);
});

test('startup recovery makes abandoned pending attempts unknown, while new constructors preserve live ones', async () => {
  const input = controls(1);
  let finish;
  const active = createNotificationService(db, { now: () => time, sendTestEmail: () => new Promise(resolve => { finish = resolve; }) });
  const first = active.sendTest(ctx, input);
  await new Promise(resolve => setImmediate(resolve));
  createNotificationService(db, { sendTestEmail: async () => {} });
  assert.equal(db.prepare('SELECT state FROM notification_attempts').get().state, 'pending');
  migrateNotifications(db);
  await assert.rejects(service.sendTest(ctx, input), { code: 'DELIVERY_UNKNOWN' });
  finish();
  await assert.rejects(first, { code: 'DELIVERY_UNKNOWN' });
});

test('new sends are capped per user and retained attempts expire after a day', async () => {
  for (let n = 0; n < 3; n++) await service.sendTest(ctx, controls(1));
  await assert.rejects(service.sendTest(ctx, controls(1)), { code: 'RATE_LIMITED' });
  time += 24 * 60 * 60 * 1000 + 1;
  await service.sendTest(ctx, controls(1));
  assert.equal(db.prepare('SELECT count(*) AS n FROM notification_attempts').get().n, 1);
});

test('default service authorizer fails closed for unvalidated MCP callers', async () => {
  const mcp = { userId: 1, actor: 'mcp' };
  assert.throws(() => service.settings(mcp), { code: 'FORBIDDEN' });
  assert.throws(() => service.update(mcp, { notify_time: '08:00' }), { code: 'FORBIDDEN' });
  await assert.rejects(service.sendTest(mcp, controls(1)), { code: 'FORBIDDEN' });
});

test('disabled mail delivery fails before reserving an attempt', async () => {
  const disabled = createNotificationService(db);
  await assert.rejects(disabled.sendTest(ctx, controls(1)), { code: 'UPSTREAM_UNAVAILABLE' });
  assert.equal(db.prepare('SELECT count(*) AS n FROM notification_attempts').get().n, 0);
});

test('a known pre-send failure remains failed even for a newly authorized retry', async () => {
  let checks = 0;
  const denied = createNotificationService(db, { now: () => time, sendTestEmail: async () => {}, authorize: () => {
    if (++checks === 3) throw Object.assign(new Error('revoked'), { code: 'FORBIDDEN' });
  } });
  const input = controls(1);
  await assert.rejects(denied.sendTest(ctx, input), { code: 'FORBIDDEN' });
  await assert.rejects(service.sendTest(ctx, input), { code: 'FORBIDDEN' });
  assert.equal(sends.length, 0);
});

test('an asynchronous permission callback cannot accidentally grant access', async () => {
  const unsafe = createNotificationService(db, { sendTestEmail: async () => {}, authorize: async () => {} });
  await assert.rejects(unsafe.sendTest(ctx, controls(1)), { code: 'FORBIDDEN' });
});

test('missing users or concurrency versions fail closed', async () => {
  assert.throws(() => service.settings({ userId: 999, actor: 'web' }), { code: 'AUTH_REQUIRED' });
  const input = controls(1);
  db.prepare('DELETE FROM planner_versions WHERE user_id=1').run();
  await assert.rejects(service.sendTest(ctx, input), { code: 'AUTH_REQUIRED' });
});

test('invalid saved recipient and timezone cannot reach the transport', async () => {
  const { encryptEmail } = require('../crypto');
  db.prepare('UPDATE users SET notify_email_enc=? WHERE id=1').run(encryptEmail('invalid-address'));
  await assert.rejects(service.sendTest(ctx, controls(1)), { code: 'VALIDATION_ERROR' });
  service.update(ctx, { notify_email: 'valid@example.com' });
  db.prepare('UPDATE users SET notify_tz=? WHERE id=1').run('Mars/Olympus');
  await assert.rejects(service.sendTest(ctx, controls(1)), { code: 'VALIDATION_ERROR' });
  assert.equal(sends.length, 0);
});

test('an oversized daily summary fails before reserving or transmitting content', async () => {
  db.exec(`WITH RECURSIVE n(x) AS (SELECT 10 UNION ALL SELECT x+1 FROM n WHERE x<1010)
    INSERT INTO todos(id,user_id,list_id,title,completed,archived,day_assigned)
    SELECT x,1,1,'Synthetic task',0,0,'2026-09-27' FROM n`);
  await assert.rejects(service.sendTest(ctx, controls(1)), { code: 'RESULT_TOO_LARGE' });
  assert.equal(db.prepare('SELECT count(*) AS n FROM notification_attempts').get().n, 0);
});

test('UTC+14 tomorrow calculation advances one local calendar day', async () => {
  service.update(ctx, { notify_tz: 'Pacific/Kiritimati' });
  db.exec(`INSERT INTO todos(id,user_id,list_id,title,completed,archived,day_assigned) VALUES
    (3,1,1,'Tomorrow',0,0,'2026-09-29'),(4,1,1,'Day after tomorrow',0,0,'2026-09-30')`);
  await service.sendTest(ctx, controls(1));
  assert.deepEqual(sends[0][1].tomorrowTodos.map(row => row.title), ['Tomorrow']);
});

test('stale pending delivery becomes unknown without late completion changing that result', async () => {
  let finish;
  const active = createNotificationService(db, { now: () => time, timeoutMs: 1000,
    sendTestEmail: () => new Promise(resolve => { finish = resolve; }) });
  const input = controls(1);
  const first = active.sendTest(ctx, input);
  time += 1001;
  await assert.rejects(active.sendTest(ctx, input), { code: 'DELIVERY_UNKNOWN' });
  finish();
  await assert.rejects(first, { code: 'DELIVERY_UNKNOWN' });
});

test('settings changes during delivery do not change the already captured recipient', async () => {
  let finish;
  const active = createNotificationService(db, { now: () => time, sendTestEmail: (recipient) => {
    sends.push(recipient);
    return new Promise(resolve => { finish = resolve; });
  } });
  const first = active.sendTest(ctx, controls(1));
  service.update(ctx, { notify_email: 'new-recipient@example.com' });
  finish();
  assert.equal((await first).sentTo, 'recipient-canary@example.com');
  assert.deepEqual(sends, ['recipient-canary@example.com']);
});
