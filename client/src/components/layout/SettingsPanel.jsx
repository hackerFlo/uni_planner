import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useRegisterModal } from '../../context/ModalContext';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { TimePicker } from '../ui/TimePicker';
import ListsSection from '../settings/ListsSection';

function useAsync(fn) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function run(...args) {
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const msg = await fn(...args);
      if (msg) setSuccess(msg);
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return { loading, error, success, run };
}

export default function SettingsPanel({ onClose, fetchTodos, onOpenWhatsNew }) {
  useRegisterModal();
  const { user, updateAccount, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const [emailForm, setEmailForm] = useState({ newEmail: '', currentPassword: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const emailOp = useAsync(async () => {
    await updateAccount({ currentPassword: emailForm.currentPassword, newEmail: emailForm.newEmail });
    setEmailForm({ newEmail: '', currentPassword: '' });
    return 'Username / email updated successfully';
  });
  const passwordOp = useAsync(async () => {
    if (passwordForm.newPassword !== passwordForm.confirm) throw new Error('Passwords do not match');
    await updateAccount({ currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword });
    setPasswordForm({ currentPassword: '', newPassword: '', confirm: '' });
    return 'Password updated successfully';
  });

  const [notifForm, setNotifForm] = useState({ notify_enabled: false, notify_time: '22:00', notify_email: '' });
  const notifOp = useAsync(async () => {
    await api.patch('/api/auth/notification-settings', {
      ...notifForm,
      notify_tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    return 'Notification settings saved';
  });
  const testEmailOp = useAsync(async () => {
    const data = await api.post('/api/auth/test-email');
    return `Test email sent to ${data.sentTo}`;
  });

  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreResult, setRestoreResult] = useState(null);
  const [restoreError, setRestoreError] = useState('');

  useEffect(() => {
    api.get('/api/auth/notification-settings')
      .then(data => setNotifForm({ notify_enabled: data.notify_enabled, notify_time: data.notify_time, notify_email: data.notify_email }))
      .catch(err => console.warn('[settings] failed to load notification settings:', err.message));
  }, []);

  async function handleDownloadBackup() {
    setBackupLoading(true);
    try {
      const data = await api.get('/api/backup');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `uni-planner-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error('Backup download failed. Please try again.');
      console.warn('[settings] backup download failed:', err.message);
    } finally {
      setBackupLoading(false);
    }
  }

  async function handleRestoreBackup(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoreError('');
    setRestoreResult(null);
    setRestoreLoading(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const result = await api.post('/api/backup/restore', data);
      setRestoreResult(result);
      fetchTodos?.();
    } catch (err) {
      setRestoreError(err.message.includes('JSON') ? 'Invalid backup file' : err.message);
    } finally {
      setRestoreLoading(false);
      e.target.value = '';
    }
  }

  return (
    <div
      data-modal-root
      className="fixed inset-0 z-40 flex justify-end"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/10 backdrop-blur-[1px]" onClick={onClose} />
      <aside className="relative z-10 w-80 bg-white border-l border-zinc-100 flex flex-col h-full shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
          <h2 className="text-sm font-semibold text-zinc-800">Account Settings</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 transition p-1 rounded-lg hover:bg-zinc-50">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-8">
          <div>
            <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-widest mb-1">Signed in as</p>
            <p className="text-sm text-zinc-700 font-medium truncate">{user?.email}</p>
          </div>

          {/* Change password */}
          <form onSubmit={e => { e.preventDefault(); passwordOp.run(); }} className="space-y-3">
            <h3 className="text-xs font-semibold text-zinc-600 uppercase tracking-widest">Change Password</h3>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Current password</label>
              <input
                type="password"
                required
                maxLength={128}
                value={passwordForm.currentPassword}
                onChange={e => setPasswordForm(f => ({ ...f, currentPassword: e.target.value }))}
                className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">New password</label>
              <input
                type="password"
                required
                minLength={8}
                maxLength={128}
                value={passwordForm.newPassword}
                onChange={e => setPasswordForm(f => ({ ...f, newPassword: e.target.value }))}
                className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
                placeholder="Min. 8 characters"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Confirm new password</label>
              <input
                type="password"
                required
                maxLength={128}
                value={passwordForm.confirm}
                onChange={e => setPasswordForm(f => ({ ...f, confirm: e.target.value }))}
                className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
                placeholder="••••••••"
              />
            </div>
            {passwordOp.error && <p className="text-xs text-red-500">{passwordOp.error}</p>}
            {passwordOp.success && <p className="text-xs text-emerald-600">{passwordOp.success}</p>}
            <button
              type="submit"
              disabled={passwordOp.loading}
              className="w-full text-xs font-medium bg-indigo-500 hover:bg-indigo-600 text-white py-2 rounded-lg transition disabled:opacity-50"
            >
              {passwordOp.loading ? 'Saving…' : 'Update Password'}
            </button>
          </form>

          <div className="border-t border-zinc-100" />

          {/* Lists */}
          <ListsSection fetchTodos={fetchTodos} />

          <div className="border-t border-zinc-100" />

          {/* Email Notifications */}
          <form onSubmit={e => { e.preventDefault(); notifOp.run(); }} className="space-y-3">
            <h3 className="text-xs font-semibold text-zinc-600 uppercase tracking-widest">Email Notifications</h3>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Receive a daily summary of all tasks you completed that day. Messages are sent at central european time.
            </p>

            <label className="flex items-center gap-3 cursor-pointer">
              <div className="relative">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={notifForm.notify_enabled}
                  onChange={e => setNotifForm(f => ({ ...f, notify_enabled: e.target.checked }))}
                />
                <div className={`w-9 h-5 rounded-full transition-colors ${notifForm.notify_enabled ? 'bg-indigo-500' : 'bg-zinc-200'}`} />
                <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${notifForm.notify_enabled ? 'translate-x-4' : ''}`} />
              </div>
              <span className="text-xs text-zinc-600">Enable daily summary</span>
            </label>

            <div className={notifForm.notify_enabled ? '' : 'opacity-40 pointer-events-none'}>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Send to email</label>
                  <input
                    type="email"
                    maxLength={254}
                    value={notifForm.notify_email}
                    onChange={e => setNotifForm(f => ({ ...f, notify_email: e.target.value }))}
                    className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Send time</label>
                  <TimePicker
                    value={notifForm.notify_time}
                    onChange={t => setNotifForm(f => ({ ...f, notify_time: t }))}
                  />
                </div>
              </div>
            </div>

            {notifOp.error && <p className="text-xs text-red-500">{notifOp.error}</p>}
            {notifOp.success && <p className="text-xs text-emerald-600">{notifOp.success}</p>}
            <button
              type="submit"
              disabled={notifOp.loading}
              className="w-full text-xs font-medium bg-indigo-500 hover:bg-indigo-600 text-white py-2 rounded-lg transition disabled:opacity-50"
            >
              {notifOp.loading ? 'Saving…' : 'Save Notification Settings'}
            </button>
            <button
              type="button"
              disabled={testEmailOp.loading}
              onClick={testEmailOp.run}
              className="w-full text-xs font-medium border border-indigo-300 text-indigo-600 hover:bg-indigo-50 py-2 rounded-lg transition disabled:opacity-50"
            >
              {testEmailOp.loading ? 'Sending…' : 'Send Test Email Now'}
            </button>
            {testEmailOp.error && <p className="text-xs text-red-500">{testEmailOp.error}</p>}
            {testEmailOp.success && <p className="text-xs text-emerald-600">{testEmailOp.success}</p>}
          </form>

          <div className="border-t border-zinc-100" />

          {/* App Updates */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-zinc-600 uppercase tracking-widest">App Updates</h3>
            <p className="text-[11px] text-zinc-400 leading-relaxed">See what's changed in the most recent update.</p>
            <button
              type="button"
              onClick={() => { onClose(); onOpenWhatsNew?.(); }}
              className="w-full text-xs font-medium border border-indigo-300 text-indigo-600 hover:bg-indigo-50 py-2 rounded-lg transition"
            >
              See what's changed
            </button>
          </div>

          <div className="border-t border-zinc-100" />

          {/* Backup & Restore */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-zinc-600 uppercase tracking-widest">Backup &amp; Restore</h3>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Download all your todos as a JSON file, or restore from a previous backup. Existing items are never duplicated.
            </p>
            <button
              type="button"
              disabled={backupLoading}
              onClick={handleDownloadBackup}
              className="w-full text-xs font-medium bg-indigo-500 hover:bg-indigo-600 text-white py-2 rounded-lg transition disabled:opacity-50"
            >
              {backupLoading ? 'Preparing…' : 'Download Backup'}
            </button>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Restore from backup</label>
              <label className={`flex items-center justify-center w-full py-2 rounded-lg border border-zinc-200 text-xs text-zinc-500 hover:bg-zinc-50 transition cursor-pointer ${restoreLoading ? 'opacity-50 pointer-events-none' : ''}`}>
                {restoreLoading ? 'Restoring…' : 'Choose backup file…'}
                <input type="file" accept=".json,application/json" className="sr-only" onChange={handleRestoreBackup} disabled={restoreLoading} />
              </label>
            </div>
            {restoreError && <p className="text-xs text-red-500">{restoreError}</p>}
            {restoreResult && (
              <p className="text-xs text-emerald-600">
                Restored {restoreResult.imported} item{restoreResult.imported !== 1 ? 's' : ''}{restoreResult.skipped > 0 ? `, ${restoreResult.skipped} already existed` : ''}.
              </p>
            )}
          </div>
        </div>

        <div className="px-5 py-4 pb-8 md:pb-4 border-t border-zinc-100">
          <button
            onClick={handleLogout}
            className="w-full text-xs font-medium bg-red-500 hover:bg-red-600 text-white py-2 rounded-lg transition"
          >
            Log out
          </button>
        </div>
      </aside>
    </div>
  );
}
