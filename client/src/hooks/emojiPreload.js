const IDLE_TIMEOUT_MS = 4000;

// The emoji chunk is large and nothing on screen needs it at startup, so it
// waits for an idle moment. First typing in an emoji field loads it sooner, and
// load() is idempotent, so whichever comes first wins.
export function preloadWhenIdle(load, env = globalThis) {
  if (typeof env.requestIdleCallback === 'function') {
    const handle = env.requestIdleCallback(load, { timeout: IDLE_TIMEOUT_MS });
    return () => env.cancelIdleCallback?.(handle);
  }
  const timer = env.setTimeout(load, IDLE_TIMEOUT_MS);
  return () => env.clearTimeout(timer);
}
