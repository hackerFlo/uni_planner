import test from 'node:test';
import assert from 'node:assert/strict';

import { ApiError, KINDS } from '../api/errors.js';
import { okStatus, failStatus, INITIAL_STATUS } from './status.js';

test.describe('okStatus', () => {
  test('prefixes a check mark', () => {
    assert.deepEqual(okStatus('Moved task 123 to Wed 2026-11-18'), { ok: true, text: '✓ Moved task 123 to Wed 2026-11-18' });
  });
});

test.describe('failStatus', () => {
  test('names the action, the cause and the request reference', () => {
    const error = new ApiError(KINDS.BAD_REQUEST, { status: 400, requestId: 'abc-1', message: 'Title is required' });
    assert.deepEqual(failStatus('move task 123', error), { ok: false, text: '✗ Could not move task 123: Title is required (ref abc-1)' });
  });

  test('omits the reference when there is none', () => {
    const error = new ApiError(KINDS.OFFLINE);
    assert.equal(failStatus('add task', error).text.includes('ref'), false);
  });

  test('never prints the message of a non-API error', () => {
    assert.equal(failStatus('add task', new TypeError('x is not a function')).text.includes('x is not'), false);
  });
});

test.describe('INITIAL_STATUS', () => {
  test('is neutral', () => {
    assert.equal(INITIAL_STATUS.ok, null);
  });
});
