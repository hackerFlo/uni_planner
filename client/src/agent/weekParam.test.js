import test from 'node:test';
import assert from 'node:assert/strict';

import { parseWeekParam, shiftWeek, weekLinks } from './weekParam.js';

const WED = '2026-11-18';
const THIS_MONDAY = '2026-11-16';

test.describe('parseWeekParam', () => {
  test('keeps a valid Monday', () => {
    assert.equal(parseWeekParam('2026-11-09', WED), '2026-11-09');
  });

  test('snaps a valid non-Monday date to its Monday', () => {
    assert.equal(parseWeekParam('2026-11-22', WED), '2026-11-16');
  });

  test('falls back to the current week when the param is missing', () => {
    assert.equal(parseWeekParam(null, WED), THIS_MONDAY);
  });

  for (const bad of ['', 'banana', '2026-13-01', '2026-02-30', '2026-1-1', '20261116']) {
    test(`falls back to the current week for ${JSON.stringify(bad)}`, () => {
      assert.equal(parseWeekParam(bad, WED), THIS_MONDAY);
    });
  }
});

test.describe('shiftWeek', () => {
  test('moves forward across a month boundary', () => {
    assert.equal(shiftWeek('2026-11-30', 1), '2026-12-07');
  });

  test('moves backward', () => {
    assert.equal(shiftWeek('2026-11-16', -1), '2026-11-09');
  });
});

test.describe('weekLinks', () => {
  test('builds previous, current and next urls', () => {
    assert.deepEqual(weekLinks('2026-11-09', WED), {
      previous: '/agent?week=2026-11-02',
      current: '/agent?week=2026-11-16',
      next: '/agent?week=2026-11-16',
    });
  });
});
