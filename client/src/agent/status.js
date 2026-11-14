import { userMessage } from '../api/errors.js';

export const INITIAL_STATUS = { ok: null, text: 'Ready. No action has been taken yet.' };

export function okStatus(text) {
  return { ok: true, text: `✓ ${text}` };
}

export function failStatus(action, error) {
  const ref = error?.requestId ? ` (ref ${error.requestId})` : '';
  return { ok: false, text: `✗ Could not ${action}: ${userMessage(error)}${ref}` };
}
