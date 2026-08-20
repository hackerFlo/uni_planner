import { pullProgress, PULL_THRESHOLD_PX } from '../utils/pullToRefresh';

// Sits under the top edge and rides down with the finger. Renders nothing at rest
// so it costs an installed PWA nothing until the gesture starts.
export default function PullToRefreshIndicator({ distance, refreshing }) {
  if (!refreshing && distance <= 0) return null;

  const offset = refreshing ? PULL_THRESHOLD_PX : distance;
  const progress = pullProgress(distance);
  const armed = refreshing || progress >= 1;

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 z-[90] flex justify-center pointer-events-none"
      style={{ transform: `translateY(${offset - 28}px)` }}
    >
      <div className="w-7 h-7 rounded-full bg-white dark:bg-zinc-900 shadow-md border border-zinc-100 dark:border-zinc-800 flex items-center justify-center">
        <svg
          className={`w-3.5 h-3.5 ${armed ? 'text-indigo-500' : 'text-zinc-300 dark:text-zinc-600'} ${refreshing ? 'animate-spin' : ''}`}
          style={refreshing ? undefined : { transform: `rotate(${progress * 270}deg)` }}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </div>
    </div>
  );
}
