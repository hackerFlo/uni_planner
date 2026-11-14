// A write this client made advances the planner revision by exactly one. The
// revision poller would otherwise report that bump as a foreign change and
// refetch everything the write's own refresh already covered.
const listeners = new Set();

export function subscribeOwnWrites(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Only expected + 1 within one epoch proves nothing else intervened: the server
// applies a write atomically against the expected revision. Any larger jump
// hides someone else's change and must still reach the poller.
export function reportOwnWrite(expected, result) {
  if (expected?.epoch !== result?.epoch || result?.revision !== expected.revision + 1) return;
  const written = { epoch: result.epoch, revision: result.revision };
  for (const listener of listeners) listener({ epoch: expected.epoch, revision: expected.revision }, written);
}
