const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { createMcpRouter, hostBoundary } = require('./router');

const config = { enabled: true, publicUrl: 'https://mcp.example.com/mcp',
  webOrigin: 'https://planner.example.com', allowedOrigins: ['https://mcp.example.com'] };
let revoked = false;
const links = { resolve(identity) {
  if (revoked) throw Object.assign(new Error('Disabled'), { status: 403, code: 'LINK_REQUIRED' });
  return { userId: identity.subject === 'alice' ? 1 : 2, capabilities: ['planner_read'] };
} };
const lists = { page(ctx) { return { lists: [{ id: ctx.userId, name: `Owner ${ctx.userId}` }], nextCursor: null }; } };
const verifyAssertion = async req => {
  const subject = req.headers['cf-access-jwt-assertion'];
  if (!['alice', 'bob'].includes(subject)) throw Object.assign(new Error('Required'), { status: 401 });
  return { subject };
};
const app = express();
app.use(hostBoundary(config));
app.use('/mcp', createMcpRouter({ config, verifyAssertion, links, lists }));
app.use(express.json({ limit: '10kb' }));
app.get('/api/private', (_req, res) => res.json({ private: true }));
const listener = app.listen(0);
const base = `http://127.0.0.1:${listener.address().port}`;
config.publicUrl = base.replace('http:', 'https:') + '/mcp';
test.after(() => listener.close());

function headers(extra = {}) {
  return { Host: new URL(base).host, 'cf-access-jwt-assertion': 'alice', ...extra };
}
async function connect(subject) {
  const client = new Client({ name: 'integration-test', version: '1' });
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
    requestInit: { headers: headers({ 'cf-access-jwt-assertion': subject }) },
  });
  await client.connect(transport);
  return client;
}

test('official SDK initializes, discovers only implemented tools and isolates parallel principals', async () => {
  const clients = await Promise.all(['alice', 'bob'].map(connect));
  try {
    assert.deepEqual((await clients[0].listTools()).tools.map(t => t.name), ['list_lists']);
    const results = await Promise.all(clients.map(c => c.callTool({ name: 'list_lists', arguments: {} })));
    assert.deepEqual(results.map(r => r.structuredContent.lists[0].id), [1, 2]);
    assert.equal((await clients[0].callTool({ name: 'delete_account', arguments: {} })).isError, true);
  } finally { await Promise.all(clients.map(c => c.close())); }
});

function rawGet(path, extra = {}) {
  return new Promise((resolve, reject) => {
    http.get(base + path, { headers: headers(extra) }, res => {
      res.resume();
      resolve(res.statusCode);
    }).on('error', reject);
  });
}

test('Host and Origin boundary blocks API on MCP host and hostile origins', async () => {
  for (const [path, extra, status] of [
    ['/api/private', {}, 404], ['/mcp', { Host: 'unknown.example.com' }, 404],
    ['/mcp', { Origin: 'https://evil.example.com' }, 403],
    ['/mcp/', {}, 404], ['/mcp/extra', {}, 404],
  ]) assert.equal(await rawGet(path, extra), status);
  assert.equal(await rawGet('/api/private', { Host: 'planner.example.com' }), 200);
});

test('web cookies and session identifiers cannot substitute for assertion authentication', async () => {
  const response = await fetch(`${base}/mcp`, { headers: headers({
    'cf-access-jwt-assertion': '', Cookie: 'token=anything', 'Mcp-Session-Id': 'alice',
  }) });
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('revocation is checked on subsequent requests', async () => {
  const client = await connect('alice');
  revoked = true;
  try { await assert.rejects(client.callTool({ name: 'list_lists', arguments: {} })); }
  finally { revoked = false; await client.close(); }
});

test('rejects batches, oversized bodies, compressed bodies and unsupported methods', async () => {
  for (const [body, extra, status] of [
    ['[]', {}, 400], ['{"padding":"' + 'a'.repeat(33000) + '"}', {}, 413],
    ['{}', { 'Content-Encoding': 'gzip' }, 415],
  ]) {
    const res = await fetch(`${base}/mcp`, { method: 'POST',
      headers: headers({ 'Content-Type': 'application/json', ...extra }), body });
    assert.equal(res.status, status);
  }
  assert.equal((await fetch(`${base}/mcp`, { headers: headers() })).status, 405);
});
