// Pure rules for the new-task dialog's AI list suggestion. Everything that
// decides whether a model call may happen lives here so it can be tested
// without React; hooks/useAiListSuggestion.js only wires it to the form.

export const DEBOUNCE_MS = 1200;
export const MAX_CALLS_PER_DIALOG = 3;
export const TITLE_MAX_CHARS = 200;
export const NOTE_MAX_CHARS = 2000;
const MIN_TITLE_CHARS = 3;
const MIN_NOTE_CHARS = 10;

const squash = text => String(text ?? '').trim().replace(/\s+/g, ' ');

export const normaliseText = (title, note) => `${squash(title)}\n${squash(note)}`.toLowerCase();

export function isTextEligible(title, note) {
  return squash(title).replace(/ /g, '').length >= MIN_TITLE_CHARS || squash(note).replace(/ /g, '').length >= MIN_NOTE_CHARS;
}

// A list prefilled by the dialog's context (a list's "+" button) is an explicit
// choice already, so no suggestion is made there. Day "+" and generic "add" open
// without a list and do get one.
export function isDialogEligible({ user, mode, listCount, prefilledListId }) {
  return mode === 'create' && Boolean(user) && user.principal !== 'agent'
    && user.ai_list_available === true && user.ai_list_enabled === true
    && listCount >= 2 && prefilledListId === undefined;
}

const capChars = (text, max) => [...String(text ?? '').trim()].slice(0, max).join('');

// One session per opened dialog. `request(title, note, signal)` resolves to a
// list id or null and may reject; failures are reported, never thrown.
export function createSuggestionSession({ request }) {
  const cache = new Map();
  let calls = 0;
  let manual = false;
  let sequence = 0;
  let controller = null;

  const abortInFlight = () => { controller?.abort(); controller = null; sequence += 1; };

  async function suggest(title, note) {
    if (manual || !isTextEligible(title, note)) return { status: 'skipped', listId: null };
    const key = normaliseText(title, note);
    if (cache.has(key)) return { status: 'cached', listId: cache.get(key) };
    if (calls >= MAX_CALLS_PER_DIALOG) return { status: 'skipped', listId: null };
    abortInFlight();
    calls += 1;
    const mine = sequence;
    controller = new AbortController();
    try {
      const listId = await request(capChars(title, TITLE_MAX_CHARS), capChars(note, NOTE_MAX_CHARS), controller.signal);
      if (mine !== sequence || manual) return { status: 'stale', listId: null };
      cache.set(key, listId);
      return { status: 'ok', listId };
    } catch {
      // Best effort by design: a failed suggestion must never reach the user.
      return { status: mine === sequence ? 'error' : 'stale', listId: null };
    }
  }

  return {
    suggest,
    cancel: abortInFlight,
    markManual() { manual = true; abortInFlight(); },
  };
}
