import { useState } from 'react';
import { aiApi } from '../../api/aiSuggestion';
import { userMessage } from '../../api/errors';
import { useAuth } from '../../context/AuthContext';

export default function AiListSection() {
  const { user, refreshUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!user?.ai_list_available || user.principal === 'agent') return null;

  async function toggle(enabled) {
    setBusy(true);
    setError('');
    try {
      await aiApi.setEnabled(enabled);
      await refreshUser();
    } catch (err) { setError(userMessage(err)); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 uppercase tracking-widest">AI suggestions</h3>
      <label className={`flex items-center gap-3 cursor-pointer ${busy ? 'opacity-60 pointer-events-none' : ''}`}>
        <div className="relative">
          <input type="checkbox" className="sr-only" checked={Boolean(user.ai_list_enabled)} disabled={busy}
            onChange={e => toggle(e.target.checked)} />
          <div className={`w-9 h-5 rounded-full transition-colors ${user.ai_list_enabled ? 'bg-indigo-500' : 'bg-zinc-200 dark:bg-zinc-700'}`} />
          <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white dark:bg-zinc-900 rounded-full shadow transition-transform ${user.ai_list_enabled ? 'translate-x-4' : ''}`} />
        </div>
        <span className="text-xs text-zinc-600 dark:text-zinc-300">Suggest a list for new tasks with AI</span>
      </label>
      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-relaxed">
        While you type a new task, its title and note are sent to Anthropic to pick a list. Only new tasks; your own choice always wins.
      </p>
      {error && <p role="alert" className="text-[11px] text-red-500">{error}</p>}
    </div>
  );
}
