import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { api } from '../api/client';
import { parseDateLocal } from '../utils/dates';
import { useToday } from './TimeContext';
import { useAuth } from './AuthContext';

import { usePlannerResource } from '../hooks/usePlannerResource';
const ExamsContext = createContext(null);
const EMPTY = [];

const MS_PER_DAY = 86400000;

function daysUntil(dateStr, todayIso) {
  return Math.round((parseDateLocal(dateStr) - parseDateLocal(todayIso)) / MS_PER_DAY);
}

export function ExamsProvider({ children }) {
  const todayIso = useToday();
  const { user } = useAuth();
  const [modalAccount, setModalAccount] = useState(null);
  const isModalOpen = Boolean(user?.id && modalAccount === user.id);
  const { data, refresh: fetchExams, mutate, captureVersion, version } = usePlannerResource('/api/exams', 'exams');
  const exams = data ?? EMPTY;

  // todayIso is a real dependency: daysUntil reads it, so leaving it out froze
  // every countdown at whatever it was when the exams were last fetched.
  const upcomingExams = useMemo(
    () => exams
      .map(e => ({ ...e, daysRemaining: daysUntil(e.exam_date, todayIso) }))
      .filter(e => e.daysRemaining >= 0)
      .sort((a, b) => a.daysRemaining - b.daysRemaining),
    [exams, todayIso]
  );

  const addExam = useCallback(async (title, examDate, controls) => {
    const result = await mutate(options => api.post('/api/exams', { title, exam_date: examDate }, options), controls);
    return result.exam ?? result.data?.exam;
  }, [mutate]);
  const updateExam = useCallback(async (id, updates, controls) => {
    const result = await mutate(options => api.patch(`/api/exams/${id}`, updates, options), controls);
    return result.exam ?? result.data?.exam;
  }, [mutate]);
  const deleteExam = useCallback((id, controls) => mutate(options => api.delete(`/api/exams/${id}`, options), controls), [mutate]);

  return (
    <ExamsContext.Provider value={{
      upcomingExams,
      captureVersion,
      version,
      nextExam: upcomingExams[0] ?? null,
      fetchExams,
      addExam,
      updateExam,
      deleteExam,
      isModalOpen,
      openModal: () => setModalAccount(user?.id ?? null),
      closeModal: () => setModalAccount(null),
    }}>
      {children}
    </ExamsContext.Provider>
  );
}

export function useExams() {
  return useContext(ExamsContext);
}
