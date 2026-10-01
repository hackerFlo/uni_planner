import test from 'node:test';
import assert from 'node:assert/strict';
import { api } from './client.js';
import { ApiError, KINDS, subscribeAccessExpiry } from './errors.js';
import { isBusy } from './activity.js';

test.describe('API transport', () => {
  test.afterEach(() => {
    test.mock.restoreAll();
    assert.equal(isBusy(), false);
  });

  test('stops an Access redirect before following it outside the origin', async () => {
    const fetchMock = test.mock.method(globalThis, 'fetch', async () => ({ type: 'opaqueredirect' }));
    await assert.rejects(api.post('/api/todos', { text: 'Example' }), {
      name: 'ApiError', kind: KINDS.ACCESS_EXPIRED,
    });
    assert.equal(fetchMock.mock.calls[0].arguments[1].redirect, 'manual');
    assert.equal(fetchMock.mock.callCount(), 1);
  });

  test('does not allow callers to follow Access redirects', async () => {
    const fetchMock = test.mock.method(globalThis, 'fetch', async () => new Response('{}'));
    await api.get('/api/todos', { redirect: 'follow' });
    assert.equal(fetchMock.mock.calls[0].arguments[1].redirect, 'manual');
  });

  test('rejects a successful HTML response instead of silently returning empty data', async () => {
    test.mock.method(globalThis, 'fetch', async () => new Response('<html>Sign in</html>', {
      headers: { 'X-Request-Id': 'request-example' },
    }));
    await assert.rejects(api.get('/api/todos'), (error) =>
      error instanceof ApiError && error.kind === KINDS.UNKNOWN && error.requestId === 'request-example');
  });

  test('accepts intentionally empty 204 responses', async () => {
    test.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 204 }));
    assert.deepEqual(await api.delete('/api/todos/1'), {});
  });

  test('preserves gateway classification for an intermediary HTML error', async () => {
    test.mock.method(globalThis, 'fetch', async () => new Response('<html>Bad gateway</html>', { status: 502 }));
    await assert.rejects(api.get('/api/todos'), { kind: KINDS.GATEWAY, status: 502 });
  });

  test('returns application JSON unchanged', async () => {
    test.mock.method(globalThis, 'fetch', async () => Response.json([{ id: 1 }]));
    assert.deepEqual(await api.get('/api/todos'), [{ id: 1 }]);
  });

  test('recognises an Access HTML 401 before redirecting to the application login', async () => {
    test.mock.method(globalThis, 'fetch', async (path) => path === '/api/health'
      ? { type: 'opaqueredirect' }
      : new Response('<html>Unauthorized</html>', { status: 401 }));
    await assert.rejects(api.get('/api/todos'), { kind: KINDS.ACCESS_EXPIRED });
  });

  test('preserves application login errors without probing the Access gate', async () => {
    const fetchMock = test.mock.method(globalThis, 'fetch', async () =>
      Response.json({ error: 'Invalid credentials' }, { status: 401 }));
    await assert.rejects(api.post('/api/auth/login', {}), {
      kind: KINDS.UNAUTHORIZED, message: 'Invalid credentials',
    });
    assert.equal(fetchMock.mock.callCount(), 1);
  });

  test('keeps caller cancellation distinct from connection failure without probing', async () => {
    const abort = new AbortController();
    abort.abort();
    const fetchMock = test.mock.method(globalThis, 'fetch', async () => { throw abort.signal.reason; });
    await assert.rejects(api.get('/api/todos', { signal: abort.signal }), (error) => error === abort.signal.reason);
    assert.equal(fetchMock.mock.callCount(), 1);
  });

  test('reports Access expiry centrally even when the caller handles the rejection', async t => {
    const reported = [];
    t.after(subscribeAccessExpiry(error => reported.push(error.kind)));
    test.mock.method(globalThis, 'fetch', async () => ({ type: 'opaqueredirect' }));
    await api.get('/api/auth/me').catch(() => undefined);
    assert.deepEqual(reported, [KINDS.ACCESS_EXPIRED]);
  });
});
