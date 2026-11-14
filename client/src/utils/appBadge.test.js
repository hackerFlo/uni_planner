import test from 'node:test';
import assert from 'node:assert/strict';

import { applyBadge, countOpenToday } from './appBadge.js';

const TODAY = '2026-11-16';
const task = (day, extra = {}) => ({ day_assigned: day, ...extra });

test.describe('countOpenToday', () => {
  test('counts only open tasks assigned to today', () => {
    const todos = [task(TODAY), task(TODAY), task('2026-11-17'), task(null), task(TODAY, { completed: 1 }), task(TODAY, { archived: true })];
    assert.equal(countOpenToday(todos, TODAY), 2);
  });
});

test.describe('applyBadge', () => {
  const fake = () => { const calls = []; return { calls, setAppBadge: async n => { calls.push(['set', n]); }, clearAppBadge: async () => { calls.push(['clear']); } }; };

  test('sets the badge for a positive count', async () => {
    const nav = fake();
    await applyBadge(nav, 4);
    assert.deepEqual(nav.calls, [['set', 4]]);
  });

  test('clears the badge at zero', async () => {
    const nav = fake();
    await applyBadge(nav, 0);
    assert.deepEqual(nav.calls, [['clear']]);
  });

  test('does nothing where the Badging API is missing', async () => {
    await assert.doesNotReject(applyBadge({}, 2));
  });

  test('reports a rejected call instead of throwing', async () => {
    const errors = [];
    await applyBadge({ setAppBadge: async () => { throw new Error('denied'); } }, 1, e => errors.push(e.message));
    assert.deepEqual(errors, ['denied']);
  });
});
