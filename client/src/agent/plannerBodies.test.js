import test from 'node:test';
import assert from 'node:assert/strict';

import { itemRef, moveBody, reorderBody, createDividerBody, deleteDividerBody } from './plannerBodies.js';

const task = (id, day, order) => ({ id, day_assigned: day, planner_order: order });
const divider = { id: 'divider-7', dividerId: 7, kind: 'divider', day_assigned: 'd', planner_order: 0 };

test.describe('itemRef', () => {
  test('references a task by id', () => {
    assert.deepEqual(itemRef(task(5, 'd', 0)), { kind: 'task', id: 5 });
  });

  test('references a divider by its row id', () => {
    assert.deepEqual(itemRef(divider), { kind: 'divider', id: 7 });
  });
});

test.describe('moveBody', () => {
  const items = [task(1, 'd', 0), task(2, 'd', 1), task(3, null, 0), task(4, null, 1)];

  test('appends to the end of the target day', () => {
    assert.deepEqual(moveBody(items, items[2], 'd'), { item: { kind: 'task', id: 3 }, day: 'd', index: 2 });
  });

  test('does not count the moved item itself', () => {
    assert.equal(moveBody(items, items[0], 'd').index, 1);
  });

  test('unassigning appends to the unassigned list', () => {
    assert.deepEqual(moveBody(items, items[0], null), { item: { kind: 'task', id: 1 }, day: null, index: 2 });
  });
});

test.describe('reorderBody', () => {
  test('carries the day and ordered refs', () => {
    assert.deepEqual(reorderBody([task(2, 'd', 0), divider]), { day: 'd', items: [{ kind: 'task', id: 2 }, { kind: 'divider', id: 7 }] });
  });
});

test.describe('divider bodies', () => {
  test('create appends at the end of the day', () => {
    assert.deepEqual(createDividerBody('d', [task(1, 'd', 0), task(2, 'd', 1)]), { day: 'd', index: 2 });
  });

  test('delete sends the raw row id', () => {
    assert.deepEqual(deleteDividerBody(7), { id: 7 });
  });
});
