import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshPlannerViews, refreshPlannerResources } from './plannerRefresh.js';
import { PlannerResource } from './plannerResource.js';

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

test('overlapping reads defer reconciliation without manufacturing a sync error', async () => {
  const options = { signal: new AbortController().signal };
  const calls = [];
  const readers = [true, false, true].map(result => async received => {
    calls.push(received);
    return result;
  });
  assert.equal(await refreshPlannerResources(readers, options), false);
  assert.deepEqual(calls, [options, options, options]);
});

test('real resource failures remain observable when another read is deferred', async () => {
  const failure = new Error('view unavailable');
  await assert.rejects(refreshPlannerResources([
    async () => false, async () => { throw failure; },
  ]), error => error === failure);
});

test('initial loading and revision reconciliation use one request per already-current resource', async () => {
  const version = { epoch: 'a'.repeat(32), revision: 1 };
  const pending = [];
  let reads = 0;
  const resources = Array.from({ length: 3 }, () => new PlannerResource({
    read: () => { reads++; return new Promise(resolve => pending.push(resolve)); },
    select: result => result.rows,
  }));
  const initial = Promise.all(resources.map(resource => resource.refresh()));
  const reconciliation = refreshPlannerResources(resources.map(resource => options => resource.refresh(options)),
    { minimumVersion: version, signal: new AbortController().signal });
  assert.equal(reads, resources.length);
  for (const resolve of pending) resolve({ rows: [], version });
  assert.deepEqual(await initial, [true, true, true]);
  assert.equal(await reconciliation, true);
  assert.equal(reads, resources.length);
});
