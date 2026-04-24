import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function NotFoundPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-indigo-500 mb-5">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>

        <p className="text-[80px] font-semibold text-zinc-100 leading-none select-none -mb-4">404</p>
        <h1 className="text-xl font-semibold text-zinc-800 tracking-tight mb-2">Page not found</h1>
        <p className="text-sm text-zinc-400 mb-8">
          This page doesn't exist or has been moved.
        </p>

        <button
          onClick={() => navigate(user ? '/' : '/login')}
          className="inline-flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          {user ? 'Back to planner' : 'Back to login'}
        </button>
      </div>
    </div>
  );
}
