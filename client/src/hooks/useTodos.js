import { useState, useCallback, useRef, useEffect } from 'react';
import { api } from '../api/client';
import { userMessage } from '../api/errors';
import { useUndo } from '../context/UndoContext';
import { useToast } from '../context/ToastContext';
import { useAutoRefresh } from './useAutoRefresh';
import {
  assignDayLocal,
  applyOrderItems,
  composeReverts,
  snapshotOrderItems,
  toOrderItems,
} from '../utils/plannerMutations';

function mergeTodoUpdate(prev, todo, materialized, removedIds) {
  const removed = new Set(removedIds);
  const matMap = new Map(materialized.map(t => [t.id, t]));
  let next = prev
    .filter(t => !removed.has(t.id))
    .map(t => matMap.has(t.id) ? matMap.get(t.id) : (t.id === todo.id ? todo : t));
  const existingIds = new Set(next.map(t => t.id));
  for (const m of materialized) if (!existingIds.has(m.id)) next.push(m);
  if (!existingIds.has(todo.id)) next.push(todo);
  return next.filter(t => !t.archived);
}

export function useTodos() {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(false);
  // Distinguishes "still fetching for the first time" from "fetched, and there
  // is nothing here" -- seven empty columns look identical otherwise.
  const [hasLoaded, setHasLoaded] = useState(false);
  const { recordUndo } = useUndo();
  const toast = useToast();

  const todosRef = useRef(todos);

  useEffect(() => { todosRef.current = todos; }, [todos]);

  // The optimistic paths below roll the board back before they report: leaving
  // the UI showing a change the server rejected is worse than showing an error.
  const reportFailure = useCallback((what, err) => {
    console.warn(`[useTodos] ${what}:`, err.kind, err.message);
    toast?.error(`${what}. ${userMessage(err)}`, { ref: err.requestId ?? null });
  }, [toast]);

  const fetchTodos = useCallback(async () => {
    setLoading(true);
    try {
      const { todos } = await api.get('/api/todos');
      setTodos(todos);
    } catch (err) {
      // Keep whatever is on screen: this also runs on tab focus and at midnight,
      // and blanking a populated planner because one refresh failed is worse.
      console.warn('[useTodos] load failed:', err.kind, err.message);
      toast?.error(userMessage(err), { ref: err.requestId ?? null });
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, [toast]);

  useAutoRefresh(fetchTodos);

  const createTodo = useCallback(async (data) => {
    const { todo, materialized = [] } = await api.post('/api/todos', data);
    setTodos(prev => [todo, ...materialized, ...prev]);
    recordUndo(async () => {
      await api.delete(`/api/todos/${todo.id}`);
      const allIds = new Set([todo.id, ...materialized.map(t => t.id)]);
      setTodos(prev => prev.filter(t => !allIds.has(t.id)));
    });
    return todo;
  }, [recordUndo]);

  const updateTodo = useCallback(async (id, data) => {
    const prevTodo = todosRef.current.find(t => t.id === id);
    const { todo, materialized = [], removedIds = [] } = await api.patch(`/api/todos/${id}`, data);
    setTodos(prev => mergeTodoUpdate(prev, todo, materialized, removedIds));
    if (prevTodo) {
      const revertData = Object.fromEntries(Object.keys(data).map(k => [k, prevTodo[k] ?? null]));
      recordUndo(async () => {
        const { todo: reverted, materialized: rm = [], removedIds: rri = [] } = await api.patch(`/api/todos/${todo.id}`, revertData);
        setTodos(prev => mergeTodoUpdate(prev, reverted, rm, rri));
      });
    }
    return todo;
  }, [recordUndo]);

  const deleteTodo = useCallback(async (id, scope = 'single') => {
    const prevTodo = todosRef.current.find(t => t.id === id);
    await api.delete(`/api/todos/${id}?scope=${scope}`);
    if (scope === 'all') {
      const templateId = prevTodo?.recurrence_parent_id ?? id;
      setTodos(prev => prev.filter(t => t.id !== templateId && t.recurrence_parent_id !== templateId));
    } else {
      setTodos(prev => prev.filter(t => t.id !== id));
    }
    if (prevTodo) {
      const { id: _id, ...createData } = prevTodo;
      recordUndo(async () => {
        const { todo } = await api.post('/api/todos', createData);
        setTodos(prev => [todo, ...prev]);
      });
    }
  }, [recordUndo]);

  const makeDayRevert = useCallback((id, day) => async () => {
    setTodos(prev => assignDayLocal(prev, id, day));
    const { todo } = await api.patch(`/api/todos/${id}`, { day_assigned: day });
    setTodos(prev => prev.map(t => t.id === id ? todo : t));
  }, []);

  const makeOrderRevert = useCallback((items) => async () => {
    setTodos(prev => applyOrderItems(prev, items));
    await api.patch('/api/todos/reorder', { items });
  }, []);

  // Hands its revert back instead of recording it, so a caller that issues
  // several writes can record them as one undo entry.
  const applyAssignDay = useCallback(async (id, day) => {
    const prevDay = todosRef.current.find(t => t.id === id)?.day_assigned ?? null;
    setTodos(prev => assignDayLocal(prev, id, day));
    try {
      const { todo } = await api.patch(`/api/todos/${id}`, { day_assigned: day });
      setTodos(prev => prev.map(t => t.id === id ? todo : t));
      return { todo, revert: makeDayRevert(id, prevDay) };
    } catch (err) {
      setTodos(prev => assignDayLocal(prev, id, prevDay));
      throw err;
    }
  }, [makeDayRevert]);

  const applyReorder = useCallback(async (orderedTodos) => {
    const prevItems = snapshotOrderItems(todosRef.current, orderedTodos);
    const items = toOrderItems(orderedTodos);
    setTodos(prev => applyOrderItems(prev, items));
    try {
      await api.patch('/api/todos/reorder', { items });
      return { revert: makeOrderRevert(prevItems) };
    } catch (err) {
      setTodos(prev => applyOrderItems(prev, prevItems));
      throw err;
    }
  }, [makeOrderRevert]);

  const assignDay = useCallback(async (id, day) => {
    try {
      const { todo, revert } = await applyAssignDay(id, day);
      recordUndo(revert);
      return todo;
    } catch (err) {
      reportFailure('Could not move the item', err);
      return null;
    }
  }, [applyAssignDay, recordUndo, reportFailure]);

  const reorderDay = useCallback(async (orderedTodos) => {
    try {
      const { revert } = await applyReorder(orderedTodos);
      recordUndo(revert);
    } catch (err) {
      reportFailure('Could not save the new order', err);
    }
  }, [applyReorder, recordUndo, reportFailure]);

  // A cross-day drag is two writes. Recorded separately, the renumber overwrote
  // the day move in the single-slot undo store and Ctrl+Z put the card back in
  // its old position on the *new* day -- so they compose into one entry.
  const moveTodoToDay = useCallback(async (id, day, orderedTodos) => {
    let revertDay = null;
    try {
      const assigned = await applyAssignDay(id, day);
      revertDay = assigned.revert;
      const reordered = await applyReorder(orderedTodos);
      recordUndo(composeReverts([revertDay, reordered.revert]));
    } catch (err) {
      // If the day move landed and only the renumber failed, that half is still
      // on screen and still has to be undoable.
      recordUndo(revertDay);
      reportFailure('Could not move the item', err);
    }
  }, [applyAssignDay, applyReorder, recordUndo, reportFailure]);

  return {
    todos,
    loading,
    initialLoading: loading && !hasLoaded,
    fetchTodos,
    createTodo,
    updateTodo,
    deleteTodo,
    assignDay,
    reorderDay,
    moveTodoToDay,
  };
}
