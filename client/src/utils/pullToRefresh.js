// Geometry for the pull-to-refresh gesture, kept apart from the DOM plumbing so
// the feel can be tested without a touchscreen.

export const PULL_THRESHOLD_PX = 64;
export const PULL_MAX_PX = 96;

// Rubber-banding: the indicator moves at half the finger's speed and stops dead
// at PULL_MAX_PX, so an enthusiastic swipe cannot drag it down the page.
export function pullDistance(dy) {
  if (dy <= 0) return 0;
  return Math.min(dy * 0.5, PULL_MAX_PX);
}

export function shouldRefresh(distance) {
  return distance >= PULL_THRESHOLD_PX;
}

// 0..1, for rotating the spinner as the gesture approaches the threshold.
export function pullProgress(distance) {
  return Math.max(0, Math.min(1, distance / PULL_THRESHOLD_PX));
}

// A gesture only counts when the surface under the finger is already at its top;
// otherwise the user is scrolling, not pulling.
export function isAtTop(el) {
  return !el || el.scrollTop <= 0;
}
