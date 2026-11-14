import { useCallback, useRef, useState } from 'react';
import { runWithRecovery } from '../api/conflictRetry.js';
import { failStatus, INITIAL_STATUS, okStatus } from './status';

const BUSY_STATUS = { ok: false, text: '✗ Another action is still running. Wait until this line shows its result, then try again.' };

// One action at a time. The status line keeps the last result until the next
// action starts, and is never cleared on a timer. `act` resolves true/false so a
// form can decide whether to reset itself.
export function useAct(recover) {
  const [status, setStatus] = useState(INITIAL_STATUS);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  const act = useCallback(async (action, work, success) => {
    if (running.current) { setStatus(BUSY_STATUS); return false; }
    running.current = true;
    setBusy(true);
    setStatus({ ok: null, text: `Working: ${action}…` });
    try {
      const result = await runWithRecovery(work, recover);
      setStatus(okStatus(typeof success === 'function' ? success(result) : success));
      return true;
    } catch (error) {
      setStatus(failStatus(action, error));
      return false;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, [recover]);
  return { status, setStatus, busy, act };
}
