import test from 'node:test';
import assert from 'node:assert/strict';

import { toIso, parseDateLocal, getWeekDates, isSameDay, msUntilNextMidnight, countdownParts, formatCountdown } from './dates.js';

// Fixed local dates. Constructed with the Date(y, m, d) form so they are local
// midnight regardless of the machine's zone -- the whole point of these helpers.
const WED = new Date(2026, 7, 19); // Wednesday 19 Aug 2026
const SUN = new Date(2026, 7, 23); // Sunday 23 Aug 2026
const MON = new Date(2026, 7, 17); // Monday 17 Aug 2026

test.describe('toIso', () => {
  test('formats a local date without shifting it across a zone boundary', () => {
    assert.equal(toIso(new Date(2026, 0, 1)), '2026-01-01');
  });

  test('zero-pads single-digit months and days', () => {
    assert.equal(toIso(new Date(2026, 8, 5)), '2026-09-05');
  });

  test('round-trips through parseDateLocal', () => {
    assert.equal(toIso(parseDateLocal('2026-02-28')), '2026-02-28');
  });
});

test.describe('parseDateLocal', () => {
  test('returns local midnight, not UTC midnight', () => {
    const d = parseDateLocal('2026-08-19');
    assert.equal(d.getHours(), 0);
    assert.equal(d.getDate(), 19);
  });
});

test.describe('getWeekDates', () => {
  test('returns seven days', () => {
    assert.equal(getWeekDates(0, WED).length, 7);
  });

  test('starts on Monday for a midweek date', () => {
    assert.equal(getWeekDates(0, WED)[0], '2026-08-17');
  });

  test('ends on Sunday', () => {
    assert.equal(getWeekDates(0, WED)[6], '2026-08-23');
  });

  // Sunday is the trap: getDay() === 0 must map back to the Monday six days
  // earlier, not forward to the next one.
  test('treats Sunday as the last day of the week it closes, not the first of the next', () => {
    assert.deepEqual(getWeekDates(0, SUN), getWeekDates(0, WED));
  });

  test('treats Monday as the first day of its own week', () => {
    assert.deepEqual(getWeekDates(0, MON), getWeekDates(0, WED));
  });

  test('offset -1 lands on the previous Monday', () => {
    assert.equal(getWeekDates(-1, WED)[0], '2026-08-10');
  });

  test('offset +1 lands on the following Monday', () => {
    assert.equal(getWeekDates(1, WED)[0], '2026-08-24');
  });

  test('offset -2 reaches the week the planner cannot show', () => {
    assert.equal(getWeekDates(-2, WED)[0], '2026-08-03');
  });

  test('crosses a month boundary without skipping a day', () => {
    const week = getWeekDates(0, new Date(2026, 7, 31)); // Mon 31 Aug 2026
    assert.deepEqual(week, [
      '2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03',
      '2026-09-04', '2026-09-05', '2026-09-06',
    ]);
  });

  test('crosses a year boundary without skipping a day', () => {
    const week = getWeekDates(0, new Date(2026, 11, 31)); // Thu 31 Dec 2026
    assert.equal(week[0], '2026-12-28');
    assert.equal(week[6], '2027-01-03');
  });

  test('every returned day is one calendar day after the last', () => {
    const week = getWeekDates(0, WED);
    for (let i = 1; i < week.length; i++) {
      const prev = parseDateLocal(week[i - 1]);
      const cur = parseDateLocal(week[i]);
      assert.equal(Math.round((cur - prev) / 86400000), 1);
    }
  });
});

test.describe('isSameDay', () => {
  test('ignores the time component', () => {
    assert.equal(isSameDay(new Date(2026, 7, 19, 23, 59), new Date(2026, 7, 19, 0, 1)), true);
  });

  test('separates adjacent days', () => {
    assert.equal(isSameDay(new Date(2026, 7, 19), new Date(2026, 7, 20)), false);
  });
});

test.describe('msUntilNextMidnight', () => {
  const HOUR = 3600000;

  test('is a full day when the clock has just struck midnight', () => {
    assert.equal(msUntilNextMidnight(new Date(2026, 7, 19, 0, 0, 0)), 24 * HOUR);
  });

  test('is one hour at 23:00', () => {
    assert.equal(msUntilNextMidnight(new Date(2026, 7, 19, 23, 0, 0)), HOUR);
  });

  test('never returns zero, which would spin a timer', () => {
    assert.ok(msUntilNextMidnight(new Date(2026, 7, 19, 23, 59, 59, 999)) >= 1);
  });

  test('lands exactly on the next local midnight', () => {
    const now = new Date(2026, 7, 19, 14, 27, 3);
    const landing = new Date(now.getTime() + msUntilNextMidnight(now));
    assert.equal(toIso(landing), '2026-08-20');
    assert.equal(landing.getHours(), 0);
    assert.equal(landing.getMinutes(), 0);
  });

  test('crosses a month boundary', () => {
    const now = new Date(2026, 7, 31, 22, 0, 0);
    assert.equal(toIso(new Date(now.getTime() + msUntilNextMidnight(now))), '2026-09-01');
  });
});

test.describe('formatCountdown', () => {
  test('says Today rather than "0 days"', () => {
    assert.equal(formatCountdown(0), 'Today');
  });

  test('uses the singular for one day', () => {
    assert.equal(formatCountdown(1), '1 day');
  });

  test('uses the plural for two', () => {
    assert.equal(formatCountdown(2), '2 days');
  });

  test('handles a distant exam', () => {
    assert.equal(formatCountdown(128), '128 days');
  });
});

test.describe('countdownParts', () => {
  test('drops the unit on the day itself, so nothing stacks under it', () => {
    assert.deepEqual(countdownParts(0), { value: 'Today', unit: null });
  });

  test('splits the number from its unit for the stacked badge', () => {
    assert.deepEqual(countdownParts(1), { value: '1', unit: 'day' });
  });

  test('pluralises the badge unit', () => {
    assert.deepEqual(countdownParts(9), { value: '9', unit: 'days' });
  });
});
