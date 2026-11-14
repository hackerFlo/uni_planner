const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'uni-planner-agent-account-')), 'planner.db'
);
process.env.JWT_SECRET = 'test-secret-long-enough-for-the-check';
process.env.LOG_LEVEL = 'error';
process.env.DISABLE_RATE_LIMIT = 'true';
process.env.ALLOW_REGISTER = 'true';
delete process.env.MCP_WRITES_ENABLED;

const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');
const db = require('../db');
const requireAuth = require('../middleware/auth');
const { SESSION_COOKIE_NAME } = require('../config');
const { createTodoService } = require('../services/todos');

const OWNER_PASSWORD = 'correct-horse-battery';
const hash = bcrypt.hashSync(OWNER_PASSWORD, 4);
const FORBIDDEN = { error: 'Not available to the agent account', code: 'AGENT_FORBIDDEN' };

function makeOwner(email) {
  const id = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, hash).lastInsertRowid;
  const listId = db.prepare('INSERT INTO lists (user_id, name, color, sort_order) VALUES (?, ?, ?, ?)')
    .run(id, 'Tasks', 'indigo', 0).lastInsertRowid;
  return { id: Number(id), email, listId: Number(listId) };
}

const app = express();
app.use(cookieParser());
app.use(express.json());
app.use('/api/auth', require('./auth'));
app.use('/api/todos', require('./todos'));
app.use('/api/lists', require('./lists'));
app.use('/api/planner', require('./planner'));
app.use('/api/day-notes', require('./dayNotes'));
app.use('/api/day-dividers', require('./dayDividers'));
app.use('/api/exams', require('./exams'));
app.use('/api/quotes', require('./quotes'));
app.use('/api/preferences', require('./preferences').createPreferencesRouter(db));
app.use('/api/backup', require('./backup'));
app.use('/api/version', require('./version'));
app.use('/api/agent-account', require('./agentAccount'));
app.use('/api/agent-connections', requireAuth, (_req, res) => res.json({ ok: true }));
app.use((err, _req, res, _next) => res.status(err.status || 500).json({ error: err.message }));
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

async function call(method, url, { cookie, body } = {}) {
  const response = await fetch(`${base}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON bodies are asserted by status only */ }
  const setCookie = response.headers.get('set-cookie');
  return { status: response.status, json, cookie: setCookie ? setCookie.split(';')[0] : null };
}

async function login(email, password) {
  const result = await call('POST', '/api/auth/login', { body: { email, password } });
  return { ...result, cookie: result.cookie ?? null };
}

async function ownerSession(owner) {
  return (await login(owner.email, OWNER_PASSWORD)).cookie;
}

async function createAgent(owner, email) {
  const cookie = await ownerSession(owner);
  const created = await call('POST', '/api/agent-account', { cookie, body: { currentPassword: OWNER_PASSWORD, email } });
  assert.equal(created.status, 201);
  const agent = await login(email, created.json.password);
  assert.equal(agent.status, 200);
  return { ownerCookie: cookie, password: created.json.password, cookie: agent.cookie, email };
}

const dayOffset = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
const markerOf = (id) => db.prepare('SELECT agent_activity_action AS action, agent_activity_at AS at FROM todos WHERE id = ?').get(id);

test('agent login and /me return the owner id, the agent email and the agent principal', async () => {
  const owner = makeOwner('shape-owner@example.com');
  const agent = await createAgent(owner, 'shape-agent@example.com');
  const me = await call('GET', '/api/auth/me', { cookie: agent.cookie });
  assert.equal(me.status, 200);
  assert.deepEqual(
    { id: me.json.user.id, email: me.json.user.email, principal: me.json.user.principal },
    { id: owner.id, email: 'shape-agent@example.com', principal: 'agent' },
  );
});

test('owner login and /me report the owner principal', async () => {
  const owner = makeOwner('shape-owner2@example.com');
  const login1 = await login(owner.email, OWNER_PASSWORD);
  assert.equal(login1.json.user.principal, 'owner');
  const me = await call('GET', '/api/auth/me', { cookie: login1.cookie });
  assert.deepEqual([me.json.user.id, me.json.user.email, me.json.user.principal], [owner.id, owner.email, 'owner']);
});

test('agent login with a wrong password fails like an owner login', async () => {
  const owner = makeOwner('wrongpw-owner@example.com');
  const agent = await createAgent(owner, 'wrongpw-agent@example.com');
  const bad = await login(agent.email, 'not-the-password');
  assert.deepEqual([bad.status, bad.json.error], [401, 'Invalid email or password']);
});

test('agent works on the owner planner data', async () => {
  const owner = makeOwner('work-owner@example.com');
  const agent = await createAgent(owner, 'work-agent@example.com');
  const created = await call('POST', '/api/todos', { cookie: agent.cookie, body: { title: 'From agent', list_id: owner.listId } });
  assert.equal(created.status, 201);
  const seenByOwner = await call('GET', '/api/todos', { cookie: agent.ownerCookie });
  assert.ok(seenByOwner.json.todos.some(todo => todo.title === 'From agent'));
});

test('an agent of owner A cannot reach owner B data', async () => {
  const a = makeOwner('iso-a@example.com');
  const b = makeOwner('iso-b@example.com');
  const agentA = await createAgent(a, 'iso-agent-a@example.com');
  const bTodo = Number(db.prepare('INSERT INTO todos (user_id, list_id, title) VALUES (?, ?, ?)').run(b.id, b.listId, 'B secret').lastInsertRowid);
  const list = await call('GET', '/api/todos', { cookie: agentA.cookie });
  assert.equal(list.json.todos.some(todo => todo.title === 'B secret'), false);
  const patched = await call('PATCH', `/api/todos/${bTodo}`, { cookie: agentA.cookie, body: { title: 'hacked' } });
  assert.ok(patched.status >= 400);
  assert.equal(db.prepare('SELECT title FROM todos WHERE id = ?').get(bTodo).title, 'B secret');
});

const DENIED_ROUTES = [
  ['PATCH', '/api/auth/me', { currentPassword: 'x', newPassword: 'whatever123' }],
  ['GET', '/api/auth/notification-settings'],
  ['PATCH', '/api/auth/notification-settings', { notify_enabled: true }],
  ['POST', '/api/auth/test-email', {}],
  ['GET', '/api/backup'],
  ['POST', '/api/backup/restore', { todos: [] }],
  ['GET', '/api/agent-connections'],
  ['GET', '/api/version'],
  ['POST', '/api/version/update', {}],
  ['GET', '/api/agent-account'],
  ['POST', '/api/agent-account', { currentPassword: 'x', email: 'y@example.com' }],
  ['POST', '/api/agent-account/reset-password', { currentPassword: 'x' }],
  ['PATCH', '/api/agent-account', { disabled: true }],
  ['POST', '/api/agent-account/sign-out', {}],
  ['DELETE', '/api/agent-account', { currentPassword: 'x' }],
  ['POST', '/api/preferences/profiles', { id: '00000000-0000-4000-8000-000000000000', label: 'x' }],
];

test('every non-MCP route answers an agent session with 403 AGENT_FORBIDDEN', async () => {
  const owner = makeOwner('deny-owner@example.com');
  const agent = await createAgent(owner, 'deny-agent@example.com');
  for (const [method, url, body] of DENIED_ROUTES) {
    const result = await call(method, url, { cookie: agent.cookie, body });
    assert.equal(result.status, 403, `${method} ${url}`);
    assert.deepEqual(result.json, FORBIDDEN, `${method} ${url}`);
  }
});

test('denied routes stay reachable for the owner session', async () => {
  const owner = makeOwner('deny-owner2@example.com');
  const cookie = await ownerSession(owner);
  assert.equal((await call('GET', '/api/auth/notification-settings', { cookie })).status, 200);
  assert.equal((await call('GET', '/api/backup', { cookie })).status, 200);
});

const ALLOWED_ROUTES = [
  ['GET', '/api/todos'], ['GET', '/api/lists'], ['GET', '/api/planner/version'], ['GET', '/api/day-notes'],
  ['GET', '/api/exams'], ['GET', '/api/day-dividers'], ['GET', '/api/quotes/stats'], ['GET', '/api/preferences/profiles'],
];

test('MCP-scope routes remain available to an agent session', async () => {
  const owner = makeOwner('allow-owner@example.com');
  const agent = await createAgent(owner, 'allow-agent@example.com');
  for (const [method, url] of ALLOWED_ROUTES) {
    const result = await call(method, url, { cookie: agent.cookie });
    assert.equal(result.status, 200, `${method} ${url}`);
  }
});

test('agent logout works and revokes the session', async () => {
  const owner = makeOwner('logout-owner@example.com');
  const agent = await createAgent(owner, 'logout-agent@example.com');
  assert.equal((await call('POST', '/api/auth/logout', { cookie: agent.cookie })).status, 200);
  assert.equal((await call('GET', '/api/auth/me', { cookie: agent.cookie })).status, 401);
});

test('disabling the agent account invalidates its live session immediately', async () => {
  const owner = makeOwner('disable-owner@example.com');
  const agent = await createAgent(owner, 'disable-agent@example.com');
  const result = await call('PATCH', '/api/agent-account', { cookie: agent.ownerCookie, body: { disabled: true } });
  assert.deepEqual([result.status, result.json.account.disabled], [200, true]);
  assert.equal((await call('GET', '/api/auth/me', { cookie: agent.cookie })).status, 401);
  assert.equal((await login(agent.email, agent.password)).status, 401);
});

test('re-enabling lets the agent sign in again', async () => {
  const owner = makeOwner('enable-owner@example.com');
  const agent = await createAgent(owner, 'enable-agent@example.com');
  await call('PATCH', '/api/agent-account', { cookie: agent.ownerCookie, body: { disabled: true } });
  await call('PATCH', '/api/agent-account', { cookie: agent.ownerCookie, body: { disabled: false } });
  assert.equal((await login(agent.email, agent.password)).status, 200);
});

test('sign-out invalidates the agent session but not the owner session', async () => {
  const owner = makeOwner('signout-owner@example.com');
  const agent = await createAgent(owner, 'signout-agent@example.com');
  const result = await call('POST', '/api/agent-account/sign-out', { cookie: agent.ownerCookie, body: {} });
  assert.deepEqual([result.status, result.json], [200, { ok: true }]);
  assert.equal((await call('GET', '/api/auth/me', { cookie: agent.cookie })).status, 401);
  assert.equal((await call('GET', '/api/auth/me', { cookie: agent.ownerCookie })).status, 200);
});

test('reset-password returns a new password once, signs the agent out and replaces the old password', async () => {
  const owner = makeOwner('reset-owner@example.com');
  const agent = await createAgent(owner, 'reset-agent@example.com');
  const reset = await call('POST', '/api/agent-account/reset-password', { cookie: agent.ownerCookie, body: { currentPassword: OWNER_PASSWORD } });
  assert.equal(reset.status, 200);
  assert.notEqual(reset.json.password, agent.password);
  assert.equal((await call('GET', '/api/auth/me', { cookie: agent.cookie })).status, 401);
  assert.equal((await login(agent.email, agent.password)).status, 401);
  assert.equal((await login(agent.email, reset.json.password)).status, 200);
});

test('delete removes the account and invalidates its session', async () => {
  const owner = makeOwner('delete-owner@example.com');
  const agent = await createAgent(owner, 'delete-agent@example.com');
  const result = await call('DELETE', '/api/agent-account', { cookie: agent.ownerCookie, body: { currentPassword: OWNER_PASSWORD } });
  assert.deepEqual([result.status, result.json], [200, { ok: true }]);
  assert.equal((await call('GET', '/api/auth/me', { cookie: agent.cookie })).status, 401);
  assert.equal((await call('GET', '/api/agent-account', { cookie: agent.ownerCookie })).json.account, null);
});

test('deleting the owner cascades to the agent account and its sessions', async () => {
  const owner = makeOwner('cascade-owner@example.com');
  await createAgent(owner, 'cascade-agent@example.com');
  db.prepare('DELETE FROM users WHERE id = ?').run(owner.id);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM agent_accounts WHERE owner_user_id = ?').get(owner.id).n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE agent_account_id IS NOT NULL AND user_id = ?').get(owner.id).n, 0);
});

test('an owner password change does not sign the agent out', async () => {
  const owner = makeOwner('pwchange-owner@example.com');
  const agent = await createAgent(owner, 'pwchange-agent@example.com');
  const changed = await call('PATCH', '/api/auth/me', { cookie: agent.ownerCookie, body: { currentPassword: OWNER_PASSWORD, newPassword: 'another-long-password' } });
  assert.equal(changed.status, 200);
  assert.equal((await call('GET', '/api/auth/me', { cookie: agent.cookie })).status, 200);
});

test('GET /api/agent-account exposes only email, disabled and timestamps', async () => {
  const owner = makeOwner('get-owner@example.com');
  const cookie = await ownerSession(owner);
  assert.deepEqual((await call('GET', '/api/agent-account', { cookie })).json, { account: null });
  const agent = await createAgent(owner, 'get-agent@example.com');
  const { account } = (await call('GET', '/api/agent-account', { cookie: agent.ownerCookie })).json;
  assert.deepEqual(Object.keys(account).sort(), ['created_at', 'disabled', 'email', 'last_login_at']);
  assert.notEqual(account.last_login_at, null);
});

test('creating a second agent account for one owner answers 409', async () => {
  const owner = makeOwner('second-owner@example.com');
  const agent = await createAgent(owner, 'second-agent@example.com');
  const again = await call('POST', '/api/agent-account', { cookie: agent.ownerCookie, body: { currentPassword: OWNER_PASSWORD, email: 'second-other@example.com' } });
  assert.equal(again.status, 409);
});

test('only the bcrypt hash of the generated password is stored', async () => {
  const owner = makeOwner('hash-owner@example.com');
  const agent = await createAgent(owner, 'hash-agent@example.com');
  const row = db.prepare('SELECT password_hash FROM agent_accounts WHERE owner_user_id = ?').get(owner.id);
  assert.ok(await bcrypt.compare(agent.password, row.password_hash));
  assert.notEqual(row.password_hash, agent.password);
});

// 403, not 401: the client treats a 401 outside /api/auth/ as a lost session and
// navigates to /login, which closed the settings panel before the message showed.
test('create, reset and delete require the current owner password', async () => {
  const owner = makeOwner('reauth-owner@example.com');
  const cookie = await ownerSession(owner);
  const wrong = { currentPassword: 'wrong-password' };
  const create = await call('POST', '/api/agent-account', { cookie, body: { ...wrong, email: 'reauth-agent@example.com' } });
  assert.deepEqual([create.status, create.json.error], [403, 'Current password is incorrect']);
  await createAgentDirect(owner, 'reauth-agent@example.com');
  const reset = await call('POST', '/api/agent-account/reset-password', { cookie, body: wrong });
  const remove = await call('DELETE', '/api/agent-account', { cookie, body: wrong });
  assert.deepEqual([reset.status, remove.status], [403, 403]);
  assert.notEqual(db.prepare('SELECT id FROM agent_accounts WHERE owner_user_id = ?').get(owner.id), undefined);
});

async function createAgentDirect(owner, email) {
  const cookie = await ownerSession(owner);
  return call('POST', '/api/agent-account', { cookie, body: { currentPassword: OWNER_PASSWORD, email } });
}

test('create rejects unknown body fields', async () => {
  const owner = makeOwner('strict-owner@example.com');
  const cookie = await ownerSession(owner);
  const result = await call('POST', '/api/agent-account', { cookie, body: { currentPassword: OWNER_PASSWORD, email: 'strict-agent@example.com', extra: 1 } });
  assert.equal(result.status, 400);
});

test('an agent email cannot equal an existing owner email', async () => {
  const owner = makeOwner('uniq-owner@example.com');
  makeOwner('uniq-taken@example.com');
  const result = await createAgentDirect(owner, 'UNIQ-TAKEN@example.com');
  assert.equal(result.status, 409);
});

test('an agent email cannot equal another owner agent email', async () => {
  const first = makeOwner('uniq2-owner1@example.com');
  const second = makeOwner('uniq2-owner2@example.com');
  await createAgentDirect(first, 'uniq2-agent@example.com');
  assert.equal((await createAgentDirect(second, 'uniq2-agent@example.com')).status, 409);
});

test('registration rejects an email already used by an agent account', async () => {
  const owner = makeOwner('uniq3-owner@example.com');
  await createAgentDirect(owner, 'uniq3-agent@example.com');
  const result = await call('POST', '/api/auth/register', { body: { email: 'uniq3-agent@example.com', password: 'long-enough-password' } });
  assert.equal(result.status, 409);
});

test('an owner email change rejects an email already used by an agent account', async () => {
  const owner = makeOwner('uniq4-owner@example.com');
  const other = makeOwner('uniq4-other@example.com');
  await createAgentDirect(owner, 'uniq4-agent@example.com');
  const cookie = await ownerSession(other);
  const result = await call('PATCH', '/api/auth/me', { cookie, body: { currentPassword: OWNER_PASSWORD, newEmail: 'uniq4-agent@example.com' } });
  assert.equal(result.status, 409);
});

test('agent task creation and day move set the same markers as the MCP actor', async () => {
  const owner = makeOwner('marker-owner@example.com');
  const mcpOwner = makeOwner('marker-mcp@example.com');
  const agent = await createAgent(owner, 'marker-agent@example.com');
  const monday = dayOffset(1);
  const tuesday = dayOffset(2);

  const created = await call('POST', '/api/todos', { cookie: agent.cookie, body: { title: 'Agent task', list_id: owner.listId, day_assigned: monday } });
  const agentCreated = markerOf(created.json.todo.id).action;
  await call('PATCH', `/api/todos/${created.json.todo.id}`, { cookie: agent.cookie, body: { day_assigned: tuesday } });
  const agentMoved = markerOf(created.json.todo.id).action;

  const service = createTodoService(db);
  const mcp = { userId: mcpOwner.id, actor: 'mcp' };
  const viaMcp = service.create(mcp, { title: 'Mcp task', list_id: mcpOwner.listId, day_assigned: monday });
  const mcpCreated = markerOf(viaMcp.todo.id).action;
  service.update(mcp, { id: viaMcp.todo.id, day_assigned: tuesday });
  const mcpMoved = markerOf(viaMcp.todo.id).action;

  assert.deepEqual([agentCreated, agentMoved], [mcpCreated, mcpMoved]);
  assert.deepEqual([agentCreated, agentMoved], ['created', 'moved']);
});

test('an owner web edit clears an agent marker', async () => {
  const owner = makeOwner('clear-owner@example.com');
  const agent = await createAgent(owner, 'clear-agent@example.com');
  const created = await call('POST', '/api/todos', { cookie: agent.cookie, body: { title: 'Agent task', list_id: owner.listId } });
  assert.equal(markerOf(created.json.todo.id).action, 'created');
  await call('PATCH', `/api/todos/${created.json.todo.id}`, { cookie: agent.ownerCookie, body: { title: 'Edited by owner' } });
  assert.equal(markerOf(created.json.todo.id).action, null);
});

test('an agent edit does not clear its own marker', async () => {
  const owner = makeOwner('keep-owner@example.com');
  const agent = await createAgent(owner, 'keep-agent@example.com');
  const created = await call('POST', '/api/todos', { cookie: agent.cookie, body: { title: 'Agent task', list_id: owner.listId } });
  await call('PATCH', `/api/todos/${created.json.todo.id}`, { cookie: agent.cookie, body: { title: 'Renamed by agent' } });
  assert.equal(markerOf(created.json.todo.id).action, 'created');
});

test('backup export contains no agent-account data', async () => {
  const owner = makeOwner('export-owner@example.com');
  const agent = await createAgent(owner, 'export-agent@example.com');
  const exported = await call('GET', '/api/backup', { cookie: agent.ownerCookie });
  const text = JSON.stringify(exported.json);
  assert.equal(text.includes('export-agent@example.com'), false);
  assert.equal(text.includes('agent_account'), false);
});

test('backup restore signs the agent account out', async () => {
  const owner = makeOwner('restore-owner@example.com');
  const agent = await createAgent(owner, 'restore-agent@example.com');
  const restored = await call('POST', '/api/backup/restore', { cookie: agent.ownerCookie, body: { todos: [] } });
  assert.equal(restored.status, 200);
  assert.equal((await call('GET', '/api/auth/me', { cookie: agent.cookie })).status, 401);
  assert.equal((await login(agent.email, agent.password)).status, 200);
});

test('agent sessions carry the SESSION cookie name used by owners', async () => {
  const owner = makeOwner('cookie-owner@example.com');
  const agent = await createAgent(owner, 'cookie-agent@example.com');
  assert.ok(agent.cookie.startsWith(`${SESSION_COOKIE_NAME}=`));
});
