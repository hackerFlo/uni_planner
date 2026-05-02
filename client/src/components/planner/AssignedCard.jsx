import { useEffect, useRef, useState } from 'react';
import { Draggable } from '@hello-pangea/dnd';
import LinkText from '../ui/LinkText';

function fmtTime(t) { return t ? t.replace(' min', 'm') : t; }

const LIST_BADGE = {
  university: 'bg-indigo-50 text-indigo-500',
  private: 'bg-emerald-50 text-emerald-600',
  future: 'bg-amber-50 text-amber-600',
};

function CardBody({ provided, snapshot, todo, checked, onComplete, onUnassign, onEdit, onDelete }) {
  const [rotation, setRotation] = useState(0);
  const prevXRef = useRef(null);
  const decayRef = useRef(null);

  useEffect(() => {
    if (!snapshot.isDragging) {
      setRotation(0);
      prevXRef.current = null;
      return;
    }
    function handleMove(e) {
      if (prevXRef.current !== null) {
        const dx = e.clientX - prevXRef.current;
        setRotation(Math.max(-12, Math.min(12, dx * 1.5)));
        clearTimeout(decayRef.current);
        decayRef.current = setTimeout(() => setRotation(0), 80);
      }
      prevXRef.current = e.clientX;
    }
    function handleUp() {
      setRotation(0);
      prevXRef.current = null;
      window.removeEventListener('pointermove', handleMove);
    }
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      clearTimeout(decayRef.current);
    };
  }, [snapshot.isDragging]);

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
      className="group bg-white border border-zinc-100 rounded-lg p-2.5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-shadow cursor-grab active:cursor-grabbing select-none min-w-0 w-full"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={onComplete}
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

export default function AssignedCard({ todo, index, onUnassign, onComplete, onEdit, onDelete }) {
  const [checked, setChecked] = useState(false);

  function handleComplete(e) {
    e.stopPropagation();
    if (checked) return;
    setChecked(true);
    setTimeout(() => onComplete(todo), 500);
  }

  return (
    <Draggable draggableId={String(todo.id)} index={index}>
      {(provided, snapshot) => (
        <CardBody
          provided={provided}
          snapshot={snapshot}
          todo={todo}
          checked={checked}
          onComplete={handleComplete}
          onUnassign={onUnassign}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}
    </Draggable>
  );
}
