import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_PREFERENCES, normalizePreferences, resolveTheme,
  loadPreferences, savePreferences, PREFS_KEY,
} from './preferences.js';

const fakeStore = (initial = {}) => {
  const data = { ...initial };
  return {
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = v; },
    _data: data,
  };
};

test.describe('normalizePreferences', () => {
  test('fills in every default from nothing', () => {
    assert.deepEqual(normalizePreferences(undefined), { ...DEFAULT_PREFERENCES });
  });

  test('keeps a valid stored theme', () => {
    assert.equal(normalizePreferences({ theme: 'dark' }).theme, 'dark');
  });

  test('falls back on a theme this version does not know', () => {
    assert.equal(normalizePreferences({ theme: 'solarized' }).theme, DEFAULT_PREFERENCES.theme);
  });

  test('falls back on a density this version does not know', () => {
    assert.equal(normalizePreferences({ density: 'tiny' }).density, 'comfortable');
  });

  test('rejects a non-boolean reduceMotion', () => {
    assert.equal(normalizePreferences({ reduceMotion: 'yes' }).reduceMotion, false);
  });

  test('accepts a two-letter country code', () => {
    assert.equal(normalizePreferences({ holidayCountry: 'AT' }).holidayCountry, 'AT');
  });

  test('rejects a country code that is not one', () => {
    assert.equal(normalizePreferences({ holidayCountry: 'Austria' }).holidayCountry, 'DE');
  });

  test('accepts a subdivision code', () => {
    assert.equal(normalizePreferences({ holidaySubdivision: 'DE-BY' }).holidaySubdivision, 'DE-BY');
  });

  // "whole country" is a real choice and has to be storable, but it must be said
  // explicitly -- an absent key means an older blob, which keeps the default.
  test('an empty subdivision means the whole country', () => {
    assert.equal(normalizePreferences({ holidayCountry: 'AT', holidaySubdivision: '' }).holidaySubdivision, null);
  });

  test('an absent subdivision keeps the default region', () => {
    assert.equal(normalizePreferences({ theme: 'dark' }).holidaySubdivision, DEFAULT_PREFERENCES.holidaySubdivision);
  });

  test('rejects a malformed subdivision', () => {
    assert.equal(normalizePreferences({ holidaySubdivision: 'Bavaria' }).holidaySubdivision, DEFAULT_PREFERENCES.holidaySubdivision);
  });

  test('drops keys it does not recognise', () => {
    assert.deepEqual(
      Object.keys(normalizePreferences({ theme: 'dark', mystery: 1 })).sort(),
      Object.keys(DEFAULT_PREFERENCES).sort()
    );
  });

  test('is idempotent', () => {
    const once = normalizePreferences({ theme: 'dark', density: 'compact' });
    assert.deepEqual(normalizePreferences(once), once);
  });
});

test.describe('loadPreferences', () => {
  test('returns defaults when nothing is stored', () => {
    assert.deepEqual(loadPreferences(fakeStore()), { ...DEFAULT_PREFERENCES });
  });

  test('reads back what was saved', () => {
    const store = fakeStore();
    savePreferences({ ...DEFAULT_PREFERENCES, theme: 'dark', density: 'compact' }, store);
    const loaded = loadPreferences(store);
    assert.equal(loaded.theme, 'dark');
    assert.equal(loaded.density, 'compact');
  });

  test('survives corrupted JSON rather than taking the app down', () => {
    assert.deepEqual(loadPreferences(fakeStore({ [PREFS_KEY]: '{not json' })), { ...DEFAULT_PREFERENCES });
  });

  test('survives a storage that throws, as in Safari private mode', () => {
    const hostile = { getItem() { throw new Error('denied'); } };
    assert.deepEqual(loadPreferences(hostile), { ...DEFAULT_PREFERENCES });
  });
});

test.describe('savePreferences', () => {
  test('reports success', () => {
    assert.equal(savePreferences(DEFAULT_PREFERENCES, fakeStore()), true);
  });

  test('reports failure instead of throwing when the store refuses', () => {
    const hostile = { setItem() { throw new Error('quota'); } };
    assert.equal(savePreferences(DEFAULT_PREFERENCES, hostile), false);
  });
});

test.describe('resolveTheme', () => {
  test('an explicit choice wins over the OS', () => {
    assert.equal(resolveTheme('light', true), 'light');
    assert.equal(resolveTheme('dark', false), 'dark');
  });

  test('system follows the OS', () => {
    assert.equal(resolveTheme('system', true), 'dark');
    assert.equal(resolveTheme('system', false), 'light');
  });
});
