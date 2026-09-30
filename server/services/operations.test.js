const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-operations-'));
process.env.DATABASE_PATH = path.join(temp, 'planner.db');
process.env.LOG_LEVEL = 'error';
process.env.NOTIFICATION_ENCRYPT_KEY = 'a'.repeat(64);
const db = require('../db');
const { createOperations } = require('./operations');
const { createPreferenceService } = require('./preferences');
const { createQuoteService } = require('./quotes');
const ops = createOperations(db);
let userId = 0;
function account() {
  const id = db.prepare('INSERT INTO users(email,password_hash) VALUES(?,?)').run(`operation-${++userId}@example.com`, 'synthetic').lastInsertRowid;
  return { userId: id, actor: 'web' };
}
const control = ctx => ({ expectedVersion: ops.version(ctx), idempotencyKey: randomUUID() });
test.after(() => { db.close(); fs.rmSync(temp, { recursive: true, force: true }); });

test('preference mutations have receipts without recording settings as undo payloads', () => {
  const ctx = account();
  const id = randomUUID();
  ops.execute(ctx, 'create_preference_profile', { id, label: 'Synthetic device', settings: {} }, control(ctx));
  const args = { id, patch: { theme: 'dark', agentActivityIcon: 'ring' } };
  const controls = control(ctx);
  const result = ops.execute(ctx, 'update_preferences', args, controls);
  assert.equal(result.undoAvailable, false);
  assert.equal(ops.execute(ctx, 'update_preferences', args, controls).replayed, true);
  assert.equal(createPreferenceService(db).get(ctx, { id }).settings.theme, 'dark');
  assert.equal(createPreferenceService(db).get(ctx, { id }).settings.agentActivityIcon, 'ring');
  ops.execute(ctx, 'reset_preferences', { id }, control(ctx));
  assert.equal(createPreferenceService(db).get(ctx, { id }).settings.theme, 'system');
  assert.equal(createPreferenceService(db).get(ctx, { id }).settings.agentActivityIcon, 'fuzzy');
});

test('quote dislike records exact supported undo while bulk restore and import do not', () => {
  const ctx = account();
  const quotes = createQuoteService(db);
  const imported = ops.execute(ctx, 'import_quotes_csv', { csv: 'ID,Quote,Author,Characters,Wikipedia,Source\nQ1,Synthetic quote.,Synthetic,16,,' }, control(ctx));
  assert.equal(imported.undoAvailable, false);
  const id = db.prepare('SELECT id FROM quotes WHERE user_id=?').get(ctx.userId).id;
  const result = ops.execute(ctx, 'dislike_quote', { id, date: '2026-09-27' }, control(ctx));
  assert.equal(result.undoAvailable, true);
  assert.equal(quotes.stats(ctx).stats.disliked, 1);
  ops.undo(ctx, result.operationId, control(ctx));
  assert.equal(quotes.stats(ctx).stats.disliked, 0);
  assert.equal(ops.execute(ctx, 'restore_all_quotes', {}, control(ctx)).undoAvailable, false);
});

test('notification settings participate in receipts without storing encrypted addresses in undo', () => {
  const ctx = account();
  const result = ops.execute(ctx, 'update_notification_settings', { notify_email: 'synthetic-recipient@example.com' }, control(ctx));
  assert.equal(result.undoAvailable, false);
  assert.equal(db.prepare('SELECT count(*) AS n FROM planner_operations WHERE user_id=?').get(ctx.userId).n, 0);
});

test('unknown operations fail safely and foreign quote mutations leave owner state unchanged', () => {
  const owner = account();
  const stranger = account();
  assert.throws(() => ops.execute(owner, 'toString', {}, control(owner)), { code: 'NOT_FOUND' });
  ops.execute(owner, 'import_quotes_csv', { csv: 'ID,Quote,Author,Characters,Wikipedia,Source\nQ2,Owned synthetic quote.,Synthetic,22,,' }, control(owner));
  const { id } = db.prepare('SELECT id FROM quotes WHERE user_id=?').get(owner.userId);
  const before = ops.version(owner);
  assert.throws(() => ops.execute(stranger, 'restore_quote', { id, date: '2026-09-27' }, control(stranger)), { code: 'NOT_FOUND' });
  assert.deepEqual(ops.version(owner), before);
  const restored = ops.execute(owner, 'restore_quote', { id, date: '2026-09-27' }, control(owner));
  assert.equal(restored.undoAvailable, true);
});

test('dismissal follows version, retry, ownership and undo rules', () => {
  const agentOps = createOperations(db, { authorize: context => {
    if (context.actor !== 'mcp' || !Number.isSafeInteger(context.userId)) throw new Error('Untrusted test principal');
  } });
  const web = account();
  const agent = { ...web, actor: 'mcp' };
  const stranger = account();
  const list = db.prepare('INSERT INTO lists(user_id,name,color) VALUES(?,?,?)')
    .run(web.userId, 'Tasks', 'indigo').lastInsertRowid;
  const created = agentOps.execute(agent, 'create_task', { title: 'New', list_id: list },
    { expectedVersion: agentOps.version(agent), idempotencyKey: randomUUID() }).data.todo;
  assert.equal(created.agent_activity_action, 'created');
  assert.throws(() => ops.execute(stranger, 'dismiss_task_agent_activity', { id: created.id }, control(stranger)), { code: 'NOT_FOUND' });
  const retry = control(web);
  const dismissed = ops.execute(web, 'dismiss_task_agent_activity', { id: created.id }, retry);
  assert.equal(dismissed.data.todo.agent_activity_at, null);
  assert.equal(ops.execute(web, 'dismiss_task_agent_activity', { id: created.id }, retry).replayed, true);
  ops.undo(web, dismissed.operationId, control(web));
  assert.equal(db.prepare('SELECT agent_activity_action FROM todos WHERE id=?').get(created.id).agent_activity_action, 'created');
});
