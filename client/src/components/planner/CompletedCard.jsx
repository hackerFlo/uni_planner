import { memo } from 'react';
import LinkText from '../ui/LinkText';
import RichText from '../ui/RichText';
import Tooltip, { recurrenceLabel } from '../ui/Tooltip';
import { useLists } from '../../context/ListsContext';
import { LIST_PALETTE } from '../../constants/listPalette';

function fmtTime(t) { return t ? t.replace(' min', 'm') : t; }

// A finished item, drawn as the same card as a live one so a revealed day column
// reads as one board rather than a card list above a text list. Dimmed with
// `opacity-50 hover:opacity-70` -- the treatment the sidebar already uses for a
// todo that is assigned elsewhere (TodoCard's `isAssigned`), so "greyed out"
// means the same thing everywhere in the app.
//
// Deliberately not a Draggable: completed work is archived, and it sits after
// `provided.placeholder` in the column, so giving it a Draggable index would put
// it in the drop list's index space and corrupt every reorder.
const CompletedCard = memo(function CompletedCard({ todo, onUncomplete }) {
  const { getList } = useLists();
  const list = getList(todo.list_id);
  const palette = LIST_PALETTE[list?.color] ?? LIST_PALETTE.slate;
  const listName = list?.name ?? '';

  return (
    <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-lg p-2.5 shadow-sm opacity-50 hover:opacity-70 transition-opacity select-none min-w-0 w-full">
      <div className="flex items-center gap-2 mb-1.5">
        <Tooltip text="Mark as not done">
          <button
            onClick={() => onUncomplete(todo)}
            aria-pressed="true"
            aria-label={`Mark "${todo.title}" as not done`}
            className="flex-shrink-0 relative w-3.5 h-3.5 rounded border bg-indigo-500 border-indigo-500 transition-all duration-150 flex items-center justify-center hover:scale-110 active:scale-95 md:before:absolute md:before:content-[''] md:before:inset-[-8px]"
          >
            <svg className="w-2 h-2" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={3.5} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </button>
        </Tooltip>
        <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full uppercase tracking-wide ${palette.badge}`}>
          {listName}
        </span>
        {todo.approx_time && (
          <span className="text-[9px] font-medium text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded-full truncate">
            {fmtTime(todo.approx_time)}
          </span>
        )}
        {(todo.recurrence_interval_days != null || todo.recurrence_pattern != null) && (
          <Tooltip text={recurrenceLabel(todo.recurrence_interval_days, todo.recurrence_pattern)}>
            <svg className="flex-shrink-0 w-3 h-3 text-zinc-400 dark:text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
            </svg>
          </Tooltip>
        )}
      </div>

      <LinkText text={todo.title} className="text-xs font-medium text-zinc-500 dark:text-zinc-400 line-through leading-snug break-words min-w-0 w-full block" />
      {todo.description && (
        <RichText text={todo.description} className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 line-clamp-2 block" />
      )}
    </div>
  );
});

export default CompletedCard;
