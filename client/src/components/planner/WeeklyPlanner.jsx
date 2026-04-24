import { useRef, useState, useMemo, useEffect } from 'react';
import DayColumn from './DayColumn';

function getWeekDates(offset = 0) {
  const today = new Date();
  const day = today.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMonday + offset * 7);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  });
}

const WEEK_LABEL = { '-1': 'Last Week', '0': 'This Week', '1': 'Next Week' };

export default function WeeklyPlanner({ todos, onUnassign, onComplete, onEdit }) {
  const [weekOffset, setWeekOffset] = useState(0);

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);

  const LIST_ORDER = { university: 0, private: 1, future: 2 };

  const todosByDate = useMemo(() => {
    const result = {};
    for (const date of weekDates) {
      result[date] = todos
        .filter(t => t.day_assigned === date)
        .sort((a, b) => (LIST_ORDER[a.list_type] ?? 3) - (LIST_ORDER[b.list_type] ?? 3));
    }
    return result;
  }, [todos, weekDates]);

  const scrollRef = useRef(null);

  useEffect(() => {
    if (weekOffset !== 0 || !scrollRef.current) return;
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const todayStr = `${y}-${m}-${d}`;
    const idx = weekDates.indexOf(todayStr);
    if (idx < 0) return;
    requestAnimationFrame(() => {
      const col = scrollRef.current?.firstChild?.children[idx];
      if (!col) return;
      const containerRect = scrollRef.current.getBoundingClientRect();
      const colRect = col.getBoundingClientRect();
      scrollRef.current.scrollLeft += colRect.left - containerRect.left;
    });
  }, [weekOffset, weekDates]);

  return (
    <div className="h-full flex flex-col p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
          {WEEK_LABEL[String(weekOffset)]}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekOffset(v => Math.max(-1, v - 1))}
            disabled={weekOffset === -1}
            className="text-xs font-semibold px-3 py-1 rounded-full bg-indigo-500/30 text-indigo-600 hover:bg-indigo-500/50 disabled:opacity-25 disabled:cursor-not-allowed transition-all"
          >
            <span className="md:hidden">← Prev</span>
            <span className="hidden md:inline">← Previous Week</span>
          </button>
          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="text-xs font-medium px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-500 hover:bg-zinc-200 transition-all"
            >
              Current
            </button>
          )}
          <button
            onClick={() => setWeekOffset(v => Math.min(1, v + 1))}
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
        className="flex-1 min-h-0 overflow-x-auto overflow-y-auto [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: 'none' }}
      >
        <div className="flex gap-3 min-h-full">
          {weekDates.map(date => (
            <DayColumn
              key={date}
              date={date}
              todos={todosByDate[date]}
              onUnassign={onUnassign}
              onComplete={onComplete}
              onEdit={onEdit}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
