import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RECURRENCE_OPTIONS, emptyTaskForm, formFromTodo, validateTaskForm, buildTaskPayload, plainToRichText,
} from './taskForm.js';

const base = { title: ' Read ', description: '', listId: '2', day: '', approxTime: '', recurrence: '' };

test.describe('RECURRENCE_OPTIONS', () => {
  test('mirrors the planner form choices', () => {
    assert.deepEqual(RECURRENCE_OPTIONS.map(o => o.value), ['', '1', '2', '3', '4', '5', '6', '7', 'weekdays', 'weekends']);
  });
});

test.describe('emptyTaskForm', () => {
  test('defaults to the first list', () => {
    assert.equal(emptyTaskForm([{ id: 4 }, { id: 5 }]).listId, '4');
  });
});

test.describe('formFromTodo', () => {
  test('reads fields back into form strings', () => {
    const todo = { title: 'A', description: 'x<br>y', list_id: 3, day_assigned: '2026-11-18', approx_time: '30 min',
      recurrence_interval_days: 7, recurrence_pattern: null };
    assert.deepEqual(formFromTodo(todo), { title: 'A', description: 'x\ny', listId: '3', day: '2026-11-18', approxTime: '30m', recurrence: '7' });
  });

  test('reads a pattern recurrence', () => {
    assert.equal(formFromTodo({ title: 'A', list_id: 1, recurrence_pattern: 'weekdays' }).recurrence, 'weekdays');
  });

  test('tolerates null fields', () => {
    assert.deepEqual(formFromTodo({ title: 'A', list_id: 1, description: null, day_assigned: null, approx_time: null }),
      { title: 'A', description: '', listId: '1', day: '', approxTime: '', recurrence: '' });
  });
});

test.describe('validateTaskForm', () => {
  test('accepts a minimal form', () => {
    assert.equal(validateTaskForm(base), null);
  });

  test('requires a title', () => {
    assert.match(validateTaskForm({ ...base, title: '  ' }), /Title/);
  });

  test('requires a list', () => {
    assert.match(validateTaskForm({ ...base, listId: '' }), /list/i);
  });

  test('rejects a malformed day', () => {
    assert.match(validateTaskForm({ ...base, day: '2026-02-30' }), /Day/);
  });

  test('rejects a malformed approx time', () => {
    assert.match(validateTaskForm({ ...base, approxTime: 'soon' }), /time/i);
  });

  test('accepts hours and minutes', () => {
    assert.equal(validateTaskForm({ ...base, approxTime: '2h' }), null);
  });

  test('a repeat needs a day', () => {
    assert.match(validateTaskForm({ ...base, recurrence: '7' }), /day/i);
  });

  test('a repeat with a day is fine', () => {
    assert.equal(validateTaskForm({ ...base, recurrence: '7', day: '2026-11-18' }), null);
  });
});

test.describe('buildTaskPayload', () => {
  test('trims the title and nulls empty optionals', () => {
    assert.deepEqual(buildTaskPayload(base), {
      title: 'Read', description: '', list_id: 2, day_assigned: null, approx_time: null,
      recurrence_interval_days: null, recurrence_pattern: null,
    });
  });

  test('maps a numeric recurrence to interval days', () => {
    const payload = buildTaskPayload({ ...base, day: '2026-11-18', recurrence: '3' });
    assert.deepEqual([payload.recurrence_interval_days, payload.recurrence_pattern], [3, null]);
  });

  test('maps weekdays to a pattern', () => {
    const payload = buildTaskPayload({ ...base, day: '2026-11-18', recurrence: 'weekdays' });
    assert.deepEqual([payload.recurrence_interval_days, payload.recurrence_pattern], [null, 'weekdays']);
  });

  test('lowercases the approx time', () => {
    assert.equal(buildTaskPayload({ ...base, approxTime: ' 30M ' }).approx_time, '30m');
  });

  test('converts description line breaks', () => {
    assert.equal(buildTaskPayload({ ...base, description: 'a\nb' }).description, 'a<br>b');
  });
});

test.describe('plainToRichText', () => {
  test('escapes angle brackets typed as text', () => {
    assert.equal(plainToRichText('1 < 2'), '1 &lt; 2');
  });

  test('returns empty for blank input', () => {
    assert.equal(plainToRichText('  \n '), '');
  });
});
