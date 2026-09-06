import { useRef, useState } from 'react';
import { Droppable } from '@hello-pangea/dnd';
import AssignedCard from './AssignedCard';
import DividerCard from './DividerCard';
import CompletedCard from './CompletedCard';
import Tooltip from '../ui/Tooltip';
import EmojiPicker from '../ui/EmojiPicker';
import useEmojiInput from '../../hooks/useEmojiInput';
import { parseDateLocal } from '../../utils/dates';
import { withCopyGhost } from '../../utils/copyDrag';
import { useToday } from '../../context/TimeContext';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ALT_LABEL = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent ?? '') ? '⌥' : 'Alt';

// A todo drags under its number, a divider under the namespaced string it is
// already stored as -- so the same expression covers both kinds of row.
const dayDraggableId = item => String(item.id);

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
            aria-label="Edit note"
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
      aria-label="Add note"
      className={`opacity-0 group-hover:opacity-100 transition-opacity ${accentText}`}
    >
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    </button>
    </Tooltip>
  );
}

// Placeholder cards for the first fetch. Shaped like an AssignedCard so the
// column does not jump when the real ones land. An empty day now renders
// nothing at all, so without these seven blank columns would be
// indistinguishable from a load that has not finished.
const SKELETON_ROWS = ['w-4/5', 'w-3/5', 'w-2/3'];

function DaySkeleton() {
  return (
    <div className="space-y-2 animate-pulse" aria-hidden="true">
      {SKELETON_ROWS.map((titleWidth, i) => (
        <div
          key={i}
          className="bg-white/60 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 rounded-lg p-2.5"
        >
          <div className="h-2 w-10 rounded-full bg-zinc-200 dark:bg-zinc-700" />
          <div className={`h-2 mt-2 rounded-full bg-zinc-200 dark:bg-zinc-700 ${titleWidth}`} />
          <div className="h-2 mt-1.5 w-1/2 rounded-full bg-zinc-100 dark:bg-zinc-800" />
        </div>
      ))}
    </div>
  );
}

export default function DayColumn({ date, items, copyGhostId = null, loading = false, completedTodos = [], showCompleted = false, onToggleCompleted, onUncomplete, holiday, exam, isDragging, note, onNoteChange, onUnassign, onComplete, onEdit, onDelete, onAdd, onAddDivider, onDeleteDivider }) {
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
          aria-busy={loading}
          className={`group flex flex-col w-[180px] flex-shrink-0 md:w-auto md:flex-1 md:min-w-[180px] overflow-hidden rounded-xl border transition-all snap-start md:snap-align-none ${
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
                  // Revealed on hover of the day column, like the Add-note button beside
                  // it (both hang off the column's unnamed `group`). Always visible below
                  // md: a touch device has no hover, and this is the only way to reach
                  // completed items -- same reasoning as ExamsModal.jsx. Also stays
                  // visible while the column IS showing completed items, because the
                  // indigo tint is the only signal that the column is in that mode.
                  className={`p-0.5 rounded transition focus-visible:opacity-100 ${
                    showCompleted
                      ? 'text-indigo-500 opacity-100'
                      : 'text-zinc-300 dark:text-zinc-600 hover:text-zinc-500 dark:hover:text-zinc-400 opacity-100 md:opacity-0 md:group-hover:opacity-100'
                  }`}
                >
                  {/* Font Awesome Free 6.7.2 regular eye / eye-slash (CC BY 4.0,
                      fontawesome.com/license/free). Inlined rather than pulled from a
                      CDN: AR-10 keeps script-src/style-src at 'self'. */}
                  {showCompleted ? (
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 576 512" aria-hidden="true">
                      <path d="M288 80c-65.2 0-118.8 29.6-159.9 67.7C89.6 183.5 63 226 49.4 256c13.6 30 40.2 72.5 78.6 108.3C169.2 402.4 222.8 432 288 432s118.8-29.6 159.9-67.7C486.4 328.5 513 286 526.6 256c-13.6-30-40.2-72.5-78.6-108.3C406.8 109.6 353.2 80 288 80zM95.4 112.6C142.5 68.8 207.2 32 288 32s145.5 36.8 192.6 80.6c46.8 43.5 78.1 95.4 93 131.1c3.3 7.9 3.3 16.7 0 24.6c-14.9 35.7-46.2 87.7-93 131.1C433.5 443.2 368.8 480 288 480s-145.5-36.8-192.6-80.6C48.6 356 17.3 304 2.5 268.3c-3.3-7.9-3.3-16.7 0-24.6C17.3 208 48.6 156 95.4 112.6zM288 336c44.2 0 80-35.8 80-80s-35.8-80-80-80c-.7 0-1.3 0-2 0c1.3 5.1 2 10.5 2 16c0 35.3-28.7 64-64 64c-5.5 0-10.9-.7-16-2c0 .7 0 1.3 0 2c0 44.2 35.8 80 80 80zm0-208a128 128 0 1 1 0 256 128 128 0 1 1 0-256z" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 640 512" aria-hidden="true">
                      <path d="M38.8 5.1C28.4-3.1 13.3-1.2 5.1 9.2S-1.2 34.7 9.2 42.9l592 464c10.4 8.2 25.5 6.3 33.7-4.1s6.3-25.5-4.1-33.7L525.6 386.7c39.6-40.6 66.4-86.1 79.9-118.4c3.3-7.9 3.3-16.7 0-24.6c-14.9-35.7-46.2-87.7-93-131.1C465.5 68.8 400.8 32 320 32c-68.2 0-125 26.3-169.3 60.8L38.8 5.1zm151 118.3C226 97.7 269.5 80 320 80c65.2 0 118.8 29.6 159.9 67.7C518.4 183.5 545 226 558.6 256c-12.6 28-36.6 66.8-70.9 100.9l-53.8-42.2c9.1-17.6 14.2-37.5 14.2-58.7c0-70.7-57.3-128-128-128c-32.2 0-61.7 11.9-84.2 31.5l-46.1-36.1zM394.9 284.2l-81.5-63.9c4.2-8.5 6.6-18.2 6.6-28.3c0-5.5-.7-10.9-2-16c.7 0 1.3 0 2 0c44.2 0 80 35.8 80 80c0 9.9-1.8 19.4-5.1 28.2zm9.4 130.3C378.8 425.4 350.7 432 320 432c-65.2 0-118.8-29.6-159.9-67.7C121.6 328.5 95 286 81.4 256c8.3-18.4 21.5-41.5 39.4-64.8L83.1 161.5C60.3 191.2 44 220.8 34.5 243.7c-3.3 7.9-3.3 16.7 0 24.6c14.9 35.7 46.2 87.7 93 131.1C174.5 443.2 239.2 480 320 480c47.8 0 89.9-12.9 126.2-32.5l-41.9-33zM192 256c0 70.7 57.3 128 128 128c13.3 0 26.1-2 38.2-5.8L302 334c-23.5-5.4-43.1-21.2-53.7-42.3l-56.1-44.2c-.2 2.8-.3 5.6-.3 8.5z" />
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
              {/* One row per item, plus the inert stand-in that holds the
                  original's place while a copy is dragged out of this column. */}
              {withCopyGhost(items, copyGhostId, dayDraggableId).map((row, index) => (row.item.kind === 'divider' ? (
                <DividerCard
                  key={row.key}
                  item={row.item}
                  index={index}
                  draggableId={row.draggableId}
                  isGhost={row.isGhost}
                  boardDragging={isDragging}
                  onDelete={onDeleteDivider}
                />
              ) : (
                <AssignedCard
                  key={row.key}
                  todo={row.item}
                  index={index}
                  draggableId={row.draggableId}
                  isGhost={row.isGhost}
                  onUnassign={onUnassign}
                  onComplete={onComplete}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              )))}
              {provided.placeholder}
              {loading && items.length === 0 && <DaySkeleton />}
              {isDragging && !snapshot.isDraggingOver && (
                <p className="text-[11px] text-zinc-300 dark:text-zinc-600 text-center py-2">Drop here</p>
              )}
              {!isDragging && !loading && (
                <Tooltip text={`Add item — hold ${ALT_LABEL} for a divider`} className="w-full">
                  <button
                    onPointerDown={e => e.stopPropagation()}
                    // Alt/Option turns the same button into "insert a divider
                    // here", which is why the divider has no control of its own.
                    onClick={e => (e.altKey ? onAddDivider(date, items) : onAdd(date))}
                    aria-label={`Add an item to ${dayLabel} ${dayNum}`}
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
                  <div className="space-y-2">
                    {completedTodos.map(todo => (
                      <CompletedCard key={todo.id} todo={todo} onUncomplete={onUncomplete} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </Droppable>
  );
}
