import { useCallback, useEffect, useRef, useState } from 'react';
import { quoteApi, capturedRequest } from '../../api/settingsMutations';
import { useUndo } from '../../context/UndoContext';
import { userMessage } from '../../api/errors';
import { usePreferences } from '../../context/PreferencesContext';
import { useToday } from '../../context/TimeContext';

export default function QuotesSection() {
  const { preferences, update } = usePreferences();
  const today = useToday();
  const [stats, setStats] = useState(null);
  const [version, setVersion] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const undo = useUndo();
  const importAttempt = useRef(capturedRequest(quoteApi.importCsv));
  const restoreAttempt = useRef(capturedRequest(quoteApi.restoreAll));
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [importResult, setImportResult] = useState(null);

  const snoozed = preferences.quotesSnoozedOn === today;

  const loadStats = useCallback(async () => {
    try {
      const data = await quoteApi.stats();
      setStats(data.stats);
      setVersion(data.version);
    } catch {
      // The counts are informational; failing to read them must not break the
      // toggle sitting above them.
      setStats(null);
      setVersion(null);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  async function importCsv(csv) {
    setImportError('');
    setImportResult(null);
    setImporting(true);
    try {
      const receipt = await importAttempt.current.run({ csv }, version);
      setImportResult(receipt);
      if (receipt.replayed) await loadStats();
      else { setStats(receipt.stats ?? null); setVersion(receipt.currentVersion); }
      undo?.recordOperation(receipt, loadStats);
    } catch (error) { setImportError(userMessage(error)); }
    finally { setImporting(false); }
  }

  async function handleImport(event) {
    const file = event.target.files?.[0];
    if (!file || importing || restoring) return;
    setImporting(true);
    try { await importCsv(await file.text()); }
    catch (error) { setImportError(userMessage(error)); }
    finally { event.target.value = ''; setImporting(false); }
  }

  async function handleRestoreAll() {
    if (restoring || importing || !version) return;
    setRestoring(true);
    setImportError('');
    try {
      const receipt = await restoreAttempt.current.run({}, version);
      if (receipt.replayed) await loadStats();
      else { setStats(receipt.stats); setVersion(receipt.currentVersion); }
      undo?.recordOperation(receipt, loadStats);
    } catch (error) { setImportError(userMessage(error)); }
    finally { setRestoring(false); }
  }

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 uppercase tracking-widest">Quotes</h3>

      <label className="flex items-center gap-3 cursor-pointer">
        <div className="relative">
          <input
            type="checkbox"
            className="sr-only"
            checked={preferences.showQuotes}
            onChange={e => update({ showQuotes: e.target.checked })}
          />
          <div className={`w-9 h-5 rounded-full transition-colors ${preferences.showQuotes ? 'bg-indigo-500' : 'bg-zinc-200 dark:bg-zinc-700'}`} />
          <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white dark:bg-zinc-900 rounded-full shadow transition-transform ${preferences.showQuotes ? 'translate-x-4' : ''}`} />
        </div>
        <span className="text-xs text-zinc-600 dark:text-zinc-300">Show a daily quote</span>
      </label>

      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-relaxed">
        A new quote each day, in the top bar. Every quote is shown once before any repeats.
      </p>

      <div className={preferences.showQuotes ? '' : 'opacity-40 pointer-events-none'}>
        <button
          type="button"
          onClick={() => update({ quotesSnoozedOn: snoozed ? null : today })}
          className="w-full text-xs font-medium border border-indigo-300 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950 py-2 rounded-lg transition"
        >
          {snoozed ? 'Show quotes again today' : 'Hide quotes until tomorrow'}
        </button>
        {snoozed && (
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-relaxed mt-1">
            Quotes are hidden for the rest of today and come back on their own at midnight.
          </p>
        )}
      </div>

      {stats && (
        <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 space-y-3">
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-relaxed">
            {stats.available} quote{stats.available === 1 ? '' : 's'} in rotation
            {stats.uploaded > 0 ? `, ${stats.uploaded} of them yours` : ''}
            {stats.disliked > 0 ? ` · ${stats.disliked} hidden` : ''}
          </p>
          {stats.disliked > 0 && (
            <button
              type="button"
              onClick={handleRestoreAll}
              disabled={restoring || importing || !version || importAttempt.current.pending}
              className="w-full text-xs font-medium border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 py-2 rounded-lg transition"
            >
              Restore {stats.disliked} hidden quote{stats.disliked === 1 ? '' : 's'}
            </button>
          )}
        </div>
      )}

      <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 space-y-2">
        <label className="block text-xs text-zinc-500 dark:text-zinc-400">Add quotes from a CSV</label>
        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-relaxed">
          Needs a header row with <span className="font-mono">Quote</span> and{' '}
          <span className="font-mono">Author</span> columns; <span className="font-mono">Wikipedia</span> and{' '}
          <span className="font-mono">Source</span> are optional. Quotes already in the library are skipped.
        </p>
        <label className={`flex items-center justify-center w-full py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition cursor-pointer ${importing || restoring || !version || importAttempt.current.pending ? 'opacity-50 pointer-events-none' : ''}`}>
          {importing ? 'Importing…' : 'Choose CSV file…'}
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={handleImport} disabled={importing || restoring || !version || importAttempt.current.pending || restoreAttempt.current.pending} />
        </label>
        {importError && <p className="text-xs text-red-500">{importError}</p>}
        {importAttempt.current.pending && (
          <button type="button" disabled={importing || restoring} onClick={() => importCsv('')} className="text-xs underline">
            Retry previous import
          </button>
        )}
        {(!version || importError) && !importAttempt.current.pending && !restoreAttempt.current.pending && (
          <button type="button" disabled={importing || restoring} onClick={() => { setImportError(''); loadStats(); }} className="text-xs underline">
            Reload current quote settings
          </button>
        )}
        {importResult && (
          <p className="text-xs text-emerald-600">
            Added {importResult.added}, skipped {importResult.skipped}
            {importResult.errorCount > 0 ? ` · ${importResult.errorCount} row${importResult.errorCount === 1 ? '' : 's'} could not be read` : ''}
          </p>
        )}
        {importResult?.errors?.length > 0 && (
          <ul className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-relaxed list-disc pl-4">
            {importResult.errors.map((msg) => <li key={msg}>{msg}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}
