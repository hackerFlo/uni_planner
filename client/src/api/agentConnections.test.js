import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAgentConnectionsApi } from './agentConnections.js';
import { KINDS, subscribeAccessExpiry } from './errors.js';
import { isBusy } from './activity.js';

const status = {
  enabled: true, configured: true, publicUrl: 'https://mcp.example.com/mcp',
  linked: false, capabilities: [], revokedAt: null, requiresReenrollment: false,
};
const response = (data, code = 200) => new Response(JSON.stringify(data), {
  status: code, headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'test-request' },
});

describe('agent connection requests', () => {
  it('enrolls only read access with explicit consent and the browser CSRF header', async () => {
    let request;
    const api = createAgentConnectionsApi({ fetchImpl: async (...args) => {
      request = args;
      return response({});
    } });
    await api.enroll('synthetic-password', true);
    assert.deepEqual(request, ['/api/agent-connections', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'manual',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ password: 'synthetic-password', consent: true, capabilities: ['planner_read'] }),
    }]);
  });

  it('does not send enrollment without fresh password and consent', async () => {
    const api = createAgentConnectionsApi({ fetchImpl: () => assert.fail('No request expected') });
    for (const [password, consent] of [['', true], ['synthetic-password', false], ['synthetic-password', 'true']]) {
      await assert.rejects(api.enroll(password, consent), { kind: KINDS.BAD_REQUEST });
    }
  });

  it('revokes with JSON and CSRF protection without requiring a password or status lookup', async () => {
    let options;
    const api = createAgentConnectionsApi({ fetchImpl: async (_path, request) => {
      options = request;
      return response({});
    } });
    await api.disable();
    assert.deepEqual({ method: options.method, headers: options.headers, body: options.body }, {
      method: 'DELETE', body: '{}',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    });
  });

  it('returns validated disabled status, including a link which can still be revoked', async () => {
    const disabled = { ...status, enabled: false, linked: true, capabilities: ['planner_read'] };
    const api = createAgentConnectionsApi({ fetchImpl: async () => response(disabled) });
    assert.deepEqual(await api.getStatus(), disabled);
  });

  it('rejects malformed successful status instead of inventing a connection state', async () => {
    for (const data of [{}, { ...status, linked: 'true' }, { ...status, capabilities: ['admin'] }]) {
      const api = createAgentConnectionsApi({ fetchImpl: async () => response(data) });
      await assert.rejects(api.getStatus(), { kind: KINDS.UNKNOWN });
    }
  });

  it('classifies an Access redirect without following it or treating it as success', async () => {
    const api = createAgentConnectionsApi({ fetchImpl: async () => ({ type: 'opaqueredirect' }) });
    await assert.rejects(api.disable(), { kind: KINDS.ACCESS_EXPIRED });
    assert.equal(isBusy(), false);
  });

  it('preserves HTTP error classification and request correlation', async () => {
    const api = createAgentConnectionsApi({ fetchImpl: async () => response({ error: 'Please wait.' }, 429) });
    await assert.rejects(api.getStatus(), { kind: KINDS.RATE_LIMITED, requestId: 'test-request', message: 'Please wait.' });
  });

  it('distinguishes an Access AJAX HTML 401 from an application session expiry', async () => {
    const api = createAgentConnectionsApi({
      fetchImpl: async () => new Response('<html>Unauthorized</html>', {
        status: 401, headers: { 'X-Request-Id': 'access-request' },
      }),
      probe: async () => KINDS.ACCESS_EXPIRED,
    });
    await assert.rejects(api.disable(), { kind: KINDS.ACCESS_EXPIRED, status: 401, requestId: 'access-request' });
    assert.equal(isBusy(), false);
  });

  it('reports caught Access expiry centrally from connection requests', async t => {
    const reported = [];
    t.after(subscribeAccessExpiry(error => reported.push(error.kind)));
    const api = createAgentConnectionsApi({ fetchImpl: async () => ({ type: 'opaqueredirect' }) });
    await api.disable().catch(() => undefined);
    assert.deepEqual(reported, [KINDS.ACCESS_EXPIRED]);
  });

  it('preserves an application JSON 401 without probing the Access gate', async () => {
    const api = createAgentConnectionsApi({
      fetchImpl: async () => response({ error: 'Invalid or expired token' }, 401),
      probe: async () => assert.fail('Application JSON failures do not need an Access probe'),
    });
    await assert.rejects(api.disable(), { kind: KINDS.UNAUTHORIZED, status: 401 });
  });

  it('uses reachability classification after network failure and settles activity', async () => {
    const api = createAgentConnectionsApi({
      fetchImpl: async () => { throw new TypeError('Network failed'); },
      probe: async () => KINDS.OFFLINE,
    });
    await assert.rejects(api.enroll('synthetic-password', true), { kind: KINDS.OFFLINE });
    assert.equal(isBusy(), false);
  });

  it('rejects an HTML success page rather than claiming a successful mutation', async () => {
    const api = createAgentConnectionsApi({ fetchImpl: async () => new Response('<html>Sign in</html>') });
    await assert.rejects(api.disable(), { kind: KINDS.UNKNOWN });
  });
});

it('enrolls exactly the selected permissions and rejects malformed permission sets', async () => {
  let sent;
  const api = createAgentConnectionsApi({ fetchImpl: async (_url, options) => {
    sent = JSON.parse(options.body); return response({});
  } });
  const capabilities = ['planner_read', 'notifications'];
  await api.enroll('synthetic-password', true, capabilities);
  assert.deepEqual(sent.capabilities, capabilities);
  for (const invalid of [[], ['admin'], ['planner_read', 'planner_read']]) {
    await assert.rejects(api.enroll('synthetic-password', true, invalid), { kind: KINDS.BAD_REQUEST });
  }
});
