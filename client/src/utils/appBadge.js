export function countOpenToday(todos, today) {
  return todos.filter(todo => todo.day_assigned === today && !todo.completed && !todo.archived).length;
}

// Not every browser has the Badging API, and a rejected call (permission, an
// uninstalled PWA) must cost the badge only.
export async function applyBadge(nav, count, onError = error => console.warn('[badge]', error.name)) {
  try {
    if (count > 0 && nav?.setAppBadge) await nav.setAppBadge(count);
    else if (nav?.clearAppBadge) await nav.clearAppBadge();
  } catch (error) {
    onError(error);
  }
}
