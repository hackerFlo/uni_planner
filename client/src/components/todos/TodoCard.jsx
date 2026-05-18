import { memo, useEffect, useRef, useState } from 'react';
import { Draggable } from '@hello-pangea/dnd';
import LinkText from '../ui/LinkText';
import RichText from '../ui/RichText';
import Tooltip, { recurrenceLabel } from '../ui/Tooltip';
import ConfirmPopover from '../ui/ConfirmPopover';
import { useLists } from '../../context/ListsContext';
import { LIST_PALETTE } from '../../constants/listPalette';
import useIsMobile from '../../hooks/useIsMobile';
import { useAnyModalOpen } from '../../context/ModalContext';

const COMPLETION_DELAY_MS = 500;

function isRecurring(todo) {
  return todo.recurrence_parent_id != null || todo.recurrence_interval_days != null || todo.recurrence_pattern != null;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function fmtTime(t) { return t ? t.replace(' min', 'm') : t; }
function dayLabel(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return DAY_NAMES[new Date(y, m - 1, d).getDay()];
}

const TodoCardBody = memo(function TodoCardBody({ provided, snapshot, todo, isAssigned, checked, onComplete, onEdit, onDelete }) {
  const isMobile = useIsMobile();
  const anyModalOpen = useAnyModalOpen();
  const hideOnHover = anyModalOpen ? '' : 'group-hover:invisible';
  const { getList } = useLists();
  const list = getList(todo.list_id);
  const palette = LIST_PALETTE[list?.color] ?? LIST_PALETTE.slate;
  const listName = list?.name ?? '';

  const [rotation, setRotation] = useState(0);
  const prevXRef = useRef(null);
  const decayRef = useRef(null);

  const isDraggingOverDay = snapshot.isDragging && DATE_RE.test(snapshot.draggingOver ?? '');

  useEffect(() => {
    if (!snapshot.isDragging) {
      setRotation(0);
      prevXRef.current = null;
      return;
    }
    let rafId = null;
    let pendingX = null;
    function handleMove(e) {
      pendingX = e.clientX;
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (prevXRef.current !== null) {
          const dx = pendingX - prevXRef.current;
          setRotation(Math.max(-12, Math.min(12, dx * 1.5)));
          clearTimeout(decayRef.current);
          decayRef.current = setTimeout(() => setRotation(0), 80);
        }
        prevXRef.current = pendingX;
      });
    }
    function handleUp() {
      setRotation(0);
      prevXRef.current = null;
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    }
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      clearTimeout(decayRef.current);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [snapshot.isDragging]);

  return (
    <div
      ref={provided.innerRef}
      {...provided.draggableProps}
      {...(!isMobile ? provided.dragHandleProps : {})}
      style={{
        ...provided.draggableProps.style,
        width: isDraggingOverDay ? 180 : provided.draggableProps.style?.width,
        height: isDraggingOverDay ? 'auto' : provided.draggableProps.style?.height,
        opacity: snapshot.isDragging ? 0.85 : checked ? 0.4 : 1,
        transform: snapshot.isDragging
          ? `${provided.draggableProps.style?.transform ?? ''} ${isMobile ? '' : `rotate(${rotation}deg) `}scale(1.03)`
          : checked
          ? `${provided.draggableProps.style?.transform ?? ''} scale(0.97)`
          : provided.draggableProps.style?.transform,
        transition: checked
          ? 'opacity 400ms ease, transform 300ms ease'
          : provided.draggableProps.style?.transition,
      }}
      className={`group border rounded-lg shadow-sm transition-all select-none ${isMobile ? '' : 'cursor-grab active:cursor-grabbing'} ${
        isDraggingOverDay
          ? 'bg-white border-zinc-100 p-2.5'
          : isAssigned
          ? 'bg-zinc-50 border-zinc-100 p-3 opacity-50 hover:opacity-70'
          : 'bg-white border-zinc-100 p-3 hover:shadow-md hover:-translate-y-0.5'
      }`}
    >
      {isDraggingOverDay ? (
        <>
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full uppercase tracking-wide ${palette.badge}`}>
              {listName}
            </span>
            {todo.approx_time && (
              <span className="text-[9px] font-medium text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded-full">
                {fmtTime(todo.approx_time)}
              </span>
            )}
          </div>
          <LinkText text={todo.title} className="text-xs font-medium text-zinc-800 leading-snug break-words min-w-0 w-full block" />
          {todo.description && (
            <RichText text={todo.description} className="text-[11px] text-zinc-400 mt-0.5 line-clamp-2 block" />
          )}
          <div className="flex gap-1 mt-2">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-5 h-5 rounded bg-zinc-50" />
            ))}
          </div>
        </>
      ) : (
        <div
          className="relative flex items-start gap-2.5"
          onClick={isMobile ? () => onEdit(todo) : undefined}
        >
          <Tooltip text="Mark complete">
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onComplete(e); }}
            className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded border transition-all duration-150 flex items-center justify-center hover:scale-110 active:scale-95 ${
              checked
                ? 'bg-indigo-500 border-indigo-500'
                : 'border-zinc-300 hover:border-indigo-400 hover:bg-indigo-50'
            }`}
          >
            <svg
              className="w-2.5 h-2.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="white"
              strokeWidth={3.5}
              style={{
                strokeDasharray: 48,
                strokeDashoffset: checked ? 0 : 48,
                transition: 'stroke-dashoffset 280ms ease 60ms',
              }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </button>
          </Tooltip>

          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-1.5 min-w-0">
              <LinkText text={todo.title} className={`text-sm font-medium break-words flex-1 min-w-0 ${isAssigned ? 'text-zinc-400' : 'text-zinc-800'}`} />
              <div className={`flex items-center gap-1.5 flex-shrink-0 ${hideOnHover}`}>
                {(todo.recurrence_interval_days != null || todo.recurrence_pattern != null) && (
                  <Tooltip text={recurrenceLabel(todo.recurrence_interval_days, todo.recurrence_pattern)}>
                    <svg className="w-3 h-3 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                    </svg>
                  </Tooltip>
                )}
                {todo.approx_time && (
                  <span className="text-[9px] font-medium text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded-full">
                    {fmtTime(todo.approx_time)}
                  </span>
                )}
                {isAssigned && (
                  <span className="text-[9px] font-medium text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded-full">
                    {dayLabel(todo.day_assigned)}
                  </span>
                )}
              </div>
            </div>
            {todo.description && (
              <RichText text={todo.description} className="text-xs text-zinc-400 mt-0.5 line-clamp-2 block" />
            )}
          </div>

          {isMobile && (
            <button
              {...provided.dragHandleProps}
              aria-label="Drag to reorder"
              onPointerDown={e => e.stopPropagation()}
              onClick={e => e.stopPropagation()}
              style={{ touchAction: 'none' }}
              className="flex-shrink-0 -mr-1 p-1.5 text-zinc-300 active:text-zinc-500 cursor-grab active:cursor-grabbing"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <circle cx="7" cy="5" r="1.5"/><circle cx="13" cy="5" r="1.5"/>
                <circle cx="7" cy="10" r="1.5"/><circle cx="13" cy="10" r="1.5"/>
                <circle cx="7" cy="15" r="1.5"/><circle cx="13" cy="15" r="1.5"/>
              </svg>
            </button>
          )}
          {!isMobile && (
            <div
              className={`absolute right-0 top-0 items-center gap-1 pl-4 ${anyModalOpen ? 'hidden' : 'hidden group-hover:flex'}`}
              style={{ background: `linear-gradient(to right, transparent, ${isAssigned ? '#fafafa' : '#ffffff'} 40%)` }}
              onPointerDown={e => e.stopPropagation()}
            >
              <Tooltip text="Edit">
                <button
                  onClick={e => { e.stopPropagation(); onEdit(todo); }}
                  className="p-1 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              </Tooltip>
              {isRecurring(todo) ? (
                <ConfirmPopover
                  options={[
                    { label: 'Delete this item', tone: 'danger' },
                    { label: 'Delete all items', tone: 'danger' },
                  ]}
                  onSelect={label => {
                    onDelete(todo.id, label === 'Delete all items' ? 'all' : 'single');
                  }}
                  tooltipText="Delete"
                >
                  <button className="p-1 rounded hover:bg-red-50 text-zinc-400 hover:text-red-500 transition">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </ConfirmPopover>
              ) : (
                <Tooltip text="Delete">
                  <button
                    onClick={e => { e.stopPropagation(); onDelete(todo.id); }}
                    className="p-1 rounded hover:bg-red-50 text-zinc-400 hover:text-red-500 transition"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </Tooltip>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default function TodoCard({ todo, isAssigned, index, onComplete, onEdit, onDelete }) {
  const [checked, setChecked] = useState(false);

  function handleComplete(e) {
    e.stopPropagation();
    if (checked) return;
    setChecked(true);
    setTimeout(() => onComplete(todo), COMPLETION_DELAY_MS);
  }

  return (
    <Draggable draggableId={isAssigned ? `sidebar-${todo.id}` : String(todo.id)} index={index}>
      {(provided, snapshot) => (
        <TodoCardBody
          provided={provided}
          snapshot={snapshot}
          todo={todo}
          isAssigned={isAssigned}
          checked={checked}
          onComplete={handleComplete}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}
    </Draggable>
  );
}
