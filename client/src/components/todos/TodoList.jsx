import { Droppable } from '@hello-pangea/dnd';
import TodoCard from './TodoCard';

const TYPE_CONFIG = {
  university: {
    label: 'University',
    accent: 'text-indigo-600',
    dot: 'bg-indigo-400',
  },
  private: {
    label: 'Private',
    accent: 'text-emerald-600',
    dot: 'bg-emerald-400',
  },
  future: {
    label: 'Future',
    accent: 'text-amber-600',
    dot: 'bg-amber-400',
  },
};

export default function TodoList({ type, todos, loading, onAdd, onEdit, onComplete, onDelete }) {
  const config = TYPE_CONFIG[type];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
          <h2 className={`text-xs font-semibold uppercase tracking-widest ${config.accent}`}>
            {config.label}
          </h2>
        </div>
        <button
          onClick={onAdd}
          className="text-zinc-400 hover:text-zinc-700 transition p-0.5 rounded"
          title="Add item"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      <Droppable droppableId={`${type}-list`} isDropDisabled={true}>
        {(provided) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className="min-h-[60px] space-y-2 rounded-lg"
          >
            {loading && todos.length === 0 && (
              <div className="text-xs text-zinc-300 py-4 text-center">Loading…</div>
            )}
            {!loading && todos.length === 0 && (
              <div
                onClick={onAdd}
                className="text-xs text-zinc-300 py-6 text-center border border-dashed border-zinc-200 rounded-lg cursor-pointer hover:border-zinc-300 hover:text-zinc-400 transition"
              >
                No items — click + to add
              </div>
            )}
            {todos.map((todo, index) => (
              <TodoCard
                key={todo.id}
                todo={todo}
                index={index}
                isAssigned={!!todo.day_assigned}
                onComplete={onComplete}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}
