import { useState } from 'react';

// One-shot async action with loading / error / success state, for the small
// forms in the settings panel. The action returns the success message, or
// nothing when there is no message worth showing.
//
// Lived inside SettingsPanel.jsx until QuotesSection needed it too; extracted
// rather than copied so the two cannot drift.
export default function useAsync(fn) {
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
