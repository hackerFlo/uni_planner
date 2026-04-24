import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import AssignedCard from './AssignedCard';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseDateLocal(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export default function DayColumn({ date, todos, holiday, onUnassign, onComplete, onEdit, onReorder }) {
  const { setNodeRef, isOver } = useDroppable({ id: date });

  const dateObj = parseDateLocal(date);
  const todayObj = new Date();
  todayObj.setHours(0, 0, 0, 0);
  const isToday = dateObj.getTime() === todayObj.getTime();

  const dayLabel = DAY_SHORT[dateObj.getDay()];
  const dayNum = dateObj.getDate();
  const month = dateObj.toLocaleDateString('en-GB', { month: 'short' });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col min-w-[180px] flex-shrink-0 rounded-xl border transition-all snap-start md:snap-align-none ${
        isToday
          ? 'border-indigo-200 bg-indigo-50/40'
          : holiday
          ? 'border-emerald-200 bg-emerald-50/40'
          : 'border-zinc-100 bg-white'
      } ${isOver ? 'ring-2 ring-inset ring-indigo-400' : ''}`}
    >
      <div className={`px-3 py-3 border-b ${isToday ? 'border-indigo-100' : holiday ? 'border-emerald-100' : 'border-zinc-100'}`}>
        <div className="flex items-baseline gap-1.5">
          <span className={`text-xs font-semibold uppercase tracking-widest ${isToday ? 'text-indigo-500' : holiday ? 'text-emerald-600' : 'text-zinc-400'}`}>
            {dayLabel}
          </span>
          {holiday && (
            <>
              <span className={`text-xs ${isToday ? 'text-indigo-300' : 'text-emerald-300'}`}>·</span>
              <span className="text-xs font-medium text-emerald-600 truncate" title={holiday}>{holiday}</span>
            </>
          )}
          {isToday && (
            <span className="text-[9px] font-medium bg-indigo-500 text-white px-1 py-0.5 rounded-full uppercase tracking-wide">
              Today
            </span>
          )}
        </div>
        <p className={`text-lg font-light mt-0.5 ${isToday ? 'text-indigo-700' : holiday ? 'text-emerald-700' : 'text-zinc-700'}`}>
          {dayNum} <span className="text-sm text-zinc-400">{month}</span>
        </p>
      </div>

      <div
        className={`flex-1 p-2.5 min-h-[120px] transition-colors rounded-b-xl ${
          isOver ? 'bg-indigo-50/60' : holiday ? 'bg-emerald-50/20' : ''
        }`}
      >
        <div className="space-y-2">
          {todos.length === 0 && !isOver && (
            <p className="text-[11px] text-zinc-300 text-center py-4">Drop here</p>
          )}
          <SortableContext items={todos.map(t => t.id)} strategy={verticalListSortingStrategy}>
            {todos.map(todo => (
              <AssignedCard
                key={todo.id}
                todo={todo}
                onUnassign={onUnassign}
                onComplete={onComplete}
                onEdit={onEdit}
              />
            ))}
          </SortableContext>
        </div>
      </div>
    </div>
  );
}
