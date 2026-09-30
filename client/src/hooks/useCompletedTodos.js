import { useCallback, useMemo } from 'react';
import { usePlannerResource } from './usePlannerResource';

// Completed work belongs to the visible week and authenticated account. Reuse
// the resource lifetime so late responses cannot leak across either boundary.
export function useCompletedTodos(weekDates, enabled) {
  const from = weekDates[0];
  const to = weekDates[weekDates.length - 1];
  const active = Boolean(enabled && from && to);
  const resource = usePlannerResource(`/api/todos/completed?from=${from}&to=${to}`, 'todos', { autoLoad: active });
  const { refresh: refreshResource } = resource;
  const refresh = useCallback(options => active ? refreshResource(options) : Promise.resolve(true), [active, refreshResource]);
  const byDate = useMemo(() => {
    const grouped = {};
    for (const todo of resource.data ?? []) (grouped[todo.day_assigned] ??= []).push(todo);
    return grouped;
  }, [resource.data]);
  return { byDate, loading: resource.loading, refresh, version: resource.version };
}

export default useCompletedTodos;
