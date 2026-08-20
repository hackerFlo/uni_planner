// Pure state transitions behind the planner's drag-and-drop and its undo.
//
// A cross-day drag is two server writes -- move the card to the new day, then
// renumber that day. Each used to record its own undo entry into a single-slot
// store, so the renumber overwrote the day move and Ctrl+Z restored the order
// but left the card on the day it had been dragged to. Keeping the arithmetic
// here (rather than inline in the drag handler and the hook) is what makes that
// interaction testable without a browser.

function byPlannerOrder(a, b) {
  return (a.planner_order ?? Infinity) - (b.planner_order ?? Infinity);
}

function clampIndex(index, length) {
  if (!Number.isFinite(index)) return length;
  return Math.max(0, Math.min(index, length));
}

export function todosForDay(todos, day, { excludeId = null } = {}) {
  return todos
    .filter(t => t.day_assigned === day && t.id !== excludeId)
    .sort(byPlannerOrder);
}

// The dragged card stays on its day; only its position inside it changes.
export function planSameDayReorder(todos, { day, from, to }) {
  const dayTodos = todosForDay(todos, day);
  if (from < 0 || from >= dayTodos.length || from === to) return null;
  const next = [...dayTodos];
  const [moved] = next.splice(from, 1);
  next.splice(clampIndex(to, next.length), 0, moved);
  return next;
}

// The order the destination day must end up in once the card has been moved
// into it. Returns null when the id is unknown, so a stale drag cannot splice
// `undefined` into a day and blank a card.
export function planCrossDayDrop(todos, { todoId, toDay, index }) {
  const moved = todos.find(t => t.id === todoId);
  if (!moved) return null;
  const rest = todosForDay(todos, toDay, { excludeId: todoId });
  const at = clampIndex(index, rest.length);
  return [...rest.slice(0, at), { ...moved, day_assigned: toDay }, ...rest.slice(at)];
}

export function assignDayLocal(todos, id, day) {
  return todos.map(t => (t.id === id ? { ...t, day_assigned: day } : t));
}

export function toOrderItems(orderedTodos) {
  return orderedTodos.map((t, i) => ({ id: t.id, planner_order: i }));
}

// The positions those same todos held before the drag, in the shape the reorder
// endpoint accepts -- i.e. the payload that undoes it.
export function snapshotOrderItems(todos, orderedTodos) {
  const byId = new Map(todos.map(t => [t.id, t]));
  return orderedTodos.map(t => ({ id: t.id, planner_order: byId.get(t.id)?.planner_order ?? 0 }));
}

export function applyOrderItems(todos, items) {
  const order = new Map(items.map(({ id, planner_order }) => [id, planner_order]));
  return todos.map(t => (order.has(t.id) ? { ...t, planner_order: order.get(t.id) } : t));
}

// One undo entry for an action that took several writes. Applied newest-first so
// the state unwinds in the exact reverse of the order it was built up, and
// sequentially so a revert that depends on the previous one cannot race it.
export function composeReverts(reverts) {
  const fns = reverts.filter(fn => typeof fn === 'function');
  if (fns.length === 0) return null;
  if (fns.length === 1) return fns[0];
  return async () => {
    for (let i = fns.length - 1; i >= 0; i -= 1) await fns[i]();
  };
}
