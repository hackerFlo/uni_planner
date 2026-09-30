const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { generateKeyPairSync, randomUUID } = require('node:crypto');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-mcp-integration-'));
process.env.DATABASE_PATH = path.join(tempDir, 'isolated.db');
process.env.JWT_SECRET = 'synthetic-mcp-integration-cookie-secret';
process.env.LOG_LEVEL = 'error';
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const db = require('../db');
const webListsRouter = require('../routes/lists');
const { createSession } = require('../sessions');
const { SESSION_COOKIE_NAME } = require('../config');
const { createLogger } = require('../logger');
const { createAccessVerifier } = require('./access');
const { createLinkService } = require('./links');
const { mountMcp } = require('./mount');
const { jsonBodyParser } = require('../middleware/bodyParser');

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const links = createLinkService(db);
let keyResolver;
let userSequence = 0;
test.before(async () => {
  const jose = await import('jose');
  keyResolver = jose.createLocalJWKSet({ keys: [{ ...keys.publicKey.export({ format: 'jwk' }),
    kid: 'synthetic-integration-key', alg: 'RS256' }] });
});
test.after(() => { db.close(); fs.rmSync(tempDir, { recursive: true, force: true }); });

function makeUser(config, label) {
  const id = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')
    .run(`mcp-${++userSequence}@example.com`, 'not-a-login-password').lastInsertRowid;
  const identity = { issuer: config.issuer, subject: `synthetic-subject-${id}` };
  links.enroll(id, identity, ['planner_read']);
  for (const [name, sortOrder] of [[`${label}-second`, 1], [`${label}-first`, 0]]) {
    db.prepare('INSERT INTO lists (user_id, name, color, sort_order) VALUES (?, ?, ?, ?)')
      .run(id, name, 'indigo', sortOrder);
  }
  const cookie = jwt.sign({ id, tv: 0, sid: createSession(id) }, process.env.JWT_SECRET, { expiresIn: '1h' });
  return { id, identity, cookie };
}

function assertion(config, user, audience = config.mcpAudience) {
  return jwt.sign({ type: 'app' }, keys.privateKey, { algorithm: 'RS256',
    keyid: 'synthetic-integration-key', issuer: config.issuer,
    audience, subject: user.identity.subject, expiresIn: '5m' });
}

async function setup(t) {
  const config = { enabled: true, writesEnabled: false, issuer: 'https://integration-team.cloudflareaccess.com',
    mcpAudience: 'synthetic-mcp', webAudience: 'synthetic-web',
    publicUrl: 'https://mcp.example.com/mcp', webOrigin: 'https://planner.example.com', allowedOrigins: [] };
  const lines = [];
  const logger = createLogger({}, { level: 'debug', format: 'json', sink: (_level, line) => lines.push(line) });
  const app = express();
  app.use((req, _res, next) => { req.id = randomUUID(); req.log = logger.child({ reqId: req.id }); next(); });
  mountMcp(app, config, db, { verifyAssertion: createAccessVerifier(config, { keyResolver }) });
  app.use(jsonBodyParser());
  app.use(cookieParser());
  app.use('/api/lists', webListsRouter);
  for (const route of ['todos', 'exams', 'dayNotes', 'dayDividers', 'planner']) {
    const paths = { dayNotes: 'day-notes', dayDividers: 'day-dividers' };
    app.use(`/api/${paths[route] || route}`, require(`../routes/${route}`));
  }
  const listener = app.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  t.after(() => { listener.closeAllConnections(); listener.close(); });
  const base = `http://127.0.0.1:${listener.address().port}`;
  config.publicUrl = base.replace('http:', 'https:') + '/mcp';
  config.allowedOrigins = [new URL(config.publicUrl).origin];
  return { config, base, lines, alice: makeUser(config, 'alice-content-canary'),
    bob: makeUser(config, 'bob-content-canary') };
}

async function connect(t, fixture, user, extraHeaders = {}) {
  const client = new Client({ name: 'synthetic-integration', version: '1' });
  t.after(() => client.close());
  await client.connect(new StreamableHTTPClientTransport(new URL(`${fixture.base}/mcp`), {
    requestInit: { headers: { 'Cf-Access-Jwt-Assertion': assertion(fixture.config, user), ...extraHeaders } },
  }));
  return client;
}

function webLists(fixture, user) {
  return new Promise((resolve, reject) => {
    http.get(`${fixture.base}/api/lists`, { headers: {
      Host: new URL(fixture.config.webOrigin).host, Cookie: `${SESSION_COOKIE_NAME}=${user.cookie}`,
    } }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    }).on('error', reject);
  });
}

function rpc(fixture, headers = {}, body = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }) {
  return fetch(`${fixture.base}/mcp`, { method: 'POST', headers: {
    'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers,
  }, body: JSON.stringify(body) });
}
const list = client => client.callTool({ name: 'list_lists', arguments: {} });

test('real website and MCP reads are identical and isolated for concurrent signed identities', async t => {
  const fixture = await setup(t);
  const users = [fixture.alice, fixture.bob];
  const clients = await Promise.all(users.map(user => connect(t, fixture, user)));
  const [web, mcp] = await Promise.all([
    Promise.all(users.map(user => webLists(fixture, user))), Promise.all(clients.map(list)),
  ]);
  for (let i = 0; i < users.length; i += 1) {
    assert.equal(web[i].status, 200);
    assert.deepEqual(mcp[i].structuredContent, { lists: web[i].body.lists, nextCursor: null, version: web[i].body.version });
    assert.equal(mcp[i].structuredContent.lists.length, 2);
  }
  assert.notDeepEqual(mcp[0].structuredContent.lists, mcp[1].structuredContent.lists);
  assert.ok(mcp[0].structuredContent.lists.every(row => !row.name.includes('bob-content-canary')));
  assert.ok(mcp[1].structuredContent.lists.every(row => !row.name.includes('alice-content-canary')));
});

test('only the implemented read tool is discoverable and administrative tools cannot execute', async t => {
  const fixture = await setup(t);
  const client = await connect(t, fixture, fixture.alice);
  const tools = (await client.listTools()).tools;
  assert.deepEqual(tools.map(tool => tool.name), ['list_lists', 'get_planner_context', 'get_task',
    'list_tasks', 'search_tasks', 'get_week', 'list_day_notes', 'list_exams',
    'list_holiday_countries', 'get_holidays', 'list_preference_profiles', 'get_preferences', 'get_quote_stats', 'get_daily_quote']);
  assert.deepEqual(tools[0].annotations, {
    readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false,
  });
  for (const name of ['delete_account', 'restore_backup', 'execute_sql', 'create_task']) {
    assert.equal((await client.callTool({ name, arguments: {} })).isError, true);
  }
});

test('planner reads use owned data and read-only grants cannot materialize recurrence', async t => {
  const fixture = await setup(t);
  const client = await connect(t, fixture, fixture.alice);
  const listId = db.prepare('SELECT id FROM lists WHERE user_id=? LIMIT 1').get(fixture.alice.id).id;
  const foreignList = db.prepare('SELECT id FROM lists WHERE user_id=? LIMIT 1').get(fixture.bob.id).id;
  const insert = db.prepare('INSERT INTO todos(user_id,list_id,title,day_assigned) VALUES(?,?,?,?)');
  const task = insert.run(fixture.alice.id, listId, 'Owned task', '2026-09-28').lastInsertRowid;
  const foreign = insert.run(fixture.bob.id, foreignList, 'Private task', '2026-09-28').lastInsertRowid;
  const page = await client.callTool({ name: 'list_tasks', arguments: {} });
  assert.deepEqual(page.structuredContent.tasks.map(row => row.id), [task]);
  assert.equal((await client.callTool({ name: 'get_task', arguments: { id: foreign } })).isError, true);
  assert.equal((await client.callTool({ name: 'list_tasks', arguments: { materialize: true } })).isError, true);
  const week = await client.callTool({ name: 'get_week', arguments: { week_start: '2026-09-28' } });
  assert.deepEqual(week.structuredContent.items.map(row => row.id), [task]);
  const context = await client.callTool({ name: 'get_planner_context', arguments: {} });
  assert.equal(context.structuredContent.timezone, 'UTC');
});

test('disabled MCP returns an uncached 404 while the authenticated website still works', async t => {
  const fixture = await setup(t);
  fixture.config.enabled = false;
  const response = await rpc(fixture, { 'Cf-Access-Jwt-Assertion': assertion(fixture.config, fixture.alice) });
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await webLists(fixture, fixture.alice)).status, 200);
});

test('website audience, expired assertions and unsigned identity hints cannot authenticate MCP', async t => {
  const fixture = await setup(t);
  const headers = { 'Cf-Access-Authenticated-User-Email': 'mcp-1@example.com', 'Mcp-Session-Id': 'forged-session' };
  const wrongAudience = await rpc(fixture, { ...headers,
    'Cf-Access-Jwt-Assertion': assertion(fixture.config, fixture.alice, fixture.config.webAudience) });
  assert.equal(wrongAudience.status, 401);
  const expired = jwt.sign({ type: 'app' }, keys.privateKey, { algorithm: 'RS256',
    keyid: 'synthetic-integration-key', issuer: fixture.config.issuer, audience: fixture.config.mcpAudience,
    subject: fixture.alice.identity.subject, expiresIn: -60 });
  assert.equal((await rpc(fixture, { ...headers, 'Cf-Access-Jwt-Assertion': expired })).status, 401);
});

test('a valid web cookie or bearer cookie token never substitutes for an Access assertion', async t => {
  const fixture = await setup(t);
  assert.equal((await webLists(fixture, fixture.alice)).status, 200);
  const response = await rpc(fixture, { Cookie: `${SESSION_COOKIE_NAME}=${fixture.alice.cookie}`,
    Authorization: `Bearer ${fixture.alice.cookie}`, 'Mcp-Session-Id': fixture.alice.identity.subject });
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('www-authenticate'), 'Bearer');
});

test('live revocation denies an already initialized client without affecting another user', async t => {
  const fixture = await setup(t);
  const [alice, bob] = await Promise.all([connect(t, fixture, fixture.alice), connect(t, fixture, fixture.bob)]);
  await list(alice);
  links.revoke(fixture.alice.id);
  await assert.rejects(list(alice));
  const response = await rpc(fixture, { 'Cf-Access-Jwt-Assertion': assertion(fixture.config, fixture.alice) });
  assert.equal(response.status, 403);
  assert.equal((await list(bob)).structuredContent.lists.length, 2);
  assert.equal((await webLists(fixture, fixture.alice)).status, 200);
});

test('credential version changes invalidate an initialized client until explicit re-enrollment', async t => {
  const fixture = await setup(t);
  const client = await connect(t, fixture, fixture.alice);
  db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?').run(fixture.alice.id);
  await assert.rejects(list(client));
  assert.equal((await webLists(fixture, fixture.alice)).status, 401);
  links.enroll(fixture.alice.id, fixture.alice.identity, ['planner_read']);
  assert.equal((await list(client)).structuredContent.lists.length, 2);
});

test('unknown owner fields, hostile pagination and a foreign cursor cannot expose or modify lists', async t => {
  const fixture = await setup(t);
  const [alice, bob] = await Promise.all([connect(t, fixture, fixture.alice), connect(t, fixture, fixture.bob)]);
  const before = db.prepare('SELECT * FROM lists ORDER BY id').all();
  for (const args of [{ user_id: fixture.bob.id }, { userId: fixture.bob.id }, { limit: 101 },
    { limit: -1 }, { cursor: 'not-a-cursor' }, { id: fixture.bob.id }, { extra: { owner: fixture.bob.id } }]) {
    assert.equal((await alice.callTool({ name: 'list_lists', arguments: args })).isError, true);
  }
  const page = await alice.callTool({ name: 'list_lists', arguments: { limit: 1 } });
  const stolen = await bob.callTool({ name: 'list_lists', arguments: { limit: 1, cursor: page.structuredContent.nextCursor } });
  assert.equal(stolen.isError, true);
  assert.equal(JSON.parse(stolen.content[0].text).code, 'CONFLICT');
  assert.deepEqual(db.prepare('SELECT * FROM lists ORDER BY id').all(), before);
});

test('successful and rejected MCP requests log actions and correlation without credential or content canaries', async t => {
  const fixture = await setup(t);
  const credential = assertion(fixture.config, fixture.alice);
  const client = await connect(t, fixture, fixture.alice, { Authorization: 'Bearer opaque-credential-canary' });
  await list(client);
  await rpc(fixture, { 'Cf-Access-Jwt-Assertion': 'invalid-assertion-canary' });
  await rpc(fixture, { 'Cf-Access-Jwt-Assertion': credential },
    [{ jsonrpc: '2.0', id: 1, method: 'private-planner-body-canary' }]);
  const joined = fixture.lines.join('\n');
  for (const canary of [credential, fixture.alice.cookie, 'opaque-credential-canary', 'invalid-assertion-canary',
    'alice-content-canary', 'bob-content-canary', 'private-planner-body-canary']) assert.equal(joined.includes(canary), false);
  const records = fixture.lines.map(line => JSON.parse(line));
  assert.ok(records.some(record => record.action === 'list_lists' && record.userId === fixture.alice.id &&
    record.outcome === 'success' && typeof record.reqId === 'string'));
  assert.ok(records.some(record => record.msg === 'mcp access rejected' && record.outcome === 401));
});

test('production mount authenticates before JSON parsing and preserves its own body ceiling', async t => {
  const fixture = await setup(t);
  const url = `${fixture.base}/mcp`;
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  const unauthorized = await fetch(url, { method: 'POST', headers, body: '{invalid-private-body-canary' });
  assert.equal(unauthorized.status, 401);
  headers['Cf-Access-Jwt-Assertion'] = assertion(fixture.config, fixture.alice);
  const malformed = await fetch(url, { method: 'POST', headers, body: '{invalid-private-body-canary' });
  assert.equal(malformed.status, 400);
  const oversized = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ padding: 'x'.repeat(33000) }) });
  assert.equal(oversized.status, 413);
  assert.equal(oversized.headers.get('cache-control'), 'no-store');
  assert.equal(fixture.lines.join('\n').includes('invalid-private-body-canary'), false);
});

test('deleted account and surviving signed assertion cannot resolve a principal', async t => {
  const fixture = await setup(t);
  const client = await connect(t, fixture, fixture.alice);
  db.prepare('DELETE FROM users WHERE id = ?').run(fixture.alice.id);
  await assert.rejects(list(client));
  const response = await rpc(fixture, { 'Cf-Access-Jwt-Assertion': assertion(fixture.config, fixture.alice) });
  assert.equal(response.status, 403);
});

test('write tools share version checks, exact undo and receipt replay with the website', async t => {
  const fixture = await setup(t);
  fixture.config.writesEnabled = true;
  links.enroll(fixture.alice.id, fixture.alice.identity, ['planner_read', 'planner_write']);
  const client = await connect(t, fixture, fixture.alice);
  const initial = (await list(client)).structuredContent;
  const args = { list_id: initial.lists[0].id, title: 'One write', expectedVersion: initial.version, idempotencyKey: randomUUID() };
  const created = await client.callTool({ name: 'create_task', arguments: args });
  assert.equal(created.isError, undefined);
  const receipt = created.structuredContent;
  assert.equal(receipt.undoAvailable, true);
  const replay = await client.callTool({ name: 'create_task', arguments: args });
  assert.equal(replay.structuredContent.replayed, true);
  assert.equal(db.prepare('SELECT count(*) n FROM todos WHERE user_id=?').get(fixture.alice.id).n, 1);
  const stale = await client.callTool({ name: 'create_task', arguments: { ...args, idempotencyKey: randomUUID() } });
  assert.equal(JSON.parse(stale.content[0].text).code, 'CONFLICT');
  const undone = await client.callTool({ name: 'undo_operation', arguments: { operationId: receipt.operationId,
    expectedVersion: receipt.resultVersion, idempotencyKey: randomUUID() } });
  assert.equal(undone.isError, undefined);
  assert.equal(db.prepare('SELECT count(*) n FROM todos WHERE user_id=?').get(fixture.alice.id).n, 0);
  const afterUndo = await client.callTool({ name: 'create_task', arguments: args });
  assert.equal(afterUndo.structuredContent.operationUndone, true);
  links.enroll(fixture.alice.id, fixture.alice.identity, ['planner_read']);
  assert.equal((await client.callTool({ name: 'create_task', arguments: args })).isError, true);
});

test('agent badges survive MCP reads, website dismissal, and authorization changes', async t => {
  const fixture = await setup(t);
  fixture.config.writesEnabled = true;
  links.enroll(fixture.alice.id, fixture.alice.identity, ['planner_read', 'planner_write']);
  const client = await connect(t, fixture, fixture.alice);
  assert.ok((await client.listTools()).tools.some(tool => tool.name === 'dismiss_task_agent_activity'));
  const listId = db.prepare('SELECT id FROM lists WHERE user_id=? LIMIT 1').get(fixture.alice.id).id;
  const invoke = (name, args) => client.callTool({ name, arguments: { ...args,
    expectedVersion: currentVersion(fixture.alice), idempotencyKey: randomUUID() } });
  const created = await invoke('create_task', { title: 'Marked', list_id: listId });
  const task = created.structuredContent.data.todo;
  assert.equal(task.agent_activity_action, 'created');
  const read = await client.callTool({ name: 'get_task', arguments: { id: task.id } });
  assert.equal(read.isError, undefined);
  const web = await webAction(fixture, fixture.alice, 'GET', '/api/todos', undefined, currentVersion(fixture.alice));
  assert.equal(web.status, 200);
  assert.equal(read.structuredContent.task.agent_activity_at, web.body.todos[0].agent_activity_at);
  const spoof = await invoke('dismiss_task_agent_activity', { id: task.id, agent_activity_action: 'moved' });
  assert.equal(spoof.isError, true);
  const dismissed = await webAction(fixture, fixture.alice, 'POST', `/api/todos/${task.id}/dismiss-agent-activity`, {}, currentVersion(fixture.alice));
  assert.equal(dismissed.body.todo.agent_activity_at, null);
  const second = (await invoke('create_task', { title: 'Another', list_id: listId })).structuredContent.data.todo;
  links.enroll(fixture.bob.id, fixture.bob.identity, ['planner_read', 'planner_write']);
  const bob = await connect(t, fixture, fixture.bob);
  const foreign = await bob.callTool({ name: 'dismiss_task_agent_activity', arguments: { id: second.id,
    expectedVersion: currentVersion(fixture.bob), idempotencyKey: randomUUID() } });
  assert.equal(foreign.isError, true);
  assert.equal(db.prepare('SELECT agent_activity_action FROM todos WHERE id=?').get(second.id).agent_activity_action, 'created');
  const mcpDismissed = await invoke('dismiss_task_agent_activity', { id: second.id });
  assert.equal(mcpDismissed.structuredContent.data.todo.agent_activity_at, null);
  const third = (await invoke('create_task', { title: 'Revoked', list_id: listId })).structuredContent.data.todo;
  links.revoke(fixture.alice.id);
  await assert.rejects(invoke('dismiss_task_agent_activity', { id: third.id }));
  assert.equal(db.prepare('SELECT agent_activity_action FROM todos WHERE id=?').get(third.id).agent_activity_action, 'created');
});

test('sensitive permissions remain independent and writes-off does not disable authorized export', async t => {
  const fixture = await setup(t);
  links.enroll(fixture.alice.id, fixture.alice.identity, ['planner_read', 'export']);
  const client = await connect(t, fixture, fixture.alice);
  const names = (await client.listTools()).tools.map(tool => tool.name);
  assert.ok(names.includes('prepare_backup_export'));
  assert.ok(!names.includes('get_notification_settings'));
  assert.ok(!names.includes('create_task'));
  const result = await client.callTool({ name: 'prepare_backup_export', arguments: {} });
  assert.equal(result.isError, undefined);
  const chunk = await client.callTool({ name: 'read_backup_export_chunk', arguments: { id: result.structuredContent.id, offset: 0 } });
  assert.equal(chunk.isError, undefined);
  const snapshot = JSON.parse(Buffer.from(chunk.structuredContent.data, 'base64').toString());
  assert.ok(!JSON.stringify(snapshot).includes('bob-content-canary'));
  assert.ok(!JSON.stringify(snapshot).includes('agent_links'));
});

test('CSV body allowance is isolated and mutation/bulk limits survive separate MCP requests', async t => {
  const fixture = await setup(t);
  const headers = { 'Cf-Access-Jwt-Assertion': assertion(fixture.config, fixture.alice) };
  const body = name => ({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: { csv: 'x'.repeat(40000) } } });
  assert.equal((await rpc(fixture, headers, body('import_quotes_csv'))).status, 200);
  assert.equal((await rpc(fixture, headers, body('create_task'))).status, 413);
  for (let i = 0; i < 9; i++) assert.equal((await rpc(fixture, headers, body('import_quotes_csv'))).status, 200);
  assert.equal((await rpc(fixture, headers, body('import_quotes_csv'))).status, 429);
  for (let i = 0; i < 19; i++) assert.equal((await rpc(fixture, headers, { ...body('create_task'), params: { name: 'create_task', arguments: {} } })).status, 200);
  assert.equal((await rpc(fixture, headers, { ...body('create_task'), params: { name: 'create_task', arguments: {} } })).status, 429);
});

function webAction(fixture, user, method, url, body, version) {
  return new Promise((resolve, reject) => {
    const request = http.request(fixture.base + url, { method, headers: {
      Host: new URL(fixture.config.webOrigin).host, Cookie: `${SESSION_COOKIE_NAME}=${user.cookie}`,
      'Content-Type': 'application/json', 'X-Planner-Epoch': version.epoch,
      'X-Planner-Revision': String(version.revision), 'Idempotency-Key': randomUUID(),
    } }, response => {
      let text = ''; response.on('data', chunk => { text += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(text) }));
    }).on('error', reject);
    request.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
function currentVersion(user) { return db.prepare('SELECT epoch,revision FROM planner_versions WHERE user_id=?').get(user.id); }

test('website and MCP task, board, note and exam workflows produce equivalent owned state', async t => {
  const fixture = await setup(t);
  fixture.config.writesEnabled = true;
  links.enroll(fixture.alice.id, fixture.alice.identity, ['planner_read', 'planner_write']);
  const client = await connect(t, fixture, fixture.alice);
  async function mcp(name, args) {
    const result = await client.callTool({ name, arguments: { ...args, expectedVersion: currentVersion(fixture.alice), idempotencyKey: randomUUID() } });
    assert.equal(result.isError, undefined, JSON.stringify(result.content));
    return result.structuredContent.data;
  }
  async function web(method, url, args) {
    const result = await webAction(fixture, fixture.bob, method, url, args, currentVersion(fixture.bob));
    assert.ok([200, 201].includes(result.status), JSON.stringify(result.body));
    return result.body;
  }
  const listId = user => db.prepare('SELECT id FROM lists WHERE user_id=? ORDER BY sort_order LIMIT 1').get(user.id).id;
  const args = { title: 'Sanitized task', description: '<b onclick="bad()">Allowed</b>', day_assigned: '2026-11-02' };
  const left = (await mcp('create_task', { ...args, list_id: listId(fixture.alice) })).todo;
  const right = (await web('POST', '/api/todos', { ...args, list_id: listId(fixture.bob) })).todo;
  const dividerA = (await mcp('create_divider', { day: args.day_assigned, index: 0 })).item;
  const dividerB = (await web('POST', '/api/planner/create-divider', { day: args.day_assigned, index: 0 })).data.item;
  await mcp('move_planner_item', { item: { kind: 'task', id: left.id }, day: '2026-11-03', index: 0 });
  await web('POST', '/api/planner/move', { item: { kind: 'task', id: right.id }, day: '2026-11-03', index: 0 });
  await mcp('copy_planner_item', { item: { kind: 'task', id: left.id }, day: args.day_assigned, index: 1 });
  await web('POST', '/api/planner/copy', { item: { kind: 'task', id: right.id }, day: args.day_assigned, index: 1 });
  await mcp('set_task_completed', { id: left.id, completed: true });
  await web('PATCH', `/api/todos/${right.id}`, { completed: true, archived: true });
  await mcp('set_day_note', { date: args.day_assigned, note: '  Exact note  ' });
  await web('PUT', `/api/day-notes/${args.day_assigned}`, { note: '  Exact note  ' });
  await mcp('create_exam', { title: 'Final exam', exam_date: args.day_assigned });
  await web('POST', '/api/exams', { title: 'Final exam', exam_date: args.day_assigned });
  const rows = (table, fields, user) => db.prepare(`SELECT ${fields} FROM ${table} WHERE user_id=? ORDER BY ${fields.split(',')[0]}`).all(user.id);
  for (const [table, fields] of [['todos', 'title,description,day_assigned,completed,archived,planner_order,recurrence_interval_days,recurrence_pattern'],
    ['day_dividers', 'date,planner_order'], ['day_notes', 'date,note'], ['exams', 'title,exam_date']]) {
    assert.deepEqual(rows(table, fields, fixture.alice), rows(table, fields, fixture.bob));
  }
  await mcp('delete_divider', { id: dividerA.id });
  await web('POST', '/api/planner/delete-divider', { id: dividerB.id });
  assert.equal(rows('day_dividers', 'date', fixture.alice).length, 0);
  assert.equal(rows('day_dividers', 'date', fixture.bob).length, 0);
});

test('old partial board endpoints fail closed whenever agent writes are enabled', async t => {
  const fixture = await setup(t);
  const previous = process.env.MCP_WRITES_ENABLED;
  process.env.MCP_WRITES_ENABLED = 'true';
  try {
    for (const [method, url, body] of [['PATCH', '/api/todos/reorder', { items: [] }],
      ['POST', '/api/day-dividers', { date: '2026-11-02' }]]) {
      assert.equal((await webAction(fixture, fixture.bob, method, url, body, currentVersion(fixture.bob))).status, 409);
    }
  } finally {
    if (previous === undefined) delete process.env.MCP_WRITES_ENABLED; else process.env.MCP_WRITES_ENABLED = previous;
  }
});
