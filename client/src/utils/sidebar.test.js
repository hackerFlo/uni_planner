import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSidebar, sidebarAssignment, sidebarDraggableId } from './sidebar.js';

const todo = (id, { day = null, created = '2026-08-01T00:00:00.000Z' } = {}) =>
  ({ id, day_assigned: day, created_at: created });
const TODAY = '2026-08-19';
const sidebar = items => buildSidebar(items, TODAY);

test.describe('buildSidebar', () => {
  test('keeps an unassigned todo', () => {
    assert.deepEqual(sidebar([todo(1)]).map(t => t.id), [1]);
  });

  test('keeps a todo assigned inside the current week', () => {
    assert.deepEqual(sidebar([todo(1, { day: '2026-08-19' })]).map(t => t.id), [1]);
  });

  test('hides a todo assigned to an earlier week the arrows cannot reach', () => {
    assert.deepEqual(sidebar([todo(1, { day: '2026-08-05' })]), []);
  });

  test('hides a todo assigned to a far future week', () => {
    assert.deepEqual(sidebar([todo(1, { day: '2026-09-14' })]), []);
  });

  test('orders unassigned before assigned', () => {
    const items = [todo(1, { day: '2026-08-19' }), todo(2)];
    assert.deepEqual(sidebar(items).map(t => t.id), [2, 1]);
  });

  test('sorts unassigned newest first', () => {
    const items = [
      todo(1, { created: '2026-08-01T00:00:00.000Z' }),
      todo(2, { created: '2026-08-09T00:00:00.000Z' }),
    ];
    assert.deepEqual(sidebar(items).map(t => t.id), [2, 1]);
  });

  test('sorts assigned by the day they sit on, oldest first', () => {
    const items = [todo(1, { day: '2026-08-21' }), todo(2, { day: '2026-08-18' })];
    assert.deepEqual(sidebar(items).map(t => t.id), [2, 1]);
  });

  test('a reachable previous-week assignment sorts among the others by date', () => {
    const items = [todo(1, { day: '2026-08-21' }), todo(2, { day: '2026-08-10' })];
    assert.deepEqual(sidebar(items).map(t => t.id), [2, 1]);
  });

  test('includes every backlog or reachable task exactly once', () => {
    const items = [todo(1), todo(2, { day: '2026-08-19' }), todo(3, { day: '2026-08-05' })];
    assert.deepEqual(sidebar(items).map(t => t.id), [1, 2]);
  });

  test('returns an empty list for no todos', () => {
    assert.deepEqual(sidebar([]), []);
  });

  test('keeps both inclusive boundaries and hides their adjacent days', () => {
    const items = ['2026-08-09', '2026-08-10', '2026-08-30', '2026-08-31'].map((day, id) => todo(id, { day }));
    assert.deepEqual(sidebar(items).map(t => t.id), [1, 2]);
  });

  test('removes expired assignments when the calendar rolls into Monday', () => {
    const items = [todo(1), todo(2, { day: '2026-08-10' })];
    assert.deepEqual(buildSidebar(items, '2026-08-23').map(t => t.id), [1, 2]);
    assert.deepEqual(buildSidebar(items, '2026-08-24').map(t => t.id), [1]);
  });
});

test.describe('sidebarDraggableId', () => {
  test('prefixes an assigned todo, whose day column already holds the raw id', () => {
    assert.equal(sidebarDraggableId(todo(1, { day: '2026-08-19' })), 'sidebar-1');
  });

  test('leaves an unassigned todo on its bare id', () => {
    assert.equal(sidebarDraggableId(todo(1)), '1');
  });
});

test.describe('sidebarAssignment', () => {
  const today = '2026-08-19';

  test('leaves an unassigned task without an assignment label', () => {
    assert.deepEqual(sidebarAssignment(null, today), { inWindow: false, label: '' });
  });

  for (const [day, label] of [
    ['2026-08-10', 'Mon'], ['2026-08-16', 'Sun'],
    ['2026-08-19', 'Wed'], ['2026-08-24', 'Mon'], ['2026-08-30', 'Sun'],
  ]) {
    test(`dims reachable assignment ${day} and shows its weekday`, () => {
      assert.deepEqual(sidebarAssignment(day, today), { inWindow: true, label });
    });
  }

  for (const day of ['2026-08-09', '2026-08-31', '2026-07-01', '2027-08-19']) {
    test(`keeps unreachable assignment ${day} at full emphasis with an explicit date`, () => {
      assert.deepEqual(sidebarAssignment(day, today), { inWindow: false, label: day });
    });
  }

  test('updates the window when Sunday rolls over to Monday', () => {
    assert.equal(sidebarAssignment('2026-08-10', '2026-08-23').inWindow, true);
    assert.equal(sidebarAssignment('2026-08-10', '2026-08-24').inWindow, false);
    assert.equal(sidebarAssignment('2026-09-06', '2026-08-23').inWindow, false);
    assert.equal(sidebarAssignment('2026-09-06', '2026-08-24').inWindow, true);
  });

  test('uses calendar weeks across a year boundary', () => {
    assert.equal(sidebarAssignment('2026-12-20', '2026-12-31').inWindow, false);
    assert.equal(sidebarAssignment('2026-12-21', '2026-12-31').inWindow, true);
    assert.equal(sidebarAssignment('2027-01-10', '2026-12-31').inWindow, true);
    assert.equal(sidebarAssignment('2027-01-11', '2026-12-31').inWindow, false);
  });

  test('uses calendar boundaries through the autumn daylight saving change', () => {
    assert.equal(sidebarAssignment('2026-10-18', '2026-10-25').inWindow, true);
    assert.equal(sidebarAssignment('2026-11-01', '2026-10-25').inWindow, true);
    assert.equal(sidebarAssignment('2026-11-02', '2026-10-25').inWindow, false);
  });

  test('hides an unreachable task without mutating its stored assignment', () => {
    const item = Object.freeze(todo(1, { day: '2026-08-05' }));
    sidebarAssignment(item.day_assigned, today);
    assert.deepEqual(sidebar([item]), []);
    assert.equal(item.day_assigned, '2026-08-05');
    assert.equal(sidebarDraggableId(item), 'sidebar-1');
  });
});
