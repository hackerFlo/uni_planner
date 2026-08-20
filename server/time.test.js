const test = require('node:test');
const assert = require('node:assert/strict');

const { localDayBoundsUtc } = require('./time');

const MS_PER_HOUR = 60 * 60 * 1000;

function hoursBetween({ startIso, endIso }) {
  return (Date.parse(endIso) - Date.parse(startIso)) / MS_PER_HOUR;
}

// A local day is 24 hours only when no DST transition falls inside it. The
// "completed today" window in scheduler.js and routes/auth.js is built from
// these bounds, so an hour of drift twice a year silently mis-reports a day.
test.describe('localDayBoundsUtc', () => {
  test('brackets an ordinary day east of UTC at the local midnights', () => {
    assert.deepEqual(localDayBoundsUtc('2026-08-20', 'Europe/Berlin'), {
      startIso: '2026-08-19T22:00:00.000Z',
      endIso: '2026-08-20T22:00:00.000Z',
    });
  });

  test('an ordinary day is exactly 24 hours', () => {
    assert.equal(hoursBetween(localDayBoundsUtc('2026-08-20', 'Europe/Berlin')), 24);
  });

  test('the spring-forward day in Europe/Berlin is 23 hours', () => {
    assert.equal(hoursBetween(localDayBoundsUtc('2026-03-29', 'Europe/Berlin')), 23);
  });

  test('the spring-forward day ends at the next local midnight, not start+24h', () => {
    assert.deepEqual(localDayBoundsUtc('2026-03-29', 'Europe/Berlin'), {
      startIso: '2026-03-28T23:00:00.000Z',
      endIso: '2026-03-29T22:00:00.000Z',
    });
  });

  test('the autumn fall-back day in Europe/Berlin is 25 hours', () => {
    assert.equal(hoursBetween(localDayBoundsUtc('2026-10-25', 'Europe/Berlin')), 25);
  });

  test('the autumn fall-back day ends at the next local midnight', () => {
    assert.deepEqual(localDayBoundsUtc('2026-10-25', 'Europe/Berlin'), {
      startIso: '2026-10-24T22:00:00.000Z',
      endIso: '2026-10-25T23:00:00.000Z',
    });
  });

  test('brackets an ordinary day west of UTC at the local midnights', () => {
    assert.deepEqual(localDayBoundsUtc('2026-08-20', 'America/New_York'), {
      startIso: '2026-08-20T04:00:00.000Z',
      endIso: '2026-08-21T04:00:00.000Z',
    });
  });

  test('the spring-forward day in America/New_York is 23 hours', () => {
    assert.equal(hoursBetween(localDayBoundsUtc('2026-03-08', 'America/New_York')), 23);
  });

  test('the autumn fall-back day in America/New_York is 25 hours', () => {
    assert.equal(hoursBetween(localDayBoundsUtc('2026-11-01', 'America/New_York')), 25);
  });

  test('handles a half-hour offset zone', () => {
    assert.deepEqual(localDayBoundsUtc('2026-08-20', 'Asia/Kolkata'), {
      startIso: '2026-08-19T18:30:00.000Z',
      endIso: '2026-08-20T18:30:00.000Z',
    });
  });

  test('a half-hour offset zone without DST still spans 24 hours', () => {
    assert.equal(hoursBetween(localDayBoundsUtc('2026-08-20', 'Asia/Kolkata')), 24);
  });

  // Half-hour offset AND a southern-hemisphere transition: +10:30 becomes +09:30.
  test('the fall-back day in a half-hour offset zone is 25 hours', () => {
    assert.equal(hoursBetween(localDayBoundsUtc('2026-04-05', 'Australia/Adelaide')), 25);
  });

  test('UTC itself needs no adjustment', () => {
    assert.deepEqual(localDayBoundsUtc('2026-08-20', 'UTC'), {
      startIso: '2026-08-20T00:00:00.000Z',
      endIso: '2026-08-21T00:00:00.000Z',
    });
  });

  test('rolls over a month boundary', () => {
    assert.equal(localDayBoundsUtc('2026-01-31', 'UTC').endIso, '2026-02-01T00:00:00.000Z');
  });

  test('rolls over a year boundary', () => {
    assert.equal(localDayBoundsUtc('2026-12-31', 'UTC').endIso, '2027-01-01T00:00:00.000Z');
  });

  test('rolls over a leap day', () => {
    assert.equal(localDayBoundsUtc('2028-02-28', 'UTC').endIso, '2028-02-29T00:00:00.000Z');
  });

  test('the end of one day is the start of the next, with no gap or overlap', () => {
    const day = localDayBoundsUtc('2026-03-29', 'Europe/Berlin');
    const nextDay = localDayBoundsUtc('2026-03-30', 'Europe/Berlin');
    assert.equal(day.endIso, nextDay.startIso);
  });
});
