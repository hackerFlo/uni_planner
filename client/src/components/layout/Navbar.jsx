import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import SettingsPanel from './SettingsPanel';

export default function Navbar({ onArchiveToggle, archiveOpen }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <>
      <header className="h-14 flex-shrink-0 border-b border-zinc-100 flex items-center px-5 gap-4 bg-white">
        <div className="flex items-center gap-2.5 mr-auto">
          <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-zinc-800 tracking-tight">Uni Planner</span>
        </div>

        <button
          onClick={onArchiveToggle}
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition ${
            archiveOpen
              ? 'bg-indigo-50 text-indigo-600'
              : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
          Archive
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setSettingsOpen(v => !v)}
            className="text-xs text-zinc-400 hover:text-zinc-700 font-medium transition px-2 py-1 rounded-lg hover:bg-zinc-50 hidden sm:block"
            title="Account settings"
          >
            {user?.email}
          </button>
          <button
            onClick={handleLogout}
            className="text-xs text-zinc-500 hover:text-zinc-800 font-medium transition px-2.5 py-1.5 rounded-lg hover:bg-zinc-50"
          >
            Log out
          </button>
        </div>
      </header>

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </>
  );
}
