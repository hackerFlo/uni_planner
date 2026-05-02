import { useEffect, useRef, useState } from 'react';
import { Draggable } from '@hello-pangea/dnd';
import LinkText from '../ui/LinkText';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function fmtTime(t) { return t ? t.replace(' min', 'm') : t; }
function dayLabel(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return DAY_NAMES[new Date(y, m - 1, d).getDay()];
}

function TodoCardBody({ provided, snapshot, todo, isAssigned, checked, onComplete, onEdit, onDelete }) {
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
        opacity: snapshot.isDragging ? 0.85 : checked ? 0.4 : 1,
        transform: snapshot.isDragging
          ? `${provided.draggableProps.style?.transform ?? ''} rotate(${rotation}deg) scale(1.03)`
          : checked
          ? `${provided.draggableProps.style?.transform ?? ''} scale(0.97)`
          : provided.draggableProps.style?.transform,
        transition: checked
          ? 'opacity 400ms ease, transform 300ms ease'
          : provided.draggableProps.style?.transition,
      }}
      className={`group border rounded-lg p-3 shadow-sm transition-all select-none cursor-grab active:cursor-grabbing ${
        isAssigned
          ? 'bg-zinc-50 border-zinc-100 opacity-50 hover:opacity-70'
          : 'bg-white border-zinc-100 hover:shadow-md hover:-translate-y-0.5'
      }`}
    >
      <div className="relative flex items-start gap-2.5">
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={onComplete}
          className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded border transition-all duration-150 flex items-center justify-center ${
            checked
              ? 'bg-indigo-500 border-indigo-500'
              : 'border-zinc-300 hover:border-indigo-400 hover:bg-indigo-50'
          }`}
          title="Mark complete"
        >
          <svg
            className="w-2.5 h-2.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="white"
            strokeWidth={3}
            style={{
              strokeDasharray: 40,
              strokeDashoffset: checked ? 0 : 40,
              transition: 'stroke-dashoffset 280ms ease 60ms',
            }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-1.5 min-w-0">
            <LinkText text={todo.title} className={`text-sm font-medium break-words flex-1 min-w-0 ${isAssigned ? 'text-zinc-400' : 'text-zinc-800'}`} />
            {todo.approx_time && (
              <span className="flex-shrink-0 text-[9px] font-medium text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded-full">
                {fmtTime(todo.approx_time)}
              </span>
            )}
            {isAssigned && (
              <span className="flex-shrink-0 text-[9px] font-medium text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded-full">
                {dayLabel(todo.day_assigned)}
              </span>
            )}
          </div>
          {todo.description && (
            <LinkText text={todo.description} className="text-xs text-zinc-400 mt-0.5 line-clamp-2 block" />
          )}
        </div>

        <div
          className="absolute right-0 top-0 hidden group-hover:flex items-center gap-1 pl-4"
          style={{ background: `linear-gradient(to right, transparent, ${isAssigned ? '#fafafa' : '#ffffff'} 40%)` }}
          onPointerDown={e => e.stopPropagation()}
        >
          <button
            onClick={e => { e.stopPropagation(); onEdit(todo); }}
            className="p-1 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition"
            title="Edit"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete(todo.id); }}
            className="p-1 rounded hover:bg-red-50 text-zinc-400 hover:text-red-500 transition"
            title="Delete"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TodoCard({ todo, isAssigned, index, onComplete, onEdit, onDelete }) {
  const [checked, setChecked] = useState(false);

  function handleComplete(e) {
    e.stopPropagation();
    if (checked) return;
    setChecked(true);
    setTimeout(() => onComplete(todo), 500);
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
