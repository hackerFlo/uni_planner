import { useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, DragOverlay, MouseSensor, TouchSensor, KeyboardSensor, useSensor, useSensors, pointerWithin, closestCenter } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { useTodos } from '../hooks/useTodos';
import Navbar from '../components/layout/Navbar';
import TodoList from '../components/todos/TodoList';
import TodoForm from '../components/todos/TodoForm';
import ArchiveDrawer from '../components/todos/ArchiveDrawer';
import WeeklyPlanner from '../components/planner/WeeklyPlanner';
import { _pendingAnimIds } from '../components/planner/AssignedCard';

const LIST_BADGE = {
  university: 'bg-indigo-50 text-indigo-500',
  private: 'bg-emerald-50 text-emerald-600',
  future: 'bg-amber-50 text-amber-600',
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function DragCard({ todo, rotation = 0 }) {
  return (
    <div
      style={{
        transform: `rotate(${rotation}deg) scale(1.03)`,
        transition: 'transform 180ms cubic-bezier(0.34, 1.4, 0.64, 1)',
        transformOrigin: 'top center',
        willChange: 'transform',
      }}
      className="bg-white border border-zinc-200 rounded-lg p-2.5 shadow-2xl cursor-grabbing w-44"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <div className="flex-shrink-0 w-3.5 h-3.5 rounded border border-zinc-300" />
        <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full uppercase tracking-wide ${LIST_BADGE[todo.list_type]}`}>
          {todo.list_type}
        </span>
      </div>
      <p className="text-xs font-medium text-zinc-800 leading-snug">{todo.title}</p>
      {todo.description && (
        <p className="text-[11px] text-zinc-400 mt-0.5 line-clamp-2">{todo.description}</p>
      )}
    </div>
  );
}

export default function PlannerPage() {
  const { todos, loading, fetchTodos, createTodo, updateTodo, deleteTodo, assignDay, reorderDay } = useTodos();
  const [activeTodo, setActiveTodo] = useState(null);
  const [dragOverInfo, setDragOverInfo] = useState(null);
  const [dragRotation, setDragRotation] = useState(0);
  const [formState, setFormState] = useState(null); // null | { mode: 'create'|'edit', todo?, defaults? }
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(288);
  const [isResizing, setIsResizing] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const resizingRef = useRef(false);
  const resizeStartRef = useRef({ x: 0, width: 0 });
  const lastPointerX = useRef(null);
  const dragCommitRef = useRef({ prevDate: null, time: 0 });

  useEffect(() => { fetchTodos(); }, [fetchTodos]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (!activeTodo) {
      setDragRotation(0);
      lastPointerX.current = null;
      return;
    }
    function onPointerMove(e) {
      const clientX = e.clientX ?? e.touches?.[0]?.clientX;
      if (clientX == null) return;
      if (lastPointerX.current !== null) {
        const dx = clientX - lastPointerX.current;
        setDragRotation(Math.max(-8, Math.min(8, dx * 1.05)));
      }
      lastPointerX.current = clientX;
    }
    document.addEventListener('pointermove', onPointerMove);
    return () => document.removeEventListener('pointermove', onPointerMove);
  }, [activeTodo]);

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

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor)
  );

  function getRealId(id) {
    if (typeof id === 'string' && id.startsWith('sidebar-')) {
      return Number(id.slice('sidebar-'.length));
    }
    return id;
  }

  function collisionDetection(args) {
    const within = pointerWithin(args);
    if (within.length === 0) return closestCenter(args);

    // When the ghost card inserts at position 0, it shifts card 0 down a few px so the
    // pointer briefly exits its rect. pointerWithin then returns only the column, which
    // makes SortableContext reset — card 0 snaps back up, pointer re-enters, loop starts.
    // Fix: resolve card position with closestCenter (distance-based, not rect-based), but
    // only among cards in the currently hovered column so empty columns don't pull in
    // cards from adjacent columns.
    const columnHit = within.find(c => typeof c.id === 'string' && DATE_RE.test(c.id));
    if (columnHit) {
      const colCardIds = new Set(
        todos.filter(t => t.day_assigned === columnHit.id).map(t => t.id)
      );
      if (colCardIds.size > 0) {
        const closest = closestCenter({
          ...args,
          droppableContainers: args.droppableContainers.filter(c => colCardIds.has(c.id)),
        });
        if (closest.length > 0) return closest;
      }
      return [columnHit];
    }

    const cardHit = within.find(c => typeof c.id === 'number');
    return cardHit ? [cardHit] : within;
  }

  function handleDragOver({ active, over }) {
    if (!activeTodo) { setDragOverInfo(null); return; }
    if (!over) return; // Don't clear on transient null — prevents layout-shift feedback loop
    const realActiveId = getRealId(active.id);
    const overId = over.id;
    if (overId === realActiveId) return; // pointer over the ghost itself — preserve state
    const activeT = todos.find(t => t.id === realActiveId);

    let targetDate = null;
    let targetOverId = null;

    if (DATE_RE.test(overId)) {
      if (overId !== activeT?.day_assigned) { targetDate = overId; }
    } else if (typeof overId === 'number') {
      const overT = todos.find(t => t.id === overId);
      if (overT?.day_assigned && overT.day_assigned !== activeT?.day_assigned) {
        targetDate = overT.day_assigned;
        targetOverId = overId;
      }
    }

    if (!targetDate) {
      // Only clear the ghost when pointer is explicitly on a column (date string).
      // A card-number result from the source column can be a closestCenter artifact
      // when pointerWithin briefly returns nothing — don't let that erase the ghost.
      if (DATE_RE.test(overId)) setDragOverInfo(null);
      return;
    }

    setDragOverInfo(prev => {
      if (prev?.date === targetDate) {
        if (prev?.overId === targetOverId) return prev;
        // Never allow the insertion slot to reset to null (ghost-at-end) once we
        // are already inside this column — the ghost animation shifts card B downward,
        // which briefly makes the pointer land in empty space and causes pointerWithin
        // to return only the column (targetOverId = null). Freezing prevents the snap-back.
        if (targetOverId === null) return prev;
        return { date: targetDate, overId: targetOverId };
      }

      // Switching column: if this is the column we just left within 150ms it's a
      // layout-shift bounce between adjacent columns — ignore it.
      const { prevDate, time } = dragCommitRef.current;
      if (prevDate === targetDate && Date.now() - time < 150) return prev;

      dragCommitRef.current = { prevDate: prev?.date ?? null, time: Date.now() };
      return { date: targetDate, overId: targetOverId };
    });
  }

  function handleDragStart({ active }) {
    const realId = getRealId(active.id);
    setActiveTodo(todos.find(t => t.id === realId) ?? null);
    dragCommitRef.current = { prevDate: null, time: 0 };
  }

  function handleDragEnd({ active, over }) {
    setActiveTodo(null);
    setDragOverInfo(null);
    if (!over) return;
    const realId = getRealId(active.id);
    const overId = over.id;
    if (realId === overId) return;

    // Dropped on a day column (empty area)
    if (DATE_RE.test(overId)) {
      const activeT = todos.find(t => t.id === realId);
      if (!activeT?.day_assigned) _pendingAnimIds.add(realId);
      assignDay(realId, overId);
      return;
    }

    // Dropped on another card
    const activeT = todos.find(t => t.id === realId);
    const overT = todos.find(t => t.id === overId);
    if (!overT) return;

    if (activeT?.day_assigned && activeT.day_assigned === overT.day_assigned) {
      // Same day → reorder within the column
      const dayTodos = todos
        .filter(t => t.day_assigned === activeT.day_assigned)
        .sort((a, b) => (a.planner_order ?? Infinity) - (b.planner_order ?? Infinity));
      const oldIdx = dayTodos.findIndex(t => t.id === realId);
      const newIdx = dayTodos.findIndex(t => t.id === overId);
      reorderDay(arrayMove(dayTodos, oldIdx, newIdx));
    } else if (overT.day_assigned) {
      // From sidebar or different day → assign AND insert at the target card's position
      if (!activeT?.day_assigned) _pendingAnimIds.add(realId);
      const dayTodos = todos
        .filter(t => t.day_assigned === overT.day_assigned)
        .sort((a, b) => (a.planner_order ?? Infinity) - (b.planner_order ?? Infinity));
      const insertIdx = dayTodos.findIndex(t => t.id === overId);
      const newOrder = [
        ...dayTodos.slice(0, insertIdx),
        activeT,
        ...dayTodos.slice(insertIdx),
      ];
      assignDay(realId, overT.day_assigned).then(() => reorderDay(newOrder));
    }
  }

  const plannerTodos = useMemo(() => todos.filter(t => t.day_assigned), [todos]);
  const sidebarByType = useMemo(() => ({
    university: todos.filter(t => t.list_type === 'university'),
    private: todos.filter(t => t.list_type === 'private'),
    future: todos.filter(t => t.list_type === 'future'),
  }), [todos]);

  const displayPlannerTodos = useMemo(() => {
    if (!activeTodo || !dragOverInfo) return plannerTodos;
    const { date, overId: overCardId } = dragOverInfo;
    const activeId = activeTodo.id;
    const withoutActive = plannerTodos.filter(t => t.id !== activeId);
    const targetItems = withoutActive
      .filter(t => t.day_assigned === date)
      .sort((a, b) => (a.planner_order ?? Infinity) - (b.planner_order ?? Infinity));
    const ghost = { ...activeTodo, day_assigned: date, _isGhost: true };
    if (overCardId == null) {
      targetItems.push(ghost);
    } else {
      const idx = targetItems.findIndex(t => t.id === overCardId);
      targetItems.splice(idx >= 0 ? idx : targetItems.length, 0, ghost);
    }
    const reordered = targetItems.map((t, i) => ({ ...t, planner_order: i }));
    return [...withoutActive.filter(t => t.day_assigned !== date), ...reordered];
  }, [activeTodo, dragOverInfo, plannerTodos]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-white">
      <Navbar onArchiveToggle={() => setArchiveOpen(v => !v)} archiveOpen={archiveOpen} />

      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
        <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>

          {/* Weekly planner — top half on mobile, right panel on desktop */}
          <main className="h-1/2 md:h-auto md:flex-1 flex-shrink-0 overflow-hidden order-1 md:order-2">
            <WeeklyPlanner
              todos={displayPlannerTodos}
              onUnassign={id => assignDay(id, null)}
              onComplete={todo => updateTodo(todo.id, { completed: 1, archived: 1 })}
              onEdit={todo => setFormState({ mode: 'edit', todo })}
              onReorder={reorderDay}
            />
          </main>

          {/* Sidebar wrapper — bottom half on mobile, left panel on desktop */}
          <div
            className="relative h-1/2 md:h-auto flex-shrink-0 md:flex-none bg-zinc-50 order-2 md:order-1 border-t border-zinc-200 md:border-t-0"
            style={isMobile ? undefined : (sidebarCollapsed ? { width: 0 } : { width: `${sidebarWidth}px` })}
          >
            <aside
              style={isMobile ? undefined : (sidebarCollapsed ? { width: 0 } : { width: `${sidebarWidth}px` })}
              className={`bg-zinc-50 flex flex-col h-full overflow-hidden ${isMobile || isResizing ? '' : 'transition-[width] duration-200'}`}
            >
              <div
                className="p-5 flex-1 space-y-6 overflow-y-auto"
                style={isMobile ? undefined : { width: `${sidebarWidth}px` }}
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

          <DragOverlay dropAnimation={null}>
            {activeTodo ? <DragCard todo={activeTodo} rotation={dragRotation} /> : null}
          </DragOverlay>

        </DndContext>
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
