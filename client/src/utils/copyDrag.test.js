import test from 'node:test';
import assert from 'node:assert/strict';

import { COPY_GHOST_ID, withCopyGhost } from './copyDrag.js';

const idOf = item => String(item.id);
const items = [{ id: 1 }, { id: 2 }, { id: 3 }];

test.describe('withCopyGhost', () => {
  test('returns one row per item when no copy-drag is running', () => {
    const rows = withCopyGhost(items, null, idOf);
    assert.deepEqual(rows.map(r => r.draggableId), ['1', '2', '3']);
    assert.equal(rows.some(r => r.isGhost), false);
  });

  test('splices the stand-in immediately after the dragged card', () => {
    const rows = withCopyGhost(items, '2', idOf);
    assert.deepEqual(rows.map(r => r.draggableId), ['1', '2', COPY_GHOST_ID, '3']);
  });

  test('appends the stand-in when the dragged card is last', () => {
    const rows = withCopyGhost(items, '3', idOf);
    assert.deepEqual(rows.map(r => r.draggableId), ['1', '2', '3', COPY_GHOST_ID]);
  });

  // The stand-in is the original, drawn a second time -- it renders the same
  // card, which is what makes it indistinguishable on screen.
  test('the stand-in carries the dragged card itself', () => {
    const rows = withCopyGhost(items, '2', idOf);
    assert.equal(rows[2].item, items[1]);
  });

  // Same item, so the key cannot come from it: React would see a duplicate.
  test('gives the stand-in a key of its own', () => {
    const rows = withCopyGhost(items, '2', idOf);
    assert.equal(rows[1].key, 2);
    assert.equal(rows[2].key, COPY_GHOST_ID);
  });

  // A todo assigned to a day is a Draggable in both the day column and the
  // sidebar, under two different ids. Only the list the drag started in matches.
  test('adds nothing when the dragged card is not in this list', () => {
    const rows = withCopyGhost(items, 'sidebar-2', idOf);
    assert.deepEqual(rows.map(r => r.draggableId), ['1', '2', '3']);
  });

  test('adds nothing to an empty list', () => {
    assert.deepEqual(withCopyGhost([], '2', idOf), []);
  });
});
