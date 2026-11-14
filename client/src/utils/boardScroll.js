// The week board's position survives a reload of the same tab. sessionStorage is
// per tab, so a freshly opened tab starts clean and keeps the scroll-to-today
// behaviour. The saved day guards the other case: a tab left open overnight must
// not restore yesterday's view over today's.
export const BOARD_SCROLL_KEY = 'uniPlanner.boardScroll';

// Reading the property itself throws when site data is blocked, which a try
// around getItem/setItem would not catch.
export function sessionStore() {
  try { return globalThis.sessionStorage ?? null; }
  catch { return null; }
}

// Storage can be full, blocked or absent; the position is a nicety, so a failed
// save reports false instead of throwing.
export function saveBoardScroll(storage, { today, weekOffset, scrollLeft }) {
  try {
    storage.setItem(BOARD_SCROLL_KEY, JSON.stringify({ today, weekOffset, scrollLeft: Math.round(scrollLeft) }));
    return true;
  } catch {
    return false;
  }
}

export function loadBoardScroll(storage, today) {
  try {
    const saved = JSON.parse(storage.getItem(BOARD_SCROLL_KEY));
    const valid = saved && saved.today === today && Number.isFinite(saved.scrollLeft) && [-1, 0, 1].includes(saved.weekOffset);
    return valid ? { weekOffset: saved.weekOffset, scrollLeft: saved.scrollLeft } : null;
  } catch {
    return null;
  }
}
