// Geometry for the planner's own horizontal scrollbar. The native bar is not an
// option there: `scrollbar-width: none` is not axis-specific, so un-hiding x
// would un-hide y, and a nested scroll container breaks dnd's drag auto-scroll.
// The arithmetic lives here, apart from the DOM, so it can be tested without a
// browser -- the client's test runner has no jsdom.

export const MIN_THUMB_PX = 32;

const HIDDEN = Object.freeze({ visible: false, widthPx: 0, leftPx: 0 });
const UNMEASURED_TRACK = Object.freeze({ visible: true, widthPx: 0, leftPx: 0 });

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function positiveOrZero(value) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function thumbGeometry({ scrollLeft, clientWidth, scrollWidth, trackWidth, minThumbPx = MIN_THUMB_PX }) {
  const viewportPx = positiveOrZero(clientWidth);
  const rowPx = positiveOrZero(scrollWidth);
  const maxScrollLeft = rowPx - viewportPx;
  if (viewportPx === 0 || maxScrollLeft <= 0) return HIDDEN;

  // The caller measures the track from the element this decides to render, so on
  // the first paint it is still zero. Hiding then would mean it is never measured.
  const trackPx = positiveOrZero(trackWidth);
  if (trackPx === 0) return UNMEASURED_TRACK;

  const smallestThumbPx = Math.min(positiveOrZero(minThumbPx), trackPx);
  const widthPx = clamp((viewportPx / rowPx) * trackPx, smallestThumbPx, trackPx);
  const progress = clamp(positiveOrZero(scrollLeft) / maxScrollLeft, 0, 1);
  return { visible: true, widthPx, leftPx: (trackPx - widthPx) * progress };
}

export function scrollLeftForThumbLeft({ thumbLeftPx, trackWidth, thumbWidthPx, clientWidth, scrollWidth }) {
  const maxScrollLeft = positiveOrZero(scrollWidth) - positiveOrZero(clientWidth);
  const travelPx = positiveOrZero(trackWidth) - positiveOrZero(thumbWidthPx);
  if (maxScrollLeft <= 0 || travelPx <= 0 || !Number.isFinite(thumbLeftPx)) return 0;
  return clamp(thumbLeftPx / travelPx, 0, 1) * maxScrollLeft;
}
