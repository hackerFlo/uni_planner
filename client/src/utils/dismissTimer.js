const REAL_CLOCK = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: handle => clearTimeout(handle),
};

// A countdown that can be held and resumed without losing the time already
// spent: hovering a toast must not restart its full duration on leave.
export function createDismissTimer(durationMs, onFire, clock = REAL_CLOCK) {
  let remaining = durationMs;
  let handle = null;
  let startedAt = 0;

  function pause() {
    if (handle === null) return;
    clock.clearTimeout(handle);
    handle = null;
    remaining = Math.max(0, remaining - (clock.now() - startedAt));
  }

  function start() {
    if (handle !== null || durationMs <= 0) return;
    startedAt = clock.now();
    handle = clock.setTimeout(() => { handle = null; onFire(); }, remaining);
  }

  function stop() {
    pause();
    remaining = 0;
  }

  return { start, pause, stop };
}
