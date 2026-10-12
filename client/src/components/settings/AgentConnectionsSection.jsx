import { useCallback, useEffect, useId, useReducer, useRef, useState } from 'react';
import { agentConnections } from '../../api/agentConnections';
import { userMessage } from '../../api/errors';
import { createEnrollmentSelection, enrollmentSelectionReducer } from './agentEnrollmentSelection';

function useConnectionStatus() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refreshSequence = useRef(0);
  const invalidateRefresh = useCallback(() => { refreshSequence.current++; }, []);
  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    setLoading(true);
    setError('');
    try {
      const current = await agentConnections.getStatus();
      if (sequence !== refreshSequence.current) return;
      setStatus(current);
      return current;
    } catch (err) {
      if (sequence === refreshSequence.current) setError(userMessage(err));
    } finally {
      if (sequence === refreshSequence.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh();
    return invalidateRefresh;
  }, [refresh, invalidateRefresh]);
  return { status, loading, error, refresh };
}

function ConnectionSummary({ status }) {
  return (
    <div className="space-y-2 text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
      <p>
        {!status.configured ? 'Agent access is not configured on this server.'
          : !status.enabled ? 'Agent access is disabled on this server.'
            : status.linked ? 'Your account has authorized agent access.'
              : 'Your account has not authorized agent access.'}
      </p>
      {status.requiresReenrollment && <p>Fresh enrollment is required before agents can access your account again.</p>}
      <p>Permissions: {status.capabilities.join(', ') || 'none'}. {!status.writesEnabled && 'Planner changes and notification sends are disabled on this server.'}</p>
      {status.publicUrl && <div>
        <p className="font-medium text-zinc-600 dark:text-zinc-300">Connection URL</p>
        <p className="break-all select-all">{status.publicUrl}</p>
      </div>}
      <p>Signing out of the website does not disable agent access. Changing your password requires fresh enrollment.</p>
    </div>
  );
}

export function EnrollmentForm({ status, confirmedStatus, reenrollment, busy, onEnroll }) {
  const id = useId();
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [selection, dispatch] = useReducer(enrollmentSelectionReducer, status, createEnrollmentSelection);
  const { capabilities } = selection;
  useEffect(() => {
    dispatch({ type: 'status', status, confirmed: status === confirmedStatus });
  }, [status, confirmedStatus]);
  useEffect(() => {
    setPassword('');
    setConsent(false);
  }, [selection.boundary]);
  function submit(event) {
    event.preventDefault();
    const submittedPassword = password;
    setPassword('');
    setConsent(false);
    onEnroll(submittedPassword, consent, capabilities);
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
        Enrollment authorizes all clients for your linked Cloudflare identity. Re-enrolling also authorizes clients whose Cloudflare grants remain valid. Revoke those grants in Cloudflare or the client before re-enrolling if you want to disconnect them permanently.
      </p>
      <div>
        <label htmlFor={`${id}-password`} className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">Current website password</label>
        <input id={`${id}-password`} type="password" autoComplete="current-password" required maxLength={128}
          value={password} onChange={event => setPassword(event.target.value)} disabled={busy}
          className="w-full text-sm border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition" />
      </div>
      <fieldset className="space-y-2 text-xs text-zinc-600 dark:text-zinc-300" disabled={busy}>
        <legend className="mb-2">Choose agent permissions</legend>
        <p>Read planner data (required)</p>
        {[['planner_write', 'Permission to create, edit and delete planner items and preferences'],
          ['notifications', 'Read and change notification settings and send test emails'],
          ['export', 'Export all planner data, including your notification email address']].map(([value, label]) => (
          <label key={value} className="flex items-start gap-2">
            <input type="checkbox" checked={capabilities.includes(value)} onChange={event => dispatch({
              type: 'toggle', capability: value, checked: event.target.checked,
            })} />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>
      {!status.writesEnabled && <p role="note" className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
        These choices save permissions for your account. Planner changes and test emails are currently disabled for the whole server. The server operator must enable them before agents can use those permissions.
      </p>}
      <label className="flex items-start gap-2 text-xs text-zinc-600 dark:text-zinc-300">
        <input type="checkbox" required checked={consent} disabled={busy}
          onChange={event => setConsent(event.target.checked)} className="mt-0.5" />
        <span>I authorize these permissions for all clients with a valid Cloudflare grant, including surviving grants and unattended requests.</span>
      </label>
      <button type="submit" disabled={busy || !password || !consent}
        className="w-full text-xs font-medium bg-indigo-500 hover:bg-indigo-600 text-white py-2 rounded-lg transition disabled:opacity-50">
        {busy ? 'Saving…' : reenrollment ? 'Update agent permissions' : 'Enable selected permissions'}
      </button>
    </form>
  );
}

export default function AgentConnectionsSection() {
  const { status, loading, error: loadError, refresh } = useConnectionStatus();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [confirmedStatus, setConfirmedStatus] = useState(null);
  const actionInFlight = useRef(false);
  async function runAction(action, expectedLinked) {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await action();
      const current = await refresh();
      if (!current) return;
      if (current.linked !== expectedLinked) {
        setError('Connection status changed before it could be confirmed. Review the current status before trying again.');
        return;
      }
      setConfirmedStatus(current);
      setSuccess(expectedLinked ? 'Selected agent permissions authorized.' : 'All agent access to UniPlanner is disabled.');
    } catch (err) {
      setError(userMessage(err));
    } finally {
      actionInFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3" aria-labelledby="agent-connections-heading" aria-busy={loading || busy}>
      <h3 id="agent-connections-heading" className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 uppercase tracking-widest">Agent Connections</h3>
      {loading && <p role="status" className="text-xs text-zinc-500 dark:text-zinc-400">Loading agent access…</p>}
      {loadError && <div className="space-y-2">
        <p role="alert" className="text-xs text-red-500">{loadError}</p>
        <button type="button" onClick={refresh} disabled={loading || busy} className="text-xs text-indigo-600 underline">Try again</button>
      </div>}
      {status && <>
        <ConnectionSummary status={status} />
        {status.enabled && status.configured && <EnrollmentForm
          status={status} confirmedStatus={confirmedStatus} busy={busy || loading || Boolean(loadError)}
          reenrollment={status.linked || status.requiresReenrollment || Boolean(status.revokedAt)}
          onEnroll={(password, consent, capabilities) => runAction(() => agentConnections.enroll(password, consent, capabilities), true)} />}
        {(status.linked || status.requiresReenrollment) && <div className="space-y-2">
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
            Disabling blocks UniPlanner access immediately for all linked clients. It does not revoke Cloudflare OAuth grants.
          </p>
          <button type="button" disabled={busy || loading}
            onClick={() => runAction(() => agentConnections.disable(), false)}
            className="w-full text-xs font-medium border border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950 py-2 rounded-lg transition disabled:opacity-50">
            Disable all agent access
          </button>
        </div>}
      </>}
      {error && <div className="space-y-2">
        <p role="alert" className="text-xs text-red-500">{error}</p>
        <button type="button" onClick={() => { setError(''); setSuccess(''); refresh(); }} disabled={loading || busy}
          className="text-xs text-indigo-600 underline">Refresh connection status</button>
      </div>}
      {success && <p role="status" className="text-xs text-emerald-600">{success}</p>}
    </section>
  );
}
