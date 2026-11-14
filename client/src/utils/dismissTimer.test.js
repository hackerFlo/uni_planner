import test from 'node:test';
import assert from 'node:assert/strict';

import { createDismissTimer } from './dismissTimer.js';

function fakeClock() {
  let now = 0;
  let pending = null;
  return {
    now: () => now,
    setTimeout: (fn, ms) => { pending = { fn, at: now + ms }; return pending; },
    clearTimeout: handle => { if (pending === handle) pending = null; },
    advance(ms) {
      now += ms;
      if (pending && pending.at <= now) { const { fn } = pending; pending = null; fn(); }
    },
    get armed() { return pending !== null; },
  };
}

test.describe('createDismissTimer', () => {
  test('fires after the full duration when never paused', () => {
    const clock = fakeClock();
    let fired = 0;
    createDismissTimer(1000, () => { fired += 1; }, clock).start();
    clock.advance(1000);
    assert.equal(fired, 1);
  });

  test('does not fire while paused', () => {
    const clock = fakeClock();
    let fired = 0;
    const timer = createDismissTimer(1000, () => { fired += 1; }, clock);
    timer.start();
    clock.advance(400);
    timer.pause();
    clock.advance(5000);
    assert.equal(fired, 0);
  });

  test('resumes with only the time that was left', () => {
    const clock = fakeClock();
    let fired = 0;
    const timer = createDismissTimer(1000, () => { fired += 1; }, clock);
    timer.start();
    clock.advance(400);
    timer.pause();
    clock.advance(5000);
    timer.start();
    clock.advance(599);
    assert.equal(fired, 0);
    clock.advance(1);
    assert.equal(fired, 1);
  });

  test('a duration of zero never arms a timer', () => {
    const clock = fakeClock();
    createDismissTimer(0, () => {}, clock).start();
    assert.equal(clock.armed, false);
  });

  test('stop cancels a pending dismissal', () => {
    const clock = fakeClock();
    let fired = 0;
    const timer = createDismissTimer(1000, () => { fired += 1; }, clock);
    timer.start();
    timer.stop();
    clock.advance(2000);
    assert.equal(fired, 0);
  });

  test('pausing twice does not drain the remaining time twice', () => {
    const clock = fakeClock();
    let fired = 0;
    const timer = createDismissTimer(1000, () => { fired += 1; }, clock);
    timer.start();
    clock.advance(300);
    timer.pause();
    clock.advance(300);
    timer.pause();
    timer.start();
    clock.advance(700);
    assert.equal(fired, 1);
  });
});
