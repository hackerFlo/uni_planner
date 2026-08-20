import { Droppable } from '@hello-pangea/dnd';
import TodoCard from './TodoCard';
import Tooltip from '../ui/Tooltip';
import { LIST_PALETTE } from '../../constants/listPalette';

export default function TodoList({ list, todos, loading, onAdd, onEdit, onComplete, onDelete }) {
  const palette = LIST_PALETTE[list.color] ?? LIST_PALETTE.slate;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${palette.dot}`} />
          <h2 className={`text-xs font-semibold uppercase tracking-widest ${palette.accent}`}>
            {list.name}
          </h2>
        </div>
        <Tooltip text="Add item">
          <button
            onClick={onAdd}
            className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 transition p-0.5 rounded"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </Tooltip>
      </div>

      <Droppable
        droppableId={`${list.id}-list`}
      >
        {(provided) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className="min-h-[60px] space-y-2 rounded-lg"
          >
            {loading && todos.length === 0 && (
              <div className="text-xs text-zinc-300 dark:text-zinc-600 py-4 text-center">Loading…</div>
            )}
            {!loading && todos.length === 0 && (
              <div
                onClick={onAdd}
                className="text-xs text-zinc-300 dark:text-zinc-600 py-6 text-center border border-dashed border-zinc-200 dark:border-zinc-800 rounded-lg cursor-pointer hover:border-zinc-300 dark:hover:border-zinc-600 hover:text-zinc-400 transition"
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
