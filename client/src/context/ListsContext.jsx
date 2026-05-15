import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

const ListsContext = createContext(null);

export function ListsProvider({ children }) {
  const { user } = useAuth();
  const [lists, setLists] = useState([]);
  const toast = useToast();

  const fetchLists = useCallback(async () => {
    if (!user) { setLists([]); return; }
    try {
      const { lists: fetched } = await api.get('/api/lists');
      setLists(fetched);
    } catch (err) {
      console.warn('[lists] failed to load:', err.message);
      toast?.error('Could not load lists. Refresh to retry.');
      setLists([]);
    }
  }, [user, toast]);

  useEffect(() => { fetchLists(); }, [fetchLists]);

  function getList(id) {
    return lists.find(l => l.id === id);
  }

  async function createList(name, color) {
    const { list } = await api.post('/api/lists', { name, color });
    setLists(prev => [...prev, list]);
    return list;
  }

  async function updateList(id, updates) {
    const { list } = await api.patch(`/api/lists/${id}`, updates);
    setLists(prev => prev.map(l => l.id === id ? list : l));
    return list;
  }

  async function reorderLists(orderedIds) {
    setLists(prev => {
      const idToList = Object.fromEntries(prev.map(l => [l.id, l]));
      return orderedIds.map((id, idx) => ({ ...idToList[id], sort_order: idx }));
    });
    await api.patch('/api/lists/reorder', { order: orderedIds });
  }

  async function deleteList(id, moveToListId) {
    const url = moveToListId ? `/api/lists/${id}?moveTo=${moveToListId}` : `/api/lists/${id}`;
    await api.delete(url);
    setLists(prev => prev.filter(l => l.id !== id));
  }

  return (
    <ListsContext.Provider value={{ lists, fetchLists, getList, createList, updateList, reorderLists, deleteList }}>
      {children}
    </ListsContext.Provider>
  );
}

export function useLists() {
  return useContext(ListsContext);
}
