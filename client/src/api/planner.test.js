import { describe, it, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { api } from './client.js';
import { plannerApi, plannerMutationOptions } from './planner.js';
import { KINDS } from './errors.js';
import { isBusy } from './activity.js';

const version = { epoch: 'a'.repeat(32), revision: 7 };
const retryKey = '5ce22963-02da-4bb2-828b-a5276b13efa9';
const operationId = 'e2cc737e-30fb-4859-b32b-5f0b01ed3bb2';
afterEach(() => mock.restoreAll());

describe('planner API controls', () => {
  it('sends the captured version and same caller key on intentional retry without fetching a newer version', async () => {
    const calls = [];
    mock.method(globalThis, 'fetch', async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ data: {}, resultVersion: version, currentVersion: version }));
    });
    const controls = { expectedVersion: version, idempotencyKey: retryKey };
    await plannerApi.undo(operationId, controls);
    await plannerApi.undo(operationId, controls);
    assert.equal(calls.length, 2);
    assert.ok(calls.every(call => call.url === '/api/planner/undo'));
    assert.deepEqual(calls[0].options.headers, {
      'Content-Type': 'application/json', 'X-Planner-Epoch': version.epoch,
      'X-Planner-Revision': '7', 'Idempotency-Key': retryKey,
    });
    assert.deepEqual(calls[0].options.headers, calls[1].options.headers);
    assert.equal(calls[0].options.body, JSON.stringify({ operationId }));
  });

  it('does not fetch, invent a version, or retry after a conflict', async () => {
    const request = mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ error: 'Planner changed' }), { status: 409 }));
    await assert.rejects(plannerApi.undo(operationId, { expectedVersion: version, idempotencyKey: retryKey }), { status: 409 });
    assert.equal(request.mock.callCount(), 1);
  });

  it('rejects missing/invalid controls before any network activity', async () => {
    mock.method(globalThis, 'fetch', () => assert.fail('No request expected'));
    for (const controls of [{}, { expectedVersion: version }, { expectedVersion: { ...version, revision: -1 }, idempotencyKey: retryKey },
      { expectedVersion: version, idempotencyKey: 'not-a-uuid' }]) {
      await assert.rejects(plannerApi.undo(operationId, controls), { kind: KINDS.BAD_REQUEST });
    }
  });

  it('returns a validated copy of the version and rejects malformed successful responses', async () => {
    mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ version })));
    assert.deepEqual(await plannerApi.getVersion(), version);
    mock.restoreAll();
    mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ version: { epoch: 'invalid', revision: 1 } })));
    await assert.rejects(plannerApi.getVersion(), { kind: KINDS.UNKNOWN });
  });

  it('does not allow additional options to replace explicit mutation controls', () => {
    assert.deepEqual(plannerMutationOptions(version, retryKey, { headers: { 'X-Planner-Revision': '999', 'X-Test': 'kept' } }).headers,
      { 'X-Test': 'kept', 'X-Planner-Revision': '7', 'X-Planner-Epoch': version.epoch, 'Idempotency-Key': retryKey });
  });
});

describe('API request options', () => {
  it('preserves JSON content type while merging custom headers for every verb', async () => {
    const calls = [];
    mock.method(globalThis, 'fetch', async (_url, options) => { calls.push(options); return new Response('{}'); });
    const options = { headers: { 'X-Test': 'value' }, cache: 'no-store' };
    await api.get('/api/test', options);
    for (const method of ['post', 'patch', 'put']) await api[method]('/api/test', { value: 1 }, options);
    await api.delete('/api/test', options);
    assert.ok(calls.every(call => call.headers['Content-Type'] === 'application/json' && call.headers['X-Test'] === 'value' && call.cache === 'no-store'));
  });

  it('propagates intentional cancellation without a reachability probe or a stuck activity indicator', async () => {
    const abort = new AbortController();
    const failure = new DOMException('Cancelled', 'AbortError');
    const request = mock.method(globalThis, 'fetch', async () => { abort.abort(); throw failure; });
    await assert.rejects(plannerApi.getVersion({ signal: abort.signal }), error => error === failure);
    assert.equal(request.mock.callCount(), 1);
    assert.equal(isBusy(), false);
  });

  it('classifies manual Access redirects without treating an HTML sign-in as a successful read', async () => {
    mock.method(globalThis, 'fetch', async (_url, options) => {
      assert.equal(options.redirect, 'manual');
      return { type: 'opaqueredirect' };
    });
    await assert.rejects(plannerApi.getVersion(), { kind: KINDS.ACCESS_EXPIRED });
  });

  it('ignores a stale unauthorized response cancelled while its body was being parsed', async () => {
    const abort = new AbortController();
    mock.method(globalThis, 'fetch', async () => ({
      headers: new Headers(), ok: false, status: 401,
      json: async () => { abort.abort(); return { error: 'Expired old session' }; },
    }));
    await assert.rejects(plannerApi.getVersion({ signal: abort.signal }), { name: 'AbortError' });
  });
});
