import { useState } from 'react';
import Tooltip from '../ui/Tooltip';
import { parseDateLocal } from '../../utils/dates';

// A todo assigned to a week the planner's arrows cannot reach is in neither the
// day columns nor the list above. Without this it would be unreachable: not
// completable, not editable, not deletable, and findable only in a backup
// export. One muted line is the price of never losing a task.

function fullDate(iso) {
  return parseDateLocal(iso).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

export default function StrandedTasks({ todos, onUnassign, onEdit }) {
  const [open, setOpen] = useState(false);
  if (todos.length === 0) return null;

  const label = todos.length === 1 ? '1 task on another week' : `${todos.length} tasks on other weeks`;

  return (
    <div className="pt-4 mt-2 border-t border-zinc-200 dark:border-zinc-800">
      <button
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between text-[11px] text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition"
      >
        <span>{label}</span>
        <span className="flex items-center gap-1">
          {open ? 'Hide' : 'Show'}
          <svg
            className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </span>
      </button>

      {open && (
        <ul className="mt-2 space-y-1.5">
          {todos.map(todo => (
            <li
              key={todo.id}
              className="flex items-start gap-2 rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 px-2.5 py-2"
            >
              <div className="flex-1 min-w-0">
                <button
                  onClick={() => onEdit(todo)}
                  className="block w-full text-left text-xs text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-50 break-words transition"
                >
                  {todo.title}
                </button>
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500">{fullDate(todo.day_assigned)}</span>
              </div>
              <Tooltip text="Move back to the list">
                <button
                  onClick={() => onUnassign(todo.id)}
                  aria-label={`Unassign ${todo.title}`}
                  className="flex-shrink-0 mt-0.5 p-1 rounded text-zinc-400 dark:text-zinc-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950 transition"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 15H6a2 2 0 01-2-2V7a2 2 0 012-2h5m4 0h3a2 2 0 012 2v6a2 2 0 01-2 2h-3m-4 4l4-4-4-4" />
                  </svg>
                </button>
              </Tooltip>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
