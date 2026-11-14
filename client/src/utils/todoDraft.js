// In-progress item-form drafts (sessionStorage, survives a reload but not the
// tab) and the last list a task was created in (localStorage). Both are
// per-viewer conveniences: storage may be absent or throw (Safari private mode),
// and neither direction is allowed to take the form down.

export const DRAFT_PREFIX = 'uniPlanner.todoDraft.';
export const LAST_LIST_KEY = 'uniPlanner.lastUsedListId';

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 50000;
const MAX_CUSTOM_TIME = 3;

export function draftKey(mode, todo, defaults = {}) {
  if (mode === 'edit') return `${DRAFT_PREFIX}edit:${todo?.id}`;
  return `${DRAFT_PREFIX}new:${defaults.list_id ?? ''}:${defaults.day_assigned ?? ''}`;
}

export function serializeDraft(fields) {
  return JSON.stringify(fields);
}

function isValidDraft(d) {
  return d !== null && typeof d === 'object' && !Array.isArray(d)
    && typeof d.title === 'string' && d.title.length <= MAX_TITLE
    && typeof d.description === 'string' && d.description.length <= MAX_DESCRIPTION
    && (d.listId === null || Number.isInteger(d.listId))
    && typeof d.dayAssigned === 'string'
    && typeof d.recurrence === 'string'
    && typeof d.approxTime === 'string'
    && typeof d.customTime === 'string' && d.customTime.length <= MAX_CUSTOM_TIME;
}

export function parseDraft(raw) {
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    if (!isValidDraft(parsed)) return null;
    const { title, description, listId, dayAssigned, recurrence, approxTime, customTime } = parsed;
    return { title, description, listId, dayAssigned, recurrence, approxTime, customTime };
  } catch (err) {
    console.warn('[todo-draft] discarded unreadable draft:', err.message);
    return null;
  }
}

export function loadDraft(key, storage = globalThis.sessionStorage) {
  try {
    return parseDraft(storage.getItem(key));
  } catch (err) {
    console.warn('[todo-draft] could not read draft:', err.message);
    return null;
  }
}

export function saveDraft(key, fields, storage = globalThis.sessionStorage) {
  try {
    storage.setItem(key, serializeDraft(fields));
  } catch (err) {
    console.warn('[todo-draft] could not save draft:', err.message);
  }
}

export function clearDraft(key, storage = globalThis.sessionStorage) {
  try {
    storage.removeItem(key);
  } catch (err) {
    console.warn('[todo-draft] could not clear draft:', err.message);
  }
}

export function loadLastListId(storage = globalThis.localStorage) {
  try {
    const id = Number(storage.getItem(LAST_LIST_KEY));
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch (err) {
    console.warn('[todo-draft] could not read last list:', err.message);
    return null;
  }
}

export function saveLastListId(id, storage = globalThis.localStorage) {
  try {
    storage.setItem(LAST_LIST_KEY, String(id));
  } catch (err) {
    console.warn('[todo-draft] could not save last list:', err.message);
  }
}

// Precedence: the task's own list, then an explicit prefill (the + on a list),
// then the list last used for a created task, then the first list.
export function pickDefaultListId({ todoListId, prefillListId, lastUsedId, lists }) {
  if (todoListId != null) return todoListId;
  if (prefillListId != null) return prefillListId;
  if (lists.some(list => list.id === lastUsedId)) return lastUsedId;
  return lists[0]?.id ?? null;
}
