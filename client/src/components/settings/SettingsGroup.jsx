import { useId, useState } from 'react';

// A real button + region (not <details>) because the panel needs two things
// <details> cannot give it: controlled open state that is persisted, and
// lazy-mounting. Content mounts the first time the group opens and is then only
// hidden, so a half-typed form survives a collapse while closed groups spend no
// requests.
export default function SettingsGroup({ title, summary, open, onToggle, children }) {
  const regionId = useId();
  const [everOpened, setEverOpened] = useState(open);
  if (open && !everOpened) setEverOpened(true);

  return (
    <section className="border-t border-zinc-100 dark:border-zinc-800 first:border-t-0">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={regionId}
          onClick={onToggle}
          className="w-full flex items-center gap-3 py-3 text-left rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        >
          <svg
            aria-hidden="true"
            className={`w-3.5 h-3.5 shrink-0 text-zinc-400 dark:text-zinc-500 transition-transform ${open ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-zinc-600 dark:text-zinc-300 uppercase tracking-widest">{title}</span>
            <span className="block text-[11px] text-zinc-400 dark:text-zinc-500 truncate">{summary}</span>
          </span>
        </button>
      </h3>
      <div id={regionId} role="region" aria-label={title} hidden={!open} className="pt-3 pb-5 space-y-8">
        {everOpened && children}
      </div>
    </section>
  );
}
