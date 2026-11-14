const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
const ACTIONS = { n: 'new', '[': 'prev-week', ']': 'next-week', t: 'today', '?': 'help' };
const BRACKETS = new Set(['[', ']']);

export function isTypingTarget(target) {
  if (!target) return false;
  return Boolean(target.isContentEditable) || TYPING_TAGS.has(target.tagName);
}

// The key value already reflects the layout, so a bracket typed with AltGr (or
// Option on a Mac) is still a bracket; Cmd and a lone Ctrl belong to the browser.
function modifiersAllow(event) {
  if (event.metaKey) return false;
  if (BRACKETS.has(event.key)) return !event.ctrlKey || event.altKey;
  return !event.ctrlKey && !event.altKey;
}

export function shortcutAction(event) {
  if (isTypingTarget(event.target) || !modifiersAllow(event)) return null;
  return ACTIONS[event.key.toLowerCase()] ?? null;
}
