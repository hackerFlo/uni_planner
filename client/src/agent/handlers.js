import { dayLabel } from './days';
import { isRealIsoDate } from './weekParam';

const taskName = row => `task ${row.displayId}`;

function removeAction(row, actions, scope = 'single') {
  if (row.kind === 'divider') {
    return { action: `delete divider ${row.displayId}`, work: () => actions.removeDivider(row.item.dividerId), done: `Deleted divider ${row.displayId}` };
  }
  const repeats = scope === 'all' ? ' and all its repeats' : '';
  return { action: `delete ${taskName(row)}`, work: () => actions.deleteTask(row.item.id, scope), done: `Deleted ${taskName(row)}${repeats}` };
}

function taskHandlers({ act, actions }) {
  const simple = (verb, past, work) => row => act(`${verb} ${taskName(row)}`, () => work(row.item.id), `${past} ${taskName(row)}`);
  return {
    complete: simple('complete', 'Completed', actions.completeTask),
    reopen: simple('mark open', 'Marked open', actions.reopenTask),
    archive: simple('archive', 'Archived', actions.archiveTask),
    remove: (row, scope) => { const { action, work, done } = removeAction(row, actions, scope); return act(action, work, done); },
    move: (row, day) => act(`move ${taskName(row)}`, () => actions.moveItem(row.item, day), `Moved ${taskName(row)} to ${dayLabel(day)}`),
    step: (row, direction) => {
      const subject = row.kind === 'divider' ? `divider ${row.displayId}` : taskName(row);
      return act(`move ${subject} ${direction}`, () => actions.stepItem(row.item, direction), `Moved ${subject} ${direction} within ${row.item.day_assigned}`);
    },
  };
}

function dayHandlers({ act, actions }) {
  return {
    addDivider: day => act(`add divider on ${day}`, () => actions.addDivider(day), `Added a divider at the end of ${day}`),
    saveNote: (day, value) => act(`save note for ${day}`, () => actions.saveNote(day, value),
      String(value).trim() ? `Saved note for ${day}` : `Cleared note for ${day}`),
  };
}

function listHandlers({ act, actions, reject }) {
  return {
    createList: (name, color) => (name ? act('add list', () => actions.createList(name, color), `Added list "${name}"`)
      : reject('add list', 'The list name is empty.')),
    saveList: (list, updates) => (updates.name ? act(`save list ${list.id}`, () => actions.renameList(list.id, updates),
      `Saved list ${list.id} as "${updates.name}" (${updates.color})`) : reject(`save list ${list.id}`, 'The list name is empty.')),
    deleteList: (list, moveTo) => act(`delete list ${list.id}`, () => actions.deleteList(list.id, moveTo),
      `Deleted list ${list.id}${moveTo ? `, its tasks moved to list ${moveTo}` : ''}`),
  };
}

function examHandlers({ act, actions, reject }) {
  const valid = (action, title, date) => {
    if (!title) reject(action, 'The exam title is empty.');
    else if (!isRealIsoDate(date)) reject(action, 'The exam date must be a valid date (YYYY-MM-DD).');
    return Boolean(title) && isRealIsoDate(date);
  };
  return {
    addExam: (title, date) => (valid('add exam', title, date)
      ? act('add exam', () => actions.addExam(title, date), `Added exam "${title}" on ${date}`) : Promise.resolve(false)),
    saveExam: (exam, title, date) => (valid(`save exam ${exam.id}`, title, date)
      ? act(`save exam ${exam.id}`, () => actions.updateExam(exam.id, { title, exam_date: date }), `Saved exam ${exam.id}: "${title}" on ${date}`)
      : Promise.resolve(false)),
    deleteExam: exam => act(`delete exam ${exam.id}`, () => actions.deleteExam(exam.id), `Deleted exam ${exam.id}`),
  };
}

export function createHandlers({ act, setStatus, actions, goEdit, afterSave }) {
  const reject = (action, reason) => setStatus({ ok: false, text: `✗ Could not ${action}: ${reason}` });
  const deps = { act, actions, reject };
  return {
    reject,
    edit: row => goEdit(row.item.id),
    addTask: payload => act('add task', () => actions.addTask(payload), todo => `Added task ${todo?.id ?? '(id unknown)'}: ${payload.title}`),
    updateTask: async (id, payload) => {
      const saved = await act(`save task ${id}`, () => actions.updateTask(id, payload), `Saved task ${id}: ${payload.title}`);
      if (saved) afterSave();
      return saved;
    },
    ...taskHandlers(deps), ...dayHandlers(deps), ...listHandlers(deps), ...examHandlers(deps),
  };
}
