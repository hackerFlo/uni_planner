const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { createHolidayService } = require('./holidays');
const context = { userId: 1, actor: 'web' };
const baseHoliday = { date: '2026-10-03', localName: 'National', name: 'National', countryCode: 'DE',
  fixed: false, global: true, counties: null, launchYear: 1990, types: ['Public'] };
const regional = { ...baseHoliday, date: '2026-01-06', global: false, counties: ['DE-BY'] };
const reply = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
let db, service;
test.beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`CREATE TABLE holiday_cache(country TEXT,year INTEGER,payload TEXT,fetched_at TEXT,PRIMARY KEY(country,year));
    CREATE TABLE holiday_country_cache(id INTEGER PRIMARY KEY,payload TEXT,fetched_at TEXT);`);
  service = createHolidayService(db);
});
test.afterEach(() => db.close());

test('fixed upstream uses manual redirects and bounded timeout while preserving weekends and region data', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => { calls.push({ url, options }); return reply([baseHoliday, regional]); });
  const all = await service.holidays(context, { country: 'DE', year: 2026 });
  assert.deepEqual(all.holidays, [baseHoliday, regional]);
  assert.equal(calls[0].url, 'https://date.nager.at/api/v3/PublicHolidays/2026/DE');
  assert.equal(calls[0].options.redirect, 'manual');
  assert.ok(calls[0].options.signal instanceof AbortSignal);
  assert.equal((await service.holidays(context, { country: 'DE', year: 2026, subdivision: 'DE-BE' })).holidays.length, 1);
  assert.equal((await service.holidays(context, { country: 'DE', year: 2026, subdivision: 'DE-BY' })).holidays.length, 2);
  assert.equal(calls.length, 1);
});

test('malformed parameters cannot select arbitrary destinations or issue any outbound request', async t => {
  const mocked = t.mock.method(globalThis, 'fetch', async () => { throw new Error('must not request'); });
  for (const args of [{ country: '../admin', year: 2026 }, { country: 'de', year: 2026 },
    { country: 'DE', year: '2026' }, { country: 'DE', year: 2101 }, { country: 'DE', year: 1974 },
    { country: 'DE', year: 2026, url: 'https://evil.example' }, { country: 'DE', year: 2026, subdivision: 'AT-1' }]) {
    await assert.rejects(service.holidays(context, args), { code: 'VALIDATION_ERROR' });
  }
  assert.equal(mocked.mock.callCount(), 0);
});

test('malformed, mismatched or oversized responses and redirects never enter the cache', async t => {
  const responses = [reply([]), reply({ private: 'upstream-canary' }), reply([{ ...baseHoliday, countryCode: 'AT' }]),
    reply([{ ...baseHoliday, date: '2025-01-01' }]), reply([{ ...baseHoliday, date: '2026-02-30' }]),
    new Response('', { status: 302, headers: { Location: 'https://evil.example' } }),
    new Response('x'.repeat(1024 * 1024 + 1), { headers: { 'Content-Type': 'application/json' } })];
  t.mock.method(globalThis, 'fetch', async () => responses.shift());
  while (responses.length) {
    await assert.rejects(service.holidays(context, { country: 'DE', year: 2026 }), error =>
      error.code === 'UPSTREAM_UNAVAILABLE' && !error.message.includes('upstream-canary'));
  }
  assert.equal(db.prepare('SELECT count(*) n FROM holiday_cache').get().n, 0);
});

test('stale valid cache survives an outage, corrupt cache never bypasses response validation', async t => {
  const lines = [];
  const ctx = { ...context, log: { warn: (message, data) => lines.push(JSON.stringify([message, data])),
    error: (message, data) => lines.push(JSON.stringify([message, data])) } };
  db.prepare('INSERT INTO holiday_cache VALUES(?,?,?,?)').run('DE', 2026, JSON.stringify([baseHoliday]), '2000-01-01');
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('credential-canary'); });
  assert.deepEqual((await service.holidays(ctx, { country: 'DE', year: 2026 })).holidays, [baseHoliday]);
  assert.equal(lines.join('').includes('credential-canary'), false);
  db.prepare('UPDATE holiday_cache SET payload=?').run('{broken-private-cache');
  await assert.rejects(service.holidays(ctx, { country: 'DE', year: 2026 }), { code: 'UPSTREAM_UNAVAILABLE' });
  assert.equal(lines.join('').includes('broken-private-cache'), false);
});

test('country cache is shared public reference data and validates every returned country', async t => {
  const countries = [{ countryCode: 'DE', name: 'Germany' }];
  const mocked = t.mock.method(globalThis, 'fetch', async () => reply(countries));
  assert.deepEqual(await service.countries(context), { countries });
  assert.deepEqual(await service.countries({ userId: 2, actor: 'mcp' }), { countries });
  assert.equal(mocked.mock.callCount(), 1);
});

test('a stalled upstream observes the configured eight-second abort signal', async t => {
  const requested = [];
  const originalTimeout = AbortSignal.timeout.bind(AbortSignal);
  t.mock.method(AbortSignal, 'timeout', milliseconds => { requested.push(milliseconds); return originalTimeout(10); });
  t.mock.method(globalThis, 'fetch', (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
  }));
  const keepAlive = setTimeout(() => {}, 100);
  try {
    await assert.rejects(service.holidays(context, { country: 'DE', year: 2026 }), { code: 'UPSTREAM_UNAVAILABLE' });
  } finally { clearTimeout(keepAlive); }
  assert.deepEqual(requested, [8000]);
});

test('oversized declared bodies are rejected before reading and invalid country records are not cached', async t => {
  const responses = [new Response('[]', { headers: { 'Content-Type': 'application/json', 'Content-Length': '1048577' } }),
    reply([{ countryCode: '../private', name: 'invalid' }]),
    new Response('<html>sign in</html>', { headers: { 'Content-Type': 'text/html' } })];
  t.mock.method(globalThis, 'fetch', async () => responses.shift());
  while (responses.length) await assert.rejects(service.countries(context), { code: 'UPSTREAM_UNAVAILABLE' });
  assert.equal(db.prepare('SELECT count(*) n FROM holiday_country_cache').get().n, 0);
});
