import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { userMessage } from '../../api/errors';
import { usePreferences } from '../../context/PreferencesContext';
import { useToast } from '../../context/ToastContext';
import { useToday } from '../../context/TimeContext';
import Tooltip from '../ui/Tooltip';

/* Font Awesome Free 6.7.2 (CC BY 4.0, fontawesome.com/license/free): quote-left
   solid, thumbs-down regular, eye-slash regular. Inlined rather than pulled
   from a CDN -- AR-10 keeps script-src/style-src at 'self'. */
const QuoteMarkIcon = () => (
  <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 448 512" aria-hidden="true">
    <path d="M0 216C0 149.7 53.7 96 120 96l8 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-8 0c-30.9 0-56 25.1-56 56l0 8 64 0c35.3 0 64 28.7 64 64l0 64c0 35.3-28.7 64-64 64l-64 0c-35.3 0-64-28.7-64-64l0-32 0-32 0-72zm256 0c0-66.3 53.7-120 120-120l8 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-8 0c-30.9 0-56 25.1-56 56l0 8 64 0c35.3 0 64 28.7 64 64l0 64c0 35.3-28.7 64-64 64l-64 0c-35.3 0-64-28.7-64-64l0-32 0-32 0-72z" />
  </svg>
);

const ThumbsDownIcon = () => (
  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 512 512" aria-hidden="true">
    <path d="M323.8 477.2c-38.2 10.9-78.1-11.2-89-49.4l-5.7-20c-3.7-13-10.4-25-19.5-35l-51.3-56.4c-8.9-9.8-8.2-25 1.6-33.9s25-8.2 33.9 1.6l51.3 56.4c14.1 15.5 24.4 34 30.1 54.1l5.7 20c3.6 12.7 16.9 20.1 29.7 16.5s20.1-16.9 16.5-29.7l-5.7-20c-5.7-19.9-14.7-38.7-26.6-55.5c-5.2-7.3-5.8-16.9-1.7-24.9s12.3-13 21.3-13L448 288c8.8 0 16-7.2 16-16c0-6.8-4.3-12.7-10.4-15c-7.4-2.8-13-9-14.9-16.7s.1-15.8 5.3-21.7c2.5-2.8 4-6.5 4-10.6c0-7.8-5.6-14.3-13-15.7c-8.2-1.6-15.1-7.3-18-15.2s-1.6-16.7 3.6-23.3c2.1-2.7 3.4-6.1 3.4-9.9c0-6.7-4.2-12.6-10.2-14.9c-11.5-4.5-17.7-16.9-14.4-28.8c.4-1.3 .6-2.8 .6-4.3c0-8.8-7.2-16-16-16l-97.5 0c-12.6 0-25 3.7-35.5 10.7l-61.7 41.1c-11 7.4-25.9 4.4-33.3-6.7s-4.4-25.9 6.7-33.3l61.7-41.1c18.4-12.3 40-18.8 62.1-18.8L384 32c34.7 0 62.9 27.6 64 62c14.6 11.7 24 29.7 24 50c0 4.5-.5 8.8-1.3 13c15.4 11.7 25.3 30.2 25.3 51c0 6.5-1 12.8-2.8 18.7C504.8 238.3 512 254.3 512 272c0 35.3-28.6 64-64 64l-92.3 0c4.7 10.4 8.7 21.2 11.8 32.2l5.7 20c10.9 38.2-11.2 78.1-49.4 89zM32 384c-17.7 0-32-14.3-32-32L0 128c0-17.7 14.3-32 32-32l64 0c17.7 0 32 14.3 32 32l0 224c0 17.7-14.3 32-32 32l-64 0z" />
  </svg>
);

const EyeSlashIcon = () => (
  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 640 512" aria-hidden="true">
    <path d="M38.8 5.1C28.4-3.1 13.3-1.2 5.1 9.2S-1.2 34.7 9.2 42.9l592 464c10.4 8.2 25.5 6.3 33.7-4.1s6.3-25.5-4.1-33.7L525.6 386.7c39.6-40.6 66.4-86.1 79.9-118.4c3.3-7.9 3.3-16.7 0-24.6c-14.9-35.7-46.2-87.7-93-131.1C465.5 68.8 400.8 32 320 32c-68.2 0-125 26.3-169.3 60.8L38.8 5.1zm151 118.3C226 97.7 269.5 80 320 80c65.2 0 118.8 29.6 159.9 67.7C518.4 183.5 545 226 558.6 256c-12.6 28-36.6 66.8-70.9 100.9l-53.8-42.2c9.1-17.6 14.2-37.5 14.2-58.7c0-70.7-57.3-128-128-128c-32.2 0-61.7 11.9-84.2 31.5l-46.1-36.1zM394.9 284.2l-81.5-63.9c4.2-8.5 6.6-18.2 6.6-28.3c0-5.5-.7-10.9-2-16c.7 0 1.3 0 2 0c44.2 0 80 35.8 80 80c0 9.9-1.8 19.4-5.1 28.2zm9.4 130.3C378.8 425.4 350.7 432 320 432c-65.2 0-118.8-29.6-159.9-67.7C121.6 328.5 95 286 81.4 256c8.3-18.4 21.5-41.5 39.4-64.8L83.1 161.5C60.3 191.2 44 220.8 34.5 243.7c-3.3 7.9-3.3 16.7 0 24.6c14.9 35.7 46.2 87.7 93 131.1C174.5 443.2 239.2 480 320 480c47.8 0 89.9-12.9 126.2-32.5l-41.9-33zM192 256c0 70.7 57.3 128 128 128c13.3 0 26.1-2 38.2-5.8L302 334c-23.5-5.4-43.1-21.2-53.7-42.3l-56.1-44.2c-.2 2.8-.3 5.6-.3 8.5z" />
  </svg>
);

const ACTION_BTN =
  'p-1 rounded-full text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 ' +
  'hover:bg-zinc-100 dark:hover:bg-zinc-800 transition opacity-0 group-hover/quote:opacity-100 ' +
  'focus-visible:opacity-100 disabled:opacity-30';

export default function QuoteBar() {
  const { preferences, update } = usePreferences();
  const today = useToday();
  const toast = useToast();
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState(false);

  // Snoozing stores the day it was pressed, so this comparison is the whole
  // expiry mechanism: at 00:00 useToday() changes and the quote returns.
  const snoozed = preferences.quotesSnoozedOn === today;
  const enabled = preferences.showQuotes && !snoozed;

  useEffect(() => {
    if (!enabled) { setQuote(null); return; }
    let cancelled = false;
    // Keyed on `today`, so the quote also rolls over at midnight on a tab that
    // was left open, not only on a reload.
    api.get(`/api/quotes/today?date=${today}`)
      .then(({ quote: q }) => { if (!cancelled) setQuote(q ?? null); })
      // Silent: a missing quote is decoration, and a toast here would fire on
      // every page load whenever the endpoint is unhappy.
      .catch(() => { if (!cancelled) setQuote(null); });
    return () => { cancelled = true; };
  }, [enabled, today]);

  const restore = useCallback(async (id) => {
    try {
      const { quote: back } = await api.post(`/api/quotes/${id}/restore?date=${today}`);
      setQuote(back ?? null);
    } catch (err) {
      toast?.error(`Could not restore the quote. ${userMessage(err)}`, { ref: err.requestId ?? null });
    }
  }, [today, toast]);

  async function handleDislike() {
    if (!quote || busy) return;
    const hidden = quote;
    setBusy(true);
    try {
      const { quote: next } = await api.post(`/api/quotes/${hidden.id}/dislike?date=${today}`);
      setQuote(next ?? null);
      // Longer than the 4s default: this is the only chance to reverse a
      // permanent hide without going through Settings, and four seconds is not
      // enough to read the message and decide.
      toast?.success('Quote hidden. It will not be shown again.', {
        action: { label: 'Undo', onClick: () => restore(hidden.id) },
        duration: 12000,
      });
    } catch (err) {
      toast?.error(`Could not hide the quote. ${userMessage(err)}`, { ref: err.requestId ?? null });
    } finally {
      setBusy(false);
    }
  }

  function handleSnooze() {
    update({ quotesSnoozedOn: today });
  }

  if (!enabled || !quote) return null;

  return (
    <div
      // An absolutely centred box can only be as wide as twice its distance to
      // the nearer edge, and the right-hand cluster is the wider of the two: at
      // its longest -- the exam pill with a truncated title, the two icon
      // buttons, the header padding -- it measures just under 19.5rem, so 39rem
      // is what both sides have to be given. On a wide window that is far more
      // room than the percentages allowed, which is what cut long quotes off.
      // max() keeps the old percentage as a floor on narrower windows, where the
      // calc would be the tighter of the two. A quote short enough to fit is
      // sized by its own text either way, so none of this reaches one.
      className="group/quote hidden md:flex items-center gap-2 absolute left-1/2 -translate-x-1/2
                 max-w-[38%] lg:max-w-[max(46%,calc(100%-39rem))] px-2 py-1 rounded-full"
    >
      <span className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-400">
        <QuoteMarkIcon />
      </span>

      <Tooltip text={quote.text} className="min-w-0 overflow-hidden" onlyWhenTruncated>
        <span className="block truncate text-xs text-zinc-600 dark:text-zinc-300">
          {quote.text}
        </span>
      </Tooltip>

      {/* 15 of the 191 seeded quotes have no Wikipedia URL, so the author is a
          link only when there is somewhere to go. */}
      {quote.wikipedia ? (
        <a
          href={quote.wikipedia}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 text-[11px] text-zinc-400 dark:text-zinc-500 hover:text-indigo-500 hover:underline transition"
        >
          &mdash; {quote.author}
        </a>
      ) : (
        <span className="flex-shrink-0 text-[11px] text-zinc-400 dark:text-zinc-500">
          &mdash; {quote.author}
        </span>
      )}

      <span className="flex-shrink-0 flex items-center gap-0.5">
        <Tooltip text="Never show this quote again">
          <button type="button" onClick={handleDislike} disabled={busy} aria-label="Never show this quote again" className={ACTION_BTN}>
            <ThumbsDownIcon />
          </button>
        </Tooltip>
        <Tooltip text="Hide quotes until tomorrow">
          <button type="button" onClick={handleSnooze} aria-label="Hide quotes until tomorrow" className={ACTION_BTN}>
            <EyeSlashIcon />
          </button>
        </Tooltip>
      </span>
    </div>
  );
}
