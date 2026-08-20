import { useEffect, useRef, useState } from 'react';
import { getLocalTimeZone, today } from '@internationalized/date';
import { useRegisterModal } from '../../context/ModalContext';
import { useExams } from '../../context/ExamsContext';
import Tooltip from '../ui/Tooltip';
import DatePickerInput from '../ui/DatePickerInput';
import EmojiPicker from '../ui/EmojiPicker';
import useEmojiInput from '../../hooks/useEmojiInput';
import { parseDateLocal, todayIso, countdownParts } from '../../utils/dates';

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const TIERS = [
  'bg-gradient-to-br from-indigo-600 to-indigo-700',
  'bg-gradient-to-br from-indigo-500 to-indigo-600',
  'bg-gradient-to-br from-indigo-400 to-indigo-500',
  'bg-gradient-to-br from-indigo-400 to-indigo-400',
  'bg-gradient-to-br from-indigo-300 to-indigo-400',
  'bg-gradient-to-br from-indigo-200 to-indigo-300',
];

function tierForRank(index, total) {
  if (total <= 1) return TIERS[0];
  const step = (TIERS.length - 1) / (total - 1);
  return TIERS[Math.round(index * step)];
}

function PencilIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  );
}

function EditRow({ titleRef, draft, setDraft, saving, onConfirm, onCancel, onDelete }) {
  const { emojiState, handleChange, handleEmojiSelect, closeEmojiPicker } = useEmojiInput(
    draft.title,
    next => setDraft(p => ({ ...p, title: next })),
    titleRef,
  );

  return (
    <div className="flex items-center gap-2 px-7 py-4 bg-indigo-50 dark:bg-indigo-950 min-h-[84px]">
      <div className="relative flex-1 min-w-0">
        <input
          ref={titleRef}
          type="text"
          value={draft.title}
          onChange={handleChange}
          onKeyDown={e => {
            if (emojiState) return;
            if (e.key === 'Enter') onConfirm();
            if (e.key === 'Escape') onCancel();
          }}
          placeholder="Exam name…"
          maxLength={200}
          className="w-full text-sm font-medium text-zinc-900 dark:text-zinc-50 border border-indigo-200 dark:border-indigo-900 bg-white dark:bg-zinc-900 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition"
        />
        {emojiState && (
          <EmojiPicker anchorRef={titleRef} query={emojiState.query} onSelect={handleEmojiSelect} onClose={closeEmojiPicker} />
        )}
      </div>
      <DatePickerInput
        value={draft.exam_date}
        onChange={date => setDraft(p => ({ ...p, exam_date: date }))}
        minValue={today(getLocalTimeZone())}
        className="w-[155px]"
      />
      <Tooltip text="Save">
        <button
          onClick={onConfirm}
          disabled={saving || !draft.title.trim() || !draft.exam_date}
          className="w-[30px] h-[30px] flex items-center justify-center rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white disabled:opacity-40 flex-shrink-0 transition"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </button>
      </Tooltip>
      <Tooltip text="Cancel">
        <button
          onClick={onCancel}
          className="w-[30px] h-[30px] flex items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 flex-shrink-0 transition"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </Tooltip>
      {onDelete && (
        <Tooltip text="Delete">
          <button
            onClick={onDelete}
            className="w-[30px] h-[30px] flex items-center justify-center rounded-lg bg-rose-50 dark:bg-rose-950 hover:bg-rose-100 dark:hover:bg-rose-900 text-rose-500 flex-shrink-0 transition"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" />
            </svg>
          </button>
        </Tooltip>
      )}
    </div>
  );
}

function ExamsModalContent() {
  useRegisterModal();
  const { upcomingExams, closeModal, addExam, updateExam, deleteExam } = useExams();
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({ title: '', exam_date: '' });
  const [saving, setSaving] = useState(false);
  const titleRef = useRef(null);
  const listScrollRef = useRef(null);
  const scrollTimerRef = useRef(null);
  const n = upcomingExams.length;

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') closeModal(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [closeModal]);

  useEffect(() => {
    if (editingId !== null) setTimeout(() => titleRef.current?.focus(), 0);
  }, [editingId]);

  function startAdd() {
    if (editingId !== null) return;
    setDraft({ title: '', exam_date: todayIso() });
    setEditingId('new');
  }

  function startEdit(exam) {
    if (editingId !== null) return;
    setDraft({ title: exam.title, exam_date: exam.exam_date });
    setEditingId(exam.id);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft({ title: '', exam_date: '' });
  }

  async function confirmEdit() {
    const title = draft.title.trim();
    if (!title || !draft.exam_date) return;
    setSaving(true);
    try {
      if (editingId === 'new') {
        await addExam(title, draft.exam_date);
      } else {
        await updateExam(editingId, { title, exam_date: draft.exam_date });
      }
      setEditingId(null);
      setDraft({ title: '', exam_date: '' });
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete(id) {
    await deleteExam(id);
    setEditingId(null);
  }

  return (
    <div
      data-modal-root
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/30 backdrop-blur-[3px] animate-[fadeIn_0.2s_ease]"
      onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
    >
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-[580px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] flex flex-col overflow-hidden animate-[slideUp_0.28s_cubic-bezier(0.22,1,0.36,1)]">

        <div className="px-7 pt-6 pb-[18px] border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-4 flex-shrink-0">
          <h2 className="text-[19px] font-semibold text-zinc-900 dark:text-zinc-50 tracking-tight">
            {n} exam{n !== 1 ? 's' : ''} on the horizon
          </h2>
          <Tooltip text="Close">
            <button
              onClick={closeModal}
              aria-label="Close"
              className="w-8 h-8 rounded-lg border border-zinc-200 dark:border-zinc-800 flex items-center justify-center flex-shrink-0 text-zinc-400 dark:text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-600 dark:hover:text-zinc-300 transition"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </Tooltip>
        </div>

        <div
          ref={listScrollRef}
          className="divide-y divide-zinc-100 flex-1 min-h-0 overflow-y-auto autohide-scroll"
          onScroll={() => {
            const el = listScrollRef.current;
            if (!el) return;
            el.classList.add('is-scrolling');
            clearTimeout(scrollTimerRef.current);
            scrollTimerRef.current = setTimeout(() => el.classList.remove('is-scrolling'), 800);
          }}
        >
          {editingId === 'new' && (
            <EditRow
              titleRef={titleRef}
              draft={draft}
              setDraft={setDraft}
              saving={saving}
              onConfirm={confirmEdit}
              onCancel={cancelEdit}
            />
          )}

          {n === 0 && editingId !== 'new' && (
            <div className="flex items-center justify-center py-12 text-sm text-zinc-400 dark:text-zinc-500">
              No upcoming exams — add one below
            </div>
          )}

          {upcomingExams.map((exam, idx) => {
            const dateObj = parseDateLocal(exam.exam_date);
            const month = MONTH_SHORT[dateObj.getMonth()];
            const day = String(dateObj.getDate()).padStart(2, '0');

            if (editingId === exam.id) {
              return (
                <EditRow
                  key={exam.id}
                  titleRef={titleRef}
                  draft={draft}
                  setDraft={setDraft}
                  saving={saving}
                  onConfirm={confirmEdit}
                  onCancel={cancelEdit}
                  onDelete={() => confirmDelete(exam.id)}
                />
              );
            }

            return (
              <div
                key={exam.id}
                className="group flex items-center gap-3.5 px-7 py-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors animate-[fadeIn_0.28s_ease_both]"
                style={{ animationDelay: `${idx * 50}ms` }}
              >
                <div className="w-14 h-14 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex flex-col items-center justify-center flex-shrink-0">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">{month}</span>
                  <span className="text-[20px] font-bold text-zinc-900 dark:text-zinc-50 leading-tight tracking-tight">{day}</span>
                </div>
                <span className="flex-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50 truncate min-w-0">{exam.title}</span>
                <Tooltip text="Edit exam">
                  <button
                    onClick={() => startEdit(exam)}
                    aria-label="Edit exam"
                    className="w-7 h-7 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-400 dark:text-zinc-500 opacity-0 group-hover:opacity-100 hover:bg-indigo-50 dark:hover:bg-indigo-950 hover:border-indigo-200 hover:text-indigo-600 flex items-center justify-center flex-shrink-0 transition"
                  >
                    <PencilIcon />
                  </button>
                </Tooltip>
                <div className={`w-14 h-14 rounded-full flex flex-col items-center justify-center flex-shrink-0 ${tierForRank(idx, n)}`}>
                  {(() => {
                    const { value, unit } = countdownParts(exam.daysRemaining);
                    return (
                      <>
                        <span className={`font-bold tracking-tight leading-none text-white ${unit ? 'text-[17px]' : 'text-[13px]'}`}>{value}</span>
                        {unit && (
                          <span className="text-[8px] font-bold tracking-widest uppercase opacity-90 text-white mt-0.5">{unit}</span>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-5 py-3.5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex items-center justify-between gap-3 flex-shrink-0">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-semibold text-zinc-900 dark:text-zinc-50">{n}</span> upcoming exam{n !== 1 ? 's' : ''}
          </span>
          <button
            onClick={startAdd}
            className="inline-flex items-center gap-1.5 bg-indigo-500 hover:bg-indigo-600 active:scale-[0.97] text-white rounded-lg px-4 py-2 text-xs font-semibold transition"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add exam
          </button>
        </div>

      </div>
    </div>
  );
}

export default function ExamsModal() {
  const { isModalOpen } = useExams();
  return isModalOpen ? <ExamsModalContent /> : null;
}
