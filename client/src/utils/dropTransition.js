// @hello-pangea/dnd glides a released card into its slot over 330–550 ms, which
// reads as lag once the drop target is already decided. The library ends the
// drop on the card's transform transitionend, so the shorter timing has to keep
// animating transform -- a bare `none` would leave the drop unfinished. Width
// rides along: a card carried over a day at the mobile finger-tracking width
// lands top-left aligned, and snapping to the column's real content width after
// landing would shift it sideways by half the difference. Easing the width in
// the same glide makes both ends meet. Where the widths already match (desktop)
// it animates nothing.
export const FAST_DROP_MS = 180;
const DROP_EASING = 'cubic-bezier(.2,1,.1,1)';

export function dropTransition(snapshot, libraryTransition) {
  return snapshot.isDropAnimating
    ? `transform ${FAST_DROP_MS}ms ${DROP_EASING}, width ${FAST_DROP_MS}ms ${DROP_EASING}`
    : libraryTransition;
}

export const LIFT_SCALE = 1.03;

// The lean is written straight onto the dragged element as this custom property
// by useDragTilt, once per frame, with no React render in between. The carried
// transform reads it, so the tilt costs a style recalculation, not a render.
export const TILT_VAR = '--tilt';
export const MAX_TILT_DEG = 12;
export const TILT_PER_PX = 1.5;

export function tiltFromDelta(dx) {
  return Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, dx * TILT_PER_PX));
}

// Carried cards lean and lift on top of the library's translate. A landing card
// keeps that function list (translate rotate scale) and eases the tilt and lift
// back to rest inside the same transition as the glide: dropping to a bare
// translate would make the browser interpolate between lists of different
// shape, and the card would pop from 1.03 to 1 only after it had landed.
export function dragTransform(libraryTransform, snapshot) {
  if (!snapshot.isDragging) return libraryTransform;
  const base = libraryTransform ?? '';
  return snapshot.isDropAnimating
    ? `${base} rotate(0deg) scale(1)`
    : `${base} rotate(var(${TILT_VAR}, 0deg)) scale(${LIFT_SCALE})`;
}

// The width a card has once it sits in a list: the list's inner width, padding
// excluded. A card carried over a list is sized to this, because the library
// lands it top-left aligned and any width difference becomes a sideways jump
// of half that difference when it takes its real size.
export function listContentWidth(listElement, getStyle) {
  if (!listElement) return undefined;
  const { paddingLeft, paddingRight } = getStyle(listElement);
  return listElement.clientWidth - parseFloat(paddingLeft) - parseFloat(paddingRight);
}
