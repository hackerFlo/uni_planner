import { memo, useState } from 'react';
import { Draggable } from '@hello-pangea/dnd';
import LinkText from '../ui/LinkText';
import RichText from '../ui/RichText';
import Tooltip, { recurrenceLabel } from '../ui/Tooltip';
import ConfirmPopover from '../ui/ConfirmPopover';
import { useLists } from '../../context/ListsContext';
import { LIST_PALETTE } from '../../constants/listPalette';
import { useAnyModalOpen } from '../../context/ModalContext';
import { useCopyDrag } from '../../context/CopyDragContext';
import { useDragTilt } from '../../hooks/useDragTilt';

const COMPLETION_DELAY_MS = 500;

function isRecurring(todo) {
  return todo.recurrence_parent_id != null || todo.recurrence_interval_days != null || todo.recurrence_pattern != null;
}

function fmtTime(t) { return t ? t.replace(' min', 'm') : t; }

const CardBody = memo(function CardBody({ provided, snapshot, todo, checked, isGhost, onComplete, onUnassign, onEdit, onDelete }) {
  const anyModalOpen = useAnyModalOpen();
  const isCopying = useCopyDrag() && snapshot.isDragging;
  const { getList } = useLists();
  const list = getList(todo.list_id);
  const palette = LIST_PALETTE[list?.color] ?? LIST_PALETTE.slate;
  const listName = list?.name ?? '';

  const rotation = useDragTilt(snapshot.isDragging);

  return (
    <div
      ref={provided.innerRef}
      {...provided.draggableProps}
      {...provided.dragHandleProps}
      style={{
        ...provided.draggableProps.style,
        ...(snapshot.isDragging && {
          transform: `${provided.draggableProps.style?.transform ?? ''} rotate(${rotation}deg) scale(1.03)`,
          boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
        }),
        transition: checked
          ? 'opacity 400ms ease, transform 300ms ease'
          : provided.draggableProps.style?.transition,
        opacity: checked ? 0.4 : 1,
      }}
      className={`group bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-lg p-2.5 shadow-sm hover:shadow-md transition-shadow select-none min-w-0 w-full relative cursor-grab active:cursor-grabbing${isGhost ? ' pointer-events-none' : ''}`}
      aria-hidden={isGhost || undefined}
    >
      <div className="flex items-center gap-2 mb-1.5">
        {isCopying && (
          <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full uppercase tracking-wide bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-200">
            Copy
          </span>
        )}
        <Tooltip text="Mark complete">
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onComplete(e); }}
          aria-pressed={checked}
          aria-label={checked ? `Mark "${todo.title}" as not done` : `Mark "${todo.title}" as done`}
          className={`flex-shrink-0 relative w-3.5 h-3.5 rounded border transition-all duration-150 flex items-center justify-center hover:scale-110 active:scale-95 md:before:absolute md:before:content-[''] md:before:inset-[-8px] ${
            checked
              ? 'bg-indigo-500 border-indigo-500'
              : 'border-zinc-300 dark:border-zinc-700 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950'
          }`}
        >
          <svg
            className="w-2 h-2"
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
        <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full uppercase tracking-wide ${palette.badge}`}>
          {listName}
        </span>
        {todo.approx_time && (
          <span className="text-[9px] font-medium text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded-full truncate">
            {fmtTime(todo.approx_time)}
          </span>
        )}
        {(todo.recurrence_interval_days != null || todo.recurrence_pattern != null) && (
          <Tooltip text={recurrenceLabel(todo.recurrence_interval_days, todo.recurrence_pattern)}>
            <svg className="flex-shrink-0 w-3 h-3 text-zinc-400 dark:text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
            </svg>
          </Tooltip>
        )}
      </div>

      <LinkText text={todo.title} className="text-xs font-medium text-zinc-800 dark:text-zinc-100 leading-snug break-words min-w-0 w-full block" />
      {todo.description && (
        <RichText text={todo.description} className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 line-clamp-2 block" />
      )}

      <div className={`flex gap-1 mt-2 transition duration-200 ${anyModalOpen ? 'blur-sm opacity-60 pointer-events-none' : ''}`}>
          <Tooltip text="Edit">
            <button
              onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); onEdit(todo); }}
              aria-label={`Edit "${todo.title}"`}
              className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 p-1 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          </Tooltip>
          <Tooltip text="Unassign">
            <button
              onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); onUnassign(todo.id); }}
              aria-label={`Remove "${todo.title}" from this day`}
              className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 p-1 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l4 4m0-4l-4 4" />
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
              <button
                onPointerDown={e => e.stopPropagation()}
                aria-label={`Delete "${todo.title}"`}
                className="text-zinc-400 dark:text-zinc-500 hover:text-red-500 p-1 rounded hover:bg-red-50 dark:hover:bg-red-950 transition"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </ConfirmPopover>
          ) : (
            <Tooltip text="Delete">
              <button
                onPointerDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); onDelete(todo.id); }}
                aria-label={`Delete "${todo.title}"`}
                className="text-zinc-400 dark:text-zinc-500 hover:text-red-500 p-1 rounded hover:bg-red-50 dark:hover:bg-red-950 transition"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </Tooltip>
          )}
        </div>
    </div>
  );
});

export default function AssignedCard({ todo, index, draggableId, isGhost = false, onUnassign, onComplete, onEdit, onDelete }) {
  const [checked, setChecked] = useState(false);

  function handleComplete(e) {
    e.stopPropagation();
    if (checked) return;
    setChecked(true);
    setTimeout(() => onComplete(todo), COMPLETION_DELAY_MS);
  }

  // `draggableId` is an override, not a default: while a copy-drag runs the
  // board renders a second, inert stand-in for this card, and dnd will only
  // accept it under an id of its own.
  return (
    <Draggable draggableId={draggableId ?? String(todo.id)} index={index} isDragDisabled={isGhost}>
      {(provided, snapshot) => (
        <CardBody
          provided={provided}
          snapshot={snapshot}
          todo={todo}
          checked={checked}
          isGhost={isGhost}
          onComplete={handleComplete}
          onUnassign={onUnassign}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}
    </Draggable>
  );
}
