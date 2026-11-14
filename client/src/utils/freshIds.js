// A card plays its enter animation only when it was created during this session.
// "Created" is read off created_at rather than inferred from first appearance:
// a todo dragged from the sidebar onto a day also appears for the first time in
// the board's list, and so would any card on a week that was never rendered.
export const FRESH_WINDOW_MS = 10_000;
export const PLOP_MS = 400;
export const EMPTY_IDS = new Set();
export const INITIAL_FRESH_STATE = { seen: null, fresh: EMPTY_IDS };

function isRecentlyCreated(todo, now) {
  const createdAt = Date.parse(todo.created_at);
  return Math.abs(now - createdAt) <= FRESH_WINDOW_MS;
}

// The first call only records what is already there, so a load or a refetch of
// existing items never animates. Returns the same object when nothing changed,
// which lets a render-time setState settle instead of looping.
export function advanceFresh(state, todos, now) {
  if (state.seen === null) return { seen: new Set(todos.map(t => t.id)), fresh: EMPTY_IDS };
  const added = todos.filter(t => !state.seen.has(t.id));
  if (added.length === 0) return state;
  const seen = new Set(state.seen);
  const fresh = new Set(state.fresh);
  for (const todo of added) {
    seen.add(todo.id);
    if (isRecentlyCreated(todo, now)) fresh.add(todo.id);
  }
  return { seen, fresh };
}

export function expireFresh(state) {
  return state.fresh.size === 0 ? state : { seen: state.seen, fresh: EMPTY_IDS };
}
