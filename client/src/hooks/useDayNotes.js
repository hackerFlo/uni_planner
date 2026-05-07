import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

export function useDayNotes() {
  const [notes, setNotes] = useState({});

  useEffect(() => {
    api.get('/api/day-notes').then(({ notes: rows }) => {
      const map = {};
      for (const { date, note } of rows) map[date] = note;
      setNotes(map);
    }).catch(() => {});
  }, []);

  const setNote = useCallback(async (date, value) => {
    const prev = notes[date];
    const trimmed = value.trim();
    setNotes(n => trimmed ? { ...n, [date]: trimmed } : Object.fromEntries(Object.entries(n).filter(([k]) => k !== date)));
    try {
      await api.put(`/api/day-notes/${date}`, { note: trimmed });
    } catch {
      setNotes(n => prev ? { ...n, [date]: prev } : Object.fromEntries(Object.entries(n).filter(([k]) => k !== date)));
    }
  }, [notes]);

  return { notes, setNote };
}
