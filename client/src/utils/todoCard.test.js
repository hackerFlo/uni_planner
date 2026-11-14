import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMPLETION_DELAY_MS, CHECK_DELAY_MS, CHECK_DRAW_MS, FADE_MS, checkmarkTransition, completionFadeTransition, isRecurring,
} from './todoCard.js';

const TARGET_REMOVAL_MS = 700;

test.describe('completion timeline', () => {
  test('removes the card about 0.7 s after the click', () => {
    assert.equal(COMPLETION_DELAY_MS, TARGET_REMOVAL_MS);
  });

  test('fades the card out starting FADE_MS before removal', () => {
    assert.equal(completionFadeTransition, `opacity ${FADE_MS}ms ease ${COMPLETION_DELAY_MS - FADE_MS}ms, transform ${FADE_MS}ms ease ${COMPLETION_DELAY_MS - FADE_MS}ms`);
  });

  test('finishes drawing the checkmark before the fade begins', () => {
    assert.ok(CHECK_DELAY_MS + CHECK_DRAW_MS < COMPLETION_DELAY_MS - FADE_MS);
  });

  test('draws the checkmark stroke over its configured duration', () => {
    assert.equal(checkmarkTransition, `stroke-dashoffset ${CHECK_DRAW_MS}ms ease ${CHECK_DELAY_MS}ms`);
  });
});

test.describe('isRecurring', () => {
  test('is true for a todo with a recurrence pattern', () => {
    assert.equal(isRecurring({ recurrence_pattern: 'weekdays' }), true);
  });

  test('is false for a one-off todo', () => {
    assert.equal(isRecurring({}), false);
  });
});
