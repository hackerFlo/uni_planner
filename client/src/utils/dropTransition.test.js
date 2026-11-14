import test from 'node:test';
import assert from 'node:assert/strict';

import { dropTransition, dragTransform, listContentWidth, tiltFromDelta, FAST_DROP_MS, LIFT_SCALE, MAX_TILT_DEG, TILT_PER_PX, TILT_VAR } from './dropTransition.js';

const LIBRARY_DROP = 'transform 0.33s cubic-bezier(.2,1,.1,1), opacity 0.33s cubic-bezier(.2,1,.1,1)';
const LIBRARY_MIN_DROP_MS = 330;

test.describe('dropTransition', () => {
  test('replaces the library drop timing while the card is landing', () => {
    assert.equal(
      dropTransition({ isDropAnimating: true }, LIBRARY_DROP),
      `transform ${FAST_DROP_MS}ms cubic-bezier(.2,1,.1,1), width ${FAST_DROP_MS}ms cubic-bezier(.2,1,.1,1)`,
    );
  });

  // Without it a card carried at the mobile finger width lands sideways of its slot.
  test('eases width in the same glide so a narrowed card lands flush', () => {
    assert.match(dropTransition({ isDropAnimating: true }, LIBRARY_DROP), new RegExp(`width ${FAST_DROP_MS}ms`));
  });

  // The library finishes a drop on the card's transform transitionend, so the
  // shortened transition must still animate transform or the drop never ends.
  test('still animates transform, which the library waits for', () => {
    assert.match(dropTransition({ isDropAnimating: true }, LIBRARY_DROP), /^transform \d+ms/);
  });

  test('lands faster than the library minimum', () => {
    assert.ok(FAST_DROP_MS < LIBRARY_MIN_DROP_MS);
  });

  test('passes the library transition through when not landing', () => {
    assert.equal(dropTransition({ isDropAnimating: false }, LIBRARY_DROP), LIBRARY_DROP);
  });

  test('passes an absent transition through unchanged', () => {
    assert.equal(dropTransition({ isDropAnimating: false }, undefined), undefined);
  });
});

const TRANSLATE = 'translate(12px, 34px)';

test.describe('dragTransform', () => {
  // The rotation comes from a custom property the drag hook writes per frame,
  // so the string is stable and React never re-renders to change the tilt.
  test('tilts and lifts a card that is being carried, reading the tilt variable', () => {
    assert.equal(
      dragTransform(TRANSLATE, { isDragging: true, isDropAnimating: false }),
      `${TRANSLATE} rotate(var(${TILT_VAR}, 0deg)) scale(${LIFT_SCALE})`,
    );
  });

  // Landing with a translate-only transform would make the browser interpolate
  // between two lists of different shape; the tilt and lift must ease back to
  // rest inside the same transition as the glide.
  test('keeps the same function list while landing, settled to rest', () => {
    assert.equal(
      dragTransform(TRANSLATE, { isDragging: true, isDropAnimating: true }),
      `${TRANSLATE} rotate(0deg) scale(1)`,
    );
  });

  test('leaves the library transform alone when not dragging', () => {
    assert.equal(dragTransform(TRANSLATE, { isDragging: false, isDropAnimating: false }), TRANSLATE);
  });

  test('tolerates a missing library transform', () => {
    assert.equal(dragTransform(undefined, { isDragging: false, isDropAnimating: false }), undefined);
  });
});

test.describe('tiltFromDelta', () => {
  test('leans proportionally to the sideways movement', () => {
    assert.equal(tiltFromDelta(4), 4 * TILT_PER_PX);
  });

  test('leans the other way for leftward movement', () => {
    assert.equal(tiltFromDelta(-4), -4 * TILT_PER_PX);
  });

  test('clamps a fast flick to the maximum lean', () => {
    assert.equal(tiltFromDelta(500), MAX_TILT_DEG);
  });

  test('clamps a fast leftward flick to the negative maximum', () => {
    assert.equal(tiltFromDelta(-500), -MAX_TILT_DEG);
  });

  test('is flat when the pointer has not moved', () => {
    assert.equal(tiltFromDelta(0), 0);
  });
});

test.describe('listContentWidth', () => {
  const styleOf = (left, right) => () => ({ paddingLeft: `${left}px`, paddingRight: `${right}px` });

  test('is the width a card gets inside the list padding', () => {
    assert.equal(listContentWidth({ clientWidth: 178 }, styleOf(10, 10)), 158);
  });

  test('is undefined when there is no list element to measure', () => {
    assert.equal(listContentWidth(null, styleOf(10, 10)), undefined);
  });
});
