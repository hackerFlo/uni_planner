const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-preferences-test-'));
process.env.DATABASE_PATH = path.join(temp, 'planner.db');
process.env.JWT_SECRET = 'synthetic-preferences-test-cookie-secret';
process.env.LOG_LEVEL = 'error';
delete process.env.MCP_WRITES_ENABLED;
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { createSession } = require('../sessions');
const { migratePreferences } = require('../domain/preferencesMigration');
const { migrateDomain } = require('../domain/migrations');
const { createPreferencesRouter } = require('./preferences');
const { createPreferenceService, DEFAULT_PREFERENCES } = require('../services/preferences');
migratePreferences(db); migrateDomain(db);
const service = createPreferenceService(db);
const app = express();
app.use(express.json({ limit: '10kb' }), cookieParser());
app.use('/api/preferences', createPreferencesRouter(db));
const listener = app.listen(0, '127.0.0.1');
test.before(async () => { if (!listener.listening) await new Promise(resolve => listener.once('listening', resolve)); });
test.after(() => { listener.closeAllConnections(); listener.close(); db.close(); fs.rmSync(temp, { recursive: true, force: true }); });
let userCount = 0;
function makeUser() {
  const id = db.prepare('INSERT INTO users(email,password_hash) VALUES(?,?)').run(`preferences-${++userCount}@example.com`, 'synthetic-hash').lastInsertRowid;
  return { id, token: jwt.sign({ id, tv: 0, sid: createSession(id) }, process.env.JWT_SECRET, { expiresIn: '1h' }) };
}
function controls(user) {
  const version = db.prepare('SELECT epoch,revision FROM planner_versions WHERE user_id=?').get(user.id);
  return { 'X-Planner-Epoch': version.epoch, 'X-Planner-Revision': String(version.revision), 'Idempotency-Key': randomUUID() };
}
async function call(user, method, suffix = '/profiles', body, headers = {}) {
  const res = await fetch(`http://127.0.0.1:${listener.address().port}/api/preferences${suffix}`, {
    method, headers: { 'Content-Type': 'application/json', ...(user ? { Cookie: `token=${user.token}` } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: await res.json() };
}
const input = settings => ({ id: randomUUID(), label: 'Test browser', settings });

test('versioned profile creation and retry preserve the first migration exactly once', async () => {
  const alice = makeUser(); const profile = input({ theme: 'dark' }); const headers = controls(alice);
  const first = await call(alice, 'POST', '/profiles', profile, headers);
  assert.equal(first.status, 201);
  assert.equal(first.body.currentVersion.revision, Number(headers['X-Planner-Revision']) + 1);
  const replay = await call(alice, 'POST', '/profiles', profile, headers);
  assert.equal(replay.body.replayed, true);
  await call(alice, 'PATCH', `/profiles/${profile.id}`, { theme: 'light' }, controls(alice));
  const repeat = await call(alice, 'POST', '/profiles', profile, controls(alice));
  assert.equal(repeat.body.profile.settings.theme, 'light');
  assert.equal((await call(alice, 'GET')).body.profiles.length, 1);
});

test('foreign profiles cannot be read, changed, reset or claimed', async () => {
  const alice = makeUser(); const bob = makeUser(); const profile = input({ theme: 'dark' });
  await call(bob, 'POST', '/profiles', profile);
  for (const [method, suffix, body] of [['GET', '', undefined], ['PATCH', '', { theme: 'light' }], ['POST', '/reset', {}]]) {
    assert.equal((await call(alice, method, `/profiles/${profile.id}${suffix}`, body)).status, 404);
  }
  assert.equal((await call(alice, 'POST', '/profiles', profile)).status, 409);
  assert.equal((await call(alice, 'GET')).body.profiles.length, 0);
  assert.equal((await call(bob, 'GET', `/profiles/${profile.id}`)).body.profile.settings.theme, 'dark');
});

test('invalid input and stale captured versions cannot overwrite profile settings', async () => {
  const alice = makeUser(); const profile = input({});
  await call(alice, 'POST', '/profiles', profile);
  const stale = controls(alice);
  await call(alice, 'PATCH', `/profiles/${profile.id}`, { density: 'compact' }, controls(alice));
  assert.equal((await call(alice, 'PATCH', `/profiles/${profile.id}`, { density: 'comfortable' }, stale)).status, 409);
  for (const patch of [{ unknown: true }, { quotesSnoozedOn: '2026-02-30' }, { reduceMotion: 'true' },
    { agentActivityIcon: 'square' }]) {
    assert.equal((await call(alice, 'PATCH', `/profiles/${profile.id}`, patch)).status, 400);
  }
  assert.equal(service.get({ userId: alice.id }, { id: profile.id }).settings.density, 'compact');
});

test('website and shared-service edits and resets have equivalent preference behavior', async () => {
  const web = makeUser(); const shared = makeUser(); const a = input({ showQuotes: false }); const b = input({ showQuotes: false });
  await call(web, 'POST', '/profiles', a);
  service.create({ userId: shared.id }, b);
  const patch = { theme: 'dark', agentActivityIcon: 'ring', quotesSnoozedOn: '2028-02-29', holidaySubdivision: '' };
  const edited = await call(web, 'PATCH', `/profiles/${a.id}`, patch, controls(web));
  assert.deepEqual(edited.body.profile.settings, service.update({ userId: shared.id }, { id: b.id, patch }).settings);
  const reset = await call(web, 'POST', `/profiles/${a.id}/reset`, {}, controls(web));
  assert.deepEqual(reset.body.profile.settings, service.reset({ userId: shared.id }, { id: b.id }).settings);
  assert.deepEqual(reset.body.profile.settings, DEFAULT_PREFERENCES);
});

test('session expiry/revocation and write-enabled compatibility restrictions fail closed', async () => {
  const alice = makeUser(); const profile = input({});
  assert.equal((await call(null, 'GET')).status, 401);
  process.env.MCP_WRITES_ENABLED = 'true';
  try {
    assert.equal((await call(alice, 'POST', '/profiles', profile)).status, 409);
    assert.equal((await call(alice, 'POST', '/profiles', profile, controls(alice))).status, 201);
  } finally { delete process.env.MCP_WRITES_ENABLED; }
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(alice.id);
  assert.equal((await call(alice, 'PATCH', `/profiles/${profile.id}`, { theme: 'dark' })).status, 401);
  assert.equal(service.get({ userId: alice.id }, { id: profile.id }).settings.theme, 'system');
});
