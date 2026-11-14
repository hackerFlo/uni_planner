import test from 'node:test';
import assert from 'node:assert/strict';

import { nextTabTarget } from './focusTrap.js';

const ring = ['first', 'middle', 'last'];

test.describe('nextTabTarget', () => {
  test('Tab on the last element wraps to the first', () => {
    assert.equal(nextTabTarget(ring, 'last', false), 'first');
  });

  test('Shift+Tab on the first element wraps to the last', () => {
    assert.equal(nextTabTarget(ring, 'first', true), 'last');
  });

  test('Tab in the middle is left to the browser', () => {
    assert.equal(nextTabTarget(ring, 'middle', false), null);
  });

  test('Shift+Tab in the middle is left to the browser', () => {
    assert.equal(nextTabTarget(ring, 'middle', true), null);
  });

  test('Tab from outside the ring enters at the first element', () => {
    assert.equal(nextTabTarget(ring, 'stranger', false), 'first');
  });

  test('Shift+Tab from outside the ring enters at the last element', () => {
    assert.equal(nextTabTarget(ring, 'stranger', true), 'last');
  });

  test('a ring with no focusable element yields nothing to move to', () => {
    assert.equal(nextTabTarget([], 'stranger', false), null);
  });

  test('a single element traps both directions on itself', () => {
    assert.equal(nextTabTarget(['only'], 'only', false), 'only');
    assert.equal(nextTabTarget(['only'], 'only', true), 'only');
  });
});
