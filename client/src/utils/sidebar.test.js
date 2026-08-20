import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSidebar } from './sidebar.js';

const todo = (id, { day = null, created = '2026-08-01T00:00:00.000Z' } = {}) =>
  ({ id, day_assigned: day, created_at: created });

test.describe('buildSidebar', () => {
  test('keeps an unassigned todo', () => {
    assert.deepEqual(buildSidebar([todo(1)]).map(t => t.id), [1]);
  });

  test('keeps a todo assigned inside the current week', () => {
    assert.deepEqual(buildSidebar([todo(1, { day: '2026-08-19' })]).map(t => t.id), [1]);
  });

  // Previously these were held back and shown in a separate row. One list now,
  // no special case for the week the item happens to fall in.
  test('keeps a todo assigned to an earlier week the arrows cannot reach', () => {
    assert.deepEqual(buildSidebar([todo(1, { day: '2026-08-05' })]).map(t => t.id), [1]);
  });

  test('keeps a todo assigned to a far future week', () => {
    assert.deepEqual(buildSidebar([todo(1, { day: '2026-09-14' })]).map(t => t.id), [1]);
  });

  test('orders unassigned before assigned', () => {
    const items = [todo(1, { day: '2026-08-19' }), todo(2)];
    assert.deepEqual(buildSidebar(items).map(t => t.id), [2, 1]);
  });

  test('sorts unassigned newest first', () => {
    const items = [
      todo(1, { created: '2026-08-01T00:00:00.000Z' }),
      todo(2, { created: '2026-08-09T00:00:00.000Z' }),
    ];
    assert.deepEqual(buildSidebar(items).map(t => t.id), [2, 1]);
  });

  test('sorts assigned by the day they sit on, oldest first', () => {
    const items = [todo(1, { day: '2026-08-21' }), todo(2, { day: '2026-08-18' })];
    assert.deepEqual(buildSidebar(items).map(t => t.id), [2, 1]);
  });

  test('an out-of-week assignment sorts among the others by date, not to the end', () => {
    const items = [todo(1, { day: '2026-08-21' }), todo(2, { day: '2026-07-01' })];
    assert.deepEqual(buildSidebar(items).map(t => t.id), [2, 1]);
  });

  // The invariant that replaces the old two-view split: one call now has to
  // account for every todo, because there is nowhere else for one to be.
  test('accounts for every todo exactly once', () => {
    const items = [todo(1), todo(2, { day: '2026-08-19' }), todo(3, { day: '2026-08-05' })];
    assert.deepEqual(buildSidebar(items).map(t => t.id).sort(), [1, 2, 3]);
  });

  test('returns an empty list for no todos', () => {
    assert.deepEqual(buildSidebar([]), []);
  });
});
