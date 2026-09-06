import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useToast } from '../context/ToastContext';
import { applyDividerOrder, setDividerDayLocal, toDividerItem } from '../utils/plannerItems';

// The divider half of the planner board. Deliberately mirrors useTodos: the
// `apply*` calls hand their revert back instead of recording it, so a drag that
// writes to both tables can compose them into one undo entry rather than
// overwriting itself in the single-slot undo store.
export function useDividers() {
  const [dividers, setDividers] = useState([]);
  const dividersRef = useRef(dividers);
  const toast = useToast();

  useEffect(() => { dividersRef.current = dividers; }, [dividers]);

  const fetchDividers = useCallback(async () => {
    try {
      const { dividers: rows } = await api.get('/api/day-dividers');
      setDividers(rows.map(toDividerItem));
    } catch (err) {
      // Keep whatever is on screen: a failed refresh must not blank the board.
      console.warn('[useDividers] load failed:', err.message);
      toast?.error('Could not load day dividers.');
    }
  }, [toast]);

  useEffect(() => { fetchDividers(); }, [fetchDividers]);

  const removeLocal = useCallback((dividerId) => {
    setDividers(prev => prev.filter(d => d.dividerId !== dividerId));
  }, []);

  // Returns the created item so the caller can splice it into the day it landed
  // on before renumbering.
  const createDivider = useCallback(async (date, plannerOrder) => {
    const { divider } = await api.post('/api/day-dividers', { date, planner_order: plannerOrder });
    const item = toDividerItem(divider);
    setDividers(prev => [...prev, item]);
    return { item, revert: async () => {
      await api.delete(`/api/day-dividers/${item.dividerId}`);
      removeLocal(item.dividerId);
    } };
  }, [removeLocal]);

  const deleteDivider = useCallback(async (dividerId) => {
    const prev = dividersRef.current.find(d => d.dividerId === dividerId);
    await api.delete(`/api/day-dividers/${dividerId}`);
    removeLocal(dividerId);
    if (!prev) return null;
    // A restored divider gets a fresh row id, exactly as an undone todo delete
    // does (useTodos.deleteTodo). Identity is not what the user is undoing.
    return async () => {
      const { divider } = await api.post('/api/day-dividers', {
        date: prev.day_assigned,
        planner_order: prev.planner_order ?? 0,
      });
      setDividers(cur => [...cur, toDividerItem(divider)]);
    };
  }, [removeLocal]);

  const applyDividerDay = useCallback(async (dividerId, day) => {
    const prevDay = dividersRef.current.find(d => d.dividerId === dividerId)?.day_assigned ?? null;
    setDividers(prev => setDividerDayLocal(prev, dividerId, day));
    try {
      await api.patch(`/api/day-dividers/${dividerId}`, { date: day });
      return { revert: async () => {
        setDividers(prev => setDividerDayLocal(prev, dividerId, prevDay));
        await api.patch(`/api/day-dividers/${dividerId}`, { date: prevDay });
      } };
    } catch (err) {
      setDividers(prev => setDividerDayLocal(prev, dividerId, prevDay));
      throw err;
    }
  }, []);

  const applyDividerReorder = useCallback(async (items, prevItems) => {
    if (items.length === 0) return { revert: null };
    setDividers(prev => applyDividerOrder(prev, items));
    try {
      await api.patch('/api/day-dividers/reorder', { items });
      return { revert: async () => {
        setDividers(prev => applyDividerOrder(prev, prevItems));
        await api.patch('/api/day-dividers/reorder', { items: prevItems });
      } };
    } catch (err) {
      setDividers(prev => applyDividerOrder(prev, prevItems));
      throw err;
    }
  }, []);

  return { dividers, fetchDividers, createDivider, deleteDivider, applyDividerDay, applyDividerReorder };
}
