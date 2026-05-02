import { useEffect, useMemo, useRef, useState } from 'react';
import { DragDropContext } from '@hello-pangea/dnd';
import { useTodos } from '../hooks/useTodos';
import { useShakeUndo } from '../hooks/useShakeUndo';
import Navbar from '../components/layout/Navbar';
import TodoList from '../components/todos/TodoList';
import TodoForm from '../components/todos/TodoForm';
import ArchiveDrawer from '../components/todos/ArchiveDrawer';
import WeeklyPlanner from '../components/planner/WeeklyPlanner';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function localArrayMove(arr, from, to) {
  const result = [...arr];
  const [removed] = result.splice(from, 1);
  result.splice(to, 0, removed);
  return result;
}

function getRealId(draggableId) {
  if (typeof draggableId === 'string' && draggableId.startsWith('sidebar-')) {
    return Number(draggableId.slice('sidebar-'.length));
  }
  return Number(draggableId);
}

export default function PlannerPage() {
  const { todos, loading, fetchTodos, createTodo, updateTodo, deleteTodo, assignDay, reorderDay, canUndo, undo } = useTodos();
  const [activeTodo, setActiveTodo] = useState(null);
  const [formState, setFormState] = useState(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(288);
  const [isResizing, setIsResizing] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const sidebarScrollRef = useRef(null);
  const scrollTimerRef = useRef(null);
  const resizingRef = useRef(false);
  const resizeStartRef = useRef({ x: 0, width: 0 });

  useShakeUndo(canUndo, undo);

  useEffect(() => { fetchTodos(); }, [fetchTodos]);

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
        if (canUndo) {
          e.preventDefault();
          undo();
        }
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [canUndo, undo]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    function onMouseMove(e) {
      if (!resizingRef.current) return;
      const delta = e.clientX - resizeStartRef.current.x;
      setSidebarWidth(Math.max(200, Math.min(520, resizeStartRef.current.width + delta)));
    }
    function onMouseUp() {
      if (resizingRef.current) {
        resizingRef.current = false;
        setIsResizing(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  function startResize(e) {
    e.preventDefault();
    resizingRef.current = true;
    resizeStartRef.current = { x: e.clientX, width: sidebarWidth };
    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  function handleDragStart({ draggableId }) {
    const realId = getRealId(draggableId);
    setActiveTodo(todos.find(t => t.id === realId) ?? null);
  }

  function handleDragEnd({ source, destination, draggableId }) {
    setActiveTodo(null);
    if (!destination) return;

    const realId = getRealId(draggableId);
    const srcId = source.droppableId;
    const dstId = destination.droppableId;

    if (srcId === dstId && source.index === destination.index) return;

    const isDstColumn = DATE_RE.test(dstId);
    if (!isDstColumn) return;

    const activeT = todos.find(t => t.id === realId);

    if (DATE_RE.test(srcId) && srcId === dstId) {
      // Same-column reorder
      const dayTodos = todos
        .filter(t => t.day_assigned === srcId)
        .sort((a, b) => (a.planner_order ?? Infinity) - (b.planner_order ?? Infinity));
      reorderDay(localArrayMove(dayTodos, source.index, destination.index));
      return;
    }

    // Cross-column (from another column or sidebar)
    const dstTodos = todos
      .filter(t => t.day_assigned === dstId && t.id !== realId)
      .sort((a, b) => (a.planner_order ?? Infinity) - (b.planner_order ?? Infinity));
    const newOrder = [
      ...dstTodos.slice(0, destination.index),
      activeT,
      ...dstTodos.slice(destination.index),
    ];
    assignDay(realId, dstId).then(() => reorderDay(newOrder));
  }

  const plannerTodos = useMemo(() => todos.filter(t => t.day_assigned), [todos]);

  const sidebarByType = useMemo(() => {
    function sortSidebar(items) {
      const unassigned = items
        .filter(t => !t.day_assigned)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      const assigned = items
        .filter(t => t.day_assigned)
        .sort((a, b) => a.day_assigned.localeCompare(b.day_assigned));
      return [...unassigned, ...assigned];
    }
    return {
      university: sortSidebar(todos.filter(t => t.list_type === 'university')),
      private:    sortSidebar(todos.filter(t => t.list_type === 'private')),
      future:     sortSidebar(todos.filter(t => t.list_type === 'future')),
    };
  }, [todos]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-white">
      <Navbar onArchiveToggle={() => setArchiveOpen(v => !v)} archiveOpen={archiveOpen} onUndo={undo} canUndo={canUndo} fetchTodos={fetchTodos} />

      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
        <DragDropContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>

          {/* Weekly planner */}
          <main className="h-1/2 md:h-auto md:flex-1 flex-shrink-0 overflow-hidden order-1 md:order-2">
            <WeeklyPlanner
              todos={plannerTodos}
              isDragging={!!activeTodo}
              onUnassign={id => assignDay(id, null)}
              onComplete={todo => updateTodo(todo.id, { completed: 1, archived: 1 })}
              onEdit={todo => setFormState({ mode: 'edit', todo })}
              onDelete={deleteTodo}
              onReorder={reorderDay}
              onAdd={date => setFormState({ mode: 'create', defaults: { day_assigned: date } })}
            />
          </main>

          {/* Sidebar */}
          <div
            className="relative h-1/2 md:h-auto flex-shrink-0 md:flex-none bg-zinc-50 order-2 md:order-1 border-t border-zinc-200 md:border-t-0"
            style={isMobile ? undefined : (sidebarCollapsed ? { width: 0 } : { width: `${sidebarWidth}px` })}
          >
            <aside
              style={isMobile ? undefined : (sidebarCollapsed ? { width: 0 } : { width: `${sidebarWidth}px` })}
              className={`bg-zinc-50 flex flex-col h-full overflow-hidden ${isMobile || isResizing ? '' : 'transition-[width] duration-200'}`}
            >
              <div
                ref={sidebarScrollRef}
                className="p-5 flex-1 space-y-6 overflow-y-auto autohide-scroll"
                style={isMobile ? undefined : { width: `${sidebarWidth}px` }}
                onScroll={() => {
                  const el = sidebarScrollRef.current;
                  if (!el) return;
                  el.classList.add('is-scrolling');
                  clearTimeout(scrollTimerRef.current);
                  scrollTimerRef.current = setTimeout(() => el.classList.remove('is-scrolling'), 800);
                }}
              >
                <TodoList
                  type="university"
                  todos={sidebarByType.university}
                  loading={loading}
                  onAdd={() => setFormState({ mode: 'create', defaults: { list_type: 'university' } })}
                  onEdit={todo => setFormState({ mode: 'edit', todo })}
                  onComplete={todo => updateTodo(todo.id, { completed: 1, archived: 1 })}
                  onDelete={id => deleteTodo(id)}
                />
                <TodoList
                  type="private"
                  todos={sidebarByType.private}
                  loading={loading}
                  onAdd={() => setFormState({ mode: 'create', defaults: { list_type: 'private' } })}
                  onEdit={todo => setFormState({ mode: 'edit', todo })}
                  onComplete={todo => updateTodo(todo.id, { completed: 1, archived: 1 })}
                  onDelete={id => deleteTodo(id)}
                />
                <TodoList
                  type="future"
                  todos={sidebarByType.future}
                  loading={loading}
                  onAdd={() => setFormState({ mode: 'create', defaults: { list_type: 'future' } })}
                  onEdit={todo => setFormState({ mode: 'edit', todo })}
                  onComplete={todo => updateTodo(todo.id, { completed: 1, archived: 1 })}
                  onDelete={id => deleteTodo(id)}
                />
              </div>
            </aside>

            {/* Resize handle — desktop only */}
            {!isMobile && !sidebarCollapsed && (
              <div
                onMouseDown={startResize}
                className="absolute top-0 bottom-0 right-0 translate-x-1/2 w-8 cursor-col-resize group/resize flex items-stretch z-10"
              >
                <div className="w-px bg-transparent group-hover/resize:bg-indigo-500 mx-auto transition-colors duration-150" />
                <button
                  onMouseDown={e => e.stopPropagation()}
                  onClick={() => setSidebarCollapsed(true)}
                  className="opacity-0 group-hover/resize:opacity-100 transition-opacity absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-5 h-12 bg-white border border-zinc-200 rounded-full shadow-md flex items-center justify-center text-zinc-400 hover:text-indigo-500 hover:border-indigo-200 cursor-pointer"
                  title="Collapse sidebar"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              </div>
            )}

            {/* Expand toggle — desktop only, shown when collapsed */}
            {!isMobile && sidebarCollapsed && (
              <button
                onClick={() => setSidebarCollapsed(false)}
                className="absolute top-1/2 -translate-y-1/2 left-full w-5 h-10 bg-white border border-zinc-200 rounded-r-lg shadow-sm flex items-center justify-center text-zinc-400 hover:text-indigo-500 hover:border-indigo-200 transition-colors z-10"
                title="Expand sidebar"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>

        </DragDropContext>
      </div>

      {formState && (
        <TodoForm
          mode={formState.mode}
          todo={formState.todo}
          defaults={formState.defaults}
          onClose={() => setFormState(null)}
          onCreate={createTodo}
          onUpdate={(id, data) => updateTodo(id, data)}
        />
      )}

      {archiveOpen && (
        <ArchiveDrawer
          onClose={() => setArchiveOpen(false)}
          onRestore={(id) => updateTodo(id, { archived: 0, completed: 0 }).then(fetchTodos)}
          onDelete={deleteTodo}
        />
      )}
    </div>
  );
}
