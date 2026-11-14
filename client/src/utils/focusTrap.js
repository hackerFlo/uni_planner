export const FOCUSABLE_SELECTOR = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[contenteditable="true"]', '[tabindex]',
].join(',');

// Where Tab should send focus, or null when the browser's own order is fine.
// Only the two ends of the ring need intervening; an active element outside the
// ring (the dialog frame itself, say) is pulled in from the matching end.
export function nextTabTarget(ring, active, backwards) {
  if (ring.length === 0) return null;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!ring.includes(active)) return backwards ? last : first;
  if (backwards && active === first) return last;
  if (!backwards && active === last) return first;
  return null;
}
