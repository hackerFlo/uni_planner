import test from 'node:test';
import assert from 'node:assert/strict';

import { hasUnsavedChanges } from './todoForm.js';

const payload = (over = {}) => ({
  title: 'Read chapter 4',
  description: '',
  list_id: 3,
  day_assigned: null,
  approx_time: null,
  recurrence_interval_days: null,
  recurrence_pattern: null,
  ...over,
});

test.describe('hasUnsavedChanges', () => {
  test('an untouched form has nothing to lose', () => {
    assert.equal(hasUnsavedChanges(payload(), payload()), false);
  });

  test('an edited title counts as unsaved work', () => {
    assert.equal(hasUnsavedChanges(payload(), payload({ title: 'Read chapter 5' })), true);
  });

  test('typed description counts as unsaved work', () => {
    assert.equal(hasUnsavedChanges(payload(), payload({ description: '<b>notes</b>' })), true);
  });

  test('a newly picked day counts as unsaved work', () => {
    assert.equal(hasUnsavedChanges(payload(), payload({ day_assigned: '2026-08-20' })), true);
  });

  test('clearing a field that had a value counts as unsaved work', () => {
    const before = payload({ approx_time: '30m' });
    assert.equal(hasUnsavedChanges(before, payload({ approx_time: null })), true);
  });

  // The three spellings of "not set" reach the payload from different inputs;
  // treating them as different would make every untouched form look dirty.
  test('null, undefined and empty string all read as not set', () => {
    const before = { day_assigned: null, approx_time: undefined, recurrence_pattern: '' };
    const after = { day_assigned: '', approx_time: null, recurrence_pattern: undefined };
    assert.equal(hasUnsavedChanges(before, after), false);
  });

  test('a numeric id read back as text is not an edit', () => {
    assert.equal(hasUnsavedChanges(payload({ list_id: 3 }), payload({ list_id: '3' })), false);
  });

  test('a key present on only one side is compared, not skipped', () => {
    assert.equal(hasUnsavedChanges({ title: 'a' }, { title: 'a', description: 'x' }), true);
  });

  // Called before the mount effect has taken the snapshot: with nothing to
  // compare against, claiming unsaved work would block every close.
  test('reports nothing unsaved when no snapshot was taken', () => {
    assert.equal(hasUnsavedChanges(null, payload()), false);
  });
});
