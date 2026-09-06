import test from 'node:test';
import assert from 'node:assert/strict';

import { thumbGeometry, scrollLeftForThumbLeft, MIN_THUMB_PX } from './weekScroll.js';

// One viewport shape reused across the suite: the row is exactly twice as wide
// as the window onto it, so the thumb is half the track and its travel is half
// the track too. Every expectation below is derived from these four numbers.
const VIEWPORT_PX = 600;
const ROW_PX = 1200;
const TRACK_PX = 600;
const MAX_SCROLL_PX = ROW_PX - VIEWPORT_PX;
const HALF_TRACK_PX = TRACK_PX / 2;

const viewport = ({ scrollLeft = 0, clientWidth = VIEWPORT_PX, scrollWidth = ROW_PX, trackWidth = TRACK_PX } = {}) =>
  ({ scrollLeft, clientWidth, scrollWidth, trackWidth });

test.describe('thumbGeometry', () => {
  test('hides the bar when the row fits the viewport', () => {
    assert.equal(thumbGeometry(viewport({ scrollWidth: VIEWPORT_PX - 1 })).visible, false);
  });

  // The boundary the browser itself reports when nothing overflows: a row that
  // measures exactly the viewport is not scrollable, so there is nothing to show.
  test('hides the bar at the exact no-overflow boundary', () => {
    assert.equal(thumbGeometry(viewport({ scrollWidth: VIEWPORT_PX })).visible, false);
  });

  test('shows the bar as soon as one pixel overflows', () => {
    assert.equal(thumbGeometry(viewport({ scrollWidth: VIEWPORT_PX + 1 })).visible, true);
  });

  test('sizes the thumb to the visible fraction of the row', () => {
    assert.equal(thumbGeometry(viewport()).widthPx, HALF_TRACK_PX);
  });

  test('never shrinks the thumb below the minimum grab size', () => {
    const longRow = viewport({ scrollWidth: ROW_PX * 100 });
    assert.equal(thumbGeometry(longRow).widthPx, MIN_THUMB_PX);
  });

  test('honours a caller-supplied minimum thumb size', () => {
    const longRow = viewport({ scrollWidth: ROW_PX * 100 });
    assert.equal(thumbGeometry({ ...longRow, minThumbPx: 48 }).widthPx, 48);
  });

  // A minimum wider than the bar itself would otherwise push the thumb off the end.
  test('never grows the thumb past the track', () => {
    const narrowTrack = viewport({ scrollWidth: ROW_PX * 100, trackWidth: MIN_THUMB_PX / 2 });
    assert.equal(thumbGeometry(narrowTrack).widthPx, MIN_THUMB_PX / 2);
  });

  test('parks the thumb at the track start when the row is scrolled home', () => {
    assert.equal(thumbGeometry(viewport({ scrollLeft: 0 })).leftPx, 0);
  });

  test('parks the thumb flush against the track end at maximum scroll', () => {
    const geometry = thumbGeometry(viewport({ scrollLeft: MAX_SCROLL_PX }));
    assert.equal(geometry.leftPx, TRACK_PX - geometry.widthPx);
  });

  test('places the thumb proportionally between the ends', () => {
    const geometry = thumbGeometry(viewport({ scrollLeft: MAX_SCROLL_PX / 4 }));
    assert.equal(geometry.leftPx, (TRACK_PX - HALF_TRACK_PX) / 4);
  });

  // Momentum scrolling on macOS reports a scrollLeft past either end.
  test('clamps a rubber-banded scroll position to the track', () => {
    const overscrolled = thumbGeometry(viewport({ scrollLeft: MAX_SCROLL_PX * 2 }));
    assert.equal(overscrolled.leftPx, TRACK_PX - HALF_TRACK_PX);
    assert.equal(thumbGeometry(viewport({ scrollLeft: -80 })).leftPx, 0);
  });

  test('hides the bar for a viewport that has not been laid out yet', () => {
    assert.equal(thumbGeometry(viewport({ clientWidth: 0, scrollWidth: 0 })).visible, false);
  });

  test('hides the bar for a negative viewport width', () => {
    assert.equal(thumbGeometry(viewport({ clientWidth: -VIEWPORT_PX })).visible, false);
  });

  // The track is measured from the element this geometry decides to render, so on
  // the first paint it is still zero. Hiding then would mean it is never measured.
  test('keeps the bar visible but empty while the track is unmeasured', () => {
    assert.deepEqual(thumbGeometry(viewport({ trackWidth: 0 })), { visible: true, widthPx: 0, leftPx: 0 });
  });

  test('never reports a non-finite geometry', () => {
    const geometry = thumbGeometry(viewport({ scrollLeft: NaN }));
    assert.equal(Number.isFinite(geometry.widthPx), true);
    assert.equal(Number.isFinite(geometry.leftPx), true);
  });
});

test.describe('scrollLeftForThumbLeft', () => {
  const inverseOf = (geometry, thumbLeftPx) => scrollLeftForThumbLeft({
    thumbLeftPx,
    trackWidth: TRACK_PX,
    thumbWidthPx: geometry.widthPx,
    clientWidth: VIEWPORT_PX,
    scrollWidth: ROW_PX,
  });

  test('returns the scroll position the thumb was placed for', () => {
    const scrollLeft = MAX_SCROLL_PX * 0.4;
    const geometry = thumbGeometry(viewport({ scrollLeft }));
    assert.equal(inverseOf(geometry, geometry.leftPx), scrollLeft);
  });

  test('round trips both ends of the track', () => {
    for (const scrollLeft of [0, MAX_SCROLL_PX]) {
      const geometry = thumbGeometry(viewport({ scrollLeft }));
      assert.equal(inverseOf(geometry, geometry.leftPx), scrollLeft);
    }
  });

  test('clamps a drag past the track end to the last scrollable pixel', () => {
    const geometry = thumbGeometry(viewport());
    assert.equal(inverseOf(geometry, TRACK_PX * 3), MAX_SCROLL_PX);
  });

  test('clamps a drag before the track start to zero', () => {
    const geometry = thumbGeometry(viewport());
    assert.equal(inverseOf(geometry, -TRACK_PX), 0);
  });

  test('returns zero when there is nothing to scroll', () => {
    const scrollLeft = scrollLeftForThumbLeft({
      thumbLeftPx: TRACK_PX / 3,
      trackWidth: TRACK_PX,
      thumbWidthPx: TRACK_PX,
      clientWidth: VIEWPORT_PX,
      scrollWidth: VIEWPORT_PX,
    });
    assert.equal(scrollLeft, 0);
  });

  // A thumb clamped to the full track has no travel, so the divisor would be zero.
  test('returns zero when the thumb fills the whole track', () => {
    const scrollLeft = scrollLeftForThumbLeft({
      thumbLeftPx: TRACK_PX / 3,
      trackWidth: TRACK_PX,
      thumbWidthPx: TRACK_PX,
      clientWidth: VIEWPORT_PX,
      scrollWidth: ROW_PX,
    });
    assert.equal(scrollLeft, 0);
  });

  test('returns zero for an unmeasured track', () => {
    const scrollLeft = scrollLeftForThumbLeft({
      thumbLeftPx: 0,
      trackWidth: 0,
      thumbWidthPx: 0,
      clientWidth: VIEWPORT_PX,
      scrollWidth: ROW_PX,
    });
    assert.equal(scrollLeft, 0);
  });

  test('returns zero for a non-finite pointer position', () => {
    const geometry = thumbGeometry(viewport());
    assert.equal(inverseOf(geometry, NaN), 0);
  });
});
