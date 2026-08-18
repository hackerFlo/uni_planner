import { KINDS } from './errors';

const PROBE_TIMEOUT_MS = 5000;
let inFlight = null;

// A rejected fetch says nothing about why it failed, and the three real causes
// need three different answers from the user. This tells them apart.
//
// `redirect: 'manual'` is what makes it safe: the redirect is never followed, so
// the CSP's `connect-src 'self'` is never evaluated against the Cloudflare
// Access host and no violation is raised (AR-10 stays intact). We learn only
// that a redirect happened -- which is exactly the signal we need.
async function runProbe() {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch('/api/health', {
      redirect: 'manual',
      cache: 'no-store',
      signal: abort.signal,
    });
    if (res.type === 'opaqueredirect' || res.status === 0) return KINDS.ACCESS_EXPIRED;
    if (res.status >= 500) return KINDS.GATEWAY;
    // The API answers, so the original call failed for some other reason.
    return KINDS.UNKNOWN;
  } catch {
    return KINDS.OFFLINE;
  } finally {
    clearTimeout(timer);
  }
}

// Several requests usually fail together; they should share one probe rather
// than each firing their own.
export function probeReachability() {
  if (!inFlight) inFlight = runProbe().finally(() => { inFlight = null; });
  return inFlight;
}
