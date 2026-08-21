import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useRegisterModal } from '../../context/ModalContext';
import useAsync from '../../hooks/useAsync';
import { useExams } from '../../context/ExamsContext';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { userMessage } from '../../api/errors';
import { TimePicker } from '../ui/TimePicker';
import ListsSection from '../settings/ListsSection';
import AppearanceSection from '../settings/AppearanceSection';
import QuotesSection from '../settings/QuotesSection';

// Mirrors the server's own 15-minute cache, so reopening this panel does not
// spend a rate-limit slot re-asking a question we already have the answer to.
const CHECK_MEMO_TTL_MS = 15 * 60 * 1000;
let checkMemo = null; // { data, at }

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Watchtower pulls the new image and restarts the container, so /api/health is
// unreachable for a while and then answers with a different commit. That change
// is the only reliable proof the update actually landed -- the response to the
// trigger itself usually never arrives.
async function pollForNewCommit(fromCommit, isCancelled, { intervalMs = 3000, timeoutMs = 300000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(intervalMs);
    if (isCancelled()) return 'cancelled';
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      const { commit } = await res.json();
      if (commit && commit !== fromCommit) return 'done';
    } catch (err) {
      // Expected for as long as the container is down; only the deadline decides.
      console.debug('[updates] health check failed mid-restart:', err.message);
    }
  }
  return 'timeout';
}

// A dropped connection (status 0) or a gateway error is the normal outcome: the
// container being restarted is the one serving this request. Only an answer the
// API itself produced -- a 4xx, or the 503 it uses for "update service
// unreachable" -- means the update never started.
function installReallyFailed(err) {
  return (err.status >= 400 && err.status < 500) || err.status === 503;
}

export default function SettingsPanel({ onClose, fetchTodos, onOpenWhatsNew }) {
  useRegisterModal();
  const { user, updateAccount, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { fetchExams } = useExams();

  const panelRef = useRef(null);
  // Navbar hands us a fresh arrow on every render, so this effect must not depend
  // on it -- it would re-run constantly and pull focus out of whatever field the
  // user is typing in.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const returnFocusTo = document.activeElement;
    panelRef.current?.focus({ preventScroll: true });
    function onKey(e) {
      if (e.key !== 'Escape') return;
      // A nested dialog (deleting a list) mounts its own [data-modal-root] after
      // ours, and Escape belongs to whichever one is on top.
      const roots = document.querySelectorAll('[data-modal-root]');
      if (roots[roots.length - 1] !== panelRef.current?.closest('[data-modal-root]')) return;
      onCloseRef.current();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (returnFocusTo instanceof HTMLElement) returnFocusTo.focus({ preventScroll: true });
    };
  }, []);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  // NOTE: the email-change form was never rendered -- `emailForm`/`emailOp` sat
  // here fully written with nothing calling them, so changing an email has
  // always been impossible from the UI even though PATCH /api/auth/me supports
  // it and is tested. Removed rather than left as unreachable code; re-adding
  // the form is small, but AR-8 wants a verification flow with it.
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const passwordOp = useAsync(async () => {
    if (passwordForm.newPassword !== passwordForm.confirm) throw new Error('Passwords do not match');
    await updateAccount({ currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword });
    setPasswordForm({ currentPassword: '', newPassword: '', confirm: '' });
    return 'Password updated successfully';
  });

  const [notifForm, setNotifForm] = useState({ notify_enabled: false, notify_time: '22:00', notify_email: '' });
  // 'loading' | 'ready' | 'failed'. A failed load used to leave the form sitting on
  // its useState defaults, so pressing Save wrote "notifications off, no address"
  // over the real settings -- a silent data loss triggered by a transient network
  // blip. Saving is refused until the current values are actually known.
  const [notifLoad, setNotifLoad] = useState('loading');
  const [notifLoadError, setNotifLoadError] = useState('');
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

  const [versionInfo, setVersionInfo] = useState(null);
  const [versionLoad, setVersionLoad] = useState('loading'); // 'loading' | 'ready' | 'failed'
  const [versionError, setVersionError] = useState('');
  const [installState, setInstallState] = useState('idle'); // 'idle' | 'started' | 'installed' | 'timeout'
  const [installError, setInstallError] = useState('');
  const closed = useRef(false);
  useEffect(() => () => { closed.current = true; }, []);

  const loadVersion = useCallback(async (force) => {
    if (!force && checkMemo && Date.now() - checkMemo.at < CHECK_MEMO_TTL_MS) {
      setVersionInfo(checkMemo.data);
      setVersionLoad('ready');
      return checkMemo.data;
    }
    const data = await api.get('/api/version');
    checkMemo = { data, at: Date.now() };
    setVersionInfo(data);
    setVersionLoad('ready');
    return data;
  }, []);

  // Only a failed request surfaces as an error here. A check that reached
  // GitHub and came back empty is reported by the paragraphs below, which can
  // say which of the two happened -- this one could only guess.
  const checkOp = useAsync(async () => { await loadVersion(true); });

  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreResult, setRestoreResult] = useState(null);
  const [restoreError, setRestoreError] = useState('');

  const loadNotifSettings = useCallback(async () => {
    setNotifLoad('loading');
    setNotifLoadError('');
    try {
      const data = await api.get('/api/auth/notification-settings');
      setNotifForm({
        notify_enabled: data.notify_enabled,
        notify_time: data.notify_time,
        notify_email: data.notify_email,
      });
      setNotifLoad('ready');
    } catch (err) {
      console.warn('[settings] failed to load notification settings:', err.kind, err.message);
      setNotifLoadError(userMessage(err));
      setNotifLoad('failed');
    }
  }, []);

  useEffect(() => { loadNotifSettings(); }, [loadNotifSettings]);

  useEffect(() => {
    loadVersion(false).catch(err => {
      console.warn('[settings] update check failed:', err.kind, err.message);
      setVersionError(userMessage(err));
      setVersionLoad('failed');
    });
  }, [loadVersion]);

  async function handleInstallUpdate() {
    setInstallError('');
    setInstallState('started');
    const fromCommit = versionInfo?.running?.commit;
    try {
      await api.post('/api/version/update');
    } catch (err) {
      if (installReallyFailed(err)) {
        console.warn('[settings] update refused:', err.status, err.message);
        setInstallState('idle');
        setInstallError(userMessage(err));
        return;
      }
      console.info('[settings] update trigger lost its connection, which is the expected case:', err.kind);
    }
    const outcome = await pollForNewCommit(fromCommit, () => closed.current);
    if (outcome !== 'cancelled') setInstallState(outcome === 'done' ? 'installed' : 'timeout');
  }

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
      fetchExams?.();
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
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-panel-title"
        tabIndex={-1}
        className="relative z-10 w-80 max-w-[calc(100vw-2.5rem)] bg-white dark:bg-zinc-900 border-l border-zinc-100 dark:border-zinc-800 flex flex-col h-full shadow-xl outline-none"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <h2 id="settings-panel-title" className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Account Settings</h2>
          <button onClick={onClose} aria-label="Close account settings" className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition p-1 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800">
            <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-8">
          <div>
            <p className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-1">Signed in as</p>
            <p className="text-sm text-zinc-700 dark:text-zinc-200 font-medium truncate">{user?.email}</p>
          </div>

          {/* Change password */}
          <form onSubmit={e => { e.preventDefault(); passwordOp.run(); }} className="space-y-3">
            <h3 className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 uppercase tracking-widest">Change Password</h3>
            <div>
              <label className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">Current password</label>
              <input
                type="password"
                required
                maxLength={128}
                value={passwordForm.currentPassword}
                onChange={e => setPasswordForm(f => ({ ...f, currentPassword: e.target.value }))}
                className="w-full text-sm border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">New password</label>
              <input
                type="password"
                required
                minLength={8}
                maxLength={128}
                value={passwordForm.newPassword}
                onChange={e => setPasswordForm(f => ({ ...f, newPassword: e.target.value }))}
                className="w-full text-sm border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
                placeholder="Min. 8 characters"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">Confirm new password</label>
              <input
                type="password"
                required
                maxLength={128}
                value={passwordForm.confirm}
                onChange={e => setPasswordForm(f => ({ ...f, confirm: e.target.value }))}
                className="w-full text-sm border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
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

          <div className="border-t border-zinc-100 dark:border-zinc-800" />

          {/* Lists */}
          <ListsSection fetchTodos={fetchTodos} />

          <div className="border-t border-zinc-100 dark:border-zinc-800" />

          <AppearanceSection />

          <div className="border-t border-zinc-100 dark:border-zinc-800" />

          <QuotesSection />

          <div className="border-t border-zinc-100 dark:border-zinc-800" />

          {/* Email Notifications */}
          <form onSubmit={e => { e.preventDefault(); notifOp.run(); }} className="space-y-3">
            <h3 className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 uppercase tracking-widest">Email Notifications</h3>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-relaxed">
              Receive a daily summary of all tasks you completed that day. Messages are sent at central european time.
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
                  disabled={notifLoad !== 'ready'}
                  onChange={e => setNotifForm(f => ({ ...f, notify_enabled: e.target.checked }))}
                />
                <div className={`w-9 h-5 rounded-full transition-colors ${notifForm.notify_enabled ? 'bg-indigo-500' : 'bg-zinc-200 dark:bg-zinc-700'}`} />
                <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white dark:bg-zinc-900 rounded-full shadow transition-transform ${notifForm.notify_enabled ? 'translate-x-4' : ''}`} />
              </div>
              <span className="text-xs text-zinc-600 dark:text-zinc-300">Enable daily summary</span>
            </label>

            <div className={notifForm.notify_enabled && notifLoad === 'ready' ? '' : 'opacity-40 pointer-events-none'}>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">Send to email</label>
                  <input
                    type="email"
                    maxLength={254}
                    value={notifForm.notify_email}
                    onChange={e => setNotifForm(f => ({ ...f, notify_email: e.target.value }))}
                    className="w-full text-sm border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">Send time</label>
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
              disabled={notifOp.loading || notifLoad !== 'ready'}
              className="w-full text-xs font-medium bg-indigo-500 hover:bg-indigo-600 text-white py-2 rounded-lg transition disabled:opacity-50"
            >
              {notifOp.loading ? 'Saving…' : notifLoad === 'loading' ? 'Loading…' : 'Save Notification Settings'}
            </button>
            <button
              type="button"
              disabled={testEmailOp.loading}
              onClick={testEmailOp.run}
              className="w-full text-xs font-medium border border-indigo-300 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950 py-2 rounded-lg transition disabled:opacity-50"
            >
              {testEmailOp.loading ? 'Sending…' : 'Send Test Email Now'}
            </button>
            {testEmailOp.error && <p className="text-xs text-red-500">{testEmailOp.error}</p>}
            {testEmailOp.success && <p className="text-xs text-emerald-600">{testEmailOp.success}</p>}
          </form>

          <div className="border-t border-zinc-100 dark:border-zinc-800" />

          {/* App Updates */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 uppercase tracking-widest">App Updates</h3>

            <div className="rounded-lg border border-zinc-100 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800">
              <div className="flex items-baseline justify-between px-3 py-2">
                <span className="text-[11px] text-zinc-400 dark:text-zinc-500">Running</span>
                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
                  {versionInfo ? `v${versionInfo.running.version} · ${versionInfo.running.commit}` : '—'}
                </span>
              </div>
              {versionInfo?.available && (
                <div className="flex items-baseline justify-between px-3 py-2">
                  <span className="text-[11px] text-zinc-400 dark:text-zinc-500">Latest</span>
                  <span className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
                    {versionInfo.latest ? `v${versionInfo.latest.version}` : 'unknown'}
                  </span>
                </div>
              )}
            </div>

            {versionLoad === 'loading' && (
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500">Checking for updates…</p>
            )}
            {versionLoad === 'failed' && <p className="text-xs text-red-500">{versionError}</p>}

            {versionInfo && !versionInfo.available && (
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-relaxed">
                This server is not configured to check for updates, so it cannot tell whether a newer version exists.
                Set <span className="font-mono text-zinc-500 dark:text-zinc-400">GITHUB_REPO</span> in the server environment to switch it on.
              </p>
            )}

            {versionInfo?.available && versionInfo.checkFailed && versionInfo.checkReason === 'no-versions' && (
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-relaxed">
                No versions have been published for this app yet, so there is nothing to compare against. Nothing is wrong with this app.
              </p>
            )}
            {versionInfo?.available && versionInfo.checkFailed && versionInfo.checkReason !== 'no-versions' && (
              <p className="text-[11px] text-amber-600 dark:text-amber-500 leading-relaxed">
                GitHub could not be reached, so the latest version is unknown. Nothing is wrong with this app.
              </p>
            )}
            {versionInfo?.available && versionInfo.stale && (
              <p className="text-[11px] text-amber-600 dark:text-amber-500 leading-relaxed">
                GitHub could not be reached just now — showing the last result instead.
              </p>
            )}
            {versionInfo?.updateAvailable && installState === 'idle' && (
              <p className="text-xs text-emerald-600 dark:text-emerald-500">
                Version {versionInfo.latest.version} is available.
                {!versionInfo.canInstall && ' It will install automatically at 04:00.'}
              </p>
            )}
            {versionInfo?.available && !versionInfo.updateAvailable && !versionInfo.checkFailed && installState === 'idle' && !checkOp.error && (
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500">You are on the latest version.</p>
            )}

            {installState === 'started' && (
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Update started. The server is restarting, so this may take a minute — leave the page open.
              </p>
            )}
            {installState === 'installed' && (
              <p className="text-xs text-emerald-600 dark:text-emerald-500">Update installed. Reload to use the new version.</p>
            )}
            {installState === 'timeout' && (
              <p className="text-[11px] text-amber-600 dark:text-amber-500 leading-relaxed">
                The new version has not come up yet. Give it another minute, then reload the page.
              </p>
            )}
            {installError && <p className="text-xs text-red-500">{installError}</p>}
            {checkOp.error && <p className="text-xs text-red-500">{checkOp.error}</p>}

            {installState === 'installed' || installState === 'timeout' ? (
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="w-full text-xs font-medium bg-indigo-500 hover:bg-indigo-600 text-white py-2 rounded-lg transition"
              >
                Reload now
              </button>
            ) : versionInfo?.updateAvailable && versionInfo.canInstall ? (
              <button
                type="button"
                disabled={installState === 'started'}
                onClick={handleInstallUpdate}
                className="w-full text-xs font-medium bg-indigo-500 hover:bg-indigo-600 text-white py-2 rounded-lg transition disabled:opacity-50"
              >
                {installState === 'started' ? 'Installing…' : 'Install now'}
              </button>
            ) : null}

            <button
              type="button"
              disabled={checkOp.loading || installState === 'started' || (versionInfo && !versionInfo.available)}
              onClick={() => checkOp.run()}
              className="w-full text-xs font-medium border border-indigo-300 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950 py-2 rounded-lg transition disabled:opacity-50"
            >
              {checkOp.loading ? 'Checking…' : 'Check for updates'}
            </button>

            <button
              type="button"
              onClick={() => { onClose(); onOpenWhatsNew?.(); }}
              className="w-full text-xs font-medium border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 py-2 rounded-lg transition"
            >
              See what's changed
            </button>
          </div>

          <div className="border-t border-zinc-100 dark:border-zinc-800" />

          {/* Backup & Restore */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 uppercase tracking-widest">Backup &amp; Restore</h3>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-relaxed">
              Download your lists, todos, exams and day notes as a JSON file, or restore from a previous backup. Existing items are never duplicated. Your account and password are not included.
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
              <label className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">Restore from backup</label>
              <label className={`flex items-center justify-center w-full py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition cursor-pointer ${restoreLoading ? 'opacity-50 pointer-events-none' : ''}`}>
                {restoreLoading ? 'Restoring…' : 'Choose backup file…'}
                <input type="file" accept=".json,application/json" className="sr-only" onChange={handleRestoreBackup} disabled={restoreLoading} />
              </label>
            </div>
            {restoreError && <p className="text-xs text-red-500">{restoreError}</p>}
            {restoreResult && (
              <p className="text-xs text-emerald-600">
                Restored {restoreResult.imported} todo{restoreResult.imported !== 1 ? 's' : ''}{restoreResult.skipped > 0 ? `, ${restoreResult.skipped} already existed` : ''}
                {restoreResult.examsImported != null ? ` · ${restoreResult.examsImported} exam${restoreResult.examsImported !== 1 ? 's' : ''}${restoreResult.examsSkipped > 0 ? `, ${restoreResult.examsSkipped} already existed` : ''}` : ''}.
              </p>
            )}
          </div>
        </div>

        <div className="px-5 py-4 pb-8 md:pb-4 border-t border-zinc-100 dark:border-zinc-800">
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
