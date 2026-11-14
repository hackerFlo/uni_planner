import test from 'node:test';
import assert from 'node:assert/strict';

import { overlayFromOrder, applyOverlays, hiddenOverlay, editOverlay } from './boardOverlay.js';

const MONDAY = '2026-11-16';
const TUESDAY = '2026-11-17';
const task = (id, day, planner_order) => ({ id, day_assigned: day, planner_order, title: `Task ${id}` });
const divider = (n, day, planner_order) => ({ id: `divider-${n}`, dividerId: n, kind: 'divider', day_assigned: day, planner_order });

test.describe('overlayFromOrder', () => {
  test('places every item of the planned order on that day at its index', () => {
    const patches = overlayFromOrder([task(3, MONDAY, 0), divider(1, MONDAY, 1), task(1, MONDAY, 2)], TUESDAY);
    assert.deepEqual([...patches], [
      [3, { day_assigned: TUESDAY, planner_order: 0 }],
      ['divider-1', { day_assigned: TUESDAY, planner_order: 1 }],
      [1, { day_assigned: TUESDAY, planner_order: 2 }],
    ]);
  });
});

test.describe('applyOverlays', () => {
  test('moves a card to its new day before the server answers', () => {
    const rows = [task(1, MONDAY, 0), task(2, TUESDAY, 0)];
    const [moved] = applyOverlays(rows, [overlayFromOrder([task(2, TUESDAY, 0), task(1, MONDAY, 0)], TUESDAY)]);
    assert.deepEqual({ day: moved.day_assigned, order: moved.planner_order }, { day: TUESDAY, order: 1 });
  });

  test('keeps the fields the overlay does not touch', () => {
    const [row] = applyOverlays([task(1, MONDAY, 0)], [overlayFromOrder([task(1, MONDAY, 0)], TUESDAY)]);
    assert.equal(row.title, 'Task 1');
  });

  test('applies later overlays over earlier ones, as drags were made', () => {
    const first = overlayFromOrder([task(1, MONDAY, 0)], TUESDAY);
    const second = overlayFromOrder([task(1, TUESDAY, 0)], MONDAY);
    assert.equal(applyOverlays([task(1, MONDAY, 0)], [first, second])[0].day_assigned, MONDAY);
  });

  test('patches dividers by their prefixed id', () => {
    const [row] = applyOverlays([divider(4, MONDAY, 2)], [overlayFromOrder([divider(4, MONDAY, 2)], MONDAY)]);
    assert.equal(row.planner_order, 0);
  });

  // Unchanged identity keeps every memo keyed on the array from recomputing.
  test('returns the same array when no overlay is pending', () => {
    const rows = [task(1, MONDAY, 0)];
    assert.equal(applyOverlays(rows, []), rows);
  });

  test('returns the same array when no overlay touches its rows', () => {
    const rows = [task(1, MONDAY, 0)];
    assert.equal(applyOverlays(rows, [overlayFromOrder([divider(9, MONDAY, 0)], MONDAY)]), rows);
  });
});

test.describe('hiddenOverlay', () => {
  test('removes the hidden items from the rows', () => {
    const rows = [task(1, MONDAY, 0), task(2, MONDAY, 1)];
    assert.deepEqual(applyOverlays(rows, [hiddenOverlay([1])]).map(row => row.id), [2]);
  });

  test('leaves other rows untouched by identity', () => {
    const rows = [task(1, MONDAY, 0), task(2, MONDAY, 1)];
    assert.equal(applyOverlays(rows, [hiddenOverlay([1])])[0], rows[1]);
  });
});

test.describe('editOverlay', () => {
  test('lays only the whitelisted edited fields over the row', () => {
    const [row] = applyOverlays([task(1, MONDAY, 0)], [editOverlay(1, { title: 'New', approx_time: '1h', completed: 0, ignored: 'x' })]);
    assert.deepEqual({ title: row.title, time: row.approx_time, ignored: row.ignored, day: row.day_assigned },
      { title: 'New', time: '1h', ignored: undefined, day: MONDAY });
  });

  test('hides the row when the edit completes or archives it', () => {
    assert.deepEqual(applyOverlays([task(1, MONDAY, 0)], [editOverlay(1, { completed: true, archived: true })]), []);
  });

  test('keeps the row when the edit only clears completion', () => {
    assert.equal(applyOverlays([task(1, MONDAY, 0)], [editOverlay(1, { completed: 0, archived: 0 })]).length, 1);
  });
});
