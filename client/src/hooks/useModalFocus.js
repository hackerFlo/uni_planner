import { useEffect, useState } from 'react';
import { FOCUSABLE_SELECTOR, nextTabTarget } from '../utils/focusTrap';

const FIELD_SELECTOR = 'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), [contenteditable="true"]';

function tabbableIn(root) {
  return [...root.querySelectorAll(FOCUSABLE_SELECTOR)].filter(el => (
    el.tabIndex >= 0 && !el.closest('[inert]') && el.getClientRects().length > 0
  ));
}

function focusOnOpen(root, initialFocus) {
  if (root.contains(document.activeElement)) return;
  const field = initialFocus === 'field' ? root.querySelector(FIELD_SELECTOR) : null;
  (field ?? root).focus({ preventScroll: true });
}

function trapTab(root, event) {
  if (event.key !== 'Tab' || event.defaultPrevented) return;
  const ring = tabbableIn(root);
  const target = nextTabTarget(ring, document.activeElement, event.shiftKey) ?? (ring.length === 0 ? root : null);
  if (!target) return;
  event.preventDefault();
  target.focus({ preventScroll: true });
}

// Dialog focus management: move focus in on open, keep Tab inside, and hand
// focus back to whatever opened the dialog. Escape stays with the caller.
//
// The listener sits on the dialog element itself, so a keydown inside a popover
// portalled to <body> (emoji picker, confirm popover, select menu) never reaches
// it and those keep their own keyboard handling.
export function useModalFocus(ref, { initialFocus = 'field' } = {}) {
  // Read during the first render: an autoFocus field inside the dialog takes
  // focus at commit, before any effect runs, and would be mistaken for the opener.
  const [opener] = useState(() => document.activeElement);
  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    focusOnOpen(root, initialFocus);
    const onKeyDown = event => trapTab(root, event);
    root.addEventListener('keydown', onKeyDown);
    return () => {
      root.removeEventListener('keydown', onKeyDown);
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [ref, initialFocus, opener]);
}
