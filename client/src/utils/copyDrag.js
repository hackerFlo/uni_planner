// Option+drag duplicates a card instead of moving it. The duplicate has to be
// on screen from the first frame -- the whole point of the gesture is that you
// see the original stay where it was while the copy follows the pointer -- and
// the only thing @hello-pangea/dnd will keep laid out correctly through a drag
// is a Draggable it knows about. So the board renders one extra, inert card
// while a copy-drag runs: a stand-in for the original, spliced in immediately
// after the card being dragged.
//
// It is mounted from `onBeforeCapture`, which the library wraps in
// `ReactDOM.flushSync` and calls before it measures anything, so the stand-in
// is in the DOM and in the measurements before the drag begins. That is what
// keeps every displacement honest: a plain div would sit outside the library's
// model and be walked over by the cards it shifts around.
//
// It goes *after* the dragged card, never before: the dragged element is
// positioned from the box measured here, so a row inserted above it would move
// that box down and the card would hang a full row below the pointer for the
// whole drag.

export const COPY_GHOST_ID = 'copy-ghost';

// One row per card to render, plus the stand-in when this list is the one the
// copy-drag started in. `draggableIdOf` differs per surface: a day column and
// the sidebar give the same todo two different ids, which is exactly what makes
// matching on the id unambiguous -- only one of the two lists can claim it.
export function withCopyGhost(items, ghostDraggableId, draggableIdOf) {
  const rows = items.map(item => ({
    key: item.id,
    item,
    draggableId: draggableIdOf(item),
    isGhost: false,
  }));
  if (!ghostDraggableId) return rows;
  const at = rows.findIndex(row => row.draggableId === ghostDraggableId);
  if (at < 0) return rows;
  rows.splice(at + 1, 0, {
    key: COPY_GHOST_ID,
    item: rows[at].item,
    draggableId: COPY_GHOST_ID,
    isGhost: true,
  });
  return rows;
}
