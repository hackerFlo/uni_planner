import { useState } from 'react';
import SettingsPanel from './SettingsPanel';
import Tooltip from '../ui/Tooltip';
import { useExams } from '../../context/ExamsContext';

function CapIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
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
          className="flex items-center justify-center w-8 h-8 rounded-lg transition text-zinc-400 hover:text-zinc-700 hover:bg-zinc-50"
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
    <span className="block text-[10px] font-medium text-zinc-400 leading-none mt-0.5">
      Next exam · {displayTitle}
    </span>
  );

  return (
    <button
      onClick={e => { e.currentTarget.blur(); openModal(); }}
      className={`inline-flex items-center gap-2 pl-3.5 pr-1 py-1 rounded-full border border-transparent active:scale-[0.98] transition ${
        isUrgent
          ? 'bg-rose-50 hover:bg-rose-100 hover:border-rose-200'
          : 'bg-indigo-50 hover:bg-indigo-100 hover:border-indigo-200'
      }`}
    >
      <span className="flex flex-col items-end leading-none min-w-0">
        <span className={`text-sm font-bold tracking-tight leading-none ${isUrgent ? 'text-rose-600' : 'text-indigo-600'}`}>
          {nextExam.daysRemaining} days
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
      <header className="h-14 flex-shrink-0 border-b border-zinc-100 flex items-center px-5 gap-4 bg-white">
        <div className="flex items-center gap-2.5 mr-auto">
          <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-zinc-800 tracking-tight">Uni Planner</span>
        </div>

        <ExamControl nextExam={nextExam} openModal={openModal} />

        <Tooltip text="Archive">
          <button
            onClick={onArchiveToggle}
            className={`hidden sm:flex items-center justify-center w-8 h-8 rounded-lg transition ${
              archiveOpen
                ? 'bg-indigo-50 text-indigo-600'
                : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-50'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
          </button>
        </Tooltip>

        <Tooltip text="Account settings">
          <button
            onClick={() => setSettingsOpen(v => !v)}
            className={`flex items-center justify-center w-8 h-8 rounded-lg transition ${
              settingsOpen ? 'bg-indigo-50 text-indigo-600' : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-50'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
