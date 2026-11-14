import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { agentAccountApi, accountStatusLabel, formatAccountTime } from '../../api/agentAccount';
import { userMessage } from '../../api/errors';
import ConfirmPopover from '../ui/ConfirmPopover';

const INPUT_CLASS = 'w-full text-sm border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition';
const PRIMARY_CLASS = 'w-full text-xs font-medium bg-indigo-500 hover:bg-indigo-600 text-white py-2 rounded-lg transition disabled:opacity-50';
const SECONDARY_CLASS = 'text-xs font-medium border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 px-3 py-2 rounded-lg transition disabled:opacity-50';
const DANGER_CLASS = 'text-xs font-medium border border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950 px-3 py-2 rounded-lg transition disabled:opacity-50';
const NOTE_CLASS = 'text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed';
const COPIED_RESET_MS = 2000;

function PasswordField({ label, value, onChange, disabled }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">{label}</label>
      <input id={id} type="password" autoComplete="current-password" required maxLength={128}
        value={value} onChange={event => onChange(event.target.value)} disabled={disabled}
        className={INPUT_CLASS} placeholder="••••••••" />
    </div>
  );
}

function GeneratedPassword({ password, onDismiss }) {
  const id = useId();
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopyError(false);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch (err) {
      console.warn('[agent-account] clipboard write failed', err.message);
      setCopyError(true);
    }
  }
  return (
    <div className="space-y-2 rounded-lg border border-amber-300 dark:border-amber-700 p-3">
      <label htmlFor={id} className="block text-xs font-medium text-zinc-600 dark:text-zinc-300">Agent password</label>
      <div className="flex gap-2">
        <input id={id} readOnly value={password} onFocus={event => event.target.select()}
          className={`${INPUT_CLASS} font-mono`} />
        <button type="button" onClick={copy} className={SECONDARY_CLASS}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <p role="note" className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
        Shown only once — store it in the agent now.
      </p>
      {copyError && <p role="alert" className="text-xs text-red-500">Copy failed. Select the password and copy it manually.</p>}
      <button type="button" onClick={onDismiss} className={SECONDARY_CLASS}>I have stored it</button>
    </div>
  );
}

function CreateForm({ busy, onCreate }) {
  const emailId = useId();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  function submit(event) {
    event.preventDefault();
    const submitted = password;
    setPassword('');
    onCreate(submitted, email.trim());
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <p className={NOTE_CLASS}>
        Give an AI browser agent its own login. It works on your planner, its changes show the agent icon, and it cannot change your account, backups or connections.
      </p>
      <div>
        <label htmlFor={emailId} className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">Agent email</label>
        <input id={emailId} type="email" autoComplete="off" required maxLength={254}
          value={email} onChange={event => setEmail(event.target.value)} disabled={busy} className={INPUT_CLASS} />
      </div>
      <PasswordField label="Your current password" value={password} onChange={setPassword} disabled={busy} />
      <button type="submit" disabled={busy || !email || !password} className={PRIMARY_CLASS}>
        {busy ? 'Creating…' : 'Create agent account'}
      </button>
    </form>
  );
}

function PasswordAction({ label, hint, busy, onSubmit, danger }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  function submit(event) {
    event?.preventDefault();
    const submitted = password;
    setPassword('');
    setOpen(false);
    onSubmit(submitted);
  }
  if (!open) {
    return <button type="button" disabled={busy} onClick={() => setOpen(true)} className={danger ? DANGER_CLASS : SECONDARY_CLASS}>{label}</button>;
  }
  return (
    <form onSubmit={submit} className="w-full space-y-2">
      {hint && <p className={NOTE_CLASS}>{hint}</p>}
      <PasswordField label="Your current password" value={password} onChange={setPassword} disabled={busy} />
      <div className="flex gap-2">
        {danger ? (
          <ConfirmPopover options={[{ label: 'Delete agent account', tone: 'danger' }]} onSelect={() => password && submit()}>
            <button type="button" disabled={busy || !password} className={DANGER_CLASS}>{label}</button>
          </ConfirmPopover>
        ) : (
          <button type="submit" disabled={busy || !password} className={SECONDARY_CLASS}>{label}</button>
        )}
        <button type="button" onClick={() => { setOpen(false); setPassword(''); }} className="text-xs text-zinc-500 underline">Cancel</button>
      </div>
    </form>
  );
}

function AccountDetails({ account }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-zinc-600 dark:text-zinc-300">
      <dt className="text-zinc-500 dark:text-zinc-400">Email</dt><dd className="truncate">{account.email}</dd>
      <dt className="text-zinc-500 dark:text-zinc-400">Status</dt><dd>{accountStatusLabel(account)}</dd>
      <dt className="text-zinc-500 dark:text-zinc-400">Created</dt><dd>{formatAccountTime(account.created_at)}</dd>
      <dt className="text-zinc-500 dark:text-zinc-400">Last login</dt><dd>{formatAccountTime(account.last_login_at)}</dd>
    </dl>
  );
}

function AccountActions({ account, busy, run }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} className={SECONDARY_CLASS}
          onClick={() => run(() => agentAccountApi.setDisabled(!account.disabled), account.disabled ? 'Agent account enabled.' : 'Agent account disabled and signed out.')}>
          {account.disabled ? 'Enable' : 'Disable'}
        </button>
        <button type="button" disabled={busy} className={SECONDARY_CLASS}
          onClick={() => run(() => agentAccountApi.signOut(), 'Agent signed out.')}>Sign out agent</button>
      </div>
      <div className="flex flex-wrap gap-2">
        <PasswordAction label="Reset password" busy={busy}
          hint="Generates a new password and signs the agent out."
          onSubmit={password => run(() => agentAccountApi.resetPassword(password), 'Password reset. Agent signed out.')} />
        <PasswordAction label="Delete agent account" danger busy={busy}
          hint="Permanently removes the agent login. Its past changes stay in your planner."
          onSubmit={password => run(() => agentAccountApi.remove(password), 'Agent account deleted.')} />
      </div>
    </div>
  );
}

export default function AgentAccountSection() {
  const [account, setAccount] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [generated, setGenerated] = useState('');
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    setError('');
    try {
      setAccount((await agentAccountApi.get()).account);
      setLoaded(true);
    } catch (err) {
      setError(userMessage(err));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function run(action, message) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    setSuccess('');
    setGenerated('');
    try {
      const result = await action();
      if ('account' in result) setAccount(result.account);
      if (result.password) setGenerated(result.password);
      setSuccess(message);
      if (!('account' in result)) await load();
    } catch (err) {
      setError(userMessage(err));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3" aria-labelledby="agent-account-heading" aria-busy={busy}>
      <h3 id="agent-account-heading" className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 uppercase tracking-widest">Agent account</h3>
      {!loaded && !error && <p role="status" className="text-xs text-zinc-500 dark:text-zinc-400">Loading agent account…</p>}
      {generated && <GeneratedPassword password={generated} onDismiss={() => setGenerated('')} />}
      {loaded && !account && <CreateForm busy={busy}
        onCreate={(password, email) => run(() => agentAccountApi.create(password, email), 'Agent account created.')} />}
      {loaded && account && <>
        <AccountDetails account={account} />
        <AccountActions account={account} busy={busy} run={run} />
      </>}
      {error && <div className="space-y-2">
        <p role="alert" className="text-xs text-red-500">{error}</p>
        {!loaded && <button type="button" onClick={load} className="text-xs text-indigo-600 underline">Try again</button>}
      </div>}
      {success && <p role="status" className="text-xs text-emerald-600">{success}</p>}
    </section>
  );
}
