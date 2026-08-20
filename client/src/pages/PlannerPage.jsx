import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useIsMobile from '../hooks/useIsMobile';
import { DragDropContext } from '@hello-pangea/dnd';
import { useTodos } from '../hooks/useTodos';
import { useDayNotes } from '../hooks/useDayNotes';
import { useShakeUndo } from '../hooks/useShakeUndo';
import { useWhatsNew } from '../hooks/useWhatsNew';
import { useLists } from '../context/ListsContext';
import { useUndo } from '../context/UndoContext';
import Navbar from '../components/layout/Navbar';
import TodoList from '../components/todos/TodoList';
import TodoForm from '../components/todos/TodoForm';
import ArchiveDrawer from '../components/todos/ArchiveDrawer';
import WeeklyPlanner from '../components/planner/WeeklyPlanner';
import WhatsNewModal from '../components/layout/WhatsNewModal';
import Tooltip from '../components/ui/Tooltip';
import { getWeekDates, parseDateLocal } from '../utils/dates';
import { useToday } from '../context/TimeContext';
import { useCompletedTodos } from '../hooks/useCompletedTodos';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import PullToRefreshIndicator from '../components/PullToRefreshIndicator';
import { buildSidebar } from '../utils/sidebar';
import { planCrossDayDrop, planSameDayReorder } from '../utils/plannerMutations';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SIDEBAR_MIN_PX = 200;
const SIDEBAR_MAX_PX = 520;
// Matches the day column's mobile width (`w-[180px]` in DayColumn; on desktop the
// columns flex to share the row). On mobile the Tasks pane is
// full-width, so a dragged card's centre of gravity can't track the finger — shrink it to
// the column width before @hello-pangea/dnd measures it (see onBeforeCapture below).
const COLUMN_WIDTH_PX = 180;
const REVEALED_DAYS_KEY = 'uniPlanner.revealedDays';

// localStorage can throw (Safari private mode) and can hold anything a previous
// version wrote, so neither read nor write is allowed to take the page down.
function loadRevealedDays() {
  try {
    const raw = JSON.parse(localStorage.getItem(REVEALED_DAYS_KEY) ?? '[]');
    return new Set(Array.isArray(raw) ? raw.filter(d => typeof d === 'string') : []);
  } catch {
    return new Set();
  }
}

function getRealId(draggableId) {
  if (typeof draggableId === 'string' && draggableId.startsWith('sidebar-')) {
    return Number(draggableId.slice('sidebar-'.length));
  }
  return Number(draggableId);
}

export default function PlannerPage() {
  const { todos, loading, initialLoading, fetchTodos, createTodo, updateTodo, deleteTodo, assignDay, reorderDay, moveTodoToDay } = useTodos();
  const { canUndo, undo } = useUndo();
  const { notes, setNote } = useDayNotes();
  const { lists } = useLists();
  const whatsNew = useWhatsNew();
  const todayIso = useToday();
  const [activeTodo, setActiveTodo] = useState(null);
  const [formState, setFormState] = useState(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [revealedDays, setRevealedDays] = useState(loadRevealedDays);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(288);
  const [isResizing, setIsResizing] = useState(false);
  const isMobile = useIsMobile();
  const sidebarScrollRef = useRef(null);
  const shrunkCardRef = useRef(null);
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

  // On mobile only: narrow the dragged sidebar card to the day-column width before dnd
  // captures dimensions, so its centre of gravity tracks the finger and every column (not
  // just the edges) can be dropped on. Restored in handleDragEnd. Desktop is untouched.
  function handleBeforeCapture({ draggableId }) {
    if (!isMobile) return;
    const el = document.querySelector(`[data-rfd-draggable-id="${draggableId}"]`);
    if (!el || !sidebarScrollRef.current?.contains(el)) return;
    el.style.width = `${COLUMN_WIDTH_PX}px`;
    shrunkCardRef.current = el;
  }

  function restoreShrunkCard() {
    if (!shrunkCardRef.current) return;
    shrunkCardRef.current.style.width = '';
    shrunkCardRef.current = null;
  }

  function handleDragEnd({ source, destination, draggableId }) {
    restoreShrunkCard();
    setActiveTodo(null);
    if (!destination) return;

    const realId = getRealId(draggableId);
    const srcId = source.droppableId;
    const dstId = destination.droppableId;

    if (srcId === dstId && source.index === destination.index) return;
    if (!DATE_RE.test(dstId)) return;

    if (DATE_RE.test(srcId) && srcId === dstId) {
      const next = planSameDayReorder(todos, { day: srcId, from: source.index, to: destination.index });
      if (next) reorderDay(next);
      return;
    }

    // One call, not assignDay().then(reorderDay): the two writes have to land in
    // the undo store as a single entry or Ctrl+Z restores the order and leaves
    // the card on the day it was dragged to.
    const next = planCrossDayDrop(todos, { todoId: realId, toDay: dstId, index: destination.index });
    if (next) moveTodoToDay(realId, dstId, next);
  }

  const todoIdMap = useMemo(() => new Map(todos.map(t => [t.id, t])), [todos]);

  const plannerTodos = useMemo(() => todos.filter(t => t.day_assigned), [todos]);

  // Keyed on todayIso as well as the offset: without it a tab left open across
  // midnight keeps rendering the week it was opened in.
  const weekDates = useMemo(
    () => getWeekDates(weekOffset, parseDateLocal(todayIso)),
    [weekOffset, todayIso]
  );

  const sidebarByList = useMemo(() => {
    const result = {};
    for (const list of lists) {
      result[list.id] = buildSidebar(todos.filter(t => t.list_id === list.id));
    }
    return result;
    // Not keyed on weekDates any more: the sidebar shows every assignment
    // regardless of which week is on screen, so paging the planner no longer
    // changes what belongs here.
  }, [todos, lists]);

  const { byDate: completedByDate, refresh: refreshCompleted } =
    useCompletedTodos(weekDates, revealedDays.size > 0);

  function toggleCompleted(date) {
    setRevealedDays(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date); else next.add(date);
      try {
        localStorage.setItem(REVEALED_DAYS_KEY, JSON.stringify([...next]));
      } catch {
        // A full or disabled store costs the preference, never the toggle.
      }
      return next;
    });
  }

  // Completing an item moves it out of the live board and into the completed
  // list, so both have to be refreshed for the card to reappear below the fold.
  function completeTodo(todo) {
    return updateTodo(todo.id, { completed: 1, archived: 1 }).then(refreshCompleted);
  }

  // An installed PWA has no browser pull-to-refresh; this restores it and pulls
  // every surface at once, so the gesture means "bring the board up to date".
  const pullRefresh = useCallback(
    () => Promise.all([fetchTodos(), refreshCompleted()]),
    [fetchTodos, refreshCompleted]
  );
  const { distance: pullDistancePx, refreshing: pullRefreshing } = usePullToRefresh(pullRefresh);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-white dark:bg-zinc-900">
      <PullToRefreshIndicator distance={pullDistancePx} refreshing={pullRefreshing} />
      <Navbar onArchiveToggle={() => setArchiveOpen(v => !v)} archiveOpen={archiveOpen} fetchTodos={fetchTodos} onOpenWhatsNew={whatsNew.openManually} />

      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
        <DragDropContext onBeforeCapture={handleBeforeCapture} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>

          {/* Weekly planner */}
          <main className="h-1/2 md:h-auto md:flex-1 flex-shrink-0 overflow-hidden order-1 md:order-2">
            <WeeklyPlanner
              todos={plannerTodos}
              loading={initialLoading}
              weekOffset={weekOffset}
              weekDates={weekDates}
              onWeekOffsetChange={setWeekOffset}
              completedByDate={completedByDate}
              revealedDays={revealedDays}
              onToggleCompleted={toggleCompleted}
              isDragging={!!activeTodo}
              notes={notes}
              onNoteChange={setNote}
              onUnassign={id => assignDay(id, null)}
              onComplete={completeTodo}
              onEdit={todo => setFormState({ mode: 'edit', todo })}
              onDelete={deleteTodo}
              onAdd={date => setFormState({ mode: 'create', defaults: { day_assigned: date } })}
            />
          </main>

          {/* Sidebar */}
          <div
            className="relative h-1/2 md:h-auto flex-shrink-0 md:flex-none bg-zinc-50 dark:bg-zinc-900 order-2 md:order-1 border-t border-zinc-200 dark:border-zinc-800 md:border-t-0"
            style={isMobile ? undefined : (sidebarCollapsed ? { width: 0 } : { width: `${sidebarWidth}px` })}
          >
            <aside
              style={isMobile ? undefined : (sidebarCollapsed ? { width: 0 } : { width: `${sidebarWidth}px` })}
              className={`bg-zinc-50 dark:bg-zinc-900 flex flex-col h-full overflow-hidden ${isMobile || isResizing ? '' : 'transition-[width] duration-200'}`}
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
                    onComplete={completeTodo}
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
                    aria-label="Collapse the tasks sidebar"
                    className="opacity-0 group-hover/resize:opacity-100 transition-opacity absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-5 h-12 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-full shadow-md flex items-center justify-center text-zinc-400 dark:text-zinc-500 hover:text-indigo-500 hover:border-indigo-200 cursor-pointer"
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
                  aria-label="Expand the tasks sidebar"
                  className="absolute top-1/2 -translate-y-1/2 left-full w-5 h-10 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-r-lg shadow-sm flex items-center justify-center text-zinc-400 dark:text-zinc-500 hover:text-indigo-500 hover:border-indigo-200 transition-colors z-10"
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
          onComplete={completeTodo}
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
