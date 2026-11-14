// What the loading skeleton needs to look like the finished page, saved from
// the last visit. The account's theme and exams only arrive after the session
// check, so without these the skeleton would guess and visibly jump at the
// hand-over. public/paint-boot.js reads the same keys before first paint.
export const THEME_HINT_KEY = 'uniPlanner.themeHint';
export const EXAM_HINT_KEY = 'uniPlanner.examHint';

function write(storage, key, value) {
  try {
    storage?.setItem(key, value);
    return true;
  } catch {
    // Losing a hint only costs the first frames their exact shape.
    return false;
  }
}

export function saveThemeHint(theme, storage = globalThis.localStorage) {
  return write(storage, THEME_HINT_KEY, theme);
}

// Whether the navbar shows the next-exam pill or the plain exam button.
export function saveExamHint(hasExam, storage = globalThis.localStorage) {
  return write(storage, EXAM_HINT_KEY, hasExam ? '1' : '0');
}

export function loadExamHint(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(EXAM_HINT_KEY) === '1';
  } catch {
    return false;
  }
}

// Mirrors WeeklyPlanner's first scroll: the saved position of this tab, else
// today's column at the left edge, clamped to what the board can scroll.
export function skeletonBoardScroll({ columnLefts, maxScroll, todayIndex, saved }) {
  let target;
  if (saved?.weekOffset === 0) target = saved.scrollLeft;
  else if (saved?.weekOffset === 1) target = 0;
  else if (saved?.weekOffset === -1) target = maxScroll;
  else target = columnLefts[todayIndex] ?? 0;
  return Math.max(0, Math.min(maxScroll, target));
}
