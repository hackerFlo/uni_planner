// A completed card is gone COMPLETION_DELAY_MS after the click: the checkmark
// draws first, holds a beat, then the card fades out so that it is fully
// transparent at the instant the board drops it. Every number below derives from
// the one delay, so retuning it cannot leave the fade ending after the removal.
export const COMPLETION_DELAY_MS = 700;
export const CHECK_DELAY_MS = 60;
export const CHECK_DRAW_MS = 280;
export const FADE_MS = 300;

const FADE_START_MS = COMPLETION_DELAY_MS - FADE_MS;

export const checkmarkTransition = `stroke-dashoffset ${CHECK_DRAW_MS}ms ease ${CHECK_DELAY_MS}ms`;

export const completionFadeTransition = `opacity ${FADE_MS}ms ease ${FADE_START_MS}ms, transform ${FADE_MS}ms ease ${FADE_START_MS}ms`;

export function isRecurring(todo) {
  return todo.recurrence_parent_id != null || todo.recurrence_interval_days != null || todo.recurrence_pattern != null;
}
