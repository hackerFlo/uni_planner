// @hello-pangea/dnd refuses to begin a drag while any modifier is held at
// mousedown:
//
//     if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
//
// (useMouseSensor, dnd.cjs.js). That guard makes "hold Option, then drag to
// copy" impossible in the most literal way -- the card never picks up at all,
// with no error and nothing on screen to explain it.
//
// So shadow the single property that guard reads, on the single event that
// matters. This is deliberately narrower than re-dispatching a synthetic
// mousedown: the original event continues down the capture path untouched
// apart from one boolean, so nothing else about the gesture changes.
//
// Registered at import time, which is the only way to be sure it runs before
// the library's own window-capture listener -- that one is bound from a React
// effect, and every effect runs after module evaluation. If a future version
// drops the guard, this becomes a no-op rather than a bug.
//
// Scope notes: nothing else in this app reads altKey on mousedown, and the
// `click` event the browser synthesises afterwards is a separate object that
// still reports altKey correctly -- which is what keeps Option+click on a day
// column's + button (the divider shortcut) working.

const DRAG_HANDLE = '[data-rfd-drag-handle-draggable-id]';
const PRIMARY_BUTTON = 0;

if (typeof window !== 'undefined') {
  window.addEventListener('mousedown', (event) => {
    if (!event.altKey || event.button !== PRIMARY_BUTTON) return;
    if (!event.target?.closest?.(DRAG_HANDLE)) return;
    Object.defineProperty(event, 'altKey', { value: false, configurable: true });
  }, true);
}
