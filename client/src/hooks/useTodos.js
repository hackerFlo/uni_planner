import { useState, useCallback, useRef, useEffect } from 'react';
import { api } from '../api/client';

const UNDO_WINDOW_MS = 30000;

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
  const [canUndo, setCanUndo] = useState(false);

  const undoFnRef = useRef(null);
  const undoTimerRef = useRef(null);
  const todosRef = useRef(todos);

  useEffect(() => { todosRef.current = todos; }, [todos]);

  const recordUndo = useCallback((revertFn) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoFnRef.current = revertFn;
    setCanUndo(true);
    undoTimerRef.current = setTimeout(() => {
      undoFnRef.current = null;
      setCanUndo(false);
    }, UNDO_WINDOW_MS);
  }, []);

  const undo = useCallback(async () => {
    if (!undoFnRef.current) return;
    const revert = undoFnRef.current;
    undoFnRef.current = null;
    setCanUndo(false);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    await revert();
  }, []);

  const fetchTodos = useCallback(async () => {
    setLoading(true);
    try {
      const { todos } = await api.get('/api/todos');
      setTodos(todos);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'visible') fetchTodos();
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [fetchTodos]);

  useEffect(() => {
    const timerRef = { current: null };
    function scheduleAtMidnight() {
      const now = new Date();
      const msUntilMidnight =
        new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
      timerRef.current = setTimeout(() => {
        // Skip fetch when hidden; visibilitychange handler will catch up on resume
        if (document.visibilityState === 'visible') fetchTodos();
        scheduleAtMidnight();
      }, msUntilMidnight);
    }
    scheduleAtMidnight();
    return () => clearTimeout(timerRef.current);
  }, [fetchTodos]);

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

  const assignDay = useCallback(async (id, day) => {
    const prevDay = todosRef.current.find(t => t.id === id)?.day_assigned ?? null;
    setTodos(prev => prev.map(t => t.id === id ? { ...t, day_assigned: day } : t));
    const { todo } = await api.patch(`/api/todos/${id}`, { day_assigned: day });
    setTodos(prev => prev.map(t => t.id === id ? todo : t));
    recordUndo(async () => {
      setTodos(prev => prev.map(t => t.id === id ? { ...t, day_assigned: prevDay } : t));
      const { todo: reverted } = await api.patch(`/api/todos/${id}`, { day_assigned: prevDay });
      setTodos(prev => prev.map(t => t.id === id ? reverted : t));
    });
    return todo;
  }, [recordUndo]);

  const reorderDay = useCallback(async (orderedTodos) => {
    const snapshot = todosRef.current;
    const items = orderedTodos.map((t, i) => ({ id: t.id, planner_order: i }));
    setTodos(prev => {
      const map = new Map(items.map(({ id, planner_order }) => [id, planner_order]));
      return prev.map(t => map.has(t.id) ? { ...t, planner_order: map.get(t.id) } : t);
    });
    await api.patch('/api/todos/reorder', { items });
    const prevItems = orderedTodos.map(t => {
      const prev = snapshot.find(p => p.id === t.id);
      return { id: t.id, planner_order: prev?.planner_order ?? 0 };
    });
    recordUndo(async () => {
      setTodos(prev => {
        const map = new Map(prevItems.map(({ id, planner_order }) => [id, planner_order]));
        return prev.map(t => map.has(t.id) ? { ...t, planner_order: map.get(t.id) } : t);
      });
      await api.patch('/api/todos/reorder', { items: prevItems });
    });
  }, [recordUndo]);

  return { todos, loading, fetchTodos, createTodo, updateTodo, deleteTodo, assignDay, reorderDay, canUndo, undo };
}
