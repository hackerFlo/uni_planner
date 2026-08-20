import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import { useLists } from '../../context/ListsContext';
import { useRegisterModal } from '../../context/ModalContext';
import { useToast } from '../../context/ToastContext';
import { LIST_PALETTE } from '../../constants/listPalette';
import RichText from '../ui/RichText';

export default function ArchiveDrawer({ onClose, onRestore, onDelete }) {
  useRegisterModal();
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const { getList } = useLists();
  const toast = useToast();
  const panelRef = useRef(null);
  // The caller passes a fresh arrow on every one of its renders, so the effect
  // below must not depend on it -- it would re-run constantly and yank focus back
  // into the drawer while the user is typing somewhere else.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const returnFocusTo = document.activeElement;
    panelRef.current?.focus({ preventScroll: true });
    function onKey(e) { if (e.key === 'Escape') onCloseRef.current(); }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (returnFocusTo instanceof HTMLElement) returnFocusTo.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    api.get('/api/todos/archived')
      .then(({ todos }) => setTodos(todos))
      .catch(err => {
        console.warn('[archive] failed to load:', err.message);
        toast?.error('Could not load archive. Please try again.');
      })
      .finally(() => setLoading(false));
  }, [toast]);

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
      data-modal-root
      className="fixed inset-0 z-40 flex justify-end"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/10 backdrop-blur-[1px]" onClick={onClose} />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="archive-drawer-title"
        tabIndex={-1}
        className="relative z-10 w-80 max-w-[calc(100vw-2.5rem)] bg-white dark:bg-zinc-900 border-l border-zinc-100 dark:border-zinc-800 flex flex-col h-full shadow-xl outline-none"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <h2 id="archive-drawer-title" className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Archive</h2>
          <button onClick={onClose} aria-label="Close archive" className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition p-1 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800">
            <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 pb-8 sm:pb-4 space-y-2">
          {loading && (
            <div className="flex justify-center py-8">
              <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {!loading && todos.length === 0 && (
            <p className="text-xs text-zinc-400 dark:text-zinc-500 text-center py-8">Archive is empty</p>
          )}
          {todos.map(todo => {
            const list = getList(todo.list_id);
            const palette = LIST_PALETTE[list?.color] ?? LIST_PALETTE.slate;
            const listName = list?.name ?? '';
            return (
              <div key={todo.id} className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-lg p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full uppercase tracking-wide ${palette.badge}`}>
                        {listName}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300 line-through truncate">{todo.title}</p>
                    {todo.description && (
                      <RichText text={todo.description} className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5 line-clamp-2 block" />
                    )}
                  </div>
                </div>
                <div className="flex gap-2 mt-2.5">
                  <button
                    onClick={() => handleRestore(todo.id)}
                    aria-label={`Restore ${todo.title}`}
                    className="flex-1 text-xs font-medium text-indigo-600 bg-indigo-50 dark:bg-indigo-950 hover:bg-indigo-100 dark:hover:bg-indigo-900 py-2 sm:py-1.5 rounded-md transition"
                  >
                    Restore
                  </button>
                  <button
                    onClick={() => handleDelete(todo.id)}
                    aria-label={`Delete ${todo.title} permanently`}
                    className="flex-1 text-xs font-medium text-red-500 bg-red-50 dark:bg-red-950 hover:bg-red-100 dark:hover:bg-red-900 py-2 sm:py-1.5 rounded-md transition"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
