import { useEffect, useMemo, useRef, useState } from 'react';
import useIsMobile from '../hooks/useIsMobile';
import { DragDropContext } from '@hello-pangea/dnd';
import { useTodos } from '../hooks/useTodos';
import { useDayNotes } from '../hooks/useDayNotes';
import { useShakeUndo } from '../hooks/useShakeUndo';
import { useWhatsNew } from '../hooks/useWhatsNew';
import { useLists } from '../context/ListsContext';
import Navbar from '../components/layout/Navbar';
import TodoList from '../components/todos/TodoList';
import TodoForm from '../components/todos/TodoForm';
import ArchiveDrawer from '../components/todos/ArchiveDrawer';
import WeeklyPlanner from '../components/planner/WeeklyPlanner';
import WhatsNewModal from '../components/layout/WhatsNewModal';
import Tooltip from '../components/ui/Tooltip';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SIDEBAR_MIN_PX = 200;
const SIDEBAR_MAX_PX = 520;

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

function sortSidebar(items) {
  const unassigned = items
    .filter(t => !t.day_assigned)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const assigned = items
    .filter(t => t.day_assigned)
    .sort((a, b) => a.day_assigned.localeCompare(b.day_assigned));
  return [...unassigned, ...assigned];
}

export default function PlannerPage() {
  const { todos, loading, fetchTodos, createTodo, updateTodo, deleteTodo, assignDay, reorderDay, canUndo, undo } = useTodos();
  const { notes, setNote } = useDayNotes();
  const { lists } = useLists();
  const whatsNew = useWhatsNew();
  const [activeTodo, setActiveTodo] = useState(null);
  const [formState, setFormState] = useState(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(288);
  const [isResizing, setIsResizing] = useState(false);
  const isMobile = useIsMobile();
  const sidebarScrollRef = useRef(null);
  const todosRef = useRef(todos);
  useEffect(() => { todosRef.current = todos; }, [todos]);
  const scrollTimerRef = useRef(null);
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
    if (!isResizing) return;
    let rafId = null;
    function onMouseMove(e) {
      const x = e.clientX;
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const delta = x - resizeStartRef.current.x;
        setSidebarWidth(Math.max(SIDEBAR_MIN_PX, Math.min(SIDEBAR_MAX_PX, resizeStartRef.current.width + delta)));
      });
    }
    function onMouseUp() {
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    document.addEventListener('mousemove', onMouseMove, { passive: true });
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [isResizing]);

  async function handleCreate(data) {
    const todo = await createTodo(data);
    if (todo?.day_assigned) {
      const existing = todosRef.current
        .filter(t => t.day_assigned === todo.day_assigned && t.id !== todo.id)
        .sort((a, b) => (a.planner_order ?? Infinity) - (b.planner_order ?? Infinity));
      await reorderDay([...existing, todo]);
    }
    return todo;
  }

  function startResize(e) {
    e.preventDefault();
    resizeStartRef.current = { x: e.clientX, width: sidebarWidth };
    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  function handleDragStart({ draggableId }) {
    const realId = getRealId(draggableId);
    setActiveTodo(todoIdMap.get(realId) ?? null);
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

    const activeT = todoIdMap.get(realId);

    if (DATE_RE.test(srcId) && srcId === dstId) {
      const dayTodos = todos
        .filter(t => t.day_assigned === srcId)
        .sort((a, b) => (a.planner_order ?? Infinity) - (b.planner_order ?? Infinity));
      reorderDay(localArrayMove(dayTodos, source.index, destination.index));
      return;
    }

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

  const todoIdMap = useMemo(() => new Map(todos.map(t => [t.id, t])), [todos]);

  const plannerTodos = useMemo(() => todos.filter(t => t.day_assigned), [todos]);

  const sidebarByList = useMemo(() => {
    const result = {};
    for (const list of lists) {
      result[list.id] = sortSidebar(todos.filter(t => t.list_id === list.id));
    }
    return result;
  }, [todos, lists]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-white">
      <Navbar onArchiveToggle={() => setArchiveOpen(v => !v)} archiveOpen={archiveOpen} fetchTodos={fetchTodos} onOpenWhatsNew={whatsNew.openManually} />

      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
        <DragDropContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>

          {/* Weekly planner */}
          <main className="h-1/2 md:h-auto md:flex-1 flex-shrink-0 overflow-hidden order-1 md:order-2">
            <WeeklyPlanner
              todos={plannerTodos}
              isDragging={!!activeTodo}
              notes={notes}
              onNoteChange={setNote}
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
                {lists.map(list => (
                  <TodoList
                    key={list.id}
                    list={list}
                    todos={sidebarByList[list.id] ?? []}
                    loading={loading}
                    onAdd={() => setFormState({ mode: 'create', defaults: { list_id: list.id } })}
                    onEdit={todo => setFormState({ mode: 'edit', todo })}
                    onComplete={todo => updateTodo(todo.id, { completed: 1, archived: 1 })}
                    onDelete={id => deleteTodo(id)}
                  />
                ))}
              </div>
            </aside>

            {/* Resize handle — desktop only */}
            {!isMobile && !sidebarCollapsed && (
              <div
                onMouseDown={startResize}
                className="absolute top-0 bottom-0 right-0 translate-x-1/2 w-8 cursor-col-resize group/resize flex items-stretch z-10"
              >
                <div className="w-px bg-transparent group-hover/resize:bg-indigo-500 mx-auto transition-colors duration-150" />
                <Tooltip text="Collapse sidebar">
                  <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={() => setSidebarCollapsed(true)}
                    className="opacity-0 group-hover/resize:opacity-100 transition-opacity absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-5 h-12 bg-white border border-zinc-200 rounded-full shadow-md flex items-center justify-center text-zinc-400 hover:text-indigo-500 hover:border-indigo-200 cursor-pointer"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                </Tooltip>
              </div>
            )}

            {/* Expand toggle — desktop only, shown when collapsed */}
            {!isMobile && sidebarCollapsed && (
              <Tooltip text="Expand sidebar">
                <button
                  onClick={() => setSidebarCollapsed(false)}
                  className="absolute top-1/2 -translate-y-1/2 left-full w-5 h-10 bg-white border border-zinc-200 rounded-r-lg shadow-sm flex items-center justify-center text-zinc-400 hover:text-indigo-500 hover:border-indigo-200 transition-colors z-10"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </Tooltip>
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
          onCreate={handleCreate}
          onUpdate={(id, data) => updateTodo(id, data)}
          onComplete={todo => updateTodo(todo.id, { completed: 1, archived: 1 })}
          onDelete={deleteTodo}
        />
      )}

      {archiveOpen && (
        <ArchiveDrawer
          onClose={() => setArchiveOpen(false)}
          onRestore={(id) => updateTodo(id, { archived: 0, completed: 0 }).then(fetchTodos)}
          onDelete={deleteTodo}
        />
      )}

      {whatsNew.open && <WhatsNewModal entries={whatsNew.entries} onClose={whatsNew.close} />}
    </div>
  );
}
