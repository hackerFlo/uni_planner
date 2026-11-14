import { memo } from 'react';
import { Droppable } from '@hello-pangea/dnd';
import TodoCard from './TodoCard';
import Tooltip from '../ui/Tooltip';
import { SkeletonRow } from '../ui/Skeleton';
import { LIST_PALETTE } from '../../constants/listPalette';
import { sidebarDraggableId } from '../../utils/sidebar';
import { withCopyGhost } from '../../utils/copyDrag';
import { useFirstLoadFade } from '../../hooks/useFirstLoadFade';
import { useFreshIds } from '../../hooks/useFreshIds';

function TodoList({ list, todos, loading, onAdd, onEdit, onComplete, onDelete, onUnassign, onDismissAgentActivity, copyGhostId = null }) {
  const palette = LIST_PALETTE[list.color] ?? LIST_PALETTE.slate;
  const showSkeleton = loading && todos.length === 0;
  const { fadeClass, onFadeEnd } = useFirstLoadFade(showSkeleton);
  const freshIds = useFreshIds(todos, !loading);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${palette.dot}`} />
          <h2 className={`text-xs font-semibold uppercase tracking-widest ${palette.accent}`}>
            {list.name}
          </h2>
        </div>
        <Tooltip text="Add item">
          <button
            onClick={onAdd}
            aria-label={`Add item to ${list.name}`}
            className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 transition p-0.5 rounded"
          >
            <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </Tooltip>
      </div>

      {/* Sidebar lists are sources only: the page ignores any drop that is not
          on a day, and the order is fixed by creation date. An enabled list let
          a card glide into a slot it was then snapped out of (hundreds of pixels
          back home for a drop in the same list); a disabled one returns it
          home in a single glide. */}
      <Droppable droppableId={`${list.id}-list`} isDropDisabled>
        {(provided) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`min-h-[60px] rounded-lg${fadeClass}`}
            onAnimationEnd={onFadeEnd}
          >
            {/* The droppable is the list body and every card carries its own
                bottom margin, as in the day columns: a space-y gap that exists
                only between siblings made the landing slot differ by one gap
                depending on whether the card moved to or from the top. */}
            {showSkeleton && (
              <div className="space-y-2">
                {[0, 1].map(i => <SkeletonRow key={i} variant={i} />)}
              </div>
            )}
            {!loading && todos.length === 0 && (
              <button
                type="button"
                onClick={onAdd}
                aria-label={`${list.name} is empty — add an item`}
                className="w-full text-xs text-zinc-300 dark:text-zinc-600 py-6 text-center border border-dashed border-zinc-200 dark:border-zinc-800 rounded-lg cursor-pointer hover:border-zinc-300 dark:hover:border-zinc-600 hover:text-zinc-400 transition"
              >
                No items — click + to add
              </button>
            )}
            {/* One row per todo, plus the inert stand-in that holds the
                original's place while a copy is dragged out of this list. */}
            {withCopyGhost(todos, copyGhostId, sidebarDraggableId).map((row, index) => (
              <TodoCard
                key={row.key}
                todo={row.item}
                index={index}
                draggableId={row.draggableId}
                isGhost={row.isGhost}
                isFresh={!row.isGhost && freshIds.has(row.item.id)}
                onComplete={onComplete}
                onEdit={onEdit}
                onDelete={onDelete}
                onUnassign={onUnassign}
                onDismissAgentActivity={onDismissAgentActivity}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}

// Plain memo: a real prop change always re-renders; stable callbacks from the
// page are what let it skip.
export default memo(TodoList);
