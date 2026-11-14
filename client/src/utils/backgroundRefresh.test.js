import test from 'node:test';
import assert from 'node:assert/strict';

import { backgroundAfterWrite } from './backgroundRefresh.js';

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test.describe('backgroundAfterWrite', () => {
  test('awaits the refresh before the write has happened', async () => {
    const gate = deferred();
    const bg = backgroundAfterWrite(() => gate.promise);
    let done = false;
    bg.refresh().then(() => { done = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(done, false);
  });

  test('resolves immediately after the write while the refresh continues', async () => {
    const gate = deferred();
    const bg = backgroundAfterWrite(() => gate.promise);
    bg.markWritten();
    assert.equal(await bg.refresh(), true);
  });

  test('still starts the refresh after the write', async () => {
    let started = 0;
    const bg = backgroundAfterWrite(async () => { started += 1; return true; });
    bg.markWritten();
    await bg.refresh();
    assert.equal(started, 1);
  });

  test('reports settlement when the background refresh finishes', async () => {
    const gate = deferred();
    let settled = 0;
    const bg = backgroundAfterWrite(() => gate.promise, () => { settled += 1; });
    bg.markWritten();
    await bg.refresh();
    const before = settled;
    gate.resolve(true);
    await gate.promise;
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual([before, settled], [0, 1]);
  });
});
