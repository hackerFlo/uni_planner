import { useCallback } from 'react';
import { api } from '../api/client';
import { usePlannerResource } from './usePlannerResource';

const EMPTY = [];
function taskPatch(data) {
  const patch = { ...data };
  for (const field of ['completed', 'archived']) {
    if (patch[field] === 0 || patch[field] === 1) patch[field] = Boolean(patch[field]);
  }
  return patch;
}
export function useTodos({ autoLoad = true } = {}) {
  const resource = usePlannerResource('/api/todos', 'todos', { autoLoad });
  const { mutate, refresh, captureVersion, reportFailure } = resource;
  const createTodo = useCallback(async (data, controls, refreshAfter) => {
    const result = await mutate(options => api.post('/api/todos', data, options), controls, refreshAfter);
    return result.todo ?? result.data?.todo;
  }, [mutate]);
  const updateTodo = useCallback(async (id, data, controls, refreshAfter) => {
    const result = await mutate(options => api.patch(`/api/todos/${id}`, taskPatch(data), options), controls, refreshAfter);
    return result.todo ?? result.data?.todo;
  }, [mutate]);
  const deleteTodo = useCallback((id, scope = 'single', controls, refreshAfter) =>
    mutate(options => api.delete(`/api/todos/${id}?scope=${encodeURIComponent(scope)}`, options), controls, refreshAfter), [mutate]);
  const dismissAgentActivity = useCallback(async (id, controls, refreshAfter) => {
    try {
      await mutate(options => api.post(`/api/todos/${id}/dismiss-agent-activity`, {}, options), controls, refreshAfter);
      return true;
    } catch (error) {
      reportFailure('Could not dismiss AI activity', error);
      return false;
    }
  }, [mutate, reportFailure]);
  return { todos: resource.data ?? EMPTY, loading: resource.loading,
    initialLoading: !resource.hasLoaded, version: resource.version, readSnapshotVersion: resource.readSnapshotVersion,
    fetchTodos: refresh, createTodo, updateTodo, deleteTodo, dismissAgentActivity, captureVersion, reportFailure,
    mutatePlanner: mutate };
}
