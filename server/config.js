const SESSION_COOKIE_NAME = 'token';
const SESSION_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Number of reverse proxies between the client and Express, nearest-first.
// 1 = the bundled nginx only. 2 = cloudflared -> nginx (Cloudflare Tunnel).
// Too few hops group visitors under a proxy IP; too many can trust spoofed IPs.
// req.secure additionally requires nginx to forward the actual edge scheme.
function parseTrustProxyHops(raw) {
  if (raw === undefined || raw === '') return 1;
  const hops = Number(raw);
  if (!Number.isInteger(hops) || hops < 0) {
    throw new Error(`TRUST_PROXY_HOPS must be a non-negative integer, got "${raw}"`);
  }
  return hops;
}

// null = derive Secure from the actual request scheme; true/false = force it.
function parseCookieSecureOverride(raw) {
  if (raw === undefined || raw === '') return null;
  if (raw !== 'true' && raw !== 'false') {
    throw new Error(`COOKIE_SECURE must be "true" or "false" if set, got "${raw}"`);
  }
  return raw === 'true';
}

// Optional. nginx serves the SPA and proxies /api on one origin, so the browser
// never makes a cross-origin request and CORS never engages. Set this only if a
// browser on some other origin has to reach the API directly.
function parseCorsOrigin(raw) {
  if (raw === undefined || raw.trim() === '') return null;
  const value = raw.trim().replace(/\/+$/, '');
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`CORS_ORIGIN must be an absolute URL like https://example.com, got "${raw}"`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`CORS_ORIGIN must use http or https, got "${raw}"`);
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`CORS_ORIGIN must be a bare origin with no path, got "${raw}"`);
  }
  return url.origin;
}

// "owner/repo", used to read the latest GitHub Release. Deliberately has no
// default: which repository this deployment tracks is configuration, not source
// (AR-12). Unset simply turns the update check off, so a local run and the
// build-from-source compose keep working.
const GITHUB_REPO_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

function parseGithubRepo(raw) {
  if (raw === undefined || raw.trim() === '') return null;
  const value = raw.trim();
  if (!GITHUB_REPO_PATTERN.test(value)) {
    throw new Error(`GITHUB_REPO must look like "owner/repo", got "${raw}"`);
  }
  return value;
}

// Watchtower's HTTP API, reached over the compose network -- nothing is
// published to the host, so this is not an origin a browser can use.
const WATCHTOWER_URL_DEFAULT = 'http://watchtower:8080';

function parseWatchtowerUrl(raw) {
  if (raw === undefined || raw.trim() === '') return WATCHTOWER_URL_DEFAULT;
  const value = raw.trim().replace(/\/+$/, '');
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`WATCHTOWER_URL must be an absolute URL like ${WATCHTOWER_URL_DEFAULT}, got "${raw}"`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`WATCHTOWER_URL must use http or https, got "${raw}"`);
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`WATCHTOWER_URL must be a bare origin with no path, got "${raw}"`);
  }
  return url.origin;
}

// Opaque shared secret for that API. Unset means on-demand installs stay off
// and the nightly Watchtower schedule remains the only update path. The value
// is never echoed in an error message, not even when it is rejected (AR-6).
const WATCHTOWER_TOKEN_MAX_LENGTH = 512;

function parseWatchtowerToken(raw) {
  if (raw === undefined || raw.trim() === '') return null;
  const value = raw.trim();
  if (value.length > WATCHTOWER_TOKEN_MAX_LENGTH) {
    throw new Error(`WATCHTOWER_TOKEN must be at most ${WATCHTOWER_TOKEN_MAX_LENGTH} characters`);
  }
  return value;
}

// --- Optional AI list categorisation ------------------------------------------
// ANTHROPIC_API_KEY unset means the feature is unavailable: the Settings toggle
// is hidden, enabling is refused and no request is ever made. The value is never
// echoed in an error message (AR-6).
const ANTHROPIC_API_KEY_MAX_LENGTH = 512;

function parseAnthropicApiKey(raw) {
  if (raw === undefined || raw.trim() === '') return null;
  const value = raw.trim();
  if (value.length > ANTHROPIC_API_KEY_MAX_LENGTH) {
    throw new Error(`ANTHROPIC_API_KEY must be at most ${ANTHROPIC_API_KEY_MAX_LENGTH} characters`);
  }
  if (/\s/.test(value)) throw new Error('ANTHROPIC_API_KEY must not contain whitespace');
  return value;
}

const AI_LIST_MODEL_DEFAULT = 'claude-haiku-5-5';
const AI_LIST_MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;

function parseAiListModel(raw) {
  if (raw === undefined || raw.trim() === '') return AI_LIST_MODEL_DEFAULT;
  const value = raw.trim();
  if (!AI_LIST_MODEL_PATTERN.test(value)) throw new Error(`AI_LIST_MODEL must be a model id such as ${AI_LIST_MODEL_DEFAULT}, got "${raw}"`);
  return value;
}

const AI_LIST_DAILY_LIMIT_DEFAULT = 100;
const AI_LIST_DAILY_LIMIT_MAX = 100000;

function parseAiListDailyLimit(raw) {
  if (raw === undefined || raw.trim() === '') return AI_LIST_DAILY_LIMIT_DEFAULT;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > AI_LIST_DAILY_LIMIT_MAX) {
    throw new Error(`AI_LIST_DAILY_LIMIT must be an integer from 1 to ${AI_LIST_DAILY_LIMIT_MAX}, got "${raw}"`);
  }
  return limit;
}

// Environment only, for pointing the SDK at a local fake. Never user input.
function parseAnthropicBaseUrl(raw) {
  if (raw === undefined || raw.trim() === '') return null;
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error(`ANTHROPIC_BASE_URL must be an absolute URL like https://example.com, got "${raw}"`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`ANTHROPIC_BASE_URL must use http or https, got "${raw}"`);
  if (url.pathname !== '/' || url.search || url.hash) throw new Error(`ANTHROPIC_BASE_URL must be a bare origin with no path, got "${raw}"`);
  return url.origin;
}

const TRUST_PROXY_HOPS = parseTrustProxyHops(process.env.TRUST_PROXY_HOPS);
const COOKIE_SECURE_OVERRIDE = parseCookieSecureOverride(process.env.COOKIE_SECURE);
const CORS_ORIGIN = parseCorsOrigin(process.env.CORS_ORIGIN);
const GITHUB_REPO = parseGithubRepo(process.env.GITHUB_REPO);
const WATCHTOWER_URL = parseWatchtowerUrl(process.env.WATCHTOWER_URL);
const WATCHTOWER_TOKEN = parseWatchtowerToken(process.env.WATCHTOWER_TOKEN);
const ANTHROPIC_API_KEY = parseAnthropicApiKey(process.env.ANTHROPIC_API_KEY);
const AI_LIST_MODEL = parseAiListModel(process.env.AI_LIST_MODEL);
const AI_LIST_DAILY_LIMIT = parseAiListDailyLimit(process.env.AI_LIST_DAILY_LIMIT);
const ANTHROPIC_BASE_URL = parseAnthropicBaseUrl(process.env.ANTHROPIC_BASE_URL);
const AI_LIST_AVAILABLE = ANTHROPIC_API_KEY !== null;

// Marking the cookie Secure on a plain-HTTP page makes the browser discard it
// silently: login returns 200 and every request after it is a 401. So Secure
// has to follow the scheme the request actually arrived on, not NODE_ENV.
function sessionCookieOptions(req, { override = COOKIE_SECURE_OVERRIDE } = {}) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: override ?? Boolean(req.secure),
    maxAge: SESSION_COOKIE_MAX_AGE_MS,
  };
}

// clearCookie only matches a cookie whose attributes agree, so it shares the
// options above minus maxAge.
function clearSessionCookieOptions(req, opts) {
  const { maxAge, ...rest } = sessionCookieOptions(req, opts);
  return rest;
}

module.exports = {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE_MS,
  TRUST_PROXY_HOPS,
  COOKIE_SECURE_OVERRIDE,
  CORS_ORIGIN,
  GITHUB_REPO,
  WATCHTOWER_URL,
  WATCHTOWER_URL_DEFAULT,
  WATCHTOWER_TOKEN,
  ANTHROPIC_API_KEY,
  AI_LIST_MODEL,
  AI_LIST_MODEL_DEFAULT,
  AI_LIST_DAILY_LIMIT,
  ANTHROPIC_BASE_URL,
  AI_LIST_AVAILABLE,
  parseAnthropicApiKey,
  parseAiListModel,
  parseAiListDailyLimit,
  parseAnthropicBaseUrl,
  parseTrustProxyHops,
  parseCookieSecureOverride,
  parseCorsOrigin,
  parseGithubRepo,
  parseWatchtowerUrl,
  parseWatchtowerToken,
  sessionCookieOptions,
  clearSessionCookieOptions,
};
