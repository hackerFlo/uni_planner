import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';

// Completed work for the week on screen, fetched only once a day column is
// actually revealed. Kept out of the main todo list on purpose: GET /api/todos
// returns the live board, and folding finished work into it would mean every
// consumer re-filtering it back out. One request per visible week, not per column.
export function useCompletedTodos(weekDates, enabled) {
  const [byDate, setByDate] = useState({});
  const [loading, setLoading] = useState(false);

  const from = weekDates[0];
  const to = weekDates[weekDates.length - 1];

  const refresh = useCallback(async () => {
    if (!enabled || !from || !to) return;
    setLoading(true);
    try {
      const { todos } = await api.get(`/api/todos/completed?from=${from}&to=${to}`);
      const grouped = {};
      for (const t of todos) (grouped[t.day_assigned] ??= []).push(t);
      setByDate(grouped);
    } catch (err) {
      // Non-critical: the day columns still show live work. Surfacing a toast
      // here would fire on every week you page through while offline.
      console.warn('[completed] load failed:', err.kind, err.message);
    } finally {
      setLoading(false);
    }
  }, [enabled, from, to]);

  useEffect(() => { refresh(); }, [refresh]);

  return { byDate, loading, refresh };
}

export default useCompletedTodos;
