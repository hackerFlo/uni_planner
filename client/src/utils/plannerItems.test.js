import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DIVIDER_PREFIX,
  applyDividerOrder,
  dividerRowId,
  isDividerId,
  setDividerDayLocal,
  splitOrderItems,
  splitSnapshotItems,
  toDividerItem,
} from './plannerItems.js';

const MON = '2026-08-17';
const TUE = '2026-08-18';

const todo = (id, order = null) => ({ id, day_assigned: MON, planner_order: order });
const divider = (id, order = null, date = MON) => toDividerItem({ id, date, planner_order: order });

test.describe('toDividerItem', () => {
  test('namespaces the draggable id and keeps the raw row id', () => {
    assert.deepEqual(toDividerItem({ id: 7, date: MON, planner_order: 2 }), {
      id: 'divider-7',
      dividerId: 7,
      kind: 'divider',
      day_assigned: MON,
      planner_order: 2,
    });
  });

  test('renames date to day_assigned so plannerMutations can read it', () => {
    assert.equal(toDividerItem({ id: 1, date: TUE, planner_order: 0 }).day_assigned, TUE);
  });
});

test.describe('isDividerId', () => {
  test('accepts a namespaced id', () => {
    assert.equal(isDividerId(`${DIVIDER_PREFIX}3`), true);
  });

  test('rejects a todo id, which is a bare number', () => {
    assert.equal(isDividerId(3), false);
  });

  test('rejects the numeric string a todo draggable uses', () => {
    assert.equal(isDividerId('3'), false);
  });
});

test.describe('dividerRowId', () => {
  test('recovers the numeric row id the API expects', () => {
    assert.equal(dividerRowId('divider-42'), 42);
  });
});

test.describe('splitOrderItems', () => {
  test('numbers both kinds in one dense run, so they stay interleaved', () => {
    const merged = [todo(1), divider(5), todo(2)];
    assert.deepEqual(splitOrderItems(merged), {
      todoItems: [{ id: 1, planner_order: 0 }, { id: 2, planner_order: 2 }],
      dividerItems: [{ id: 5, planner_order: 1 }],
    });
  });

  test('sends the divider its raw row id, not the prefixed one', () => {
    const { dividerItems } = splitOrderItems([divider(9)]);
    assert.deepEqual(dividerItems, [{ id: 9, planner_order: 0 }]);
  });

  test('renumbers from scratch, ignoring whatever order the items carried', () => {
    const { todoItems } = splitOrderItems([todo(1, 40), todo(2, 10)]);
    assert.deepEqual(todoItems, [{ id: 1, planner_order: 0 }, { id: 2, planner_order: 1 }]);
  });

  test('a day of only todos produces no divider writes', () => {
    assert.deepEqual(splitOrderItems([todo(1), todo(2)]).dividerItems, []);
  });
});

test.describe('splitSnapshotItems', () => {
  test('reports the positions held before the drag, not the new ones', () => {
    const all = [todo(1, 0), divider(5, 1), todo(2, 2)];
    const reordered = [all[2], all[0], all[1]];
    assert.deepEqual(splitSnapshotItems(all, reordered), {
      todoItems: [{ id: 2, planner_order: 2 }, { id: 1, planner_order: 0 }],
      dividerItems: [{ id: 5, planner_order: 1 }],
    });
  });

  test('falls back to 0 for an item missing from the board', () => {
    const { todoItems } = splitSnapshotItems([], [todo(1, 3)]);
    assert.deepEqual(todoItems, [{ id: 1, planner_order: 0 }]);
  });
});

test.describe('applyDividerOrder', () => {
  test('matches on the raw row id the payload carries', () => {
    const next = applyDividerOrder([divider(5, 0), divider(6, 1)], [{ id: 6, planner_order: 4 }]);
    assert.deepEqual(next.map(d => [d.dividerId, d.planner_order]), [[5, 0], [6, 4]]);
  });

  test('leaves dividers the payload does not mention untouched', () => {
    const before = [divider(5, 2)];
    assert.deepEqual(applyDividerOrder(before, [{ id: 99, planner_order: 0 }]), before);
  });
});

test.describe('setDividerDayLocal', () => {
  test('moves only the named divider to the new day', () => {
    const next = setDividerDayLocal([divider(5, 0), divider(6, 1)], 5, TUE);
    assert.deepEqual(next.map(d => d.day_assigned), [TUE, MON]);
  });
});
