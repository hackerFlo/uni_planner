import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PlannerRevisionPoller, plannerRevisionSnapshot } from './plannerRevision.js';
import { PlannerResource } from './plannerResource.js';

const version = (revision, epoch = 'a'.repeat(32)) => ({ epoch, revision });
const settle = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture(overrides = {}) {
  let current = version(0);
  const changes = [];
  const states = [];
  const timers = new Map();
  let nextTimer = 0;
  const poller = new PlannerRevisionPoller({
    readVersion: async () => current,
    onChange: async value => changes.push(value), onState: state => states.push(state),
    schedule: (callback, delay) => { timers.set(++nextTimer, { callback, delay }); return nextTimer; },
    cancel: id => timers.delete(id), ...overrides,
  });
  poller.start();
  return { poller, changes, states, timers, setVersion: value => { current = value; } };
}

describe('planner revision polling', () => {
  it('calls browser timers with their global receiver', () => {
    const originalSchedule = globalThis.setTimeout;
    const originalCancel = globalThis.clearTimeout;
    const calls = [];
    globalThis.setTimeout = function () { assert.equal(this, globalThis); calls.push('schedule'); return 1; };
    globalThis.clearTimeout = function () { assert.equal(this, globalThis); calls.push('cancel'); };
    try {
      const poller = new PlannerRevisionPoller({ readVersion: async () => version(0),
        onChange: async () => {}, onState: () => {} });
      poller.start();
      poller.stop();
      assert.deepEqual(calls, ['cancel', 'schedule', 'cancel']);
    } finally {
      globalThis.setTimeout = originalSchedule;
      globalThis.clearTimeout = originalCancel;
    }
  });

  it('refreshes the first observed version before establishing a baseline, then reports changes on a five-second schedule', async () => {
    const f = fixture();
    await f.poller.refresh();
    assert.deepEqual(f.changes, [version(0)]);
    assert.equal([...f.timers.values()][0].delay, 5000);
    f.setVersion(version(1)); await f.poller.refresh(); await settle();
    f.setVersion(version(0, 'b'.repeat(32))); await f.poller.refresh(); await settle();
    assert.deepEqual(f.changes, [version(0), version(1), version(0, 'b'.repeat(32))]);
    f.poller.stop();
  });

  it('queues only the latest observed version while editing and flushes after editing ends', async () => {
    const f = fixture();
    f.poller.setPaused(true); await f.poller.refresh();
    for (const revision of [1, 2, 3]) { f.setVersion(version(revision)); await f.poller.refresh(); }
    assert.deepEqual(f.changes, []);
    f.poller.setPaused(false); await settle();
    assert.deepEqual(f.changes, [version(3)]);
    f.poller.stop();
  });

  it('pauses hidden-tab traffic and rejects stale responses after cancellation', async () => {
    const pending = deferred();
    let signal;
    const f = fixture({ readVersion: options => { signal = options.signal; return pending.promise; } });
    const request = f.poller.refresh();
    f.poller.setVisible(false);
    assert.equal(signal.aborted, true);
    assert.equal(f.timers.size, 0);
    pending.resolve(version(9)); await request;
    assert.ok(f.states.every(state => state.version === null));
    f.poller.stop();
  });

  it('does not leak an old account response or callback after disposal', async () => {
    const pending = deferred();
    const f = fixture({ readVersion: () => pending.promise });
    const request = f.poller.refresh(); f.poller.stop();
    const count = f.states.length;
    pending.resolve(version(8)); await request;
    assert.equal(f.states.length, count);
    assert.deepEqual(f.changes, []);
  });

  it('deduplicates focus refreshes while a request is already running', async () => {
    const pending = deferred(); let calls = 0;
    const f = fixture({ readVersion: () => { calls++; return pending.promise; } });
    const first = f.poller.refresh();
    await f.poller.refresh(); await f.poller.refresh();
    assert.equal(calls, 1);
    pending.resolve(version(0)); await first; f.poller.stop();
  });

  it('backs off failures up to one minute and resets after success', async () => {
    let fails = true;
    const failure = new Error('offline');
    const f = fixture({ readVersion: async () => { if (fails) throw failure; return version(0); } });
    for (const delay of [10000, 20000, 40000, 60000, 60000]) {
      await f.poller.refresh(); assert.equal([...f.timers.values()][0].delay, delay);
    }
    assert.equal(f.states.at(-1).error, failure);
    fails = false; await f.poller.refresh();
    assert.equal([...f.timers.values()][0].delay, 5000);
    assert.equal(f.states.at(-1).error, null); f.poller.stop();
  });

  it('ignores older revisions in the same epoch', async () => {
    const f = fixture(); f.setVersion(version(5)); await f.poller.refresh();
    f.setVersion(version(4)); await f.poller.refresh();
    assert.deepEqual(f.states.at(-1).version, version(5));
    assert.deepEqual(f.changes, [version(5)]); f.poller.stop();
  });

  it('aborts pending refresh callbacks when editing begins, then replays the latest queued change', async () => {
    const pending = deferred(); const seen = [];
    const f = fixture({ onChange: (value, { signal }) => { seen.push({ value, signal }); return pending.promise; } });
    await f.poller.refresh(); f.setVersion(version(1)); await f.poller.refresh();
    f.poller.setPaused(true);
    assert.equal(seen[0].signal.aborted, true);
    f.setVersion(version(2)); await f.poller.refresh();
    pending.resolve(); await settle(); f.poller.setPaused(false); await settle();
    assert.deepEqual(seen.map(entry => entry.value), [version(0), version(2)]); f.poller.stop();
  });

  it('retains a failed refresh for a later polling attempt without an immediate retry loop', async () => {
    let calls = 0;
    const f = fixture({ onChange: async () => { if (++calls === 1) throw new Error('refresh failed'); } });
    await f.poller.refresh(); await settle();
    assert.equal(calls, 1);
    await f.poller.refresh(); await settle();
    assert.equal(calls, 2); f.poller.stop();
  });
  it('keeps a view failure visible while a successful version probe retries the views', async () => {
    const retry = deferred();
    const failure = new Error('view unavailable');
    let calls = 0;
    const f = fixture({ onChange: () => ++calls === 1 ? Promise.reject(failure) : retry.promise });
    await f.poller.refresh(); await settle();
    await f.poller.refresh(); await settle();
    assert.equal(f.states.at(-1).error, failure);
    retry.resolve(true); await settle();
    assert.equal(f.states.at(-1).error, null);
    f.poller.stop();
  });

  it('does not clear a version probe failure when an earlier view refresh succeeds', async () => {
    const views = deferred();
    const failure = new Error('version unavailable');
    let reads = 0;
    const f = fixture({ readVersion: async () => {
      if (++reads > 1) throw failure;
      return version(0);
    }, onChange: () => views.promise });
    await f.poller.refresh(); await f.poller.refresh();
    views.resolve(true); await settle();
    assert.equal(f.states.at(-1).error, failure);
    f.poller.stop();
  });

  it('keeps the page snapshot stable during unchanged healthy polling', async () => {
    const scope = { accountId: 1 };
    let snapshot = null;
    let updates = 0;
    const f = fixture({ onState: state => {
      const next = plannerRevisionSnapshot(snapshot, state, scope);
      if (next !== snapshot) updates++;
      snapshot = next;
    } });
    await f.poller.refresh(); await settle();
    const firstSnapshot = snapshot;
    const initialUpdates = updates;
    for (let attempt = 0; attempt < 3; attempt++) await f.poller.refresh();
    assert.equal(snapshot, firstSnapshot);
    assert.equal(updates, initialUpdates);
    f.poller.stop();
  });

  it('does not reuse an identical revision snapshot across accounts', () => {
    const state = { version: version(0), error: null };
    const previous = plannerRevisionSnapshot(null, state, { accountId: 1 });
    const nextScope = { accountId: 2 };
    const next = plannerRevisionSnapshot(previous, state, nextScope);
    assert.notEqual(next, previous);
    assert.equal(next.scope, nextScope);
  });
  it('retains the initial version when a view refresh returns false, even if the version does not change', async () => {
    let calls = 0;
    const f = fixture({ onChange: async () => ++calls > 1 });
    f.setVersion(version(2));
    await f.poller.refresh(); await settle();
    assert.equal(f.poller.delivered, null);
    assert.deepEqual(f.poller.pending, version(2));
    await f.poller.refresh(); await settle();
    assert.equal(calls, 2);
    assert.deepEqual(f.poller.delivered, version(2));
    assert.equal(f.poller.pending, null);
    f.poller.stop();
  });

  it('retries an older resource snapshot before delivering the unchanged observed revision', async () => {
    let reads = 0;
    const resource = new PlannerResource({
      read: async () => ({ rows: [], version: version(++reads === 1 ? 1 : 2) }),
      select: result => result.rows,
    });
    const f = fixture({ onChange: (minimumVersion, options) => resource.refresh({ ...options, minimumVersion }) });
    f.setVersion(version(2));
    await f.poller.refresh(); await settle();
    assert.equal(f.poller.delivered, null);
    assert.deepEqual(f.poller.pending, version(2));
    await f.poller.refresh(); await settle();
    assert.deepEqual(f.poller.delivered, version(2));
    assert.equal(f.poller.pending, null);
    assert.equal(reads, 2);
    f.poller.stop(); resource.close();
  });
});
