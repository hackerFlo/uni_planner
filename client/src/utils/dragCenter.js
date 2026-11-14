// @hello-pangea/dnd picks the drop column from the dragged card's own box and
// auto-scrolls from that box's centre -- not from the finger. A sidebar card is
// narrowed to one column on pickup, but narrowing keeps its left edge, so a
// finger that grabbed it further right sits outside the shrunken card and the
// card hangs off to the left of it: the day under the card is not the day
// under the finger, and the card's centre can never get near the right edge.
//
// This is how far to nudge the narrowed card sideways so that it is centred on
// the finger, while staying fully on screen.
export function narrowedCardShiftPx({ pointerX, cardLeft, cardWidth, viewportWidth }) {
  if (!Number.isFinite(pointerX)) return 0;
  const rightmostLeft = Math.max(viewportWidth - cardWidth, 0);
  const left = Math.min(Math.max(pointerX - cardWidth / 2, 0), rightmostLeft);
  return left - cardLeft;
}
