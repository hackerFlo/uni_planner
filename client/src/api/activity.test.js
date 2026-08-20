import test from 'node:test';
import assert from 'node:assert/strict';

import { beginRequest, endRequest, subscribeActivity, isBusy } from './activity.js';

function drain() {
  while (isBusy()) endRequest();
}

test.describe('request activity', () => {
  test('starts idle', () => {
    drain();
    assert.equal(isBusy(), false);
  });

  test('is busy while a request is open', () => {
    drain();
    beginRequest();
    assert.equal(isBusy(), true);
    endRequest();
  });

  test('stays busy until the last of several requests settles', () => {
    drain();
    beginRequest();
    beginRequest();
    endRequest();
    assert.equal(isBusy(), true);
    endRequest();
    assert.equal(isBusy(), false);
  });

  // The bar should appear once and disappear once, not flicker per request.
  test('notifies only on the idle/busy edges', () => {
    drain();
    const seen = [];
    const off = subscribeActivity(n => seen.push(n));
    beginRequest();
    beginRequest();
    endRequest();
    endRequest();
    off();
    assert.deepEqual(seen, [1, 0]);
  });

  test('an unbalanced settle cannot drive the count negative', () => {
    drain();
    endRequest();
    endRequest();
    beginRequest();
    assert.equal(isBusy(), true);
    endRequest();
    assert.equal(isBusy(), false);
  });

  test('unsubscribing stops delivery', () => {
    drain();
    let calls = 0;
    const off = subscribeActivity(() => { calls += 1; });
    off();
    beginRequest();
    endRequest();
    assert.equal(calls, 0);
  });
});
