import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshPlannerViews } from './plannerRefresh.js';

test('a mutation or undo refresh waits for both board and related views', async () => {
  let finishRelated;
  let done = false;
  const options = { signal: new AbortController().signal };
  const calls = [];
  const pending = refreshPlannerViews(async received => { calls.push(received); return true; },
    received => { calls.push(received); return new Promise(resolve => { finishRelated = resolve; }); }, options)
    .then(result => { done = true; return result; });
  await Promise.resolve();
  assert.equal(done, false);
  assert.deepEqual(calls, [options, options]);
  finishRelated(true);
  assert.equal(await pending, true);
});

test('a deferred related snapshot does not claim complete refresh', async () => {
  assert.equal(await refreshPlannerViews(async () => true, async () => false), false);
});

test('board refresh failure still attempts the related view and propagates failure', async () => {
  let related = false;
  await assert.rejects(refreshPlannerViews(async () => { throw new Error('board unavailable'); },
    async () => { related = true; return true; }), /board unavailable/);
  assert.equal(related, true);
});

test('board-only callers can refresh without a related view', async () => {
  assert.equal(await refreshPlannerViews(async () => true), true);
});
