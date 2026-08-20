import { useState } from 'react';
import SettingsPanel from './SettingsPanel';
import Tooltip from '../ui/Tooltip';
import QuoteBar from './QuoteBar';
import { useExams } from '../../context/ExamsContext';
import { formatCountdown } from '../../utils/dates';

function CapIcon({ className }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 10L12 5 2 10l10 5 10-5z"/>
      <path d="M6 12v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/>
    </svg>
  );
}

function ExamControl({ nextExam, openModal }) {
  if (!nextExam) {
    return (
      <Tooltip text="Exams">
        <button
          onClick={e => { e.currentTarget.blur(); openModal(); }}
          aria-label="Exams"
          aria-haspopup="dialog"
          className="flex items-center justify-center w-8 h-8 rounded-lg transition text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800"
        >
          <CapIcon className="w-4 h-4" />
        </button>
      </Tooltip>
    );
  }

  const isUrgent = nextExam.daysRemaining <= 7;
  const MAX_TITLE_CHARS = 12;
  const truncated = nextExam.title.length > MAX_TITLE_CHARS;
  const displayTitle = truncated ? nextExam.title.slice(0, MAX_TITLE_CHARS) + '…' : nextExam.title;

  const subtitle = (
    <span className="block text-[10px] font-medium text-zinc-400 dark:text-zinc-500 leading-none mt-0.5">
      Next exam · {displayTitle}
    </span>
  );

  return (
    <button
      onClick={e => { e.currentTarget.blur(); openModal(); }}
      aria-haspopup="dialog"
      aria-label={`Exams — next: ${nextExam.title}, ${formatCountdown(nextExam.daysRemaining)}`}
      className={`inline-flex items-center gap-2 pl-2.5 sm:pl-3.5 pr-1 py-1 rounded-full border border-transparent active:scale-[0.98] transition ${
        isUrgent
          ? 'bg-rose-50 dark:bg-rose-950 hover:bg-rose-100 dark:hover:bg-rose-900 hover:border-rose-200'
          : 'bg-indigo-50 dark:bg-indigo-950 hover:bg-indigo-100 dark:hover:bg-indigo-900 hover:border-indigo-200'
      }`}
    >
      <span className="flex flex-col items-end leading-none min-w-0">
        <span className={`text-sm font-bold tracking-tight leading-none ${isUrgent ? 'text-rose-600' : 'text-indigo-600'}`}>
          {formatCountdown(nextExam.daysRemaining)}
        </span>
        {truncated ? <Tooltip text={nextExam.title}>{subtitle}</Tooltip> : subtitle}
      </span>
      <span className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${isUrgent ? 'bg-rose-500' : 'bg-indigo-500'}`}>
        <CapIcon className="w-3.5 h-3.5 text-white" />
      </span>
    </button>
  );
}

export default function Navbar({ onArchiveToggle, archiveOpen, fetchTodos, onOpenWhatsNew }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { nextExam, openModal } = useExams();

  return (
    <>
      <header className="relative h-14 flex-shrink-0 border-b border-zinc-100 dark:border-zinc-800 flex items-center px-3 sm:px-5 gap-2 sm:gap-4 bg-white dark:bg-zinc-900">
        {/* The wordmark only goes visually hidden below sm -- that is the room the
            archive trigger needs on a phone, and sr-only keeps the app name in the
            accessibility tree either way. */}
        <div className="flex items-center gap-2.5 mr-auto">
          <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center flex-shrink-0">
            <svg aria-hidden="true" className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <span className="sr-only sm:not-sr-only text-sm font-semibold text-zinc-800 dark:text-zinc-100 tracking-tight">Uni Planner</span>
        </div>

        {/* Absolutely centred rather than a flex child: the header has no centre
            slot -- mr-auto on the group above owns all the free space, so a
            normal child would sit hard against the exam pill instead. */}
        <QuoteBar />

        <ExamControl nextExam={nextExam} openModal={openModal} />

        <Tooltip text="Archive">
          <button
            onClick={onArchiveToggle}
            aria-label={archiveOpen ? 'Close archive' : 'Open archive'}
            aria-expanded={archiveOpen}
            aria-haspopup="dialog"
            className={`flex items-center justify-center w-8 h-8 flex-shrink-0 rounded-lg transition ${
              archiveOpen
                ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600'
                : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800'
            }`}
          >
            <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
          </button>
        </Tooltip>

        <Tooltip text="Account settings">
          <button
            onClick={() => setSettingsOpen(v => !v)}
            aria-label={settingsOpen ? 'Close account settings' : 'Open account settings'}
            aria-expanded={settingsOpen}
            aria-haspopup="dialog"
            className={`flex items-center justify-center w-8 h-8 flex-shrink-0 rounded-lg transition ${
              settingsOpen ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600' : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800'
            }`}
          >
            <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </Tooltip>
      </header>

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} fetchTodos={fetchTodos} onOpenWhatsNew={onOpenWhatsNew} />}
    </>
  );
}
