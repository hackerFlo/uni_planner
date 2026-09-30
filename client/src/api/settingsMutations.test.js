import { test, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { api } from './client.js';
import { capturedRequest, quoteApi, notificationApi } from './settingsMutations.js';
const version = { epoch: 'a'.repeat(32), revision: 4 };
const key = '5ce22963-02da-4bb2-828b-a5276b13efa9';
afterEach(() => mock.restoreAll());

test('uncertain retry retains the original arguments, version and key despite edited draft or newer view', async () => {
  const first = new Error('Lost response');
  const calls = [];
  const send = async (args, controls) => { calls.push({ args, controls }); if (calls.length === 1) throw first; return { ok: true }; };
  const pending = capturedRequest(send, () => key);
  const args = { notify_email: 'first@example.com' };
  await assert.rejects(pending.run(args, version), error => error === first);
  args.notify_email = 'edited@example.com';
  await pending.run(args, { ...version, revision: 99 });
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(calls[1].args.notify_email, 'first@example.com');
  assert.deepEqual(calls[1].controls, { expectedVersion: version, idempotencyKey: key });
  assert.equal(pending.pending, false);
});

test('definitive rejection releases draft while delivery ambiguity retains the send attempt', async () => {
  const conflict = Object.assign(new Error('Conflict'), { status: 409 });
  const action = capturedRequest(async () => { throw conflict; }, () => key);
  await assert.rejects(action.run({}, version));
  assert.equal(action.pending, false);
  const mail = capturedRequest(async () => { throw conflict; }, () => key, { retainConflict: true });
  await assert.rejects(mail.run({}, version));
  assert.equal(mail.pending, true);
});

test('reads validate captured versions and mutations send explicit controls without a latest-version request', async () => {
  const calls = [];
  mock.method(api, 'get', async () => ({ version, quote: { id: 1 } }));
  assert.deepEqual((await quoteApi.daily('2026-09-27')).version, version);
  mock.method(api, 'post', async (url, body, options) => { calls.push({ url, body, options }); return { version, data: {}, resultVersion: version, currentVersion: version, status: 'sent', attemptId: key }; });
  mock.method(api, 'patch', async (url, body, options) => { calls.push({ url, body, options }); return { version, data: {}, resultVersion: version, currentVersion: version, status: 'sent', attemptId: key }; });
  const controls = { expectedVersion: version, idempotencyKey: key };
  await quoteApi.dislike({ id: 1, date: '2026-09-27' }, controls);
  await quoteApi.importCsv({ csv: 'Quote,Author\nText,Author' }, controls);
  await quoteApi.restoreAll({}, controls);
  await notificationApi.save({ notify_enabled: true }, controls);
  await notificationApi.sendTest({}, controls);
  assert.equal(calls.length, 5);
  assert.ok(calls.every(call => call.options.headers['X-Planner-Revision'] === '4' && call.options.headers['Idempotency-Key'] === key));
  assert.deepEqual(calls.at(-1).body, {});
  mock.restoreAll();
  mock.method(api, 'get', async () => ({ version: { epoch: 'bad' } }));
  await assert.rejects(notificationApi.settings());
});


test('pending delivery keeps the original attempt until a confirmed result', async () => {
  const calls = [];
  const request = capturedRequest(async (_args, controls) => { calls.push(controls); return { status: calls.length === 1 ? 'in_progress' : 'sent' }; }, () => key);
  await request.run({}, version);
  assert.equal(request.pending, true);
  await request.run({}, { ...version, revision: 999 });
  assert.equal(request.pending, false);
  assert.deepEqual(calls[0], calls[1]);
});

test('malformed successful mutation response retains its key for a safe retry', async () => {
  const calls = [];
  mock.method(api, 'patch', async (_url, _body, options) => { calls.push(options); return {}; });
  const request = capturedRequest(notificationApi.save, () => key);
  await assert.rejects(request.run({ notify_enabled: true }, version));
  assert.equal(request.pending, true);
  await assert.rejects(request.run({ notify_enabled: false }, version));
  assert.deepEqual(calls[0], calls[1]);
});
