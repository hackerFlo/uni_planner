import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { UndoProvider } from './context/UndoContext';
import { ListsProvider } from './context/ListsContext';
import { ExamsProvider, useExams } from './context/ExamsContext';
import { ExamsModal } from './components/lazyDialogs';
import { ModalProvider } from './context/ModalContext';
import { ToastProvider } from './context/ToastContext';
import { TimeProvider } from './context/TimeContext';
import { PreferencesProvider } from './context/PreferencesContext';
import PlannerPage from './pages/PlannerPage';
import ErrorBoundary from './components/ErrorBoundary';
import GlobalErrorToast from './components/GlobalErrorToast';
import NewVersionNotice from './components/NewVersionNotice';
import LoadingBar from './components/LoadingBar';
import { PlannerSkeleton } from './components/ui/Skeleton';
import { useLoadingVeil } from './hooks/useLoadingVeil';
import { SHIMMER_CYCLE_MS } from './utils/loadingVeil';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const AgentView = lazy(() => import('./agent/AgentView'));

function ExamsModalHost() {
  const { isModalOpen } = useExams();
  return isModalOpen ? <Suspense fallback={null}><ExamsModal /></Suspense> : null;
}

// The pre-JS skeleton in index.html started shimmering at first paint; starting
// this one at the same point in the cycle keeps the sweep from jumping at hand-over.
const SHIMMER_PHASE = { '--shimmer-delay': `-${Math.round(performance.now() % SHIMMER_CYCLE_MS)}ms` };

function ProtectedRoute({ children, plain = false }) {
  const { user, loading } = useAuth();
  const veil = useLoadingVeil(loading);
  if (plain) {
    if (loading) return <p role="status" className="p-6 text-sm text-zinc-400 dark:text-zinc-500">Loading…</p>;
    return user ? children : <Navigate to="/login" replace />;
  }
  if (!loading && !user) return <Navigate to="/login" replace />;
  // The planner mounts underneath while the skeleton is still up, so its data
  // loads during the hold and the fade reveals a finished board.
  return (
    <>
      {!loading && children}
      {veil !== 'gone' && (
        <div className={`fixed inset-0 z-[100]${veil === 'fading' ? ' veil-out' : ''}`} style={SHIMMER_PHASE}>
          <PlannerSkeleton />
        </div>
      )}
    </>
  );
}

function PublicOnlyRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/" replace /> : children;
}

// An agent session is locked to the agent view: every path, /login included,
// lands on /agent. The owner may open /agent to preview what the agent sees.
function AppRoutes() {
  const { user } = useAuth();
  if (user?.principal === 'agent') {
    return (
      <Routes>
        <Route path="/agent/*" element={<AgentView />} />
        <Route path="*" element={<Navigate to="/agent" replace />} />
      </Routes>
    );
  }
  return (
    <Routes>
      <Route path="/login" element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
      <Route path="/agent/*" element={<ProtectedRoute plain><AgentView /></ProtectedRoute>} />
      <Route path="/" element={<ProtectedRoute><PlannerPage /></ProtectedRoute>} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
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
      <LoadingBar />
      <GlobalErrorToast />
      <NewVersionNotice />
      <ModalProvider>
      <AuthProvider>
      <TimeProvider>
      <PreferencesProvider>
        <UndoProvider>
        <ListsProvider>
          <ExamsProvider>
            <BrowserRouter>
              <Suspense fallback={null}>
                <AppRoutes />
              </Suspense>
            </BrowserRouter>
            <ExamsModalHost />
          </ExamsProvider>
        </ListsProvider>
        </UndoProvider>
      </PreferencesProvider>
      </TimeProvider>
      </AuthProvider>
      </ModalProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
