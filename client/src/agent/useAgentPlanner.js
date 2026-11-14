import { useCallback, useMemo, useRef } from 'react';
import { api } from '../api/client';
import { ApiError, KINDS } from '../api/errors';
import { usePlannerBoard } from '../hooks/usePlannerBoard';
import { useDayNotes } from '../hooks/useDayNotes';
import { useCompletedTodos } from '../hooks/useCompletedTodos';
import { refreshPlannerResources, refreshPlannerViews } from '../hooks/plannerRefresh';
import usePlannerRevision from '../hooks/usePlannerRevision';
import { useLists } from '../context/ListsContext';
import { useExams } from '../context/ExamsContext';
import { createDividerBody, deleteDividerBody, moveBody, reorderBody } from './plannerBodies';
import { planStep } from './days';
import { todosForDay } from '../utils/plannerMutations';

// Every read and write goes through the same hooks the planner uses, so version
// headers, idempotency keys, undo recording and error classification are the
// planner's own. The one difference: usePlannerBoard's move/reorder/divider
// helpers catch their failures into a toast and return null, which would leave
// the status line unable to say why. Those four call mutatePlanner directly,
// with the same endpoints and bodies, and let the error propagate.
export function useAgentPlanner(weekDates, { paused = false } = {}) {
  const relatedRefresh = useRef(null);
  const refreshRelated = useCallback(options => relatedRefresh.current?.(options) ?? Promise.resolve(true), []);
  const board = usePlannerBoard({ refreshRelated });
  const completed = useCompletedTodos(weekDates, true);
  relatedRefresh.current = completed.refresh;
  const { notes, setNote, fetchNotes } = useDayNotes();
  const listsApi = useLists();
  const examsApi = useExams();
  const { items, fetchBoard, captureVersion, mutatePlanner } = board;
  const refreshAfter = useCallback(options => refreshPlannerViews(fetchBoard, completed.refresh, options),
    [fetchBoard, completed.refresh]);
  const boardControls = () => ({ expectedVersion: captureVersion() });
  const post = (endpoint, body) => mutatePlanner(
    options => api.post(`/api/planner/${endpoint}`, body, options), boardControls(), refreshAfter);

  const completedTodos = useMemo(() => Object.values(completed.byDate).flat(), [completed.byDate]);
  const { fetchLists } = listsApi;
  const { fetchExams } = examsApi;
  const refreshAll = useCallback((version, options) => refreshPlannerResources(
    [fetchBoard, fetchLists, fetchExams, fetchNotes, completed.refresh], { ...options, minimumVersion: version }),
  [fetchBoard, fetchLists, fetchExams, fetchNotes, completed.refresh]);
  // Without this the page keeps the version it first read, and any write that
  // lands elsewhere meanwhile (a fresh account creates its preference profile
  // on first load) turns every later action into "Planner changed".
  usePlannerRevision({ onChange: refreshAll, paused });

  const actions = {
    refreshAll: () => refreshAll(null),
    addTask: payload => board.createTodo(payload, boardControls()),
    updateTask: (id, payload) => board.updateTodo(id, payload, boardControls()),
    completeTask: id => board.updateTodo(id, { completed: 1, archived: 1 }, boardControls()),
    reopenTask: id => board.updateTodo(id, { completed: 0, archived: 0 }, { expectedVersion: completed.version }),
    archiveTask: id => board.updateTodo(id, { archived: 1 }, boardControls()),
    deleteTask: (id, scope) => board.deleteTodo(id, scope, boardControls()),
    moveItem: (item, day) => post('move', moveBody(items, item, day)),
    stepItem: (item, direction) => {
      const ordered = planStep(items, item.day_assigned, item.id, direction);
      if (!ordered) {
        throw new ApiError(KINDS.BAD_REQUEST, { message: `Already at the ${direction === 'up' ? 'top' : 'bottom'} of the day.` });
      }
      return post('reorder', reorderBody(ordered));
    },
    addDivider: day => post('create-divider', createDividerBody(day, todosForDay(items, day))),
    removeDivider: id => post('delete-divider', deleteDividerBody(id)),
    saveNote: (date, value) => setNote(date, value),
    createList: (name, color) => listsApi.createList(name, color),
    renameList: (id, updates) => listsApi.updateList(id, updates),
    deleteList: async (id, moveTo) => {
      await listsApi.deleteList(id, moveTo);
      await fetchBoard();
    },
    addExam: (title, date) => examsApi.addExam(title, date),
    updateExam: (id, updates) => examsApi.updateExam(id, updates),
    deleteExam: id => examsApi.deleteExam(id),
  };
  return {
    items, todos: board.todos, completedTodos, notes, lists: listsApi.lists, exams: examsApi.upcomingExams,
    loading: board.initialLoading, actions,
  };
}
