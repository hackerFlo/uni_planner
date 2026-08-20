const express = require('express');
const requireAuth = require('../middleware/auth');
const { asyncHandler } = require('../middleware/asyncHandler');
const { log } = require('../logger');
const { VERSION, COMMIT } = require('../version');
const { GITHUB_REPO, WATCHTOWER_URL, WATCHTOWER_TOKEN } = require('../config');
const { versionCheckLimiter, updateLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

const RELEASE_CACHE_TTL_MS = 15 * 60 * 1000;
const GITHUB_TIMEOUT_MS = 5000;
const WATCHTOWER_TIMEOUT_MS = 10000;
// Watchtower answers /v1/update only after the whole update has run, and the
// first container it restarts is usually this one -- so the reply commonly
// never arrives. Once the request is on the wire Watchtower owns it, and that
// is what we report; the client watches /api/health for the new commit.
const ACCEPTED_AFTER_MS = 3000;

// EL-2: an unreachable or unhappy third party is an expected failure, not a bug
// in this process, and it must never be confused with one.
class UpstreamError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UpstreamError';
  }
}

let releaseCache = null; // { latest, checkedAt }

// "v2.10" -> [2, 10]. Returns null for anything that is not a dotted number, so
// an unexpected tag makes the check say nothing rather than say something wrong.
function parseVersionParts(value) {
  const parts = String(value).replace(/^v/i, '').split('.');
  const numbers = parts.map(Number);
  return numbers.every((n) => Number.isInteger(n) && n >= 0) ? numbers : null;
}

// Numeric per segment, because on the X.Y scheme "2.10" sorts before "2.9" as a
// string -- the release right after 2.9 would look like a downgrade.
function isNewerVersion(candidate, current) {
  const a = parseVersionParts(candidate);
  const b = parseVersionParts(current);
  if (!a || !b) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

// The GitHub payload is external input, so only the three fields we need are
// read and each is type-checked before it can reach a response (AR-1).
function readRelease(body) {
  const tag = body?.tag_name;
  if (typeof tag !== 'string' || tag === '' || tag.length > 64) {
    throw new UpstreamError('release payload has no usable tag_name');
  }
  const publishedAt = typeof body?.published_at === 'string' ? body.published_at : null;
  return { version: tag.replace(/^v/i, ''), tag, publishedAt };
}

async function fetchLatestRelease() {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
  const res = await fetch(url, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'uni-planner' },
    // A hung third party must not hold this request -- or a socket -- open.
    signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
  });
  if (!res.ok) throw new UpstreamError(`github answered ${res.status}`);
  return readRelease(await res.json());
}

// Returns the cached release when it is fresh; on a failed refresh it falls
// back to the last good value and marks it stale rather than failing the whole
// request, because a known-old answer is more useful than none.
async function loadLatestRelease(rlog) {
  const now = Date.now();
  if (releaseCache && now - releaseCache.checkedAt < RELEASE_CACHE_TTL_MS) {
    return { ...releaseCache, stale: false };
  }
  try {
    releaseCache = { latest: await fetchLatestRelease(), checkedAt: now };
    return { ...releaseCache, stale: false };
  } catch (err) {
    rlog.warn('release check failed', { repo: GITHUB_REPO, err });
    if (releaseCache) return { ...releaseCache, stale: true };
    return { latest: null, checkedAt: null, stale: false };
  }
}

router.get('/', versionCheckLimiter, requireAuth, asyncHandler(async (req, res) => {
  const running = { version: VERSION, commit: COMMIT };
  const base = { running, canInstall: Boolean(WATCHTOWER_TOKEN), updateAvailable: false };
  if (!GITHUB_REPO) {
    return res.json({ ...base, available: false, latest: null, checkedAt: null, stale: false, checkFailed: false });
  }
  const { latest, checkedAt, stale } = await loadLatestRelease(req.log || log);
  res.json({
    ...base,
    available: true,
    latest,
    updateAvailable: Boolean(latest) && isNewerVersion(latest.version, VERSION),
    checkedAt: checkedAt === null ? null : new Date(checkedAt).toISOString(),
    stale,
    checkFailed: latest === null,
  });
}));

// No request parameters at all, deliberately: it can only trigger the update
// Watchtower is already configured to perform, which is what makes exposing it
// safe. The token travels in the header and is never logged (AR-6).
async function postWatchtowerUpdate() {
  const res = await fetch(`${WATCHTOWER_URL}/v1/update`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WATCHTOWER_TOKEN}` },
    signal: AbortSignal.timeout(WATCHTOWER_TIMEOUT_MS),
  });
  if (!res.ok) throw new UpstreamError(`watchtower answered ${res.status}`);
  return res.status;
}

// unref'd: when Watchtower replies quickly the race is already settled, and a
// live three-second timer would keep the event loop busy for no reason.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms).unref());

router.post('/update', updateLimiter, requireAuth, asyncHandler(async (req, res) => {
  const rlog = req.log || log;
  if (!WATCHTOWER_TOKEN) {
    rlog.warn('update refused', { reason: 'not-configured' });
    return res.status(503).json({ error: 'On-demand updates are not configured on this server.' });
  }
  const call = postWatchtowerUpdate();
  // The only place the eventual outcome is recorded, since the response below
  // is usually sent first -- and the only thing keeping a late rejection from
  // becoming an unhandledRejection (EL-1).
  call.then(
    (status) => rlog.info('watchtower update completed', { status }),
    (err) => rlog.warn('watchtower update did not report back', { err }),
  );
  // 503, not 502: nginx answers 502 while this container is restarting, which
  // is the success path, and the client must be able to tell the two apart.
  const outcome = await Promise.race([call.then(() => 'ok', () => 'failed'), sleep(ACCEPTED_AFTER_MS).then(() => 'pending')]);
  if (outcome === 'failed') {
    return res.status(503).json({ error: 'Could not reach the update service.' });
  }
  rlog.info('update triggered', { userId: req.user.id, outcome });
  res.status(202).json({ status: 'started' });
}));

module.exports = router;

// Test seam. The 15-minute cache would otherwise let the first case in a run
// decide the answer for every case after it.
module.exports.__setReleaseCache = (value) => { releaseCache = value; };
