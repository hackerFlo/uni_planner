import test from 'node:test';
import assert from 'node:assert/strict';

import { onlineAfterEvent, readOnline } from './connectivity.js';

test.describe('readOnline', () => {
  test('is false only when the browser says offline', () => assert.equal(readOnline({ onLine: false }), false));
  test('is true when online', () => assert.equal(readOnline({ onLine: true }), true));
  test('assumes online without a navigator', () => assert.equal(readOnline(undefined), true));
});

test.describe('onlineAfterEvent', () => {
  test('goes offline on the offline event', () => assert.equal(onlineAfterEvent('offline', true), false));
  test('comes back on the online event', () => assert.equal(onlineAfterEvent('online', false), true));
  test('keeps the state on an unrelated event', () => assert.equal(onlineAfterEvent('focus', false), false));
});
