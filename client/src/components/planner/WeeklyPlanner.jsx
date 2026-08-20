import { useRef, useMemo, useEffect } from 'react';
import DayColumn from './DayColumn';
import { useHolidays } from '../../hooks/useHolidays';
import { useLists } from '../../context/ListsContext';
import { useExams } from '../../context/ExamsContext';
import { toIso } from '../../utils/dates';

const WEEK_LABEL = { '-1': 'Last Week', '0': 'This Week', '1': 'Next Week' };

export default function WeeklyPlanner({ todos, weekOffset, weekDates, onWeekOffsetChange, completedByDate, revealedDays, onToggleCompleted, isDragging, notes, onNoteChange, onUnassign, onComplete, onEdit, onDelete, onReorder, onAdd }) {
  const holidays = useHolidays();
  const { lists } = useLists();
  const { upcomingExams } = useExams();

  const examsByDate = useMemo(() => {
    const m = new Map();
    for (const e of upcomingExams) {
      m.set(e.exam_date, m.has(e.exam_date) ? `${m.get(e.exam_date)}, ${e.title}` : e.title);
    }
    return m;
  }, [upcomingExams]);

  const listOrder = useMemo(() => {
    const order = {};
    lists.forEach((l, idx) => { order[l.id] = idx; });
    return order;
  }, [lists]);

  const todosByDate = useMemo(() => {
    const result = {};
    for (const date of weekDates) {
      result[date] = todos
        .filter(t => t.day_assigned === date)
        .sort((a, b) => {
          const ao = a.planner_order ?? Infinity;
          const bo = b.planner_order ?? Infinity;
          if (ao !== bo) return ao - bo;
          return (listOrder[a.list_id] ?? 999) - (listOrder[b.list_id] ?? 999);
        });
    }
    return result;
  }, [todos, weekDates, listOrder]);

  const scrollRef = useRef(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    requestAnimationFrame(() => {
      const container = scrollRef.current;
      if (!container) return;
      if (weekOffset === 1) {
        container.scrollLeft = 0;
      } else if (weekOffset === -1) {
        container.scrollLeft = container.scrollWidth;
      } else {
        const idx = weekDates.indexOf(toIso(new Date()));
        if (idx < 0) return;
        const col = container.firstChild?.children[idx];
        if (!col) return;
        const containerRect = container.getBoundingClientRect();
        const colRect = col.getBoundingClientRect();
        container.scrollLeft += colRect.left - containerRect.left;
      }
    });
  }, [weekOffset, weekDates]);

  return (
    <div className="h-full flex flex-col p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">
          {WEEK_LABEL[String(weekOffset)]}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onWeekOffsetChange(Math.max(-1, weekOffset - 1))}
            disabled={weekOffset === -1}
            className="text-xs font-semibold px-3 py-1 rounded-full bg-indigo-500/30 text-indigo-600 hover:bg-indigo-500/50 disabled:opacity-25 disabled:cursor-not-allowed transition-all"
          >
            <span className="md:hidden">← Prev</span>
            <span className="hidden md:inline">← Previous Week</span>
          </button>
          {weekOffset !== 0 && (
            <button
              onClick={() => onWeekOffsetChange(0)}
              className="text-xs font-medium px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
            >
              Current
            </button>
          )}
          <button
            onClick={() => onWeekOffsetChange(Math.min(1, weekOffset + 1))}
            disabled={weekOffset === 1}
            className="text-xs font-semibold px-3 py-1 rounded-full bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-25 disabled:cursor-not-allowed transition-all"
          >
            <span className="md:hidden">Next →</span>
            <span className="hidden md:inline">Next Week →</span>
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-x-auto overflow-y-auto [&::-webkit-scrollbar]:hidden snap-x snap-mandatory md:snap-none"
        style={{ scrollbarWidth: 'none' }}
      >
        <div className="flex gap-3 min-h-full">
          {weekDates.map(date => (
            <DayColumn
              key={date}
              date={date}
              todos={todosByDate[date]}
              completedTodos={completedByDate[date] ?? []}
              showCompleted={revealedDays.has(date)}
              onToggleCompleted={onToggleCompleted}
              holiday={holidays.get(date) ?? null}
              exam={examsByDate.get(date) ?? null}
              isDragging={isDragging}
              note={notes?.[date]}
              onNoteChange={onNoteChange}
              onUnassign={onUnassign}
              onComplete={onComplete}
              onEdit={onEdit}
              onDelete={onDelete}
              onReorder={onReorder}
              onAdd={onAdd}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
