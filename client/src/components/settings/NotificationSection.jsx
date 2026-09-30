import { useCallback, useEffect, useRef, useState } from 'react';
import { notificationApi, capturedRequest } from '../../api/settingsMutations';
import { userMessage } from '../../api/errors';
import { useUndo } from '../../context/UndoContext';
import useAsync from '../../hooks/useAsync';
import { TimePicker } from '../ui/TimePicker';

export default function NotificationSection() {
  const undo = useUndo();
  const [notifForm, setNotifForm] = useState({ notify_enabled: false, notify_time: '22:00', notify_email: '' });
  const [version, setVersion] = useState(null);
  const [notifLoad, setNotifLoad] = useState('loading');
  const [notifLoadError, setNotifLoadError] = useState('');
  const saveAttempt = useRef(capturedRequest(notificationApi.save));
  const emailAttempt = useRef(capturedRequest(notificationApi.sendTest, undefined, { retainConflict: true }));
  const loadNotifSettings = useCallback(async () => {
    setNotifLoad('loading');
    setNotifLoadError('');
    try {
      const data = await notificationApi.settings();
      setNotifForm({ notify_enabled: data.notify_enabled, notify_time: data.notify_time, notify_email: data.notify_email });
      setVersion(data.version);
      setNotifLoad('ready');
    } catch (error) { setNotifLoadError(userMessage(error)); setNotifLoad('failed'); }
  }, []);
  useEffect(() => { loadNotifSettings(); }, [loadNotifSettings]);
  const notifOp = useAsync(async () => {
    try {
      const receipt = await saveAttempt.current.run({ ...notifForm, notify_tz: Intl.DateTimeFormat().resolvedOptions().timeZone }, version);
      if (receipt.replayed) await loadNotifSettings();
      else {
        setVersion(receipt.currentVersion);
        const saved = receipt.data;
        setNotifForm({ notify_enabled: saved.notify_enabled, notify_time: saved.notify_time, notify_email: saved.notify_email });
      }
      undo?.recordOperation(receipt, loadNotifSettings);
      return 'Notification settings saved';
    } catch (error) {
      if (error.status === 409) { setNotifLoad('failed'); setNotifLoadError('The planner changed. Reload before saving this draft.'); }
      throw error;
    }
  });
  const testEmailOp = useAsync(async () => {
    const result = await emailAttempt.current.run({}, version);
    return result.status === 'in_progress' ? 'The previous email attempt is still being processed. Retry to check its status.' : 'Test email sent to the saved recipient';
  });
  const locked = notifOp.loading || saveAttempt.current.pending;

  return (
<form onSubmit={e => { e.preventDefault(); notifOp.run(); }} className="space-y-3">
            <h3 className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 uppercase tracking-widest">Email Notifications</h3>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-relaxed">
              Receive a daily summary of all tasks you completed that day. Messages use the saved local time zone.
            </p>

            {notifLoad === 'failed' && (
              <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 px-3 py-2 space-y-1.5">
                <p className="text-[11px] text-amber-800 dark:text-amber-200 leading-relaxed">
                  Your current notification settings could not be loaded, so they cannot be
                  saved from here without overwriting them. {notifLoadError}
                </p>
                <button
                  type="button"
                  onClick={loadNotifSettings}
                  className="text-[11px] font-medium text-amber-900 underline underline-offset-2 hover:no-underline"
                >
                  Try again
                </button>
              </div>
            )}

            <label className="flex items-center gap-3 cursor-pointer">
              <div className="relative">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={notifForm.notify_enabled}
                  disabled={notifLoad !== 'ready' || locked}
                  onChange={e => setNotifForm(f => ({ ...f, notify_enabled: e.target.checked }))}
                />
                <div className={`w-9 h-5 rounded-full transition-colors ${notifForm.notify_enabled ? 'bg-indigo-500' : 'bg-zinc-200 dark:bg-zinc-700'}`} />
                <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white dark:bg-zinc-900 rounded-full shadow transition-transform ${notifForm.notify_enabled ? 'translate-x-4' : ''}`} />
              </div>
              <span className="text-xs text-zinc-600 dark:text-zinc-300">Enable daily summary</span>
            </label>

            <div className={notifForm.notify_enabled && notifLoad === 'ready' && !locked ? '' : 'opacity-40 pointer-events-none'}>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">Send to email</label>
                  <input
                    type="email"
                    maxLength={254}
                    value={notifForm.notify_email}
                    disabled={locked || notifLoad !== 'ready'}
                    onChange={e => setNotifForm(f => ({ ...f, notify_email: e.target.value }))}
                    className="w-full text-sm border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">Send time</label>
                  <TimePicker
                    value={notifForm.notify_time}
                    onChange={t => { if (!locked && notifLoad === 'ready') setNotifForm(f => ({ ...f, notify_time: t })); }}
                  />
                </div>
              </div>
            </div>

            {notifOp.error && <p className="text-xs text-red-500">{notifOp.error}</p>}
            {notifOp.success && <p className="text-xs text-emerald-600">{notifOp.success}</p>}
            <button
              type="submit"
              disabled={notifOp.loading || notifLoad !== 'ready'}
              className="w-full text-xs font-medium bg-indigo-500 hover:bg-indigo-600 text-white py-2 rounded-lg transition disabled:opacity-50"
            >
              {notifOp.loading ? 'Saving…' : notifLoad === 'loading' ? 'Loading…' : saveAttempt.current.pending ? 'Retry Previous Save' : 'Save Notification Settings'}
            </button>
            <button
              type="button"
              disabled={testEmailOp.loading || notifOp.loading || notifLoad !== 'ready'}
              onClick={testEmailOp.run}
              className="w-full text-xs font-medium border border-indigo-300 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950 py-2 rounded-lg transition disabled:opacity-50"
            >
              {testEmailOp.loading ? 'Sending…' : emailAttempt.current.pending ? 'Check Previous Email Attempt' : 'Send Test Email Now'}
            </button>
            {testEmailOp.error && <p className="text-xs text-red-500">{testEmailOp.error}</p>}
            {testEmailOp.success && <p className="text-xs text-emerald-600">{testEmailOp.success}</p>}
          </form>
  );
}
