import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { userMessage } from '../api/errors';
import { useAuth } from './AuthContext';
import { useUndo } from './UndoContext';
import { useToast } from './ToastContext';
import { parseDateLocal } from '../utils/dates';
import { useToday } from './TimeContext';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

const ExamsContext = createContext(null);

const MS_PER_DAY = 86400000;

function daysUntil(dateStr, todayIso) {
  return Math.round((parseDateLocal(dateStr) - parseDateLocal(todayIso)) / MS_PER_DAY);
}

export function ExamsProvider({ children }) {
  const { user } = useAuth();
  const { recordUndo } = useUndo();
  const toast = useToast();
  const todayIso = useToday();
  const [exams, setExams] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const examsRef = useRef(exams);
  useEffect(() => { examsRef.current = exams; }, [exams]);

  const fetchExams = useCallback(async () => {
    if (!user) { setExams([]); return; }
    try {
      const { exams: fetched } = await api.get('/api/exams');
      setExams(fetched);
    } catch (err) {
      console.warn('[exams] failed to load:', err.kind, err.message);
      toast?.error(`Could not load exams. ${userMessage(err)}`, { ref: err.requestId ?? null });
    }
  }, [user, toast]);

  useEffect(() => { fetchExams(); }, [fetchExams]);
  useAutoRefresh(fetchExams);

  // todayIso is a real dependency: daysUntil reads it, so leaving it out froze
  // every countdown at whatever it was when the exams were last fetched.
  const upcomingExams = useMemo(
    () => exams
      .map(e => ({ ...e, daysRemaining: daysUntil(e.exam_date, todayIso) }))
      .filter(e => e.daysRemaining >= 0)
      .sort((a, b) => a.daysRemaining - b.daysRemaining),
    [exams, todayIso]
  );

  const addExam = useCallback(async (title, examDate) => {
    const { exam } = await api.post('/api/exams', { title, exam_date: examDate });
    setExams(prev => [...prev, exam]);
    recordUndo(async () => {
      await api.delete(`/api/exams/${exam.id}`);
      setExams(prev => prev.filter(e => e.id !== exam.id));
    });
    return exam;
  }, [recordUndo]);

  const updateExam = useCallback(async (id, updates) => {
    const prevExam = examsRef.current.find(e => e.id === id);
    const { exam } = await api.patch(`/api/exams/${id}`, updates);
    setExams(prev => prev.map(e => e.id === id ? exam : e));
    if (prevExam) {
      recordUndo(async () => {
        const { exam: reverted } = await api.patch(`/api/exams/${id}`, { title: prevExam.title, exam_date: prevExam.exam_date });
        setExams(prev => prev.map(e => e.id === id ? reverted : e));
      });
    }
    return exam;
  }, [recordUndo]);

  const deleteExam = useCallback(async (id) => {
    const prevExam = examsRef.current.find(e => e.id === id);
    await api.delete(`/api/exams/${id}`);
    setExams(prev => prev.filter(e => e.id !== id));
    if (prevExam) {
      recordUndo(async () => {
        const { exam: restored } = await api.post('/api/exams', { title: prevExam.title, exam_date: prevExam.exam_date });
        setExams(prev => [...prev, restored]);
      });
    }
  }, [recordUndo]);

  return (
    <ExamsContext.Provider value={{
      upcomingExams,
      nextExam: upcomingExams[0] ?? null,
      fetchExams,
      addExam,
      updateExam,
      deleteExam,
      isModalOpen,
      openModal: () => setIsModalOpen(true),
      closeModal: () => setIsModalOpen(false),
    }}>
      {children}
    </ExamsContext.Provider>
  );
}

export function useExams() {
  return useContext(ExamsContext);
}
