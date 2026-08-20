import { useRef, useState } from 'react';
import { Droppable } from '@hello-pangea/dnd';
import AssignedCard from './AssignedCard';
import Tooltip from '../ui/Tooltip';
import EmojiPicker from '../ui/EmojiPicker';
import useEmojiInput from '../../hooks/useEmojiInput';
import { parseDateLocal } from '../../utils/dates';
import { useToday } from '../../context/TimeContext';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function NoteSlot({ note, isToday, exam, holiday, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);
  const { emojiState, handleChange, handleEmojiSelect, closeEmojiPicker } = useEmojiInput(draft, setDraft, inputRef);

  function startEdit() {
    setDraft(note ?? '');
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function commit() {
    setEditing(false);
    const val = draft.trim();
    if (val !== (note ?? '')) onSave(val);
  }

  function onKeyDown(e) {
    if (emojiState) return;
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { setEditing(false); setDraft(''); }
  }

  const accentText = isToday ? 'text-indigo-400' : exam ? 'text-rose-400' : holiday ? 'text-emerald-500' : 'text-zinc-400 dark:text-zinc-500';
  const accentBorder = isToday ? 'border-indigo-200 dark:border-indigo-900' : exam ? 'border-rose-200 dark:border-rose-900' : holiday ? 'border-emerald-200 dark:border-emerald-900' : 'border-zinc-200 dark:border-zinc-800';
  // var() rather than literals so the note field's backdrop follows the theme;
  // the fallbacks keep the light palette if the stylesheet has not loaded yet.
  const bgColor = isToday
    ? 'var(--day-bg-today, rgb(246,248,255))'
    : exam
    ? 'var(--day-bg-exam, rgb(255,241,242))'
    : holiday
    ? 'var(--day-bg-holiday, rgb(244,252,249))'
    : 'var(--day-bg, #ffffff)';

  if (editing) {
    return (
      <div className="relative flex-1 min-w-0">
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={handleChange}
          onBlur={() => setTimeout(commit, 150)}
          onKeyDown={onKeyDown}
          onPointerDown={e => e.stopPropagation()}
          maxLength={200}
          className={`w-full text-[10px] bg-transparent border-b outline-none py-0.5 text-zinc-600 dark:text-zinc-300 placeholder-zinc-300 ${accentBorder}`}
          placeholder="Add a note…"
        />
        {emojiState && (
          <EmojiPicker anchorRef={inputRef} query={emojiState.query} onSelect={handleEmojiSelect} onClose={closeEmojiPicker} />
        )}
      </div>
    );
  }

  if (note) {
    return (
      <div className="group/note flex-1 min-w-0 flex items-center gap-1">
        <Tooltip text={note} className="flex-1 min-w-0 overflow-hidden" onlyWhenTruncated>
          <span className={`block text-[10px] truncate ${accentText}`}>{note}</span>
        </Tooltip>
        <Tooltip text="Edit note">
          <button
            onClick={startEdit}
            onPointerDown={e => e.stopPropagation()}
            className="flex-shrink-0 opacity-0 group-hover/note:opacity-100 p-0.5 rounded text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-opacity"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        </Tooltip>
      </div>
    );
  }

  return (
    <Tooltip text="Add note">
    <button
      onClick={startEdit}
      onPointerDown={e => e.stopPropagation()}
      className={`opacity-0 group-hover:opacity-100 transition-opacity ${accentText}`}
    >
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    </button>
    </Tooltip>
  );
}

export default function DayColumn({ date, todos, completedTodos = [], showCompleted = false, onToggleCompleted, holiday, exam, isDragging, note, onNoteChange, onUnassign, onComplete, onEdit, onDelete, onAdd }) {
  const todayIso = useToday();
  const dateObj = parseDateLocal(date);
  const isToday = date === todayIso;

  const dayLabel = DAY_SHORT[dateObj.getDay()];
  const dayNum = dateObj.getDate();
  const month = dateObj.toLocaleDateString('en-GB', { month: 'short' });

  return (
    <Droppable
      droppableId={date}
    >
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          className={`group flex flex-col w-[180px] flex-shrink-0 overflow-hidden rounded-xl border transition-all snap-start md:snap-align-none ${
            isToday
              ? 'border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/40'
              : exam
              ? 'border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40'
              : holiday
              ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40'
              : 'border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900'
          } ${snapshot.isDraggingOver ? 'ring-2 ring-inset ring-indigo-400' : ''}`}
        >
          <div className={`px-3 py-3 border-b ${isToday ? 'border-indigo-100' : exam ? 'border-rose-100' : holiday ? 'border-emerald-100' : 'border-zinc-100 dark:border-zinc-800'}`}>
            <div className="flex items-center gap-1.5">
              <span className={`text-xs font-semibold uppercase tracking-widest flex-shrink-0 ${isToday ? 'text-indigo-500' : exam ? 'text-rose-600' : holiday ? 'text-emerald-600' : 'text-zinc-400 dark:text-zinc-500'}`}>
                {dayLabel}
              </span>
              {exam && (
                <>
                  <span className={`text-xs flex-shrink-0 ${isToday ? 'text-indigo-300' : 'text-rose-300'}`}>·</span>
                  <Tooltip text={exam} className="flex-1 min-w-0 overflow-hidden" onlyWhenTruncated><span className="block text-xs font-medium text-rose-600 truncate">{exam}</span></Tooltip>
                </>
              )}
              {!exam && holiday && (
                <>
                  <span className={`text-xs flex-shrink-0 ${isToday ? 'text-indigo-300' : 'text-emerald-300'}`}>·</span>
                  <Tooltip text={holiday} className="flex-1 min-w-0 overflow-hidden" onlyWhenTruncated><span className="block text-xs font-medium text-emerald-600 truncate">{holiday}</span></Tooltip>
                </>
              )}
              {isToday && !exam && !holiday && (
                <span className="flex-shrink-0 text-[9px] font-medium bg-indigo-500 text-white px-1 py-0.5 rounded-full uppercase tracking-wide">
                  Today
                </span>
              )}
              <Tooltip text={showCompleted ? 'Hide completed' : 'Show completed'} className="ml-auto flex-shrink-0">
                <button
                  onPointerDown={e => e.stopPropagation()}
                  onClick={() => onToggleCompleted(date)}
                  aria-pressed={showCompleted}
                  aria-label={showCompleted ? `Hide completed items for ${dayLabel} ${dayNum}` : `Show completed items for ${dayLabel} ${dayNum}`}
                  className={`p-0.5 rounded transition-colors ${
                    showCompleted ? 'text-indigo-500' : 'text-zinc-300 dark:text-zinc-600 hover:text-zinc-500 dark:hover:text-zinc-400'
                  }`}
                >
                  {showCompleted ? (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-4.242-4.242m4.242 4.242L3 3m18 18l-3.59-3.59m0 0A9.978 9.978 0 0021.542 12c-1.274-4.057-5.064-7-9.542-7a9.93 9.93 0 00-1.563.124" />
                    </svg>
                  )}
                </button>
              </Tooltip>
            </div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className={`text-lg font-light flex-shrink-0 ${isToday ? 'text-indigo-700' : exam ? 'text-rose-700' : holiday ? 'text-emerald-700' : 'text-zinc-700 dark:text-zinc-200'}`}>
                {dayNum} <span className="text-sm text-zinc-400 dark:text-zinc-500">{month}</span>
              </span>
              <NoteSlot note={note} isToday={isToday} exam={exam} holiday={holiday} onSave={val => onNoteChange(date, val)} />
            </div>
          </div>

          <div
            className={`flex-1 p-2.5 min-h-[120px] transition-colors rounded-b-xl ${
              snapshot.isDraggingOver ? 'bg-indigo-50 dark:bg-indigo-950/60' : isToday ? '' : exam ? 'bg-rose-50 dark:bg-rose-950/20' : holiday ? 'bg-emerald-50 dark:bg-emerald-950/20' : ''
            }`}
          >
            <div className="space-y-2">
              {todos.map((todo, index) => (
                <AssignedCard
                  key={todo.id}
                  todo={todo}
                  index={index}
                  onUnassign={onUnassign}
                  onComplete={onComplete}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
              {provided.placeholder}
              {isDragging && !snapshot.isDraggingOver && (
                <p className="text-[11px] text-zinc-300 dark:text-zinc-600 text-center py-2">Drop here</p>
              )}
              {!isDragging && (
                <Tooltip text="Add item" className="w-full">
                  <button
                    onPointerDown={e => e.stopPropagation()}
                    onClick={() => onAdd(date)}
                    className={`mt-2 w-full flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] transition-colors ${
                      isToday
                        ? 'text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 hover:text-indigo-500'
                        : exam
                        ? 'text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/60 hover:text-rose-500'
                        : holiday
                        ? 'text-emerald-300 hover:bg-emerald-100/60 hover:text-emerald-500'
                        : 'text-zinc-300 dark:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-500 dark:hover:text-zinc-400'
                    }`}
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </Tooltip>
              )}
            </div>

            {showCompleted && (
              <div className="mt-3 pt-2.5 border-t border-dashed border-zinc-200 dark:border-zinc-800">
                {completedTodos.length === 0 ? (
                  <p className="text-[10px] text-zinc-300 dark:text-zinc-600 text-center py-1">Nothing completed</p>
                ) : (
                  <ul className="space-y-1">
                    {completedTodos.map(todo => (
                      <li key={todo.id} className="flex items-start gap-1.5 px-1">
                        <svg className="w-3 h-3 mt-0.5 flex-shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                        <span className="text-[11px] text-zinc-400 dark:text-zinc-500 line-through break-words leading-snug">
                          {todo.title}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </Droppable>
  );
}
