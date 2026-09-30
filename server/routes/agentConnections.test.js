const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { generateKeyPairSync } = require('node:crypto');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-agent-connections-'));
process.env.DATABASE_PATH = path.join(tempDir, 'planner.db');
process.env.JWT_SECRET = 'synthetic-agent-connection-cookie-secret';
process.env.LOG_LEVEL = 'error';
process.env.DISABLE_RATE_LIMIT = 'true';

const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { createSession } = require('../sessions');
const { SESSION_COOKIE_NAME } = require('../config');
const { migrateMcp } = require('../mcp/migrations');
const { createLinkService } = require('../mcp/links');
const { createAccessVerifier } = require('../mcp/access');
const { createAgentConnectionsRouter } = require('./agentConnections');

const config = { enabled: true, publicUrl: 'https://mcp.example.com/mcp',
  webOrigin: 'https://planner.example.com', issuer: 'https://test-team.cloudflareaccess.com',
  webAudience: 'synthetic-web-audience', mcpAudience: 'synthetic-mcp-audience' };
const password = 'synthetic-current-password';
const passwordHash = bcrypt.hashSync(password, 4);
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const links = createLinkService(db);
let base;
let server;
let sequence = 0;

test.before(async () => {
  migrateMcp(db);
  const jose = await import('jose');
  const jwk = keys.publicKey.export({ format: 'jwk' });
  const verifyAssertion = createAccessVerifier(config, { keyResolver: jose.createLocalJWKSet({ keys: [{ ...jwk, kid: 'synthetic-key', alg: 'RS256' }] }) });
  const app = express();
  app.use(cookieParser());
  app.use('/api/agent-connections', createAgentConnectionsRouter({ db, config, verifyAssertion, links }));
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api/agent-connections`;
});

test.after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

function makeUser() {
  const id = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')
    .run(`connection-${++sequence}@example.com`, passwordHash).lastInsertRowid;
  return { id, cookie: jwt.sign({ id, tv: 0, sid: createSession(id) }, process.env.JWT_SECRET, { expiresIn: '1h' }) };
}

function assertion(subject = 'synthetic-subject', audience = config.webAudience, options = {}) {
  return jwt.sign({ type: 'app', ...options }, keys.privateKey, { algorithm: 'RS256',
    keyid: 'synthetic-key', issuer: config.issuer, audience, subject, expiresIn: '5m' });
}

function request(method, user, { headers = {}, body, token = assertion(`subject-${user?.id}`) } = {}) {
  return fetch(base, { method, headers: {
    ...(user ? { Cookie: `${SESSION_COOKIE_NAME}=${user.cookie}` } : {}),
    ...(method !== 'GET' ? { 'Content-Type': 'application/json', Origin: config.webOrigin, 'X-Requested-With': 'XMLHttpRequest' } : {}),
    ...(token ? { 'Cf-Access-Jwt-Assertion': token } : {}), ...headers,
  }, ...(method !== 'GET' ? { body: JSON.stringify(body ?? (method === 'POST' ? { password, consent: true, capabilities: ['planner_read'] } : {})) } : {}) });
}

test('enroll requires both signed proofs and returns safe own status', async () => {
  const user = makeUser();
  assert.equal((await request('POST', user)).status, 200);
  const response = await request('GET', user, { token: null });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { enabled: true, configured: true, publicUrl: config.publicUrl,
    writesEnabled: false, availableCapabilities: ['planner_read', 'planner_write', 'notifications', 'export'],
    linked: true, capabilities: ['planner_read'], revokedAt: null, requiresReenrollment: false });
});

test('valid Access assertion alone and bearer website token cannot replace cookie authentication', async () => {
  const user = makeUser();
  assert.equal((await request('POST', null)).status, 401);
  assert.equal((await request('GET', null, { headers: { Authorization: `Bearer ${user.cookie}` } })).status, 401);
});

test('missing assertion and MCP audience cannot enroll through the website', async () => {
  const user = makeUser();
  assert.equal((await request('POST', user, { token: null })).status, 401);
  assert.equal((await request('POST', user, { token: assertion('wrong-audience', config.mcpAudience) })).status, 401);
  assert.equal(links.status(user.id).linked, false);
});

for (const headers of [{ Origin: '' }, { Origin: 'https://hostile.example.com' }, { 'X-Requested-With': '' }, { 'Content-Type': 'text/plain' }]) {
  test(`mutation requires browser CSRF proof ${JSON.stringify(headers)}`, async () => {
    const user = makeUser();
    links.enroll(user.id, { issuer: config.issuer, subject: `subject-${user.id}` }, ['planner_read']);
    assert.equal((await request('POST', user, { headers })).status, 403);
    assert.equal((await request('DELETE', user, { headers })).status, 403);
    assert.equal(links.status(user.id).linked, true);
  });
}

for (const body of [{ password: 'wrong', consent: true, capabilities: ['planner_read'] },
  { password, consent: false, capabilities: ['planner_read'] },
  { password, consent: true, capabilities: ['planner_write'] },
  { password, consent: true, capabilities: ['planner_read'], user_id: 1 }]) {
  test('invalid enrollment cannot create a link', async () => {
    const user = makeUser();
    const response = await request('POST', user, { body });
    assert.ok([400, 401].includes(response.status));
    assert.equal(links.status(user.id).linked, false);
  });
}

test('revoked identity remains bound and cannot be stolen by another signed-in account', async () => {
  const owner = makeUser();
  const other = makeUser();
  const token = assertion(`permanent-${owner.id}`);
  assert.equal((await request('POST', owner, { token })).status, 200);
  assert.equal((await request('DELETE', owner)).status, 200);
  assert.equal((await request('POST', other, { token })).status, 409);
  assert.equal((await request('POST', owner, { token })).status, 200);
});

test('revocation stays available while disabled and without a usable assertion', async () => {
  const user = makeUser();
  await request('POST', user);
  config.enabled = false;
  try {
    assert.equal((await request('POST', user)).status, 404);
    assert.equal((await request('DELETE', user, { token: 'invalid-jwks-or-assertion' })).status, 200);
    assert.equal(links.status(user.id).linked, false);
  } finally { config.enabled = true; }
});

test('status/revocation are isolated even with a forged account field', async () => {
  const owner = makeUser();
  const other = makeUser();
  await request('POST', owner);
  assert.equal((await request('DELETE', other, { body: { user_id: owner.id } })).status, 400);
  assert.equal((await (await request('GET', other)).json()).linked, false);
  assert.equal(links.status(owner.id).linked, true);
});

test('expired session and changed credential version cannot enroll again', async () => {
  const user = makeUser();
  await request('POST', user);
  db.prepare('UPDATE users SET token_version = 1 WHERE id = ?').run(user.id);
  assert.equal((await request('POST', user)).status, 401);
  assert.throws(() => links.resolve({ issuer: config.issuer, subject: `subject-${user.id}` }), { code: 'LINK_REQUIRED' });
  const other = makeUser();
  db.prepare('UPDATE sessions SET expires_at = ? WHERE user_id = ?').run('2000-01-01T00:00:00.000Z', other.id);
  assert.equal((await request('POST', other)).status, 401);
});

for (const [name, body, extraHeaders, expectedStatus] of [
  ['malformed JSON', '{"password":"synthetic-private-canary"', {}, 400],
  ['oversized JSON', JSON.stringify({ password: 'synthetic-private-canary'.repeat(150) }), {}, 413],
  ['compressed body', '{}', { 'Content-Encoding': 'gzip' }, 415],
]) {
  test(`rejects ${name} without echoing sensitive input`, async () => {
    const user = makeUser();
    const response = await fetch(base, { method: 'POST', body, headers: {
      Cookie: `${SESSION_COOKIE_NAME}=${user.cookie}`, Origin: config.webOrigin,
      'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...extraHeaders,
    } });
    assert.equal(response.status, expectedStatus);
    assert.equal((await response.text()).includes('synthetic-private-canary'), false);
    assert.equal(links.status(user.id).linked, false);
  });
}

test('re-enrollment after local disable still needs fresh password proof and consent', async () => {
  const user = makeUser();
  await request('POST', user);
  await request('DELETE', user);
  assert.equal((await request('POST', user, { body: { password: 'wrong', consent: true, capabilities: ['planner_read'] } })).status, 401);
  assert.equal((await request('POST', user, { body: { password, consent: false, capabilities: ['planner_read'] } })).status, 400);
  assert.equal(links.status(user.id).linked, false);
});

test('permission changes require explicit password-proved enrollment and never auto-expand', async () => {
  const user = makeUser();
  await request('POST', user);
  const capabilities = ['planner_read', 'planner_write', 'notifications', 'export'];
  assert.deepEqual(links.status(user.id).capabilities, ['planner_read']);
  assert.equal((await request('POST', user, { body: { password: 'wrong', consent: true, capabilities } })).status, 401);
  assert.deepEqual(links.status(user.id).capabilities, ['planner_read']);
  assert.equal((await request('POST', user, { body: { password, consent: true, capabilities } })).status, 200);
  assert.deepEqual(links.status(user.id).capabilities, capabilities);
});
