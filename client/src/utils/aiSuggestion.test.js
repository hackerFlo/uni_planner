import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_CALLS_PER_DIALOG, TITLE_MAX_CHARS, NOTE_MAX_CHARS,
  normaliseText, isTextEligible, isDialogEligible, createSuggestionSession,
} from './aiSuggestion.js';

const owner = { principal: 'owner', ai_list_available: true, ai_list_enabled: true };
const eligible = { user: owner, mode: 'create', listCount: 2, prefilledListId: undefined };

test.describe('normaliseText', () => {
  test('trims, collapses whitespace and lowercases', () => {
    assert.equal(normaliseText('  Read   Chapter\n4 ', ' Pages\t1-3 '), 'read chapter 4\npages 1-3');
  });
});

test.describe('isTextEligible', () => {
  test('accepts a title of three non-space characters', () => {
    assert.equal(isTextEligible('  abc ', ''), true);
  });

  test('rejects a two-character title with no note', () => {
    assert.equal(isTextEligible('ab', ''), false);
  });

  test('accepts a short title when the note has ten characters', () => {
    assert.equal(isTextEligible('ab', '0123456789'), true);
  });

  test('ignores padding spaces when counting', () => {
    assert.equal(isTextEligible('a  b  ', '   short  '), false);
  });
});

test.describe('isDialogEligible', () => {
  test('accepts the owner creating a task with two lists and no prefilled list', () => {
    assert.equal(isDialogEligible(eligible), true);
  });

  test('rejects editing', () => {
    assert.equal(isDialogEligible({ ...eligible, mode: 'edit' }), false);
  });

  test('rejects when the setting is off', () => {
    assert.equal(isDialogEligible({ ...eligible, user: { ...owner, ai_list_enabled: false } }), false);
  });

  test('rejects when the server has no key', () => {
    assert.equal(isDialogEligible({ ...eligible, user: { ...owner, ai_list_available: false } }), false);
  });

  test('rejects the agent principal', () => {
    assert.equal(isDialogEligible({ ...eligible, user: { ...owner, principal: 'agent' } }), false);
  });

  test('rejects fewer than two lists', () => {
    assert.equal(isDialogEligible({ ...eligible, listCount: 1 }), false);
  });

  test('rejects a dialog opened from a list "+" button', () => {
    assert.equal(isDialogEligible({ ...eligible, prefilledListId: 4 }), false);
  });

  test('rejects a missing user', () => {
    assert.equal(isDialogEligible({ ...eligible, user: null }), false);
  });
});

function sessionWith(answers) {
  const requests = [];
  const request = async (title, note, signal) => {
    requests.push({ title, note, signal });
    const next = answers.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  return { requests, session: createSuggestionSession({ request }) };
}

test.describe('createSuggestionSession', () => {
  test('returns the suggested list', async () => {
    const { session } = sessionWith([7]);
    assert.deepEqual(await session.suggest('Read paper', ''), { status: 'ok', listId: 7 });
  });

  test('skips ineligible text without a request', async () => {
    const { session, requests } = sessionWith([7]);
    assert.deepEqual([(await session.suggest('ab', '')).status, requests.length], ['skipped', 0]);
  });

  test('never sends the same normalised text twice', async () => {
    const { session, requests } = sessionWith([7, 8]);
    await session.suggest('Read Paper', '');
    const again = await session.suggest('  read   paper ', '');
    assert.deepEqual([again, requests.length], [{ status: 'cached', listId: 7 }, 1]);
  });

  test('caches a null answer too', async () => {
    const { session, requests } = sessionWith([null, 9]);
    await session.suggest('Buy milk', '');
    await session.suggest('buy milk', '');
    assert.equal(requests.length, 1);
  });

  test('stops after the per-dialog call cap', async () => {
    const { session, requests } = sessionWith([1, 2, 3, 4]);
    for (let i = 0; i < MAX_CALLS_PER_DIALOG + 2; i += 1) await session.suggest(`task number ${i}`, '');
    assert.equal(requests.length, MAX_CALLS_PER_DIALOG);
  });

  test('cache hits do not consume the call cap', async () => {
    const { session, requests } = sessionWith([1, 2, 3, 4]);
    for (let i = 0; i < 10; i += 1) await session.suggest('same text', '');
    await session.suggest('another one', '');
    assert.equal(requests.length, 2);
  });

  test('stops for good once the user chose a list manually', async () => {
    const { session, requests } = sessionWith([1]);
    session.markManual();
    assert.deepEqual([(await session.suggest('Read paper', '')).status, requests.length], ['skipped', 0]);
  });

  test('a manual choice discards the answer of a request still in flight', async () => {
    let resolve;
    const session = createSuggestionSession({ request: () => new Promise(r => { resolve = r; }) });
    const pending = session.suggest('Read paper', '');
    session.markManual();
    resolve(5);
    assert.equal((await pending).status, 'stale');
  });

  test('a newer request aborts the older one and ignores its answer', async () => {
    const resolvers = [];
    const signals = [];
    const session = createSuggestionSession({ request: (_t, _n, signal) => { signals.push(signal); return new Promise(r => resolvers.push(r)); } });
    const first = session.suggest('first task', '');
    const second = session.suggest('second task', '');
    resolvers[0](1);
    resolvers[1](2);
    assert.deepEqual([signals[0].aborted, (await first).status, await second], [true, 'stale', { status: 'ok', listId: 2 }]);
  });

  test('cancel aborts the request in flight', async () => {
    let signal;
    const session = createSuggestionSession({ request: (_t, _n, s) => { signal = s; return new Promise(() => {}); } });
    session.suggest('Read paper', '');
    session.cancel();
    assert.equal(signal.aborted, true);
  });

  test('a failed request reports an error, is not cached and does not throw', async () => {
    const { session, requests } = sessionWith([new Error('down'), 3]);
    const failed = await session.suggest('Read paper', '');
    const retried = await session.suggest('Read paper', '');
    assert.deepEqual([failed.status, retried.listId, requests.length], ['error', 3, 2]);
  });

  test('caps what it sends to the server limits', async () => {
    const { session, requests } = sessionWith([1]);
    await session.suggest('t'.repeat(TITLE_MAX_CHARS + 50), 'n'.repeat(NOTE_MAX_CHARS + 50));
    assert.deepEqual([requests[0].title.length, requests[0].note.length], [TITLE_MAX_CHARS, NOTE_MAX_CHARS]);
  });
});
