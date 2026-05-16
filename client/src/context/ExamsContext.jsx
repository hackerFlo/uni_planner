import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from './AuthContext';

const ExamsContext = createContext(null);

const MS_PER_DAY = 86400000;

function parseDateLocal(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((parseDateLocal(dateStr) - today) / MS_PER_DAY);
}

export function ExamsProvider({ children }) {
  const { user } = useAuth();
  const [exams, setExams] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchExams = useCallback(async () => {
    if (!user) { setExams([]); return; }
    try {
      const { exams: fetched } = await api.get('/api/exams');
      setExams(fetched);
    } catch (err) {
      console.warn('[exams] failed to load:', err.message);
    }
  }, [user]);

  useEffect(() => { fetchExams(); }, [fetchExams]);

  const upcomingExams = useMemo(
    () => exams
      .map(e => ({ ...e, daysRemaining: daysUntil(e.exam_date) }))
      .filter(e => e.daysRemaining >= 0)
      .sort((a, b) => a.daysRemaining - b.daysRemaining),
    [exams]
  );

  async function addExam(title, examDate) {
    const { exam } = await api.post('/api/exams', { title, exam_date: examDate });
    setExams(prev => [...prev, exam]);
    return exam;
  }

  async function updateExam(id, updates) {
    const { exam } = await api.patch(`/api/exams/${id}`, updates);
    setExams(prev => prev.map(e => e.id === id ? exam : e));
    return exam;
  }

  async function deleteExam(id) {
    await api.delete(`/api/exams/${id}`);
    setExams(prev => prev.filter(e => e.id !== id));
  }

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
