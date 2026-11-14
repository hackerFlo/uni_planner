import test from 'node:test';
import assert from 'node:assert/strict';

import { CHUNK_RELOAD_KEY, CHUNK_RELOAD_WINDOW_MS, loadWithReload } from './chunkReload.js';

const NOW = 1_000_000;
const failure = new Error('Failed to fetch dynamically imported module');
const memoryStorage = (initial = {}) => {
  const data = { ...initial };
  return { getItem: key => data[key] ?? null, setItem: (key, value) => { data[key] = value; }, data };
};
const deps = (overrides = {}) => {
  const reloads = [];
  return { reloads, storage: memoryStorage(), reload: () => reloads.push('reload'), now: () => NOW, ...overrides };
};
const broken = () => Promise.reject(failure);

test.describe('loadWithReload', () => {
  test('returns the module when the import works', async () => {
    assert.deepEqual(await loadWithReload(async () => ({ default: 1 }), deps()), { default: 1 });
  });

  test('reloads once and marks the time when the import fails', async () => {
    const d = deps();
    loadWithReload(broken, d);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual([d.reloads.length, d.storage.data[CHUNK_RELOAD_KEY]], [1, String(NOW)]);
  });

  test('rethrows instead of looping when it reloaded moments ago', async () => {
    const d = deps({ storage: memoryStorage({ [CHUNK_RELOAD_KEY]: String(NOW - 1000) }) });
    await assert.rejects(loadWithReload(broken, d), failure);
  });

  test('does not reload when a reload was recent', async () => {
    const d = deps({ storage: memoryStorage({ [CHUNK_RELOAD_KEY]: String(NOW - 1000) }) });
    await loadWithReload(broken, d).catch(() => {});
    assert.equal(d.reloads.length, 0);
  });

  test('reloads again once the window has passed', async () => {
    const d = deps({ storage: memoryStorage({ [CHUNK_RELOAD_KEY]: String(NOW - CHUNK_RELOAD_WINDOW_MS - 1) }) });
    loadWithReload(broken, d);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(d.reloads.length, 1);
  });

  test('rethrows offline without reloading', async () => {
    const d = deps({ isOnline: () => false });
    await assert.rejects(loadWithReload(broken, d), failure);
    assert.equal(d.reloads.length, 0);
  });

  test('rethrows when storage cannot be written', async () => {
    const storage = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    await assert.rejects(loadWithReload(broken, deps({ storage })), failure);
  });
});
