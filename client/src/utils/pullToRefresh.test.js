import test from 'node:test';
import assert from 'node:assert/strict';

import {
  pullDistance, shouldRefresh, pullProgress, isAtTop,
  PULL_THRESHOLD_PX, PULL_MAX_PX,
} from './pullToRefresh.js';

test.describe('pullDistance', () => {
  test('ignores an upward drag', () => {
    assert.equal(pullDistance(-40), 0);
  });

  test('is zero at rest', () => {
    assert.equal(pullDistance(0), 0);
  });

  test('moves at half the finger speed, so the gesture feels weighted', () => {
    assert.equal(pullDistance(40), 20);
  });

  test('never exceeds the cap however hard you pull', () => {
    assert.equal(pullDistance(10000), PULL_MAX_PX);
  });

  test('is monotonic', () => {
    let last = -1;
    for (let dy = 0; dy <= 400; dy += 20) {
      const d = pullDistance(dy);
      assert.ok(d >= last);
      last = d;
    }
  });
});

test.describe('shouldRefresh', () => {
  test('does not fire below the threshold', () => {
    assert.equal(shouldRefresh(PULL_THRESHOLD_PX - 1), false);
  });

  test('fires exactly at the threshold', () => {
    assert.equal(shouldRefresh(PULL_THRESHOLD_PX), true);
  });

  // A cap below the threshold would make the gesture impossible to complete.
  test('the cap is reachable past the threshold', () => {
    assert.ok(PULL_MAX_PX >= PULL_THRESHOLD_PX);
    assert.equal(shouldRefresh(pullDistance(1000)), true);
  });
});

test.describe('pullProgress', () => {
  test('is 0 at rest', () => {
    assert.equal(pullProgress(0), 0);
  });

  test('is 1 once the threshold is met', () => {
    assert.equal(pullProgress(PULL_THRESHOLD_PX), 1);
  });

  test('clamps rather than overshooting', () => {
    assert.equal(pullProgress(PULL_MAX_PX * 10), 1);
  });

  test('is half way at half the threshold', () => {
    assert.equal(pullProgress(PULL_THRESHOLD_PX / 2), 0.5);
  });
});

test.describe('isAtTop', () => {
  test('a surface scrolled down is not pullable', () => {
    assert.equal(isAtTop({ scrollTop: 120 }), false);
  });

  test('a surface at its top is pullable', () => {
    assert.equal(isAtTop({ scrollTop: 0 }), true);
  });

  // iOS reports a negative scrollTop during its own rubber-band overscroll.
  test('treats iOS overscroll as still at the top', () => {
    assert.equal(isAtTop({ scrollTop: -20 }), true);
  });

  test('a missing element does not throw', () => {
    assert.equal(isAtTop(null), true);
  });
});
