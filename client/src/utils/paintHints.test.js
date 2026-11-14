import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  THEME_HINT_KEY, EXAM_HINT_KEY, saveThemeHint, saveExamHint, loadExamHint, skeletonBoardScroll,
} from './paintHints.js';

const memoryStore = () => {
  const map = new Map();
  return { map, setItem: (k, v) => map.set(k, v), getItem: k => (map.has(k) ? map.get(k) : null) };
};
const blocked = { setItem() { throw new Error('blocked'); }, getItem() { throw new Error('blocked'); } };

test.describe('saveThemeHint', () => {
  test('stores the theme preference under the hint key', () => {
    const store = memoryStore();
    saveThemeHint('light', store);
    assert.equal(store.map.get(THEME_HINT_KEY), 'light');
  });

  // 'system' is stored as-is so the boot script resolves it against the OS of
  // the next visit, not the OS of this one.
  test('stores system unresolved', () => {
    const store = memoryStore();
    saveThemeHint('system', store);
    assert.equal(store.map.get(THEME_HINT_KEY), 'system');
  });

  test('reports false when storage throws', () => {
    assert.equal(saveThemeHint('dark', blocked), false);
  });
});

test.describe('exam hint', () => {
  test('round-trips an exam pill', () => {
    const store = memoryStore();
    saveExamHint(true, store);
    assert.equal(loadExamHint(store), true);
  });

  test('round-trips a plain exam button', () => {
    const store = memoryStore();
    saveExamHint(false, store);
    assert.equal(loadExamHint(store), false);
  });

  test('defaults to the plain button when nothing is stored', () => {
    assert.equal(loadExamHint(memoryStore()), false);
  });

  test('defaults to the plain button when storage throws', () => {
    assert.equal(loadExamHint(blocked), false);
  });
});

test.describe('skeletonBoardScroll', () => {
  const board = { columnLefts: [0, 192, 384, 576, 768, 960, 1152], maxScroll: 260 };

  test("scrolls to today's column, clamped to the board", () => {
    assert.equal(skeletonBoardScroll({ ...board, todayIndex: 5, saved: null }), 260);
  });

  test("puts an early day's column at the left edge", () => {
    assert.equal(skeletonBoardScroll({ ...board, todayIndex: 1, saved: null }), 192);
  });

  test('restores the position saved for the current week', () => {
    assert.equal(skeletonBoardScroll({ ...board, todayIndex: 5, saved: { weekOffset: 0, scrollLeft: 40 } }), 40);
  });

  test('starts at the left for a saved next week', () => {
    assert.equal(skeletonBoardScroll({ ...board, todayIndex: 5, saved: { weekOffset: 1, scrollLeft: 99 } }), 0);
  });

  test('ends at the right for a saved previous week', () => {
    assert.equal(skeletonBoardScroll({ ...board, todayIndex: 1, saved: { weekOffset: -1, scrollLeft: 0 } }), 260);
  });
});

test.describe('paint-boot.js', () => {
  const boot = readFileSync(new URL('../../public/paint-boot.js', import.meta.url), 'utf8');

  test('reads the theme key the app writes', () => {
    assert.ok(boot.includes(`'${THEME_HINT_KEY}'`));
  });

  test('reads the exam key the app writes', () => {
    assert.ok(boot.includes(`'${EXAM_HINT_KEY}'`));
  });
});
