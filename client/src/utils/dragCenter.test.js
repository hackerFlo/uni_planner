import test from 'node:test';
import assert from 'node:assert/strict';

import { narrowedCardShiftPx } from './dragCenter.js';

const CARD_WIDTH_PX = 180;
const VIEWPORT_PX = 390;
const CARD_LEFT_PX = 20;
const half = CARD_WIDTH_PX / 2;

const shift = (pointerX, extra = {}) =>
  narrowedCardShiftPx({ pointerX, cardLeft: CARD_LEFT_PX, cardWidth: CARD_WIDTH_PX, viewportWidth: VIEWPORT_PX, ...extra });

test.describe('narrowedCardShiftPx', () => {
  test('centres the card under a finger in the middle of the screen', () => {
    const pointerX = 200;
    assert.equal(CARD_LEFT_PX + shift(pointerX) + half, pointerX);
  });

  test('leaves the card where it is when the finger already sits at its centre', () => {
    assert.equal(shift(CARD_LEFT_PX + half), 0);
  });

  test('moves the card left for a finger left of its centre', () => {
    assert.equal(shift(CARD_LEFT_PX + half - 10), -10);
  });

  test('keeps the card on screen when the finger is at the right edge', () => {
    assert.equal(CARD_LEFT_PX + shift(VIEWPORT_PX), VIEWPORT_PX - CARD_WIDTH_PX);
  });

  test('keeps the card on screen when the finger is at the left edge', () => {
    assert.equal(CARD_LEFT_PX + shift(0), 0);
  });

  test('does not move the card when the pointer position is unknown', () => {
    assert.equal(shift(null), 0);
  });

  test('does not move the card for a non-finite pointer position', () => {
    assert.equal(shift(Number.NaN), 0);
  });

  test('pins the card to the left edge when the viewport is narrower than the card', () => {
    assert.equal(CARD_LEFT_PX + shift(100, { viewportWidth: CARD_WIDTH_PX - 40 }), 0);
  });
});
