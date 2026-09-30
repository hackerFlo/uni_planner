import { useCallback, useMemo } from 'react';
import { api } from '../api/client';
import { usePlannerResource } from './usePlannerResource';
export function useDayNotes() {
  const { data, refresh, mutate, captureVersion, version, reportFailure } = usePlannerResource('/api/day-notes', 'notes');
  const notes = useMemo(() => Object.fromEntries((data ?? []).map(({ date, note }) => [date, note])), [data]);
  const setNote = useCallback(async (date, value, controls) => {
    try { return await mutate(options => api.put(`/api/day-notes/${date}`, { note: value.trim() }, options), controls); }
    catch (error) { reportFailure('Could not save day note', error); throw error; }
  }, [mutate, reportFailure]);
  return { notes, setNote, fetchNotes: refresh, captureVersion, version };
}
