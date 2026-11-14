import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { preloadWhenIdle } from './emojiPreload.js';

describe('preloadWhenIdle', () => {
  it('uses requestIdleCallback when available', () => {
    const calls = [];
    preloadWhenIdle(() => {}, { requestIdleCallback: (fn, options) => { calls.push(options.timeout); return 1; } });
    assert.deepEqual(calls, [4000]);
  });

  it('falls back to a timeout without requestIdleCallback', () => {
    const delays = [];
    preloadWhenIdle(() => {}, { setTimeout: (fn, delay) => { delays.push(delay); return 7; } });
    assert.deepEqual(delays, [4000]);
  });

  it('cancels the idle callback it scheduled', () => {
    const cancelled = [];
    const cancel = preloadWhenIdle(() => {}, { requestIdleCallback: () => 3, cancelIdleCallback: id => cancelled.push(id) });
    cancel();
    assert.deepEqual(cancelled, [3]);
  });

  it('cancels the fallback timer it scheduled', () => {
    const cleared = [];
    const cancel = preloadWhenIdle(() => {}, { setTimeout: () => 9, clearTimeout: id => cleared.push(id) });
    cancel();
    assert.deepEqual(cleared, [9]);
  });
});
