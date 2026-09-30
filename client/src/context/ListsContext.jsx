import { createContext, useCallback, useContext } from 'react';
import { api } from '../api/client';
import { usePlannerResource } from '../hooks/usePlannerResource';
const ListsContext = createContext(null);
const EMPTY = [];
export function ListsProvider({ children }) {
  const { data, refresh, mutate, captureVersion, version, reportFailure } = usePlannerResource('/api/lists', 'lists');
  const lists = data ?? EMPTY;
  const createList = useCallback(async (name, color, controls) => {
    const result = await mutate(options => api.post('/api/lists', { name, color }, options), controls);
    return result.list ?? result.data?.list;
  }, [mutate]);
  const updateList = useCallback(async (id, updates, controls) => {
    const result = await mutate(options => api.patch(`/api/lists/${id}`, updates, options), controls);
    return result.list ?? result.data?.list;
  }, [mutate]);
  const reorderLists = useCallback(async (order, controls) => {
    try { return await mutate(options => api.patch('/api/lists/reorder', { order }, options), controls); }
    catch (error) { reportFailure('Could not reorder lists', error); return null; }
  }, [mutate, reportFailure]);
  const deleteList = useCallback((id, moveTo, controls) => mutate(options => api.delete(
    `/api/lists/${id}${moveTo ? `?moveTo=${encodeURIComponent(moveTo)}` : ''}`, options), controls), [mutate]);
  return <ListsContext.Provider value={{ lists, getList: id => lists.find(list => list.id === id),
    createList, updateList, reorderLists, deleteList, fetchLists: refresh, captureVersion, version }}>{children}</ListsContext.Provider>;
}
export function useLists() { return useContext(ListsContext); }
