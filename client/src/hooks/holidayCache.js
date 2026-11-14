const KEY_PREFIX = 'uniPlanner.holidays.';
export const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;

const cacheKey = (country, year) => `${KEY_PREFIX}${country}.${year}`;

// Storage can be missing, full, or blocked (private mode); every failure means
// "no cache" and the caller falls back to the network, so it is only logged.
function warn(action, error) {
  console.warn(`[holidays] cache ${action} failed:`, error?.message);
}

export function readCachedYear(country, year, storage = globalThis.localStorage) {
  try {
    const entry = JSON.parse(storage.getItem(cacheKey(country, year)));
    const valid = entry && Number.isFinite(entry.fetchedAt) && Array.isArray(entry.holidays);
    return valid ? entry : null;
  } catch (error) {
    warn('read', error);
    return null;
  }
}

export function writeCachedYear(country, year, holidays, now = Date.now(), storage = globalThis.localStorage) {
  try {
    storage.setItem(cacheKey(country, year), JSON.stringify({ fetchedAt: now, holidays }));
  } catch (error) {
    warn('write', error);
  }
}

export const isStale = (entry, now = Date.now()) => !entry || now - entry.fetchedAt >= REFRESH_AFTER_MS || entry.fetchedAt > now;
