import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const LIST_BADGE = {
  university: 'bg-indigo-50 text-indigo-500',
  private: 'bg-emerald-50 text-emerald-600',
  future: 'bg-amber-50 text-amber-600',
};

export default function AssignedCard({ todo, onUnassign, onComplete, onEdit }) {
  const { attributes, listeners, setNodeRef, isDragging, transform, transition } = useSortable({
    id: todo.id,
    transition: {
      duration: 500,
      easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
    },
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0 : 1,
        touchAction: 'none',
      }}
      className="group bg-white border border-zinc-100 rounded-lg p-2.5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-grab active:cursor-grabbing select-none"
      {...attributes}
      {...listeners}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onComplete(todo); }}
          className="flex-shrink-0 relative w-3.5 h-3.5 rounded border border-zinc-300 hover:border-indigo-400 hover:bg-indigo-50 transition md:before:absolute md:before:content-[''] md:before:inset-[-8px]"
          title="Mark complete"
        />
        <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full uppercase tracking-wide ${LIST_BADGE[todo.list_type]}`}>
          {todo.list_type}
        </span>
      </div>

      <p className="text-xs font-medium text-zinc-800 leading-snug">{todo.title}</p>
      {todo.description && (
        <p className="text-[11px] text-zinc-400 mt-0.5 line-clamp-2">{todo.description}</p>
      )}

      <div className="flex gap-1 mt-2">
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onEdit(todo); }}
          className="text-[10px] text-zinc-400 hover:text-zinc-600 px-1.5 py-0.5 rounded hover:bg-zinc-50 transition"
        >
          Edit
        </button>
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onUnassign(todo.id); }}
          className="text-[10px] text-zinc-400 hover:text-zinc-600 px-1.5 py-0.5 rounded hover:bg-zinc-50 transition"
        >
          Unassign
        </button>
      </div>
    </div>
  );
}
