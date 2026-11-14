import test from 'node:test';
import assert from 'node:assert/strict';

import {
  draftKey, serializeDraft, parseDraft, loadDraft, saveDraft, clearDraft,
  loadLastListId, saveLastListId, pickDefaultListId,
} from './todoDraft.js';

const fields = (over = {}) => ({
  title: 'Read chapter 4', description: '<b>notes</b>', listId: 3, dayAssigned: '2026-11-12',
  recurrence: '', approxTime: '30m', customTime: '', ...over,
});

const memoryStorage = () => {
  const data = new Map();
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k), data };
};
const throwingStorage = () => ({
  getItem() { throw new Error('denied'); },
  setItem() { throw new Error('denied'); },
  removeItem() { throw new Error('denied'); },
});

test.describe('draftKey', () => {
  test('an edit is keyed by the task id', () => {
    assert.notEqual(draftKey('edit', { id: 1 }, {}), draftKey('edit', { id: 2 }, {}));
  });

  test('a new item is keyed by its prefilled list and day', () => {
    assert.notEqual(draftKey('create', null, { day_assigned: '2026-11-12' }), draftKey('create', null, { day_assigned: '2026-11-13' }));
  });

  test('new and edit never share a key', () => {
    assert.notEqual(draftKey('create', null, {}), draftKey('edit', { id: 1 }, {}));
  });

  test('the same new-item target always maps to the same key', () => {
    assert.equal(draftKey('create', null, { list_id: 2 }), draftKey('create', null, { list_id: 2 }));
  });
});

test.describe('parseDraft', () => {
  test('round-trips what serializeDraft wrote', () => {
    assert.deepEqual(parseDraft(serializeDraft(fields())), fields());
  });

  test('rejects malformed JSON', () => {
    assert.equal(parseDraft('{nope'), null);
  });

  test('rejects a non-object', () => {
    assert.equal(parseDraft('[1,2]'), null);
  });

  test('rejects a draft with a wrongly typed field', () => {
    assert.equal(parseDraft(JSON.stringify({ ...fields(), title: 5 })), null);
  });

  test('rejects a draft with a missing field', () => {
    const { title, ...rest } = fields();
    assert.equal(title, 'Read chapter 4');
    assert.equal(parseDraft(JSON.stringify(rest)), null);
  });

  test('accepts a null list id', () => {
    assert.equal(parseDraft(serializeDraft(fields({ listId: null }))).listId, null);
  });

  test('returns null for absent storage content', () => {
    assert.equal(parseDraft(null), null);
  });

  test('drops an oversized title', () => {
    assert.equal(parseDraft(serializeDraft(fields({ title: 'x'.repeat(201) }))), null);
  });
});

test.describe('draft storage', () => {
  test('a saved draft loads back', () => {
    const storage = memoryStorage();
    saveDraft('k', fields(), storage);
    assert.deepEqual(loadDraft('k', storage), fields());
  });

  test('a cleared draft is gone', () => {
    const storage = memoryStorage();
    saveDraft('k', fields(), storage);
    clearDraft('k', storage);
    assert.equal(loadDraft('k', storage), null);
  });

  test('drafts under different keys do not collide', () => {
    const storage = memoryStorage();
    saveDraft('a', fields({ title: 'A' }), storage);
    saveDraft('b', fields({ title: 'B' }), storage);
    assert.equal(loadDraft('a', storage).title, 'A');
  });

  test('unreadable storage loads as no draft', () => {
    assert.equal(loadDraft('k', throwingStorage()), null);
  });

  test('unwritable storage does not throw on save', () => {
    assert.doesNotThrow(() => saveDraft('k', fields(), throwingStorage()));
  });

  test('unwritable storage does not throw on clear', () => {
    assert.doesNotThrow(() => clearDraft('k', throwingStorage()));
  });

  test('absent storage does not throw', () => {
    assert.equal(loadDraft('k', undefined), null);
  });
});

test.describe('last used list', () => {
  test('remembers a saved list id', () => {
    const storage = memoryStorage();
    saveLastListId(4, storage);
    assert.equal(loadLastListId(storage), 4);
  });

  test('is null when nothing was saved', () => {
    assert.equal(loadLastListId(memoryStorage()), null);
  });

  test('is null for a corrupt value', () => {
    const storage = memoryStorage();
    storage.setItem('uniPlanner.lastUsedListId', 'abc');
    assert.equal(loadLastListId(storage), null);
  });

  test('is null when storage throws', () => {
    assert.equal(loadLastListId(throwingStorage()), null);
  });

  test('save ignores a throwing storage', () => {
    assert.doesNotThrow(() => saveLastListId(4, throwingStorage()));
  });
});

test.describe('pickDefaultListId', () => {
  const lists = [{ id: 1 }, { id: 2 }, { id: 3 }];

  test('an explicit prefill wins over everything', () => {
    assert.equal(pickDefaultListId({ todoListId: null, prefillListId: 2, lastUsedId: 3, lists }), 2);
  });

  test('an edited task keeps its own list', () => {
    assert.equal(pickDefaultListId({ todoListId: 1, prefillListId: undefined, lastUsedId: 3, lists }), 1);
  });

  test('the last used list applies when nothing is prefilled', () => {
    assert.equal(pickDefaultListId({ todoListId: undefined, prefillListId: undefined, lastUsedId: 3, lists }), 3);
  });

  test('a last used list that no longer exists is ignored', () => {
    assert.equal(pickDefaultListId({ todoListId: undefined, prefillListId: undefined, lastUsedId: 9, lists }), 1);
  });

  test('falls back to null with no lists', () => {
    assert.equal(pickDefaultListId({ todoListId: undefined, prefillListId: undefined, lastUsedId: null, lists: [] }), null);
  });
});
