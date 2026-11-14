import test from 'node:test';
import assert from 'node:assert/strict';

import { dragEndMessage, dragStartMessage, dragUpdateMessage, itemTitle, placeLabel } from './dragAnnouncements.js';

const MONDAY = '2026-11-16';
const WEDNESDAY = '2026-11-18';
const paper = { id: 1, title: 'Read paper' };

test.describe('placeLabel', () => {
  test('names the weekday of a date column', () => assert.equal(placeLabel(WEDNESDAY), 'Wednesday'));
  test('calls a list droppable the task list', () => assert.equal(placeLabel('4-list'), 'the task list'));
});

test.describe('itemTitle', () => {
  test('uses the task title', () => assert.equal(itemTitle(paper), 'Read paper'));
  test('calls a divider a divider', () => assert.equal(itemTitle({ kind: 'divider' }), 'divider'));
  test('falls back for an unknown item', () => assert.equal(itemTitle(undefined), 'item'));
});

test.describe('dragStartMessage', () => {
  test('names the title, the day and the 1-based position', () => {
    assert.equal(dragStartMessage(paper, { droppableId: MONDAY, index: 1 }), 'Picked up "Read paper" from Monday, position 2.');
  });
});

test.describe('dragUpdateMessage', () => {
  test('announces the hovered position', () => {
    assert.equal(dragUpdateMessage({ droppableId: WEDNESDAY, index: 0 }), 'Moved to Wednesday, position 1.');
  });
  test('says when nothing is under the card', () => assert.equal(dragUpdateMessage(null), 'Not over a drop target.'));
});

test.describe('dragEndMessage', () => {
  test('announces the drop', () => {
    assert.equal(dragEndMessage(paper, { droppableId: MONDAY, index: 1 }, { droppableId: WEDNESDAY, index: 0 }), 'Dropped on Wednesday, position 1.');
  });
  test('announces a cancel with where it stays', () => {
    assert.equal(dragEndMessage(paper, { droppableId: MONDAY, index: 1 }, null), 'Cancelled. "Read paper" stays on Monday, position 2.');
  });
});
