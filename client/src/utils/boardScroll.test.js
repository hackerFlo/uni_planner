import test from 'node:test';
import assert from 'node:assert/strict';

import { saveBoardScroll, loadBoardScroll, sessionStore, BOARD_SCROLL_KEY } from './boardScroll.js';

const TODAY = '2026-05-01';
const memoryStorage = () => {
  const data = new Map();
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
};
const brokenStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('quota'); } };

test.describe('boardScroll', () => {
  test('restores what was saved the same day', () => {
    const storage = memoryStorage();
    saveBoardScroll(storage, { today: TODAY, weekOffset: 1, scrollLeft: 412.4 });
    assert.deepEqual(loadBoardScroll(storage, TODAY), { weekOffset: 1, scrollLeft: 412 });
  });

  test('ignores a position saved on an earlier day', () => {
    const storage = memoryStorage();
    saveBoardScroll(storage, { today: '2026-04-30', weekOffset: 0, scrollLeft: 100 });
    assert.equal(loadBoardScroll(storage, TODAY), null);
  });

  test('returns null when nothing was saved', () => {
    assert.equal(loadBoardScroll(memoryStorage(), TODAY), null);
  });

  test('returns null for corrupt JSON', () => {
    const storage = memoryStorage();
    storage.setItem(BOARD_SCROLL_KEY, '{nope');
    assert.equal(loadBoardScroll(storage, TODAY), null);
  });

  test('returns null for an out-of-range week offset', () => {
    const storage = memoryStorage();
    storage.setItem(BOARD_SCROLL_KEY, JSON.stringify({ today: TODAY, weekOffset: 9, scrollLeft: 5 }));
    assert.equal(loadBoardScroll(storage, TODAY), null);
  });

  test('survives storage that throws on read and write', () => {
    saveBoardScroll(brokenStorage, { today: TODAY, weekOffset: 0, scrollLeft: 1 });
    assert.equal(loadBoardScroll(brokenStorage, TODAY), null);
  });
});

test.describe('sessionStore', () => {
  // Blocked site data makes reading the property itself throw, before any
  // getItem call a try around the storage methods could catch.
  test('returns null when reading sessionStorage throws', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
    try { assert.equal(sessionStore(), null); }
    finally {
      if (original) Object.defineProperty(globalThis, 'sessionStorage', original);
      else delete globalThis.sessionStorage;
    }
  });

  test('a null store loads nothing and saving does not throw', () => {
    saveBoardScroll(null, { today: TODAY, weekOffset: 0, scrollLeft: 1 });
    assert.equal(loadBoardScroll(null, TODAY), null);
  });

  test('uses the uniPlanner key prefix shared by every stored setting', () => {
    assert.match(BOARD_SCROLL_KEY, /^uniPlanner\./);
  });
});
