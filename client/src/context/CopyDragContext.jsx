import { createContext, useContext } from 'react';

const CopyDragContext = createContext(false);

// True while a drag is in progress with Alt/Option held, i.e. while the drop
// will copy the card rather than move it. Read by both card bodies so they can
// say so; a boolean drilled through WeeklyPlanner -> DayColumn -> AssignedCard
// *and* TodoList -> TodoCard would touch five components to carry one flag.
export function CopyDragProvider({ value, children }) {
  return <CopyDragContext.Provider value={value}>{children}</CopyDragContext.Provider>;
}

export function useCopyDrag() {
  return useContext(CopyDragContext);
}
