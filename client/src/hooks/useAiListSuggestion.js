import { useEffect, useRef } from 'react';
import { aiApi } from '../api/aiSuggestion.js';
import { DEBOUNCE_MS, createSuggestionSession } from '../utils/aiSuggestion.js';

// Debounced list suggestion for the new-task dialog. `enabled` already folds in
// every eligibility rule (see isDialogEligible); `onSuggest(listId)` is only
// called with a non-null id and never after markManual().
export default function useAiListSuggestion({ enabled, title, note, onSuggest }) {
  const sessionRef = useRef(null);
  const onSuggestRef = useRef(onSuggest);
  onSuggestRef.current = onSuggest;
  sessionRef.current ??= createSuggestionSession({ request: aiApi.suggestList });

  useEffect(() => {
    const session = sessionRef.current;
    if (!enabled) return undefined;
    const timer = setTimeout(async () => {
      const { listId } = await session.suggest(title, note);
      if (listId !== null) onSuggestRef.current(listId);
    }, DEBOUNCE_MS);
    return () => { clearTimeout(timer); session.cancel(); };
  }, [enabled, title, note]);

  useEffect(() => () => sessionRef.current.cancel(), []);

  return { markManual: () => sessionRef.current.markManual() };
}
