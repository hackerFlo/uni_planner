import test from 'node:test';
import assert from 'node:assert/strict';

import {
  todosForDay,
  planSameDayReorder,
  planCrossDayDrop,
  assignDayLocal,
  toOrderItems,
  snapshotOrderItems,
  applyOrderItems,
  composeReverts,
} from './plannerMutations.js';

const MON = '2026-08-17';
const TUE = '2026-08-18';

const todo = (id, { day = null, order = null } = {}) =>
  ({ id, day_assigned: day, planner_order: order });

test.describe('todosForDay', () => {
  test('keeps only the requested day', () => {
    const items = [todo(1, { day: MON, order: 0 }), todo(2, { day: TUE, order: 0 })];
    assert.deepEqual(todosForDay(items, MON).map(t => t.id), [1]);
  });

  test('sorts by planner_order', () => {
    const items = [todo(1, { day: MON, order: 2 }), todo(2, { day: MON, order: 0 })];
    assert.deepEqual(todosForDay(items, MON).map(t => t.id), [2, 1]);
  });

  // A todo created straight onto a day has no planner_order until the first
  // renumber; it must sort last rather than jump to the top.
  test('sorts a todo with no planner_order last', () => {
    const items = [todo(1, { day: MON }), todo(2, { day: MON, order: 5 })];
    assert.deepEqual(todosForDay(items, MON).map(t => t.id), [2, 1]);
  });

  test('excludes the requested id', () => {
    const items = [todo(1, { day: MON, order: 0 }), todo(2, { day: MON, order: 1 })];
    assert.deepEqual(todosForDay(items, MON, { excludeId: 1 }).map(t => t.id), [2]);
  });
});

test.describe('planSameDayReorder', () => {
  const day = [todo(1, { day: MON, order: 0 }), todo(2, { day: MON, order: 1 }), todo(3, { day: MON, order: 2 })];

  test('moves a card down', () => {
    assert.deepEqual(planSameDayReorder(day, { day: MON, from: 0, to: 2 }).map(t => t.id), [2, 3, 1]);
  });

  test('moves a card up', () => {
    assert.deepEqual(planSameDayReorder(day, { day: MON, from: 2, to: 0 }).map(t => t.id), [3, 1, 2]);
  });

  test('reports no work when the card lands where it started', () => {
    assert.equal(planSameDayReorder(day, { day: MON, from: 1, to: 1 }), null);
  });

  test('reports no work when the source index is not in the day', () => {
    assert.equal(planSameDayReorder(day, { day: MON, from: 7, to: 0 }), null);
  });
});

test.describe('planCrossDayDrop', () => {
  const board = [
    todo(1, { day: MON, order: 0 }),
    todo(2, { day: TUE, order: 0 }),
    todo(3, { day: TUE, order: 1 }),
  ];

  test('inserts the dragged card at the drop index', () => {
    const next = planCrossDayDrop(board, { todoId: 1, toDay: TUE, index: 1 });
    assert.deepEqual(next.map(t => t.id), [2, 1, 3]);
  });

  test('the inserted card carries its new day', () => {
    const next = planCrossDayDrop(board, { todoId: 1, toDay: TUE, index: 0 });
    assert.equal(next[0].day_assigned, TUE);
  });

  test('appends when the drop index is past the end', () => {
    const next = planCrossDayDrop(board, { todoId: 1, toDay: TUE, index: 99 });
    assert.deepEqual(next.map(t => t.id), [2, 3, 1]);
  });

  test('never lists the dragged card twice when it returns to its own day', () => {
    const next = planCrossDayDrop(board, { todoId: 2, toDay: TUE, index: 1 });
    assert.deepEqual(next.map(t => t.id), [3, 2]);
  });

  // A drag that outlives the todo it moved must not splice undefined into a day.
  test('reports no work for an unknown id', () => {
    assert.equal(planCrossDayDrop(board, { todoId: 404, toDay: TUE, index: 0 }), null);
  });
});

test.describe('order item payloads', () => {
  test('numbers the new order from zero', () => {
    assert.deepEqual(toOrderItems([todo(7), todo(4)]), [
      { id: 7, planner_order: 0 },
      { id: 4, planner_order: 1 },
    ]);
  });

  test('snapshots the positions the same todos held before the move', () => {
    const board = [todo(7, { day: MON, order: 3 }), todo(4, { day: MON, order: 1 })];
    assert.deepEqual(snapshotOrderItems(board, [todo(7), todo(4)]), [
      { id: 7, planner_order: 3 },
      { id: 4, planner_order: 1 },
    ]);
  });

  test('snapshots a todo that had no position as zero', () => {
    assert.deepEqual(snapshotOrderItems([todo(7, { day: MON })], [todo(7)]), [
      { id: 7, planner_order: 0 },
    ]);
  });

  test('applying order items leaves untouched todos alone', () => {
    const board = [todo(7, { day: MON, order: 0 }), todo(4, { day: TUE, order: 9 })];
    const next = applyOrderItems(board, [{ id: 7, planner_order: 5 }]);
    assert.deepEqual(next.map(t => t.planner_order), [5, 9]);
  });

  test('assignDayLocal moves exactly one todo', () => {
    const board = [todo(7, { day: MON }), todo(4, { day: MON })];
    assert.deepEqual(assignDayLocal(board, 7, TUE).map(t => t.day_assigned), [TUE, MON]);
  });
});

test.describe('composeReverts', () => {
  test('returns null when there is nothing to undo', () => {
    assert.equal(composeReverts([null, undefined]), null);
  });

  test('returns the single revert unwrapped', () => {
    const only = async () => {};
    assert.equal(composeReverts([only]), only);
  });

  test('applies reverts newest first', async () => {
    const seen = [];
    await composeReverts([() => seen.push('first'), () => seen.push('second')])();
    assert.deepEqual(seen, ['second', 'first']);
  });

  test('waits for each revert before starting the next', async () => {
    const seen = [];
    const slow = () => new Promise(resolve => setTimeout(() => { seen.push('slow'); resolve(); }, 5));
    await composeReverts([() => seen.push('fast'), slow])();
    assert.deepEqual(seen, ['slow', 'fast']);
  });
});

// The reported bug, reproduced against the same single-slot store the app uses:
// a cross-day drag issues an assign and a reorder, and whichever records its
// undo last wins. Composing them into one entry is the fix.
test.describe('undo after a cross-day drag', () => {
  function singleSlotUndoStore() {
    let pending = null;
    return {
      record(fn) { if (fn) pending = fn; },
      async run() { const fn = pending; pending = null; if (fn) await fn(); },
    };
  }

  function dragCardToOtherDay({ compose }) {
    let board = [
      todo(1, { day: MON, order: 0 }),
      todo(2, { day: MON, order: 1 }),
      todo(3, { day: TUE, order: 0 }),
    ];
    const undoStore = singleSlotUndoStore();

    const movedId = 1;
    const previousDay = board.find(t => t.id === movedId).day_assigned;
    const newOrder = planCrossDayDrop(board, { todoId: movedId, toDay: TUE, index: 0 });
    const previousItems = snapshotOrderItems(board, newOrder);

    board = assignDayLocal(board, movedId, TUE);
    const revertDay = () => { board = assignDayLocal(board, movedId, previousDay); };

    board = applyOrderItems(board, toOrderItems(newOrder));
    const revertOrder = () => { board = applyOrderItems(board, previousItems); };

    if (compose) {
      undoStore.record(composeReverts([revertDay, revertOrder]));
    } else {
      undoStore.record(revertDay);
      undoStore.record(revertOrder);
    }

    return { board: () => board, undo: () => undoStore.run() };
  }

  test('the drag itself moves the card to the head of the new day', async () => {
    const drag = dragCardToOtherDay({ compose: true });
    assert.deepEqual(todosForDay(drag.board(), TUE).map(t => t.id), [1, 3]);
  });

  test('recording each write separately loses the day restore', async () => {
    const drag = dragCardToOtherDay({ compose: false });
    await drag.undo();
    assert.equal(drag.board().find(t => t.id === 1).day_assigned, TUE);
  });

  test('one composed entry restores the original day', async () => {
    const drag = dragCardToOtherDay({ compose: true });
    await drag.undo();
    assert.equal(drag.board().find(t => t.id === 1).day_assigned, MON);
  });

  test('one composed entry restores the original position', async () => {
    const drag = dragCardToOtherDay({ compose: true });
    await drag.undo();
    assert.deepEqual(todosForDay(drag.board(), MON).map(t => t.id), [1, 2]);
  });

  test('the day the card was dropped on is left as it was', async () => {
    const drag = dragCardToOtherDay({ compose: true });
    await drag.undo();
    assert.deepEqual(todosForDay(drag.board(), TUE).map(t => t.id), [3]);
  });
});

// Dividers live in their own table but are normalised into the same shape a
// todo has, so the three planners above operate on a merged array unchanged.
// These cases exist to keep that reuse honest: a change to plannerMutations
// that started reading a todo-only field would break here first.
test.describe('merged todo and divider items', () => {
  const divider = (id, { day = null, order = null } = {}) =>
    ({ id: `divider-${id}`, dividerId: id, kind: 'divider', day_assigned: day, planner_order: order });

  test('a divider takes an ordinal between two cards', () => {
    const board = [todo(1, { day: MON, order: 0 }), divider(5, { day: MON, order: 1 }), todo(2, { day: MON, order: 2 })];
    assert.deepEqual(todosForDay(board, MON).map(i => i.id), [1, 'divider-5', 2]);
  });

  test('dragging a card past a divider reorders across both kinds', () => {
    const board = [todo(1, { day: MON, order: 0 }), divider(5, { day: MON, order: 1 }), todo(2, { day: MON, order: 2 })];
    const next = planSameDayReorder(board, { day: MON, from: 2, to: 0 });
    assert.deepEqual(next.map(i => i.id), [2, 1, 'divider-5']);
  });

  test('dragging the divider itself is the same operation', () => {
    const board = [todo(1, { day: MON, order: 0 }), todo(2, { day: MON, order: 1 }), divider(5, { day: MON, order: 2 })];
    const next = planSameDayReorder(board, { day: MON, from: 2, to: 1 });
    assert.deepEqual(next.map(i => i.id), [1, 'divider-5', 2]);
  });

  test('a divider dropped on another day keeps its kind and row id', () => {
    const board = [divider(5, { day: MON, order: 0 }), todo(3, { day: TUE, order: 0 })];
    const next = planCrossDayDrop(board, { todoId: 'divider-5', toDay: TUE, index: 0 });
    assert.deepEqual(next[0], { id: 'divider-5', dividerId: 5, kind: 'divider', day_assigned: TUE, planner_order: 0 });
  });

  test('a divider dropped on another day lands at the requested index', () => {
    const board = [divider(5, { day: MON, order: 0 }), todo(3, { day: TUE, order: 0 }), todo(4, { day: TUE, order: 1 })];
    const next = planCrossDayDrop(board, { todoId: 'divider-5', toDay: TUE, index: 1 });
    assert.deepEqual(next.map(i => i.id), [3, 'divider-5', 4]);
  });

  test('a copy is spliced in at the drop index without disturbing its source', () => {
    const dayBefore = [todo(3, { day: TUE, order: 0 }), todo(4, { day: TUE, order: 1 })];
    const copy = todo(9, { day: TUE });
    const next = [...dayBefore.slice(0, 1), copy, ...dayBefore.slice(1)];
    assert.deepEqual(toOrderItems(next), [
      { id: 3, planner_order: 0 },
      { id: 9, planner_order: 1 },
      { id: 4, planner_order: 2 },
    ]);
  });
});
