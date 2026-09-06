import { memo } from 'react';
import { Draggable } from '@hello-pangea/dnd';
import Tooltip from '../ui/Tooltip';
import { useCopyDrag } from '../../context/CopyDragContext';
import { useDragTilt } from '../../hooks/useDragTilt';

// The body is its own component because it calls a hook: the render prop of a
// Draggable is invoked inside the library's own render, so a hook here would
// belong to that component, not this one.
const DividerBody = memo(function DividerBody({ provided, snapshot, item, isGhost, boardDragging, onDelete }) {
  const dragging = snapshot.isDragging;
  const isCopying = useCopyDrag() && snapshot.isDragging;
  const rotation = useDragTilt(dragging);

  return (
    <div
      ref={provided.innerRef}
      {...provided.draggableProps}
      {...provided.dragHandleProps}
      style={{
        ...provided.draggableProps.style,
        // Picked up, a divider is a card: same tilt, same lift, same shadow as
        // AssignedCard. Hover cannot supply this -- a touch drag never hovers,
        // and the pointer leaves the rule's own box as it swings.
        ...(dragging && {
          transform: `${provided.draggableProps.style?.transform ?? ''} rotate(${rotation}deg) scale(1.03)`,
          boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
        }),
      }}
      // At rest a divider is only its rule. It puts on AssignedCard's shell --
      // same ground, border, radius, resting shadow-sm and lift to shadow-md,
      // class for class -- for exactly two occasions: while it is hovered, and
      // while anything on the board is in flight. The second is what makes every
      // divider in the week a visible landmark to aim a drop at, at the one
      // moment nothing can be hovered because the pointer is holding a card.
      // Only the box differs from a card: a fixed height and px-only padding in
      // place of p-2.5, so the rule sits in the middle of a card-sized row.
      //
      // The border exists at rest and is merely transparent: giving it a width
      // only when shown would grow the row by 2px and shift every card below it.
      className={`group/divider relative flex items-center h-11 rounded-lg border px-2.5 select-none min-w-0 w-full cursor-grab active:cursor-grabbing transition-shadow ${
        dragging || boardDragging
          ? 'bg-white dark:bg-zinc-900 border-zinc-100 dark:border-zinc-800 shadow-sm hover:shadow-md'
          : 'border-transparent hover:bg-white dark:hover:bg-zinc-900 hover:border-zinc-100 dark:hover:border-zinc-800 hover:shadow-md'
      }${isGhost ? ' pointer-events-none' : ''}`}
      aria-label="Divider"
      aria-hidden={isGhost || undefined}
    >
      {isCopying && (
        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full uppercase tracking-wide bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-200 mr-2">
          Copy
        </span>
      )}
      {/* The rule stops short on hover so the trashcan sits in line with it
          rather than on top of it. Below md there is no hover, so the button
          is permanently there and the rule is permanently short. */}
      <div className="flex-1 h-px rounded-full bg-zinc-300 dark:bg-zinc-600 mr-6 md:mr-0 md:group-hover/divider:mr-6 transition-[margin]" />
      {/* The positioning lives on the Tooltip, not the button: Tooltip
          renders an `inline-flex` span around its child, and a static one
          still generates a 24px line box after the rule -- which made the
          divider 47px tall and dropped the trashcan 12px below the line it
          is supposed to sit on. Absolute here takes the span out of flow. */}
      <Tooltip text="Delete divider" className="absolute right-2.5 top-1/2 -translate-y-1/2">
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onDelete(item.dividerId); }}
          aria-label="Delete this divider"
          // Always visible below md: a touch device has no hover, and this
          // is the only way to remove one -- same reasoning as the
          // show-completed toggle in DayColumn.
          className="p-1 rounded text-zinc-400 dark:text-zinc-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition opacity-100 md:opacity-0 md:group-hover/divider:opacity-100 focus-visible:opacity-100"
        >
          <svg aria-hidden="true" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </Tooltip>
    </div>
  );
});

// A caesura in the day: a plain rule that holds a slot in the column's order and
// drags between days like a card. It carries no content, so the padding around
// the hairline is what makes it grabbable at all.
export default function DividerCard({ item, index, draggableId, isGhost = false, boardDragging = false, onDelete }) {
  return (
    <Draggable draggableId={draggableId ?? item.id} index={index} isDragDisabled={isGhost}>
      {(provided, snapshot) => (
        <DividerBody provided={provided} snapshot={snapshot} item={item} isGhost={isGhost} boardDragging={boardDragging} onDelete={onDelete} />
      )}
    </Draggable>
  );
}
