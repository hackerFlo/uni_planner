import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { UndoProvider } from './context/UndoContext';
import { ListsProvider } from './context/ListsContext';
import { ExamsProvider } from './context/ExamsContext';
import ExamsModal from './components/exams/ExamsModal';
import { ModalProvider } from './context/ModalContext';
import { ToastProvider } from './context/ToastContext';
import PlannerPage from './pages/PlannerPage';
import ErrorBoundary from './components/ErrorBoundary';
import UpdatePrompt from './components/UpdatePrompt';
import GlobalErrorToast from './components/GlobalErrorToast';
import StaleBuildNotice from './components/StaleBuildNotice';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="flex h-screen items-center justify-center">
      <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  return user ? children : <Navigate to="/login" replace />;
}

function PublicOnlyRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/" replace /> : children;
}

export default function App() {
  useEffect(() => {
    function onWheel(e) {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    }
    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) {
        e.preventDefault();
      }
    }
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <ErrorBoundary>
      <ToastProvider>
      <GlobalErrorToast />
      <UpdatePrompt />
      <StaleBuildNotice />
      <ModalProvider>
      <AuthProvider>
        <UndoProvider>
        <ListsProvider>
          <ExamsProvider>
            <BrowserRouter>
              <Suspense fallback={null}>
                <Routes>
                  <Route path="/login" element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
                  <Route path="/" element={<ProtectedRoute><PlannerPage /></ProtectedRoute>} />
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
            <ExamsModal />
          </ExamsProvider>
        </ListsProvider>
        </UndoProvider>
      </AuthProvider>
      </ModalProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
