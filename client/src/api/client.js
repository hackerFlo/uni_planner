import { ApiError, KINDS, classifyStatus } from './errors.js';
import { probeReachability } from './probe.js';
import { beginRequest, endRequest } from './activity.js';

async function performRequest(path, options = {}) {
  let res;
  try {
    res = await fetch(path, {
      credentials: 'include',
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (err) {
    if (options.signal?.aborted) throw err;
    // fetch only rejects when no HTTP response arrived at all. A stopped backend
    // is therefore the one cause this cannot be -- nginx would answer 502. Ask
    // the probe what actually happened instead of guessing.
    const kind = await probeReachability();
    console.warn('[api] fetch rejected', { path, kind, cause: err.message });
    throw new ApiError(kind);
  }

  if (res.type === 'opaqueredirect') throw new ApiError(KINDS.ACCESS_EXPIRED);

  // Set on every response by the server's requestId middleware, so an on-screen
  // error can be matched to a log line (EL-8).
  const requestId = res.headers.get('X-Request-Id');
  const data = await res.json().catch(() => null);
  if (options.signal?.aborted) throw options.signal.reason;

  if (!res.ok) {
    // A null body on a 5xx means an intermediary answered with an HTML error
    // page -- nginx or the tunnel, not the API.
    const kind = data === null && res.status >= 500 ? KINDS.GATEWAY : classifyStatus(res.status);
    if (kind === KINDS.UNAUTHORIZED && !path.startsWith('/api/auth/')) {
      // Already on /login means the redirect would just reload into another 401.
      if (window.location.pathname !== '/login') window.location.href = '/login';
    }
    throw new ApiError(kind, { status: res.status, requestId, message: data?.error });
  }
  return data ?? {};
}

// The activity counter wraps the whole call, body parsing included, and settles
// in a finally so a rejection cannot leave the progress bar pinned on screen.
async function request(path, options) {
  beginRequest();
  try {
    return await performRequest(path, options);
  } finally {
    endRequest();
  }
}

export const api = {
  get: (path, options) => request(path, options),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
  put: (path, body, options) => request(path, { ...options, method: 'PUT', body }),
  delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
};
