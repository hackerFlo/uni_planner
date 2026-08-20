// A count of API requests currently in flight, so the UI can show one progress
// bar for "the app is talking to the server" without every call site having to
// thread a loading flag. Deliberately a plain observable rather than context:
// api/client.js is not a React module and must not import one.

let inFlight = 0;
const listeners = new Set();

function emit() {
  for (const fn of listeners) fn(inFlight);
}

export function beginRequest() {
  inFlight += 1;
  if (inFlight === 1) emit(); // only the idle -> busy edge matters
}

export function endRequest() {
  // Guard against going negative if a caller ever double-settles: a stuck
  // negative count would leave the bar permanently hidden.
  inFlight = Math.max(0, inFlight - 1);
  if (inFlight === 0) emit();
}

export function subscribeActivity(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isBusy() {
  return inFlight > 0;
}
