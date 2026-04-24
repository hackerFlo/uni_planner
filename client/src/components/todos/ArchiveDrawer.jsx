import { useEffect, useState } from 'react';
import { api } from '../../api/client';

const LIST_BADGE = {
  university: 'bg-indigo-50 text-indigo-600',
  private: 'bg-emerald-50 text-emerald-600',
  future: 'bg-amber-50 text-amber-600',
};

export default function ArchiveDrawer({ onClose, onRestore, onDelete }) {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/todos/archived')
      .then(({ todos }) => setTodos(todos))
      .finally(() => setLoading(false));
  }, []);

  async function handleRestore(id) {
    await onRestore(id);
    setTodos(prev => prev.filter(t => t.id !== id));
  }

  async function handleDelete(id) {
    await onDelete(id);
    setTodos(prev => prev.filter(t => t.id !== id));
  }

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/10 backdrop-blur-[1px]" onClick={onClose} />
      <aside className="relative z-10 w-80 bg-white border-l border-zinc-100 flex flex-col h-full shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
          <h2 className="text-sm font-semibold text-zinc-800">Archive</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 transition p-1 rounded-lg hover:bg-zinc-50">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading && (
            <div className="flex justify-center py-8">
              <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {!loading && todos.length === 0 && (
            <p className="text-xs text-zinc-400 text-center py-8">Archive is empty</p>
          )}
          {todos.map(todo => (
            <div key={todo.id} className="bg-zinc-50 border border-zinc-100 rounded-lg p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full uppercase tracking-wide ${LIST_BADGE[todo.list_type]}`}>
                      {todo.list_type}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-zinc-600 line-through truncate">{todo.title}</p>
                  {todo.description && (
                    <p className="text-xs text-zinc-400 mt-0.5 line-clamp-2">{todo.description}</p>
                  )}
                </div>
              </div>
              <div className="flex gap-2 mt-2.5">
                <button
                  onClick={() => handleRestore(todo.id)}
                  className="flex-1 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 py-1.5 rounded-md transition"
                >
                  Restore
                </button>
                <button
                  onClick={() => handleDelete(todo.id)}
                  className="flex-1 text-xs font-medium text-red-500 bg-red-50 hover:bg-red-100 py-1.5 rounded-md transition"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
