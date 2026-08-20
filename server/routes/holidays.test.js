const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'uni-planner-holidays-')), 'planner.db'
);
process.env.JWT_SECRET = 'test-secret-long-enough-for-the-check';
process.env.LOG_LEVEL = 'error';
// The limiters live in index.js, not in this router, so this app never mounts one.
delete process.env.NODE_ENV;

const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { createSession } = require('../sessions');
const { createLogger } = require('../logger');
const holidayRoutes = require('./holidays');

// ---------------------------------------------------------------------------
// Upstream stub. Only date.nager.at is intercepted; every other URL falls
// through to the real fetch, because the test's own requests to the local
// server go through the same global.
// ---------------------------------------------------------------------------
const realFetch = globalThis.fetch.bind(globalThis);
const UPSTREAM_PREFIX = 'https://date.nager.at';

let upstreamCalls = [];
let upstreamReply = () => { throw new Error('no upstream reply configured'); };

globalThis.fetch = async (url, options) => {
  const href = String(url);
  if (!href.startsWith(UPSTREAM_PREFIX)) return realFetch(url, options);
  upstreamCalls.push(href);
  return upstreamReply(href);
};

const jsonReply = (body) => ({ ok: true, status: 200, json: async () => body });
const errorReply = (status) => ({ ok: false, status, json: async () => ({}) });

// ---------------------------------------------------------------------------
// Fixtures. Shaped exactly like the live API, weekend dates included on purpose.
// ---------------------------------------------------------------------------
const NATIONWIDE_SATURDAY = {
  date: '2026-10-03', localName: 'Tag der Deutschen Einheit', name: 'German Unity Day',
  countryCode: 'DE', fixed: false, global: true, counties: null, launchYear: 1990, types: ['Public'],
};
const NATIONWIDE_WEEKDAY = {
  date: '2026-01-01', localName: 'Neujahr', name: "New Year's Day",
  countryCode: 'DE', fixed: false, global: true, counties: null, launchYear: null, types: ['Public'],
};
const BAVARIA_ONLY = {
  date: '2026-01-06', localName: 'Heilige Drei Könige', name: 'Epiphany',
  countryCode: 'DE', fixed: false, global: false, counties: ['DE-BW', 'DE-BY', 'DE-ST'],
  launchYear: null, types: ['Public'],
};
const DE_2026 = [NATIONWIDE_WEEKDAY, BAVARIA_ONLY, NATIONWIDE_SATURDAY];
const DE_2025 = [{ ...NATIONWIDE_WEEKDAY, date: '2025-01-01' }];
const DE_2027 = [{ ...NATIONWIDE_WEEKDAY, date: '2027-01-01' }];
const COUNTRIES = [{ countryCode: 'DE', name: 'Germany' }, { countryCode: 'AT', name: 'Austria' }];

// ---------------------------------------------------------------------------
// App. req.log is injected the way middleware/requestId does in production, so
// the router's warnings land somewhere a test can read them.
// ---------------------------------------------------------------------------
let logLines = [];
const capturingLog = createLogger({}, {
  level: 'debug',
  sink: (level, line) => logLines.push({ level, line }),
});

const app = express();
app.use(cookieParser());
app.use((req, _res, next) => { req.log = capturingLog; next(); });
app.use('/api/holidays', holidayRoutes);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

const userId = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')
  .run('holidays@example.com', 'x').lastInsertRowid;
// requireAuth needs a live session row, not just a signed token.
const token = jwt.sign(
  { id: userId, email: 'holidays@example.com', tv: 0, sid: createSession(userId) },
  process.env.JWT_SECRET
);

async function get(pathAndQuery) {
  const res = await realFetch(`${base}${pathAndQuery}`, { headers: { Cookie: `token=${token}` } });
  return { status: res.status, body: await res.json() };
}

const holidaysFor = (country, year) => get(`/api/holidays?country=${country}&year=${year}`);

const ageCache = (country, year, isoDate) =>
  db.prepare('UPDATE holiday_cache SET fetched_at = ? WHERE country = ? AND year = ?')
    .run(isoDate, country, year);

const LONG_AGO = '2020-01-01T00:00:00.000Z';

test.beforeEach(() => {
  upstreamCalls = [];
  logLines = [];
  db.exec('DELETE FROM holiday_cache; DELETE FROM holiday_country_cache;');
});

test.describe('GET /api/holidays', () => {
  test('returns the upstream year in full', async () => {
    upstreamReply = () => jsonReply(DE_2026);
    const { status, body } = await holidaysFor('DE', 2026);
    assert.equal(status, 200);
    assert.deepEqual(body.holidays.map(h => h.date), ['2026-01-01', '2026-01-06', '2026-10-03']);
  });

  // The whole reason there is no weekday logic anywhere: a nationwide holiday on
  // a Saturday is still a holiday and must reach the planner.
  test('keeps a nationwide holiday that falls on a Saturday', async () => {
    upstreamReply = () => jsonReply(DE_2026);
    const { body } = await holidaysFor('DE', 2026);
    const unity = body.holidays.find(h => h.date === '2026-10-03');
    assert.equal(new Date(`${unity.date}T00:00:00Z`).getUTCDay(), 6, 'fixture must be a Saturday');
    assert.equal(unity.localName, 'Tag der Deutschen Einheit');
  });

  // No server-side subdivision filtering: counties travel intact so one cached
  // year serves Bavaria and Berlin alike, and a region change needs no refetch.
  test('passes counties through untouched so the client can filter by region', async () => {
    upstreamReply = () => jsonReply(DE_2026);
    const { body } = await holidaysFor('DE', 2026);
    assert.deepEqual(body.holidays.find(h => h.date === '2026-01-06').counties, ['DE-BW', 'DE-BY', 'DE-ST']);
    assert.equal(body.holidays.find(h => h.date === '2026-10-03').counties, null);
  });

  test('echoes back the country and year it answered for', async () => {
    upstreamReply = () => jsonReply(DE_2026);
    const { body } = await holidaysFor('DE', 2026);
    assert.deepEqual({ country: body.country, year: body.year }, { country: 'DE', year: 2026 });
  });
});

test.describe('GET /api/holidays caching', () => {
  test('serves a fresh year without touching the upstream again', async () => {
    upstreamReply = () => jsonReply(DE_2026);
    await holidaysFor('DE', 2026);
    await holidaysFor('DE', 2026);
    assert.equal(upstreamCalls.length, 1);
  });

  test('refetches once the cached copy is older than the TTL', async () => {
    upstreamReply = () => jsonReply(DE_2026);
    await holidaysFor('DE', 2026);
    ageCache('DE', 2026, LONG_AGO);
    await holidaysFor('DE', 2026);
    assert.equal(upstreamCalls.length, 2);
  });

  test('serves the stale copy when the upstream answers 500', async () => {
    upstreamReply = () => jsonReply(DE_2026);
    await holidaysFor('DE', 2026);
    ageCache('DE', 2026, LONG_AGO);

    upstreamReply = () => errorReply(500);
    const { status, body } = await holidaysFor('DE', 2026);
    assert.equal(status, 200);
    assert.deepEqual(body.holidays.map(h => h.date), ['2026-01-01', '2026-01-06', '2026-10-03']);
  });

  test('warns about the fallback rather than swallowing it', async () => {
    upstreamReply = () => jsonReply(DE_2026);
    await holidaysFor('DE', 2026);
    ageCache('DE', 2026, LONG_AGO);

    upstreamReply = () => errorReply(500);
    logLines = [];
    await holidaysFor('DE', 2026);
    const warning = logLines.find(l => l.level === 'warn');
    assert.match(warning.line, /served stale cache/);
  });

  test('serves the stale copy when the upstream is unreachable', async () => {
    upstreamReply = () => jsonReply(DE_2026);
    await holidaysFor('DE', 2026);
    ageCache('DE', 2026, LONG_AGO);

    upstreamReply = () => { throw new Error('ENOTFOUND date.nager.at'); };
    const { status, body } = await holidaysFor('DE', 2026);
    assert.equal(status, 200);
    assert.equal(body.holidays.length, 3);
  });

  test('answers 502 when the upstream fails and nothing was ever cached', async () => {
    upstreamReply = () => errorReply(503);
    const { status, body } = await holidaysFor('DE', 2026);
    assert.equal(status, 502);
    assert.equal(body.error, 'Holiday service unavailable');
  });

  test('logs an error when it has nothing to fall back on', async () => {
    upstreamReply = () => errorReply(503);
    await holidaysFor('DE', 2026);
    assert.equal(logLines.filter(l => l.level === 'error').length, 1);
  });

  // A captive portal or error page answering 200 must not become the cached
  // truth for the next 30 days.
  test('refuses to cache a 200 that is not a holiday array', async () => {
    upstreamReply = () => jsonReply({ message: 'sign in to continue' });
    assert.equal((await holidaysFor('DE', 2026)).status, 502);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM holiday_cache').get().n, 0);
  });
});

test.describe('GET /api/holidays year boundary', () => {
  const replyByYear = (href) => {
    if (href.includes('/2025/')) return jsonReply(DE_2025);
    if (href.includes('/2026/')) return jsonReply(DE_2026);
    return jsonReply(DE_2027);
  };

  test('caches each year separately instead of one bleeding into the next', async () => {
    upstreamReply = replyByYear;
    await Promise.all([holidaysFor('DE', 2025), holidaysFor('DE', 2026), holidaysFor('DE', 2027)]);
    assert.deepEqual(
      db.prepare('SELECT year FROM holiday_cache ORDER BY year').all().map(r => r.year),
      [2025, 2026, 2027]
    );
  });

  test('serves the neighbouring year from its own row, not the one next to it', async () => {
    upstreamReply = replyByYear;
    await holidaysFor('DE', 2026);
    const { body } = await holidaysFor('DE', 2027);
    assert.deepEqual(body.holidays.map(h => h.date), ['2027-01-01']);
  });

  test('accepts the first year the upstream supports', async () => {
    upstreamReply = () => jsonReply(DE_2026);
    assert.equal((await holidaysFor('DE', 1975)).status, 200);
  });

  test('accepts the last year the upstream supports', async () => {
    upstreamReply = () => jsonReply(DE_2026);
    assert.equal((await holidaysFor('DE', 2100)).status, 200);
  });
});

test.describe('GET /api/holidays input validation', () => {
  test('rejects a missing country', async () => {
    assert.equal((await get('/api/holidays?year=2026')).status, 400);
  });

  test('rejects a lowercase country code', async () => {
    assert.equal((await holidaysFor('de', 2026)).status, 400);
  });

  test('rejects a three-letter country code', async () => {
    assert.equal((await holidaysFor('DEU', 2026)).status, 400);
  });

  test('rejects a path traversal attempt in the country', async () => {
    assert.equal((await get('/api/holidays?country=..%2F..%2Fadmin&year=2026')).status, 400);
  });

  test('rejects a repeated country parameter, which arrives as an array', async () => {
    assert.equal((await get('/api/holidays?country=DE&country=AT&year=2026')).status, 400);
  });

  test('rejects a missing year', async () => {
    assert.equal((await get('/api/holidays?country=DE')).status, 400);
  });

  test('rejects a non-numeric year', async () => {
    assert.equal((await holidaysFor('DE', 'twenty-six')).status, 400);
  });

  test('rejects a year below the supported range', async () => {
    assert.equal((await holidaysFor('DE', 1974)).status, 400);
  });

  test('rejects a year above the supported range', async () => {
    assert.equal((await holidaysFor('DE', 2101)).status, 400);
  });

  test('never reaches the upstream for a rejected request', async () => {
    await holidaysFor('de', 2026);
    assert.equal(upstreamCalls.length, 0);
  });

  test('requires a session', async () => {
    const res = await realFetch(`${base}/api/holidays?country=DE&year=2026`);
    assert.equal(res.status, 401);
  });
});

test.describe('GET /api/holidays/countries', () => {
  test('returns the upstream country list', async () => {
    upstreamReply = () => jsonReply(COUNTRIES);
    const { status, body } = await get('/api/holidays/countries');
    assert.equal(status, 200);
    assert.deepEqual(body.countries.map(c => c.countryCode), ['DE', 'AT']);
  });

  test('serves a fresh list without touching the upstream again', async () => {
    upstreamReply = () => jsonReply(COUNTRIES);
    await get('/api/holidays/countries');
    await get('/api/holidays/countries');
    assert.equal(upstreamCalls.length, 1);
  });

  test('serves the stale list when the upstream answers 500', async () => {
    upstreamReply = () => jsonReply(COUNTRIES);
    await get('/api/holidays/countries');
    db.prepare('UPDATE holiday_country_cache SET fetched_at = ? WHERE id = 1').run(LONG_AGO);

    upstreamReply = () => errorReply(500);
    const { status, body } = await get('/api/holidays/countries');
    assert.equal(status, 200);
    assert.deepEqual(body.countries.map(c => c.countryCode), ['DE', 'AT']);
  });

  test('answers 502 when the upstream fails and nothing was ever cached', async () => {
    upstreamReply = () => errorReply(500);
    assert.equal((await get('/api/holidays/countries')).status, 502);
  });

  test('requires a session', async () => {
    const res = await realFetch(`${base}/api/holidays/countries`);
    assert.equal(res.status, 401);
  });
});
