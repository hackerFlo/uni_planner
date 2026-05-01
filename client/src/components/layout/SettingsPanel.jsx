import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { TimePicker } from '../ui/TimePicker';

export default function SettingsPanel({ onClose }) {
  const { user, updateAccount, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const [emailForm, setEmailForm] = useState({ newEmail: '', currentPassword: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  const [notifForm, setNotifForm] = useState({ notify_enabled: false, notify_time: '22:00', notify_email: '' });
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifError, setNotifError] = useState('');
  const [notifSuccess, setNotifSuccess] = useState('');

  useEffect(() => {
    fetch('/api/auth/notification-settings', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setNotifForm({ notify_enabled: data.notify_enabled, notify_time: data.notify_time, notify_email: data.notify_email }); })
      .catch(() => {});
  }, []);

  async function handleEmailSubmit(e) {
    e.preventDefault();
    setEmailError('');
    setEmailSuccess('');
    setEmailLoading(true);
    try {
      await updateAccount({ currentPassword: emailForm.currentPassword, newEmail: emailForm.newEmail });
      setEmailSuccess('Username / email updated successfully');
      setEmailForm({ newEmail: '', currentPassword: '' });
    } catch (err) {
      setEmailError(err.message);
    } finally {
      setEmailLoading(false);
    }
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');
    if (passwordForm.newPassword !== passwordForm.confirm) {
      setPasswordError('Passwords do not match');
      return;
    }
    setPasswordLoading(true);
    try {
      await updateAccount({ currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword });
      setPasswordSuccess('Password updated successfully');
      setPasswordForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      setPasswordError(err.message);
    } finally {
      setPasswordLoading(false);
    }
  }

  async function handleNotifSubmit(e) {
    e.preventDefault();
    setNotifError('');
    setNotifSuccess('');
    setNotifLoading(true);
    try {
      const res = await fetch('/api/auth/notification-settings', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notifForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      setNotifSuccess('Notification settings saved');
    } catch (err) {
      setNotifError(err.message);
    } finally {
      setNotifLoading(false);
    }
  }

  return (
    <div
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

          {/* Change username / email */}
          <form onSubmit={handleEmailSubmit} className="space-y-3">
            <h3 className="text-xs font-semibold text-zinc-600 uppercase tracking-widest">Change Username / Email</h3>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">New username or email</label>
              <input
                type="text"
                required
                maxLength={100}
                value={emailForm.newEmail}
                onChange={e => setEmailForm(f => ({ ...f, newEmail: e.target.value }))}
                className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
                placeholder="username or new@example.com"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Current password</label>
              <input
                type="password"
                required
                maxLength={128}
                value={emailForm.currentPassword}
                onChange={e => setEmailForm(f => ({ ...f, currentPassword: e.target.value }))}
                className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
                placeholder="••••••••"
              />
            </div>
            {emailError && <p className="text-xs text-red-500">{emailError}</p>}
            {emailSuccess && <p className="text-xs text-emerald-600">{emailSuccess}</p>}
            <button
              type="submit"
              disabled={emailLoading}
              className="w-full text-xs font-medium bg-indigo-500 hover:bg-indigo-600 text-white py-2 rounded-lg transition disabled:opacity-50"
            >
              {emailLoading ? 'Saving…' : 'Update Username / Email'}
            </button>
          </form>

          <div className="border-t border-zinc-100" />

          {/* Change password */}
          <form onSubmit={handlePasswordSubmit} className="space-y-3">
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
            {passwordError && <p className="text-xs text-red-500">{passwordError}</p>}
            {passwordSuccess && <p className="text-xs text-emerald-600">{passwordSuccess}</p>}
            <button
              type="submit"
              disabled={passwordLoading}
              className="w-full text-xs font-medium bg-indigo-500 hover:bg-indigo-600 text-white py-2 rounded-lg transition disabled:opacity-50"
            >
              {passwordLoading ? 'Saving…' : 'Update Password'}
            </button>
          </form>

          <div className="border-t border-zinc-100" />

          {/* Email Notifications */}
          <form onSubmit={handleNotifSubmit} className="space-y-3">
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

            {notifError && <p className="text-xs text-red-500">{notifError}</p>}
            {notifSuccess && <p className="text-xs text-emerald-600">{notifSuccess}</p>}
            <button
              type="submit"
              disabled={notifLoading}
              className="w-full text-xs font-medium bg-indigo-500 hover:bg-indigo-600 text-white py-2 rounded-lg transition disabled:opacity-50"
            >
              {notifLoading ? 'Saving…' : 'Save Notification Settings'}
            </button>
          </form>
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
