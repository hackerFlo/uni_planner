import test from 'node:test';
import assert from 'node:assert/strict';

import { advanceFresh, expireFresh, INITIAL_FRESH_STATE, FRESH_WINDOW_MS, EMPTY_IDS } from './freshIds.js';

const NOW = Date.parse('2026-05-01T10:00:00.000Z');
const SECONDS = 1000;
const todoCreated = (id, msAgo) => ({ id, created_at: new Date(NOW - msAgo).toISOString() });
const OLD = 30 * 24 * 3600 * SECONDS;

test.describe('advanceFresh', () => {
  test('marks nothing fresh on the first observation, however recent', () => {
    const state = advanceFresh(INITIAL_FRESH_STATE, [todoCreated(1, SECONDS)], NOW);
    assert.equal(state.fresh.size, 0);
  });

  test('records the first observation as seen', () => {
    const state = advanceFresh(INITIAL_FRESH_STATE, [todoCreated(1, OLD), todoCreated(2, OLD)], NOW);
    assert.deepEqual([...state.seen], [1, 2]);
  });

  test('marks a newly appearing, recently created todo fresh', () => {
    const first = advanceFresh(INITIAL_FRESH_STATE, [todoCreated(1, OLD)], NOW);
    const next = advanceFresh(first, [todoCreated(1, OLD), todoCreated(2, SECONDS)], NOW);
    assert.deepEqual([...next.fresh], [2]);
  });

  test('does not mark an old todo that merely appears, such as one dragged onto a day', () => {
    const first = advanceFresh(INITIAL_FRESH_STATE, [], NOW);
    const next = advanceFresh(first, [todoCreated(7, OLD)], NOW);
    assert.equal(next.fresh.size, 0);
  });

  test('does not mark a todo created just outside the window', () => {
    const first = advanceFresh(INITIAL_FRESH_STATE, [], NOW);
    const next = advanceFresh(first, [todoCreated(3, FRESH_WINDOW_MS + 1)], NOW);
    assert.equal(next.fresh.size, 0);
  });

  test('returns the identical state when nothing new appeared', () => {
    const first = advanceFresh(INITIAL_FRESH_STATE, [todoCreated(1, OLD)], NOW);
    assert.equal(advanceFresh(first, [todoCreated(1, OLD)], NOW), first);
  });

  test('never re-flags an id that was already seen', () => {
    const first = advanceFresh(INITIAL_FRESH_STATE, [], NOW);
    const second = advanceFresh(first, [todoCreated(2, SECONDS)], NOW);
    const cleared = expireFresh(second);
    assert.equal(advanceFresh(cleared, [todoCreated(2, SECONDS)], NOW).fresh.size, 0);
  });

  test('ignores a todo without a parseable created_at', () => {
    const first = advanceFresh(INITIAL_FRESH_STATE, [], NOW);
    assert.equal(advanceFresh(first, [{ id: 9 }], NOW).fresh.size, 0);
  });
});

test.describe('expireFresh', () => {
  test('empties the fresh set but keeps what was seen', () => {
    const first = advanceFresh(INITIAL_FRESH_STATE, [], NOW);
    const second = advanceFresh(first, [todoCreated(2, SECONDS)], NOW);
    const cleared = expireFresh(second);
    assert.deepEqual([cleared.fresh, [...cleared.seen]], [EMPTY_IDS, [2]]);
  });

  test('returns the same state when nothing is fresh', () => {
    assert.equal(expireFresh(INITIAL_FRESH_STATE), INITIAL_FRESH_STATE);
  });
});
