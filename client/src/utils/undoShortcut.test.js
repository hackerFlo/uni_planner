import test from 'node:test';
import assert from 'node:assert/strict';

import { isUndoShortcut } from './undoShortcut.js';

const press = (key, mods = {}) => ({ key, metaKey: false, ctrlKey: false, shiftKey: false, ...mods });

test.describe('isUndoShortcut', () => {
  test('accepts Cmd+z and Ctrl+z', () => {
    assert.equal(isUndoShortcut(press('z', { metaKey: true })), true);
    assert.equal(isUndoShortcut(press('z', { ctrlKey: true })), true);
  });

  test('accepts the uppercase key reported with Caps Lock on or by automation', () => {
    assert.equal(isUndoShortcut(press('Z', { metaKey: true })), true);
  });

  test('rejects redo (Shift held)', () => {
    assert.equal(isUndoShortcut(press('Z', { metaKey: true, shiftKey: true })), false);
  });

  test('rejects z without a modifier and other keys', () => {
    assert.equal(isUndoShortcut(press('z')), false);
    assert.equal(isUndoShortcut(press('y', { metaKey: true })), false);
  });
});
