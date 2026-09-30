const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-peripheral-tools-'));
process.env.DATABASE_PATH = path.join(temp, 'planner.db');
process.env.LOG_LEVEL = 'error';
process.env.NOTIFICATION_ENCRYPT_KEY = 'b'.repeat(64);
const db = require('../../db');
const { peripheralTools } = require('./peripherals');
const { createPreferenceService } = require('../../services/preferences');
const { createNotificationService } = require('../../services/notifications');
const { DomainError } = require('../../domain/errors');
let sequence = 0;
function account(capabilities = ['planner_read', 'planner_write', 'notifications', 'export']) {
  const userId = db.prepare('INSERT INTO users(email,password_hash) VALUES(?,?)').run(`peripheral-${++sequence}@example.com`, 'synthetic').lastInsertRowid;
  return { userId, actor: 'mcp', capabilities };
}
const version = ctx => db.prepare('SELECT epoch,revision FROM planner_versions WHERE user_id=?').get(ctx.userId);
function authorize(ctx, name) {
  const capability = name.includes('notification') ? 'notifications' : name.includes('export') ? 'export' : 'planner_write';
  if (!ctx.capabilities.includes(capability)) throw new DomainError('FORBIDDEN', 'Permission revoked', 403);
}
function tools(writesEnabled = true, options = {}) {
  return Object.fromEntries(peripheralTools(db, { writesEnabled }, version, { authorize, ...options }).map(tool => [tool.name, tool]));
}
function call(tool, ctx, args = {}) { return tool.action(ctx, tool.schema.parse(args)); }
test.after(() => { db.close(); fs.rmSync(temp, { recursive: true, force: true }); });

test('peripheral schemas and metadata distinguish network, cache, export and notification effects', () => {
  const all = tools(false);
  for (const tool of Object.values(all)) assert.equal(tool.schema.safeParse({ userId: 1 }).success, false);
  for (const name of ['list_holiday_countries', 'get_holidays']) {
    assert.equal(all[name].writes, true);
    assert.equal(all[name].openWorld, true);
  }
  assert.equal(all.send_test_notification.mutation, true);
  assert.equal(all.send_test_notification.openWorld, true);
  assert.equal(all.get_notification_settings.capability, 'notifications');
  assert.equal(all.prepare_backup_export.capability, 'export');
  assert.match(all.prepare_backup_export.description, /plaintext notification email/i);
  assert.equal(all.prepare_backup_export.mutation, undefined);
});

test('daily quote preview is pure and selection needs live write permission and increments once', () => {
  const ctx = account();
  const args = { date: '2026-09-27' };
  const before = version(ctx);
  assert.deepEqual(call(tools(false).get_daily_quote, ctx, args), { quote: null, selectionRequired: true });
  assert.deepEqual(version(ctx), before);
  assert.throws(() => call(tools(false).get_daily_quote, ctx, { ...args, select: true }), { code: 'FORBIDDEN' });
  ctx.capabilities = ['planner_read'];
  assert.throws(() => call(tools().get_daily_quote, ctx, { ...args, select: true }), { code: 'FORBIDDEN' });
  ctx.capabilities.push('planner_write');
  const result = call(tools().get_daily_quote, ctx, { ...args, select: true });
  assert.ok(result.quote);
  assert.equal(version(ctx).revision, before.revision + 1);
  call(tools().get_daily_quote, ctx, { ...args, select: true });
  assert.equal(version(ctx).revision, before.revision + 1);
  assert.equal(call(tools().get_quote_stats, ctx).stats.disliked, 0);
});

test('profiles and notification reads isolate owners and recheck notification permission', () => {
  const owner = account();
  const stranger = account();
  const id = randomUUID();
  createPreferenceService(db).create(owner, { id, label: 'Synthetic device', settings: { agentActivityIcon: 'ring' } });
  const all = tools();
  assert.equal(call(all.list_preference_profiles, owner).profiles.length, 1);
  assert.equal(call(all.list_preference_profiles, stranger).profiles.length, 0);
  assert.equal(call(all.get_preferences, owner, { id }).label, 'Synthetic device');
  assert.equal(call(all.get_preferences, owner, { id }).settings.agentActivityIcon, 'ring');
  assert.throws(() => call(all.get_preferences, stranger, { id }), { code: 'NOT_FOUND' });
  createNotificationService(db).update({ ...owner, actor: 'web' }, { notify_email: 'synthetic-recipient@example.com' });
  assert.equal(call(all.get_notification_settings, owner).notify_email, 'synthetic-recipient@example.com');
  assert.equal(call(all.get_notification_settings, stranger).notify_email, '');
  owner.capabilities = ['planner_read'];
  assert.throws(() => call(all.get_notification_settings, owner), { code: 'FORBIDDEN' });
});

test('test notification accepts only controls and sends saved recipient once with injected transport', async () => {
  const ctx = account();
  createNotificationService(db).update({ ...ctx, actor: 'web' }, { notify_email: 'synthetic-test@example.com' });
  const deliveries = [];
  const all = tools(true, { sendTestEmail: async args => deliveries.push(args) });
  const input = { expectedVersion: version(ctx), idempotencyKey: randomUUID() };
  assert.equal(all.send_test_notification.schema.safeParse({ ...input, recipient: 'other@example.com' }).success, false);
  assert.equal((await call(all.send_test_notification, ctx, input)).status, 'sent');
  assert.equal((await call(all.send_test_notification, ctx, input)).replayed, true);
  assert.equal(deliveries.length, 1);
  ctx.capabilities = ['planner_read'];
  await assert.rejects(async () => call(all.send_test_notification, ctx, input), { code: 'FORBIDDEN' });
});

test('frozen export is available with writes off and every chunk remains owner scoped', () => {
  const owner = account();
  const stranger = account();
  const all = tools(false);
  const artifact = call(all.prepare_backup_export, owner);
  const chunk = call(all.read_backup_export_chunk, owner, { id: artifact.id, offset: 0 });
  assert.equal(chunk.checksum, artifact.checksum);
  assert.ok(JSON.parse(Buffer.from(chunk.data, 'base64').toString('utf8')));
  assert.throws(() => call(all.read_backup_export_chunk, stranger, { id: artifact.id, offset: 0 }), { code: 'NOT_FOUND' });
  assert.equal(all.read_backup_export_chunk.schema.safeParse({ id: artifact.id, offset: 0, length: 49153 }).success, false);
});

test('holiday adapters preserve bounded cached responses including weekends', async () => {
  const ctx = account();
  db.prepare('INSERT OR REPLACE INTO holiday_country_cache(id,payload,fetched_at) VALUES(1,?,?)')
    .run(JSON.stringify([{ countryCode: 'DE', name: 'Germany' }]), new Date().toISOString());
  const holiday = { date: '2026-10-03', localName: 'Synthetic holiday', name: 'Synthetic holiday', countryCode: 'DE', global: true, counties: null, types: ['Public'] };
  db.prepare('INSERT OR REPLACE INTO holiday_cache(country,year,payload,fetched_at) VALUES(?,?,?,?)')
    .run('DE', 2026, JSON.stringify([holiday]), new Date().toISOString());
  const all = tools(false);
  assert.equal((await call(all.list_holiday_countries, ctx)).countries[0].countryCode, 'DE');
  assert.deepEqual((await call(all.get_holidays, ctx, { country: 'DE', year: 2026 })).holidays, [holiday]);
});
