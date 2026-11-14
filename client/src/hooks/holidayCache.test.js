import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isStale, readCachedYear, REFRESH_AFTER_MS, writeCachedYear } from './holidayCache.js';

const memoryStorage = () => {
  const map = new Map();
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), map };
};
const holidays = [{ date: '2026-01-01', localName: 'Neujahr', counties: null }];
const silenced = fn => {
  const original = console.warn;
  console.warn = () => {};
  try { return fn(); } finally { console.warn = original; }
};

describe('holiday cache', () => {
  it('round-trips a stored year', () => {
    const storage = memoryStorage();
    writeCachedYear('DE', 2026, holidays, 1000, storage);
    assert.deepEqual(readCachedYear('DE', 2026, storage), { fetchedAt: 1000, holidays });
  });

  it('keys entries by country and year under the uniPlanner prefix', () => {
    const storage = memoryStorage();
    writeCachedYear('DE', 2026, holidays, 1000, storage);
    assert.deepEqual([...storage.map.keys()], ['uniPlanner.holidays.DE.2026']);
  });

  it('does not serve another country or year', () => {
    const storage = memoryStorage();
    writeCachedYear('DE', 2026, holidays, 1000, storage);
    assert.deepEqual([readCachedYear('AT', 2026, storage), readCachedYear('DE', 2027, storage)], [null, null]);
  });

  it('treats corrupt JSON as a miss', () => {
    const storage = memoryStorage();
    storage.setItem('uniPlanner.holidays.DE.2026', '{nope');
    assert.equal(silenced(() => readCachedYear('DE', 2026, storage)), null);
  });

  it('treats a wrongly shaped entry as a miss', () => {
    const storage = memoryStorage();
    storage.setItem('uniPlanner.holidays.DE.2026', JSON.stringify({ fetchedAt: 'x', holidays: {} }));
    assert.equal(readCachedYear('DE', 2026, storage), null);
  });

  it('survives storage that throws on read and write', () => {
    const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); } };
    const outcome = silenced(() => [readCachedYear('DE', 2026, broken), writeCachedYear('DE', 2026, holidays, 1, broken)]);
    assert.deepEqual(outcome, [null, undefined]);
  });

  it('survives a missing storage object', () => {
    assert.equal(silenced(() => readCachedYear('DE', 2026, undefined)), null);
  });
});

describe('isStale', () => {
  const entry = { fetchedAt: 1000, holidays };
  it('is fresh within a day', () => assert.equal(isStale(entry, 1000 + REFRESH_AFTER_MS - 1), false));
  it('is stale after a day', () => assert.equal(isStale(entry, 1000 + REFRESH_AFTER_MS), true));
  it('is stale when missing', () => assert.equal(isStale(null, 1000), true));
  it('is stale when stamped in the future', () => assert.equal(isStale(entry, 500), true));
});
