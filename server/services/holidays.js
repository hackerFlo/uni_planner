const { z } = require('zod');
const { DomainError } = require('../domain/errors');
const { idSchema, parse } = require('../domain/schemas');
const { validateDayAssigned } = require('../middleware/validate');
const { log } = require('../logger');

const UPSTREAM = 'https://date.nager.at/api/v3';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const countrySchema = z.string().regex(/^[A-Z]{2}$/);
const holidayInputSchema = z.strictObject({ country: countrySchema, year: z.number().int().min(1975).max(2100),
  subdivision: z.string().regex(/^[A-Z]{2}-[A-Z0-9]{1,4}$/).optional(),
});
const countryListSchema = z.array(z.object({ countryCode: countrySchema, name: z.string().min(1).max(200) })).min(1).max(300);
const holidayListSchema = z.array(z.object({
  date: z.string().refine(value => Boolean(validateDayAssigned(value))),
  localName: z.string().min(1).max(500), name: z.string().min(1).max(500), countryCode: countrySchema,
  fixed: z.boolean().optional(), global: z.boolean(), counties: z.array(z.string().max(16)).max(100).nullable(),
  launchYear: z.number().int().nullable().optional(), types: z.array(z.string().max(64)).max(10),
})).min(1).max(1000);
const unavailable = () => new DomainError('UPSTREAM_UNAVAILABLE', 'Holiday service unavailable', 502);

function decode(schema, raw) {
  if (Buffer.byteLength(raw) > MAX_RESPONSE_BYTES) throw unavailable();
  const parsed = schema.safeParse(JSON.parse(raw));
  if (!parsed.success) throw unavailable();
  return parsed.data;
}
async function responseText(response) {
  if (!response.body) throw unavailable();
  if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) {
    await response.body.cancel();
    throw unavailable();
  }
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_RESPONSE_BYTES) { await reader.cancel(); throw unavailable(); }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, length).toString('utf8');
  } finally { reader.releaseLock(); }
}
async function fetchUpstream(path, schema) {
  const response = await fetch(`${UPSTREAM}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(8000),
    headers: { Accept: 'application/json' },
  });
  if (response.status !== 200 || !/^application\/json\b/i.test(response.headers.get('content-type') || '')) {
    await response.body?.cancel();
    throw unavailable();
  }
  return decode(schema, await responseText(response));
}
function readCached(row, schema, logger, userId) {
  if (!row) return null;
  try { return { data: decode(schema, row.payload), age: Date.now() - Date.parse(row.fetched_at) }; }
  catch { logger.warn('holiday cache rejected', { action: 'holiday_cache', outcome: 'invalid', userId }); return null; }
}
async function cachedFetch({ row, schema, path, save, logger, userId }) {
  const cached = readCached(row, schema, logger, userId);
  if (cached && cached.age >= 0 && cached.age < CACHE_TTL_MS) return cached.data;
  try {
    const fresh = await fetchUpstream(path, schema);
    save(fresh);
    return fresh;
  } catch {
    if (cached) {
      logger.warn('holiday upstream failed, served stale cache', { action: 'holiday_fetch', outcome: 'stale', userId });
      return cached.data;
    }
    logger.error('holiday service unavailable', { action: 'holiday_fetch', outcome: 'unavailable', userId });
    throw unavailable();
  }
}
function account(context) { return parse(idSchema, context?.userId); }
async function countries(db, context) {
  const userId = account(context);
  const data = await cachedFetch({ userId, logger: context.log || log, schema: countryListSchema,
    row: db.prepare('SELECT payload,fetched_at FROM holiday_country_cache WHERE id=1').get(), path: '/AvailableCountries',
    save: payload => db.prepare(`INSERT INTO holiday_country_cache(id,payload,fetched_at) VALUES(1,?,?)
      ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at`)
      .run(JSON.stringify(payload), new Date().toISOString()),
  });
  return { countries: data };
}
async function holidays(db, context, input) {
  const userId = account(context);
  const { country, year, subdivision } = parse(holidayInputSchema, input);
  if (subdivision && !subdivision.startsWith(`${country}-`)) throw new DomainError('VALIDATION_ERROR', 'Subdivision must belong to country');
  const schema = holidayListSchema.refine(rows => rows.every(row => row.countryCode === country && row.date.startsWith(`${year}-`)));
  const data = await cachedFetch({ userId, logger: context.log || log, schema,
    row: db.prepare('SELECT payload,fetched_at FROM holiday_cache WHERE country=? AND year=?').get(country, year),
    path: `/PublicHolidays/${year}/${country}`,
    save: payload => db.prepare(`INSERT INTO holiday_cache(country,year,payload,fetched_at) VALUES(?,?,?,?)
      ON CONFLICT(country,year) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at`)
      .run(country, year, JSON.stringify(payload), new Date().toISOString()),
  });
  return { country, year, holidays: subdivision ? data.filter(row => row.global || row.counties?.includes(subdivision)) : data };
}
function createHolidayService(db) {
  // Cache tables hold public reference data, shared across authenticated owners.
  return { countries: context => countries(db, context), holidays: (context, args) => holidays(db, context, args) };
}
module.exports = { createHolidayService, holidayInputSchema };
