import { useEffect } from 'react';

const ICON_COLORS = {
  purple: 'bg-indigo-50 text-indigo-500',
  green:  'bg-emerald-50 text-emerald-500',
  amber:  'bg-amber-50 text-amber-500',
  blue:   'bg-sky-50 text-sky-500',
  rose:   'bg-rose-50 text-rose-500',
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
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function WhatsNewModal({ entry, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/30 backdrop-blur-[3px] animate-[fadeIn_0.2s_ease]"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-[520px] max-w-[calc(100vw-32px)] overflow-hidden animate-[slideUp_0.28s_cubic-bezier(0.22,1,0.36,1)]">

        {/* Header */}
        <div className="px-7 pt-6 pb-5 border-b border-zinc-100 flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-600 text-[10px] font-semibold uppercase tracking-widest rounded-full px-2.5 py-[3px] w-fit">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                <path d="M8 1L9.5 6H14.5L10.5 9.5L12 14L8 11L4 14L5.5 9.5L1.5 6H6.5L8 1Z" fill="#6366f1"/>
              </svg>
              What's new · v{entry.version}
            </span>
            <h2 className="text-lg font-semibold text-zinc-900 tracking-tight">{entry.title}</h2>
            <p className="text-[13px] text-zinc-400">
              Released {formatDate(entry.date)} · {entry.features.length} new feature{entry.features.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-lg border border-zinc-200 flex items-center justify-center flex-shrink-0 text-zinc-400 hover:bg-zinc-50 hover:text-zinc-600 transition"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Feature list */}
        <div className="max-h-[380px] overflow-y-auto">
          {entry.features.map((f, i) => (
            <div
              key={i}
              className={`flex items-start gap-4 px-7 py-4 hover:bg-zinc-50 transition-colors ${i > 0 ? 'border-t border-zinc-100' : ''}`}
            >
              <FeatureIcon svgPath={f.svgPath} color={f.icon} />
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-zinc-900 tracking-tight">{f.name}</span>
                <span className="text-[13px] text-zinc-500 leading-relaxed">{f.desc}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-7 py-4 border-t border-zinc-100 flex items-center justify-between gap-3">
          <span className="text-xs text-zinc-400">More updates coming soon…</span>
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
