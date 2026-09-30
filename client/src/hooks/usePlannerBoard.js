import { useCallback, useEffect, useMemo, useRef } from 'react';
import { api } from '../api/client';
import { useTodos } from './useTodos';
import { useDividers } from './useDividers';
import { matchingBoardVersion, refreshBoardSnapshots } from './plannerBoardSnapshot';
import { refreshPlannerViews } from './plannerRefresh.js';

export function plannerItemRef(item) {
  return item.kind === 'divider' ? { kind: 'divider', id: item.dividerId } : { kind: 'task', id: item.id };
}
export function usePlannerBoard({ refreshRelated } = {}) {
  const relatedRefresh = useRef(refreshRelated);
  relatedRefresh.current = refreshRelated;
  const todosApi = useTodos({ autoLoad: false });
  const { dividers, fetchDividers, captureVersion: dividerVersion, readSnapshotVersion: readDividerVersion } = useDividers({ autoLoad: false });
  const { todos, fetchTodos, mutatePlanner, reportFailure, captureVersion: taskVersion, readSnapshotVersion: readTaskVersion } = todosApi;
  const items = useMemo(() => [...todos, ...dividers], [todos, dividers]);
  const captureVersion = useCallback(() => matchingBoardVersion(taskVersion(), dividerVersion()), [taskVersion, dividerVersion]);
  const fetchBoard = useCallback(options => refreshBoardSnapshots(fetchTodos, fetchDividers, readTaskVersion, readDividerVersion, options),
    [fetchTodos, fetchDividers, readTaskVersion, readDividerVersion]);
  const refreshBoardSafely = useCallback(async options => {
    try { return await fetchBoard(options); }
    catch (error) { reportFailure('Could not refresh planner', error); return false; }
  }, [fetchBoard, reportFailure]);
  useEffect(() => { refreshBoardSafely(); }, [refreshBoardSafely]);
  const refreshAfter = useCallback(async options => {
    try { return await refreshPlannerViews(fetchBoard, relatedRefresh.current, options); }
    catch (error) { reportFailure('Could not refresh planner', error); return false; }
  }, [fetchBoard, reportFailure]);
  const { createTodo: createTask, updateTodo: updateTask, deleteTodo: deleteTask, dismissAgentActivity: dismissTaskActivity } = todosApi;
  const createTodo = useCallback((data, controls) => createTask(data, controls, refreshAfter), [createTask, refreshAfter]);
  const updateTodo = useCallback((id, data, controls) => updateTask(id, data, controls, refreshAfter), [updateTask, refreshAfter]);
  const deleteTodo = useCallback((id, scope, controls) => deleteTask(id, scope, controls, refreshAfter), [deleteTask, refreshAfter]);
  const dismissAgentActivity = useCallback((id, controls) => dismissTaskActivity(id, controls, refreshAfter), [dismissTaskActivity, refreshAfter]);
  const perform = useCallback(async (action, body, controls) => {
    try { return await mutatePlanner(options => api.post(`/api/planner/${action}`, body, options), { expectedVersion: captureVersion(), ...controls }, refreshAfter); }
    catch (error) { reportFailure('Could not save planner change', error); return null; }
  }, [mutatePlanner, refreshAfter, reportFailure, captureVersion]);
  const reorderDayItems = useCallback((ordered, controls) => {
    if (!ordered.length) return Promise.resolve(null);
    return perform('reorder', { day: ordered[0].day_assigned ?? null, items: ordered.map(plannerItemRef) }, controls);
  }, [perform]);
  const moveItemToDay = useCallback((item, day, ordered, controls) => {
    const index = ordered.findIndex(candidate => candidate.id === item.id);
    return perform('move', { item: plannerItemRef(item), day, index }, controls);
  }, [perform]);
  const assignDay = useCallback((id, day, controls) => perform('move', {
    item: { kind: 'task', id }, day, index: items.filter(item => (item.day_assigned ?? null) === day && item.id !== id).length,
  }, controls), [perform, items]);
  const copyItemToDay = useCallback((source, day, _before, index, controls) =>
    perform('copy', { item: plannerItemRef(source), day, index }, controls), [perform]);
  const addDivider = useCallback((day, dayItems, controls) =>
    perform('create-divider', { day, index: dayItems.length }, controls), [perform]);
  const removeDivider = useCallback((id, controls) => perform('delete-divider', { id }, controls), [perform]);
  return { ...todosApi, createTodo, updateTodo, deleteTodo, dismissAgentActivity, fetchTodos: fetchBoard, captureVersion, version: captureVersion(), dividers, items, fetchBoard, fetchDividers, reorderDayItems,
    moveItemToDay, copyItemToDay, addDivider, removeDivider, assignDay };
}
