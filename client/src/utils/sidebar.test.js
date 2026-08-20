import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSidebar } from './sidebar.js';

const WEEK = ['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21', '2026-08-22', '2026-08-23'];

const todo = (id, { day = null, created = '2026-08-01T00:00:00.000Z' } = {}) =>
  ({ id, day_assigned: day, created_at: created });

test.describe('buildSidebar', () => {
  test('keeps an unassigned todo', () => {
    const items = [todo(1)];
    assert.deepEqual(buildSidebar(items, WEEK).map(t => t.id), [1]);
  });

  test('keeps a todo assigned inside the visible week', () => {
    const items = [todo(1, { day: '2026-08-19' })];
    assert.deepEqual(buildSidebar(items, WEEK).map(t => t.id), [1]);
  });

  // The reported bug: a task two weeks back is dropped by the planner's own
  // date filter, so showing it here claimed an assignment the user could not see.
  test('drops a todo assigned outside the visible week', () => {
    const items = [todo(1, { day: '2026-08-05' })];
    assert.deepEqual(buildSidebar(items, WEEK), []);
  });

  test('drops a todo assigned to a future week that is not on screen', () => {
    const items = [todo(1, { day: '2026-09-14' })];
    assert.deepEqual(buildSidebar(items, WEEK), []);
  });

  test('orders unassigned before assigned', () => {
    const items = [todo(1, { day: '2026-08-19' }), todo(2)];
    assert.deepEqual(buildSidebar(items, WEEK).map(t => t.id), [2, 1]);
  });

  test('sorts unassigned newest first', () => {
    const items = [
      todo(1, { created: '2026-08-01T00:00:00.000Z' }),
      todo(2, { created: '2026-08-09T00:00:00.000Z' }),
    ];
    assert.deepEqual(buildSidebar(items, WEEK).map(t => t.id), [2, 1]);
  });

  test('sorts assigned by the day they sit on', () => {
    const items = [todo(1, { day: '2026-08-21' }), todo(2, { day: '2026-08-18' })];
    assert.deepEqual(buildSidebar(items, WEEK).map(t => t.id), [2, 1]);
  });

  test('an empty visible week leaves only the unassigned backlog', () => {
    const items = [todo(1), todo(2, { day: '2026-08-19' })];
    assert.deepEqual(buildSidebar(items, []).map(t => t.id), [1]);
  });
});

test.describe('buildSidebar stranded set', () => {
  test('reports a todo the planner cannot reach', () => {
    const items = [todo(1, { day: '2026-08-05' })];
    assert.deepEqual(buildSidebar(items, WEEK, { stranded: true }).map(t => t.id), [1]);
  });

  test('never reports an unassigned todo as stranded', () => {
    assert.deepEqual(buildSidebar([todo(1)], WEEK, { stranded: true }), []);
  });

  test('never reports a visible assignment as stranded', () => {
    const items = [todo(1, { day: '2026-08-19' })];
    assert.deepEqual(buildSidebar(items, WEEK, { stranded: true }), []);
  });

  test('sorts stranded todos oldest day first', () => {
    const items = [todo(1, { day: '2026-08-05' }), todo(2, { day: '2026-07-28' })];
    assert.deepEqual(buildSidebar(items, WEEK, { stranded: true }).map(t => t.id), [2, 1]);
  });

  test('the two views together account for every todo exactly once', () => {
    const items = [todo(1), todo(2, { day: '2026-08-19' }), todo(3, { day: '2026-08-05' })];
    const shown = buildSidebar(items, WEEK).map(t => t.id);
    const stranded = buildSidebar(items, WEEK, { stranded: true }).map(t => t.id);
    assert.deepEqual([...shown, ...stranded].sort(), [1, 2, 3]);
  });
});
