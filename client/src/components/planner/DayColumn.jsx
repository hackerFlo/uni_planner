import { useRef, useState } from 'react';
import { Droppable } from '@hello-pangea/dnd';
import AssignedCard from './AssignedCard';
import Tooltip from '../ui/Tooltip';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseDateLocal(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function NoteSlot({ note, isToday, holiday, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);

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
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { setEditing(false); setDraft(''); }
  }

  const accentText = isToday ? 'text-indigo-400' : holiday ? 'text-emerald-500' : 'text-zinc-400';
  const accentBorder = isToday ? 'border-indigo-200' : holiday ? 'border-emerald-200' : 'border-zinc-200';
  const bgColor = isToday ? 'rgb(246,248,255)' : holiday ? 'rgb(244,252,249)' : '#ffffff';

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        onPointerDown={e => e.stopPropagation()}
        maxLength={200}
        className={`flex-1 min-w-0 text-[10px] bg-transparent border-b outline-none py-0.5 text-zinc-600 placeholder-zinc-300 ${accentBorder}`}
        placeholder="Add a note…"
      />
    );
  }

  if (note) {
    return (
      <div className="group/note flex-1 min-w-0 flex items-center gap-1">
        <Tooltip text={note} className="flex-1 min-w-0 overflow-hidden">
          <span className={`block text-[10px] truncate ${accentText}`}>{note}</span>
        </Tooltip>
        <Tooltip text="Edit note">
          <button
            onClick={startEdit}
            onPointerDown={e => e.stopPropagation()}
            className="flex-shrink-0 opacity-0 group-hover/note:opacity-100 p-0.5 rounded text-zinc-400 hover:text-zinc-600 transition-opacity"
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

export default function DayColumn({ date, todos, holiday, isDragging, note, onNoteChange, onUnassign, onComplete, onEdit, onDelete, onAdd }) {
  const dateObj = parseDateLocal(date);
  const todayObj = new Date();
  todayObj.setHours(0, 0, 0, 0);
  const isToday = dateObj.getTime() === todayObj.getTime();

  const dayLabel = DAY_SHORT[dateObj.getDay()];
  const dayNum = dateObj.getDate();
  const month = dateObj.toLocaleDateString('en-GB', { month: 'short' });

  return (
    <Droppable droppableId={date}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          className={`group flex flex-col w-[180px] flex-shrink-0 overflow-hidden rounded-xl border transition-all snap-start md:snap-align-none ${
            isToday
              ? 'border-indigo-200 bg-indigo-50/40'
              : holiday
              ? 'border-emerald-200 bg-emerald-50/40'
              : 'border-zinc-100 bg-white'
          } ${snapshot.isDraggingOver ? 'ring-2 ring-inset ring-indigo-400' : ''}`}
        >
          <div className={`px-3 py-3 border-b ${isToday ? 'border-indigo-100' : holiday ? 'border-emerald-100' : 'border-zinc-100'}`}>
            <div className="flex items-center gap-1.5">
              <span className={`text-xs font-semibold uppercase tracking-widest flex-shrink-0 ${isToday ? 'text-indigo-500' : holiday ? 'text-emerald-600' : 'text-zinc-400'}`}>
                {dayLabel}
              </span>
              {holiday && (
                <>
                  <span className={`text-xs flex-shrink-0 ${isToday ? 'text-indigo-300' : 'text-emerald-300'}`}>·</span>
                  <Tooltip text={holiday}><span className="text-xs font-medium text-emerald-600 truncate">{holiday}</span></Tooltip>
                </>
              )}
              {isToday && !holiday && (
                <span className="flex-shrink-0 text-[9px] font-medium bg-indigo-500 text-white px-1 py-0.5 rounded-full uppercase tracking-wide">
                  Today
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className={`text-lg font-light flex-shrink-0 ${isToday ? 'text-indigo-700' : holiday ? 'text-emerald-700' : 'text-zinc-700'}`}>
                {dayNum} <span className="text-sm text-zinc-400">{month}</span>
              </span>
              <NoteSlot note={note} isToday={isToday} holiday={holiday} onSave={val => onNoteChange(date, val)} />
            </div>
          </div>

          <div
            className={`flex-1 p-2.5 min-h-[120px] transition-colors rounded-b-xl ${
              snapshot.isDraggingOver ? 'bg-indigo-50/60' : holiday ? 'bg-emerald-50/20' : ''
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
                <p className="text-[11px] text-zinc-300 text-center py-2">Drop here</p>
              )}
              {!isDragging && (
                <Tooltip text="Add item" className="w-full">
                  <button
                    onPointerDown={e => e.stopPropagation()}
                    onClick={() => onAdd(date)}
                    className={`mt-2 w-full flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] transition-colors ${
                      isToday
                        ? 'text-indigo-300 hover:bg-indigo-100/60 hover:text-indigo-500'
                        : holiday
                        ? 'text-emerald-300 hover:bg-emerald-100/60 hover:text-emerald-500'
                        : 'text-zinc-300 hover:bg-zinc-100 hover:text-zinc-500'
                    }`}
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </Tooltip>
              )}
            </div>
          </div>
        </div>
      )}
    </Droppable>
  );
}
