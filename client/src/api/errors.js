// Every API failure is reduced to one of these before it reaches the UI, so a
// message can describe what actually happened instead of guessing.
export const KINDS = {
  OFFLINE: 'offline',
  ACCESS_EXPIRED: 'access-expired',
  GATEWAY: 'gateway',
  SERVER: 'server',
  RATE_LIMITED: 'rate-limited',
  UNAUTHORIZED: 'unauthorized',
  BAD_REQUEST: 'bad-request',
  UNKNOWN: 'unknown',
};

const MESSAGES = {
  [KINDS.OFFLINE]: 'No connection to the server. Check your network, then try again.',
  [KINDS.ACCESS_EXPIRED]: 'Your Cloudflare Access session has expired. Reload the page to sign in again.',
  [KINDS.GATEWAY]: 'The server is not responding. It may still be starting up — try again in a moment.',
  [KINDS.SERVER]: 'The server hit an unexpected error. Please try again.',
  [KINDS.RATE_LIMITED]: 'Too many attempts. Please wait a minute and try again.',
  [KINDS.UNAUTHORIZED]: 'Your session has ended. Please sign in again.',
  [KINDS.BAD_REQUEST]: 'That request was rejected.',
  [KINDS.UNKNOWN]: 'Something went wrong. Please try again.',
};

export function classifyStatus(status) {
  if (status === 401) return KINDS.UNAUTHORIZED;
  if (status === 429) return KINDS.RATE_LIMITED;
  if (status === 502 || status === 503 || status === 504) return KINDS.GATEWAY;
  if (status >= 500) return KINDS.SERVER;
  if (status >= 400) return KINDS.BAD_REQUEST;
  return KINDS.UNKNOWN;
}

// The status is worth showing for the faults the user cannot act on: it is the
// difference between "it is broken" and something a search engine can answer.
export function describeFailure(kind, status = 0) {
  const base = MESSAGES[kind] ?? MESSAGES[KINDS.UNKNOWN];
  const showStatus = status >= 500 && (kind === KINDS.GATEWAY || kind === KINDS.SERVER);
  return showStatus ? `${base} (HTTP ${status})` : base;
}

export class ApiError extends Error {
  constructor(kind, { status = 0, requestId = null, message } = {}) {
    super(message || describeFailure(kind, status));
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.requestId = requestId;
  }
}

// Anything that is not an ApiError is a bug in our own code rather than a
// described failure, and a raw JavaScript message ("x is not a function") is
// not something to put in front of a user (VS-7). Every UI path goes through
// here so that stays true by default.
export function userMessage(err) {
  return err instanceof ApiError ? err.message : describeFailure(KINDS.UNKNOWN);
}
