const express = require('express');
const db = require('../db');
const { log } = require('../logger');
const requireAuth = require('../middleware/auth');

const router = express.Router();
// Public reference data: the same holidays for every account. None of the
// queries below is scoped by user_id and AR-2 deliberately does not apply --
// there is no owner to scope to. requireAuth stays on the router anyway so
// anonymous traffic cannot drive our fetches out to a third party (S-2).
router.use(requireAuth);

const UPSTREAM = 'https://date.nager.at/api/v3';
// Holidays for a given year are decided years in advance; a month is only a
// safety net for the rare legislated change, not a freshness requirement.
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const UPSTREAM_TIMEOUT_MS = 8000;
// The upstream's own supported span. Outside it a request is a typo or a probe.
const MIN_YEAR = 1975;
const MAX_YEAR = 2100;

function parseCountry(raw) {
  return typeof raw === 'string' && /^[A-Z]{2}$/.test(raw) ? raw : null;
}

function parseYear(raw) {
  if (typeof raw !== 'string' || !/^\d{4}$/.test(raw)) return null;
  const year = Number(raw);
  return year >= MIN_YEAR && year <= MAX_YEAR ? year : null;
}

const readYear = (country, year) => db.prepare(
  'SELECT payload, fetched_at FROM holiday_cache WHERE country = ? AND year = ?'
).get(country, year);

const writeYear = (country, year, payload) => db.prepare(
  'INSERT INTO holiday_cache (country, year, payload, fetched_at) VALUES (?, ?, ?, ?) ' +
  'ON CONFLICT(country, year) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at'
).run(country, year, JSON.stringify(payload), new Date().toISOString());

const readCountries = () => db.prepare(
  'SELECT payload, fetched_at FROM holiday_country_cache WHERE id = 1'
).get();

const writeCountries = (payload) => db.prepare(
  'INSERT INTO holiday_country_cache (id, payload, fetched_at) VALUES (1, ?, ?) ' +
  'ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at'
).run(JSON.stringify(payload), new Date().toISOString());

function isFresh(row, now = Date.now()) {
  if (!row) return false;
  const fetchedAt = Date.parse(row.fetched_at);
  return Number.isFinite(fetchedAt) && now - fetchedAt < CACHE_TTL_MS;
}

async function fetchUpstream(path) {
  const res = await fetch(`${UPSTREAM}${path}`, {
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`upstream answered HTTP ${res.status}`);
  const body = await res.json();
  // An empty list is indistinguishable from a captive portal or an error page
  // answering 200, and every country the API lists has holidays in every year it
  // covers. Refusing to cache one keeps a bad response from becoming permanent.
  if (!Array.isArray(body) || body.length === 0) {
    throw new Error('upstream body was not a non-empty array');
  }
  return body;
}

// Cache-first, and on failure stale-first: once a year has been fetched it keeps
// working with the upstream down, rate-limiting us, or gone for good. That
// durability is the entire point of the table, so falling back is a warning
// rather than an error -- but it is never silent (EL-1).
async function cachedFetch({ read, write, load, reqLog, what }) {
  const cached = read();
  if (isFresh(cached)) return JSON.parse(cached.payload);
  try {
    const fresh = await load();
    write(fresh);
    return fresh;
  } catch (err) {
    if (!cached) throw err;
    reqLog.warn('holiday upstream failed, served stale cache', { what, fetchedAt: cached.fetched_at, err });
    return JSON.parse(cached.payload);
  }
}

router.get('/countries', async (req, res) => {
  const reqLog = req.log || log;
  try {
    const countries = await cachedFetch({
      read: readCountries,
      write: writeCountries,
      load: () => fetchUpstream('/AvailableCountries'),
      reqLog,
      what: 'countries',
    });
    res.json({ countries });
  } catch (err) {
    reqLog.error('holiday country list failed with no cache to fall back on', { err });
    res.status(502).json({ error: 'Holiday service unavailable' });
  }
});

router.get('/', async (req, res) => {
  const reqLog = req.log || log;
  const country = parseCountry(req.query.country);
  const year = parseYear(req.query.year);
  if (!country) return res.status(400).json({ error: 'country must be a two-letter ISO code, e.g. DE' });
  if (!year) return res.status(400).json({ error: `year must be a whole year between ${MIN_YEAR} and ${MAX_YEAR}` });

  try {
    // Returned whole -- counties included, and with no weekday filtering of any
    // kind. 9 of Germany's 19 holidays in 2026 fall on a weekend, nationwide
    // ones among them (Tag der Deutschen Einheit, Saturday 2026-10-03). Keeping
    // counties is what lets one cached year serve every region.
    const holidays = await cachedFetch({
      read: () => readYear(country, year),
      write: (payload) => writeYear(country, year, payload),
      load: () => fetchUpstream(`/PublicHolidays/${year}/${country}`),
      reqLog,
      what: `${country} ${year}`,
    });
    res.json({ country, year, holidays });
  } catch (err) {
    reqLog.error('holiday lookup failed with no cache to fall back on', { country, year, err });
    res.status(502).json({ error: 'Holiday service unavailable' });
  }
});

module.exports = router;
