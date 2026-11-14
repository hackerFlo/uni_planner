// On a fast connection the app is ready within a frame or two, so the loading
// skeleton would only flicker. It stays up for at least this long after the page
// started loading, then fades out over VEIL_FADE_MS. Slow loads are never delayed.
export const MIN_VEIL_MS = 650;
export const VEIL_FADE_MS = 250;

export function veilHoldMs(elapsedMs) {
  return Math.max(0, MIN_VEIL_MS - elapsedMs);
}

// Must match the skeleton-shimmer duration in index.css and pk-sh in index.html.
export const SHIMMER_CYCLE_MS = 1200;
