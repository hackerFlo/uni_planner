import { ApiError, KINDS, classifyStatus } from './errors';
import { probeReachability } from './probe';

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(path, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (err) {
    // fetch only rejects when no HTTP response arrived at all. A stopped backend
    // is therefore the one cause this cannot be -- nginx would answer 502. Ask
    // the probe what actually happened instead of guessing.
    const kind = await probeReachability();
    console.warn('[api] fetch rejected', { path, kind, cause: err.message });
    throw new ApiError(kind);
  }

  // Set on every response by the server's requestId middleware, so an on-screen
  // error can be matched to a log line (EL-8).
  const requestId = res.headers.get('X-Request-Id');
  const data = await res.json().catch(() => null);

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

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  delete: (path) => request(path, { method: 'DELETE' }),
};
