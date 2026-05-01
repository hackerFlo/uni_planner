import { useEffect, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import LinkText from '../ui/LinkText';

if (typeof document !== 'undefined' && !document.getElementById('card-plop-style')) {
  const s = document.createElement('style');
  s.id = 'card-plop-style';
  s.textContent = `@keyframes cardPlop{0%{transform:translateY(-9px) scale(1.03);opacity:0}65%{transform:translateY(2px) scale(0.988);opacity:1}100%{transform:translateY(0) scale(1);opacity:1}}.card-plop{animation:cardPlop 300ms cubic-bezier(0.34,1.4,0.64,1) both}@keyframes ghostSlotIn{from{max-height:0}to{max-height:120px}}.ghost-slot{animation:ghostSlotIn 200ms cubic-bezier(0.25,1,0.5,1) both;overflow:hidden;}`;
  document.head.appendChild(s);
}

// Delay flag so initial page-load cards don't animate
let _appReady = false;
setTimeout(() => { _appReady = true; }, 900);

// PlannerPage adds an id here before assignDay fires; AssignedCard consumes & deletes it on mount
export const _pendingAnimIds = new Set();

function fmtTime(t) { return t ? t.replace(' min', 'm') : t; }

const LIST_BADGE = {
  university: 'bg-indigo-50 text-indigo-500',
  private: 'bg-emerald-50 text-emerald-600',
  future: 'bg-amber-50 text-amber-600',
};

export default function AssignedCard({ todo, onUnassign, onComplete, onEdit, onDelete, isGhost }) {
  const [checked, setChecked] = useState(false);
  const [dropping, setDropping] = useState(false);
  const { attributes, listeners, setNodeRef, isDragging, transform, transition } = useSortable({
    id: todo.id,
    transition: {
      duration: 500,
      easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
    },
  });

  useEffect(() => {
    if (!_appReady || isDragging || !_pendingAnimIds.has(todo.id)) return;
    _pendingAnimIds.delete(todo.id);
    setDropping(true);
    const t = setTimeout(() => setDropping(false), 400);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleComplete(e) {
    e.stopPropagation();
    if (checked) return;
    setChecked(true);
    setTimeout(() => onComplete(todo), 500);
  }

  return (
    <div
      ref={setNodeRef}
      className={`group bg-white border border-zinc-100 rounded-lg p-2.5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-grab active:cursor-grabbing select-none min-w-0 w-full${dropping ? ' card-plop' : ''}${isGhost ? ' ghost-slot' : ''}`}
      style={{
        transform: dropping ? undefined : CSS.Transform.toString(transform),
        transition: checked ? 'opacity 400ms ease, transform 300ms ease' : transition,
        opacity: isDragging ? 0 : checked ? 0.4 : 1,
        touchAction: 'none',
      }}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={handleComplete}
          className={`flex-shrink-0 relative w-3.5 h-3.5 rounded border transition-all duration-150 flex items-center justify-center md:before:absolute md:before:content-[''] md:before:inset-[-8px] ${
            checked
              ? 'bg-indigo-500 border-indigo-500'
              : 'border-zinc-300 hover:border-indigo-400 hover:bg-indigo-50'
          }`}
          title="Mark complete"
        >
          <svg
            className="w-2 h-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="white"
            strokeWidth={3.5}
            style={{
              strokeDasharray: 40,
              strokeDashoffset: checked ? 0 : 40,
              transition: 'stroke-dashoffset 280ms ease 60ms',
            }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </button>
        <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full uppercase tracking-wide ${LIST_BADGE[todo.list_type]}`}>
          {todo.list_type}
        </span>
        {todo.approx_time && (
          <span className="text-[9px] font-medium text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded-full truncate">
            {fmtTime(todo.approx_time)}
          </span>
        )}
      </div>

      <LinkText text={todo.title} className="text-xs font-medium text-zinc-800 leading-snug break-words min-w-0 w-full block" />
      {todo.description && (
        <LinkText text={todo.description} className="text-[11px] text-zinc-400 mt-0.5 line-clamp-2 block" />
      )}

      <div className="flex gap-1 mt-2">
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onEdit(todo); }}
          title="Edit"
          className="text-zinc-400 hover:text-zinc-600 p-1 rounded hover:bg-zinc-50 transition"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onUnassign(todo.id); }}
          title="Unassign"
          className="text-zinc-400 hover:text-zinc-600 p-1 rounded hover:bg-zinc-50 transition"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l4 4m0-4l-4 4" />
          </svg>
        </button>
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onDelete(todo.id); }}
          title="Delete"
          className="text-zinc-400 hover:text-red-500 p-1 rounded hover:bg-red-50 transition"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}
