import test from 'node:test';
import assert from 'node:assert/strict';

import { veilHoldMs, MIN_VEIL_MS } from './loadingVeil.js';

test.describe('veilHoldMs', () => {
  test('holds the skeleton for the rest of the minimum on a fast load', () => {
    assert.equal(veilHoldMs(MIN_VEIL_MS - 100), 100);
  });

  test('does not hold a load that already took longer than the minimum', () => {
    assert.equal(veilHoldMs(MIN_VEIL_MS + 400), 0);
  });

  test('holds the whole minimum when the app is ready at once', () => {
    assert.equal(veilHoldMs(0), MIN_VEIL_MS);
  });
});
