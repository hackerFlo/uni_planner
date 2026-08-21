import { useEffect, useRef, useLayoutEffect, useState } from 'react';
import { useRegisterModal } from '../../context/ModalContext';

const ICON_COLORS = {
  purple: 'bg-indigo-50 dark:bg-indigo-950 text-indigo-500',
  green:  'bg-emerald-50 dark:bg-emerald-950 text-emerald-500',
  amber:  'bg-amber-50 dark:bg-amber-950 text-amber-500',
  blue:   'bg-sky-50 text-sky-500',
  rose:   'bg-rose-50 dark:bg-rose-950 text-rose-500',
};

function FeatureIcon({ svgPath, color }) {
  return (
    <div className={`w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0 mt-0.5 ${ICON_COLORS[color] ?? ICON_COLORS.purple}`}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={svgPath} />
      </svg>
    </div>
  );
}

function formatDate(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function WhatsNewModal({ entries, onClose }) {
  useRegisterModal();
  const scrollRef = useRef(null);
  const [showScrollCue, setShowScrollCue] = useState(false);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Check on mount whether the list overflows and needs the scroll cue.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowScrollCue(el.scrollHeight > el.clientHeight);
  }, [entries]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setShowScrollCue(el.scrollHeight - el.scrollTop - el.clientHeight > 8);
  }

  const isMulti = entries.length > 1;
  const newest = entries[0];
  const totalFeatures = entries.reduce((n, e) => n + e.features.length, 0);

  return (
    <div
      data-modal-root
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/30 backdrop-blur-[3px] animate-[fadeIn_0.2s_ease]"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-[520px] max-w-[calc(100vw-32px)] overflow-hidden animate-[slideUp_0.28s_cubic-bezier(0.22,1,0.36,1)]">

        {/* Header */}
        <div className="px-7 pt-6 pb-5 border-b border-zinc-100 dark:border-zinc-800 flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="inline-flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 text-[10px] font-semibold uppercase tracking-widest rounded-full px-2.5 py-[3px] w-fit">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                <path d="M8 1L9.5 6H14.5L10.5 9.5L12 14L8 11L4 14L5.5 9.5L1.5 6H6.5L8 1Z" fill="#6366f1"/>
              </svg>
              {isMulti ? `What's new · ${entries.length} updates` : `What's new · v${newest.version}`}
            </span>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 tracking-tight">
              {isMulti ? `${entries.length} updates since you were last here` : newest.title}
            </h2>
            <p className="text-[13px] text-zinc-400 dark:text-zinc-500">
              {isMulti
                ? `v${entries[entries.length - 1].version} – v${newest.version} · ${totalFeatures} new feature${totalFeatures !== 1 ? 's' : ''}`
                : `Released ${formatDate(newest.date)} · ${newest.features.length} new feature${newest.features.length !== 1 ? 's' : ''}`
              }
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-lg border border-zinc-200 dark:border-zinc-800 flex items-center justify-center flex-shrink-0 text-zinc-400 dark:text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-600 dark:hover:text-zinc-300 transition"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Scrollable feature list with fade cue */}
        <div className="relative">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="max-h-[360px] overflow-y-auto"
          >
            {entries.map((entry, ei) => (
              <div key={entry.version}>
                {isMulti && (
                  <div className="px-7 pt-4 pb-1.5 flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                      v{entry.version}
                    </span>
                    <span className="text-[10px] text-zinc-300 dark:text-zinc-600">·</span>
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500">{formatDate(entry.date)}</span>
                    {ei === 0 && (
                      <span className="ml-1 text-[9px] font-semibold bg-indigo-100 text-indigo-500 rounded-full px-1.5 py-0.5 uppercase tracking-wide">Latest</span>
                    )}
                  </div>
                )}
                {entry.features.map((f, fi) => (
                  <div
                    key={fi}
                    className={`flex items-start gap-4 px-7 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors ${fi > 0 || ei > 0 ? 'border-t border-zinc-100 dark:border-zinc-800' : ''}`}
                  >
                    <FeatureIcon svgPath={f.svgPath} color={f.icon} />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 tracking-tight">{f.name}</span>
                      <span className="text-[13px] text-zinc-500 dark:text-zinc-400 leading-relaxed">{f.desc}</span>
                    </div>
                  </div>
                ))}
                {isMulti && ei < entries.length - 1 && (
                  <div className="mx-7 border-t-2 border-dashed border-zinc-100 dark:border-zinc-800" />
                )}
              </div>
            ))}
          </div>

          {/* Scroll cue: bottom fade + bouncing chevron */}
          {showScrollCue && (
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 flex flex-col items-center">
              <div className="w-full h-14 bg-gradient-to-t from-white to-white/0 dark:from-zinc-900 dark:to-zinc-900/0" />
              <div className="absolute bottom-2 animate-bounce text-zinc-300 dark:text-zinc-600">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-7 py-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-3">
          <span className="text-xs text-zinc-400 dark:text-zinc-500">More updates coming soon…</span>
          <button
            onClick={onClose}
            className="bg-indigo-500 hover:bg-indigo-600 active:scale-[0.97] text-white rounded-lg px-5 py-2 text-[13px] font-semibold transition"
          >
            Got it
          </button>
        </div>

      </div>
    </div>
  );
}
