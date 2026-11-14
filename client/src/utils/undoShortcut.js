// `key` is uppercase 'Z' with Caps Lock on, so compare case-insensitively.
export function isUndoShortcut(e) {
  return (e.metaKey || e.ctrlKey) && !e.shiftKey && e.key?.toLowerCase() === 'z';
}
