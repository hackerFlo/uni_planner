import test from 'node:test';
import assert from 'node:assert/strict';

import {
  dayHeading, dayLabel, buildDayRows, buildUnassignedRows, moveOptions,
  resolveMoveTarget, planStep, OTHER_DATE,
} from './days.js';

const names = id => ({ 1: 'Uni', 2: 'Home' }[id] ?? '');
const task = (id, day, order, extra = {}) => ({ id, title: `t${id}`, day_assigned: day, planner_order: order, list_id: 1, ...extra });
const divider = (rowId, day, order) => ({ id: `divider-${rowId}`, dividerId: rowId, kind: 'divider', day_assigned: day, planner_order: order });

test.describe('dayHeading', () => {
  test('names the weekday and shows the iso date', () => {
    assert.equal(dayHeading('2026-11-18'), 'Wednesday 2026-11-18');
  });

  test('treats Sunday as a Sunday', () => {
    assert.equal(dayHeading('2026-11-22'), 'Sunday 2026-11-22');
  });
});

test.describe('dayLabel', () => {
  test('is short for a date and plain for unassigned', () => {
    assert.deepEqual([dayLabel('2026-11-18'), dayLabel(null)], ['Wed 2026-11-18', 'Unassigned']);
  });
});

test.describe('buildDayRows', () => {
  const items = [task(3, '2026-11-18', 1), divider(9, '2026-11-18', 0), task(4, '2026-11-19', 0), task(5, '2026-11-18', 2)];
  const completed = [task(6, '2026-11-18', 7, { completed: 1 })];
  const rows = buildDayRows('2026-11-18', items, completed, names);

  test('lists the day items in planner order, dividers included', () => {
    assert.deepEqual(rows.map(r => r.displayId), ['divider-9', '3', '5', '6']);
  });

  test('marks kinds', () => {
    assert.deepEqual(rows.map(r => r.kind), ['divider', 'task', 'task', 'task']);
  });

  test('lists completed tasks after open items and flags them', () => {
    assert.deepEqual(rows.map(r => r.completed), [false, false, false, true]);
  });

  test('resolves the list name and an empty time', () => {
    assert.deepEqual([rows[1].listName, rows[1].time], ['Uni', '']);
  });

  test('carries approx_time into the time column', () => {
    const [row] = buildDayRows('d', [task(1, 'd', 0, { approx_time: '30m' })], [], names);
    assert.equal(row.time, '30m');
  });
});

test.describe('buildUnassignedRows', () => {
  test('takes only open tasks without a day, ordered', () => {
    const items = [task(1, '2026-11-18', 0), task(2, null, 5), task(3, null, 1), divider(1, '2026-11-18', 1)];
    assert.deepEqual(buildUnassignedRows(items, names).map(r => r.displayId), ['3', '2']);
  });
});

test.describe('moveOptions', () => {
  const week = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'];
  const options = moveOptions(week);

  test('offers unassigned, seven days and the other-date choice', () => {
    assert.equal(options.length, 9);
  });

  test('starts with unassigned and ends with other', () => {
    assert.deepEqual([options[0].value, options[8].value], ['', OTHER_DATE]);
  });
});

test.describe('resolveMoveTarget', () => {
  test('empty select means unassigned', () => {
    assert.deepEqual(resolveMoveTarget('', ''), { ok: true, day: null });
  });

  test('a day option resolves to that day', () => {
    assert.deepEqual(resolveMoveTarget('2026-11-18', ''), { ok: true, day: '2026-11-18' });
  });

  test('other uses the date field', () => {
    assert.deepEqual(resolveMoveTarget(OTHER_DATE, '2027-01-04'), { ok: true, day: '2027-01-04' });
  });

  test('other without a date is rejected', () => {
    assert.equal(resolveMoveTarget(OTHER_DATE, '').ok, false);
  });

  test('an impossible date is rejected', () => {
    assert.equal(resolveMoveTarget(OTHER_DATE, '2026-02-30').ok, false);
  });
});

test.describe('planStep', () => {
  const items = [task(1, 'd', 0), divider(2, 'd', 1), task(3, 'd', 2)];

  test('moves an item down one place', () => {
    assert.deepEqual(planStep(items, 'd', 1, 'down').map(i => i.id), ['divider-2', 1, 3]);
  });

  test('moves an item up one place', () => {
    assert.deepEqual(planStep(items, 'd', 3, 'up').map(i => i.id), [1, 3, 'divider-2']);
  });

  test('moves a divider', () => {
    assert.deepEqual(planStep(items, 'd', 'divider-2', 'up').map(i => i.id), ['divider-2', 1, 3]);
  });

  test('refuses to move the first item up', () => {
    assert.equal(planStep(items, 'd', 1, 'up'), null);
  });

  test('refuses to move the last item down', () => {
    assert.equal(planStep(items, 'd', 3, 'down'), null);
  });

  test('refuses an unknown id', () => {
    assert.equal(planStep(items, 'd', 99, 'down'), null);
  });
});
