import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { useToast } from '../context/ToastContext';

export function useDayNotes() {
  const [notes, setNotes] = useState({});
  const toast = useToast();

  useEffect(() => {
    api.get('/api/day-notes').then(({ notes: rows }) => {
      const map = {};
      for (const { date, note } of rows) map[date] = note;
      setNotes(map);
    }).catch((err) => {
      console.warn('[useDayNotes] failed to load:', err.message);
      toast?.error('Could not load day notes.');
    });
  // toast ref is stable — intentionally not a dep to avoid re-fetching
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stable identity: uses functional setNotes so the callback never depends on `notes`.
  const setNote = useCallback(async (date, value) => {
    const trimmed = value.trim();
    let prev;
    setNotes(n => {
      prev = n[date];
      return trimmed
        ? { ...n, [date]: trimmed }
        : Object.fromEntries(Object.entries(n).filter(([k]) => k !== date));
    });
    try {
      await api.put(`/api/day-notes/${date}`, { note: trimmed });
    } catch (err) {
      console.warn('[useDayNotes] save failed:', err.message);
      setNotes(n => prev
        ? { ...n, [date]: prev }
        : Object.fromEntries(Object.entries(n).filter(([k]) => k !== date)));
    }
  }, []);

  return { notes, setNote };
}
