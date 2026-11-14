import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { accountStatusLabel, agentAccountApi, formatAccountTime } from './agentAccount.js';

afterEach(() => mock.restoreAll());

function stubFetch() {
  const calls = [];
  mock.method(globalThis, 'fetch', async (path, options) => {
    calls.push({ path, method: options.method, body: options.body });
    return new Response('{"ok":true}', { status: 200 });
  });
  return calls;
}

test('delete sends the current password as a JSON body', async () => {
  const calls = stubFetch();
  await agentAccountApi.remove('pw');
  assert.deepEqual(calls[0], { path: '/api/agent-account', method: 'DELETE', body: '{"currentPassword":"pw"}' });
});

test('create posts email and current password', async () => {
  const calls = stubFetch();
  await agentAccountApi.create('pw', 'a@example.com');
  assert.equal(calls[0].body, '{"currentPassword":"pw","email":"a@example.com"}');
});

test('reset-password posts to its own path', async () => {
  const calls = stubFetch();
  await agentAccountApi.resetPassword('pw');
  assert.equal(calls[0].path, '/api/agent-account/reset-password');
});

test('setDisabled patches the flag', async () => {
  const calls = stubFetch();
  await agentAccountApi.setDisabled(true);
  assert.deepEqual([calls[0].method, calls[0].body], ['PATCH', '{"disabled":true}']);
});

test('accountStatusLabel names both states', () => {
  assert.deepEqual([false, true].map(disabled => accountStatusLabel({ disabled })), ['Active', 'Disabled']);
});

test('formatAccountTime reports Never for missing or invalid values', () => {
  assert.deepEqual([null, undefined, 'garbage'].map(value => formatAccountTime(value)), ['Never', 'Never', 'Never']);
});

test('formatAccountTime reads SQLite timestamps as UTC', () => {
  const sqlite = formatAccountTime('2026-03-04 10:00:00', new Date('2026-06-01T00:00:00Z'));
  assert.equal(sqlite, formatAccountTime('2026-03-04T10:00:00Z', new Date('2026-06-01T00:00:00Z')));
});
