import test from 'node:test';
import assert from 'node:assert/strict';

import { shortcutAction, isTypingTarget } from './shortcuts.js';

const press = (key, extra = {}) => ({ key, target: { tagName: 'BODY' }, ...extra });

test.describe('shortcutAction', () => {
  for (const [key, action] of [['n', 'new'], ['N', 'new'], ['[', 'prev-week'], [']', 'next-week'], ['t', 'today'], ['?', 'help']]) {
    test(`maps ${key} to ${action}`, () => assert.equal(shortcutAction(press(key)), action));
  }

  test('ignores unmapped keys', () => assert.equal(shortcutAction(press('x')), null));
  test('ignores letters with Ctrl', () => assert.equal(shortcutAction(press('n', { ctrlKey: true })), null));
  test('ignores letters with Cmd', () => assert.equal(shortcutAction(press('n', { metaKey: true })), null));
  test('ignores letters with Alt', () => assert.equal(shortcutAction(press('t', { altKey: true })), null));
  test('accepts ? typed with Shift', () => assert.equal(shortcutAction(press('?', { shiftKey: true })), 'help'));
  test('accepts a bracket typed with AltGr', () => assert.equal(shortcutAction(press('[', { ctrlKey: true, altKey: true })), 'prev-week'));
  test('accepts a bracket typed with Option', () => assert.equal(shortcutAction(press(']', { altKey: true })), 'next-week'));
  test('ignores Cmd+[ which is browser history', () => assert.equal(shortcutAction(press('[', { metaKey: true })), null));
  test('ignores a lone Ctrl+[', () => assert.equal(shortcutAction(press('[', { ctrlKey: true })), null));
  test('ignores typing in an input', () => assert.equal(shortcutAction(press('n', { target: { tagName: 'INPUT' } })), null));
});

test.describe('isTypingTarget', () => {
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
    test(`treats ${tagName} as typing`, () => assert.equal(isTypingTarget({ tagName }), true));
  }
  test('treats contenteditable as typing', () => assert.equal(isTypingTarget({ tagName: 'DIV', isContentEditable: true }), true));
  test('treats a button as not typing', () => assert.equal(isTypingTarget({ tagName: 'BUTTON' }), false));
  test('treats a missing target as not typing', () => assert.equal(isTypingTarget(null), false));
});
