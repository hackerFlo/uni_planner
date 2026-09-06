import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTodos } from './useTodos';
import { useDividers } from './useDividers';
import { useUndo } from '../context/UndoContext';
import { composeReverts } from '../utils/plannerMutations';
import { splitOrderItems, splitSnapshotItems } from '../utils/plannerItems';

// The one place that spans both halves of the planner board. A day column is a
// single ordered list of todos and divider lines, so a drag inside it writes to
// two tables -- and those writes have to reach the single-slot undo store as
// one entry, or Ctrl+Z restores half the gesture.
export function usePlannerBoard() {
  const todosApi = useTodos();
  const dividersApi = useDividers();
  const { recordUndo } = useUndo();

  const { todos, applyAssignDay, applyTodoOrder, applyCopy, reportFailure } = todosApi;
  const { dividers, createDivider, deleteDivider, applyDividerDay, applyDividerReorder } = dividersApi;

  const items = useMemo(() => [...todos, ...dividers], [todos, dividers]);
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  // Deliberately reads the ref rather than awaiting a re-render: it still holds
  // the positions from before this drag, which is exactly what the revert needs.
  const applyOrder = useCallback(async (orderedItems) => {
    const next = splitOrderItems(orderedItems);
    const prev = splitSnapshotItems(itemsRef.current, orderedItems);
    const todoWrite = await applyTodoOrder(next.todoItems, prev.todoItems);
    const dividerWrite = await applyDividerReorder(next.dividerItems, prev.dividerItems);
    return composeReverts([todoWrite.revert, dividerWrite.revert]);
  }, [applyTodoOrder, applyDividerReorder]);

  const reorderDayItems = useCallback(async (orderedItems) => {
    try {
      recordUndo(await applyOrder(orderedItems));
    } catch (err) {
      reportFailure('Could not save the new order', err);
    }
  }, [applyOrder, recordUndo, reportFailure]);

  const moveItemToDay = useCallback(async (item, day, orderedItems) => {
    let revertDay = null;
    try {
      const moved = item.kind === 'divider'
        ? await applyDividerDay(item.dividerId, day)
        : await applyAssignDay(item.id, day);
      revertDay = moved.revert;
      recordUndo(composeReverts([revertDay, await applyOrder(orderedItems)]));
    } catch (err) {
      // If the move landed and only the renumber failed, that half is still on
      // screen and still has to be undoable.
      recordUndo(revertDay);
      reportFailure('Could not move the item', err);
    }
  }, [applyAssignDay, applyDividerDay, applyOrder, recordUndo, reportFailure]);

  // Normalises the two creates to one shape. A divider carries no content, so
  // copying one means a fresh blank row rather than a duplicate of the source.
  const createCopy = useCallback(async (source, day, index) => {
    if (source.kind === 'divider') return createDivider(day, index);
    const { todo, revert } = await applyCopy(source, day);
    return { item: todo, revert };
  }, [applyCopy, createDivider]);

  // The copy's id only exists once the server has answered, so the order is
  // create, then splice it in at the drop index, then renumber the day.
  const copyItemToDay = useCallback(async (source, day, dayItemsBefore, index) => {
    let revertCopy = null;
    try {
      const created = await createCopy(source, day, index);
      revertCopy = created.revert;
      const ordered = [...dayItemsBefore.slice(0, index), created.item, ...dayItemsBefore.slice(index)];
      recordUndo(composeReverts([revertCopy, await applyOrder(ordered)]));
    } catch (err) {
      recordUndo(revertCopy);
      reportFailure('Could not copy the item', err);
    }
  }, [applyOrder, createCopy, recordUndo, reportFailure]);

  // Takes the day's current items, not just a count. A todo that has never been
  // dragged still carries a null planner_order, which sorts *after* every real
  // number -- so a divider given a concrete order would jump to the top of the
  // column instead of landing at the bottom. Renumbering the whole day is what
  // makes "it appears at the bottom, drag it into place" true, and is the same
  // thing handleCreate does after creating a todo on a day.
  const addDivider = useCallback(async (date, dayItems) => {
    try {
      const { item, revert } = await createDivider(date, dayItems.length);
      recordUndo(composeReverts([revert, await applyOrder([...dayItems, item])]));
    } catch (err) {
      reportFailure('Could not add the divider', err);
    }
  }, [applyOrder, createDivider, recordUndo, reportFailure]);

  const removeDivider = useCallback(async (dividerId) => {
    try {
      recordUndo(await deleteDivider(dividerId));
    } catch (err) {
      reportFailure('Could not delete the divider', err);
    }
  }, [deleteDivider, recordUndo, reportFailure]);

  return {
    ...todosApi,
    dividers,
    items,
    reorderDayItems,
    moveItemToDay,
    copyItemToDay,
    addDivider,
    removeDivider,
  };
}
