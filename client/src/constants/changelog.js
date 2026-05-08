// CURRENT_VERSION is compared against localStorage 'uniPlanner.lastSeenVersion'.
// Bump this on every push so the "What's New" popup auto-shows after a Watchtower update.
// Versioning: X.Y — increment Y for regular updates, bump X (reset Y to 0) for big releases.
// Add a new entry to CHANGELOG (newest first) to describe the changes.
export const CURRENT_VERSION = '1.4';

// icon: 'purple' | 'green' | 'amber' | 'blue' | 'rose'
// Each feature needs: icon, name, desc, and a 24×24 SVG path string (stroke icons).
export const CHANGELOG = [
  {
    version: '1.4',
    date: '2026-05-08',
    title: 'UI polish',
    features: [
      {
        icon: 'amber',
        name: 'Slower tooltip delay',
        desc: 'Tooltips now wait a little longer before appearing, so they stay out of the way during normal navigation.',
        svgPath: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
      },
    ],
  },
  {
    version: '1.3',
    date: '2026-05-08',
    title: 'Update popup improvements',
    features: [
      {
        icon: 'purple',
        name: 'Better update notifications',
        desc: 'The update popup now shows all releases you missed since your last visit — not just the most recent one. A scroll indicator lets you know when there is more to read.',
        svgPath: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
      },
    ],
  },
  {
    version: '1.2',
    date: '2026-05-08',
    title: 'Bug fixes',
    features: [
      {
        icon: 'blue',
        name: 'Email delivery fix',
        desc: 'Daily summary emails now send reliably even when the server restarts at the scheduled time (e.g. during a Watchtower update).',
        svgPath: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
      },
    ],
  },
  {
    version: '1.1',
    date: '2026-05-08',
    title: 'Bug fixes',
    features: [
      {
        icon: 'rose',
        name: 'Server crash fix',
        desc: 'Fixed a crash loop that prevented the server from starting after the first Docker deploy.',
        svgPath: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
      },
    ],
  },
  {
    version: '1.0',
    date: '2026-05-07',
    title: 'New version installed overnight',
    features: [
      {
        icon: 'purple',
        name: 'Custom to-do lists',
        desc: 'Create, rename, recolor, and reorder your lists from settings. Each list gets its own color to keep things organized.',
        svgPath: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
      },
      {
        icon: 'amber',
        name: 'Recurring tasks',
        desc: 'Set a task to repeat daily, weekly, or at any custom interval. Upcoming instances are created automatically.',
        svgPath: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
      },
      {
        icon: 'blue',
        name: 'Daily email summary',
        desc: 'Receive a recap of everything you completed each day. Set your preferred time and address in settings.',
        svgPath: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
      },
      {
        icon: 'green',
        name: 'Backup & restore',
        desc: 'Export all your todos as a JSON file and restore from any previous backup — existing items are never duplicated.',
        svgPath: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4',
      },
      {
        icon: 'rose',
        name: 'Undo with ⌘Z',
        desc: 'Made a mistake? Press ⌘Z (or Ctrl+Z) within 30 seconds to undo any change — completion, deletion, or reorder.',
        svgPath: 'M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6',
      },
    ],
  },
];
