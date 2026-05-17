// CURRENT_VERSION is compared against localStorage 'uniPlanner.lastSeenVersion'.
// Bump CURRENT_VERSION only on the FIRST push of each Watchtower window (04:00–04:00 local time).
// Subsequent pushes in the same window append features to the top entry instead of bumping.
// This way every Watchtower deploy maps to exactly one version.
// Versioning: X.Y — increment Y for regular updates, bump X (reset Y to 0) for big releases.
// Add a new entry to CHANGELOG (newest first) on first push of a window; append to top entry otherwise.
export const CURRENT_VERSION = '2.1';

// icon: 'purple' | 'green' | 'amber' | 'blue' | 'rose'
// Each feature needs: icon, name, desc, and a 24×24 SVG path string (stroke icons).
export const CHANGELOG = [
  {
    version: '2.1',
    date: '2026-05-17',
    title: 'Rich notes & polish',
    features: [
      {
        icon: 'purple',
        name: 'Rich text in task notes',
        desc: 'Task descriptions now support bold (Cmd/Ctrl+B), italic (Cmd/Ctrl+I), and bullet lists — just type "- " at the start of a line to start a list. Formatting is preserved on cards and in the archive.',
        svgPath: 'M4 7h16M4 12h10M4 17h16',
      },
      {
        icon: 'amber',
        name: 'Checkbox & hover polish',
        desc: 'The complete-task checkbox has a chunkier checkmark with a subtle scale on hover and tap. Task titles also no longer shift when you hover a card to reveal the edit/delete actions.',
        svgPath: 'M5 13l4 4L19 7',
      },
      {
        icon: 'blue',
        name: 'No accidental zoom',
        desc: 'Pinch-to-zoom on mobile and Cmd/Ctrl + scroll / +/- on desktop are now disabled, so the layout stays put while you plan.',
        svgPath: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7',
      },
    ],
  },
  {
    version: '2.0',
    date: '2026-05-16',
    title: 'Exams',
    features: [
      {
        icon: 'purple',
        name: 'Track upcoming exams',
        desc: 'A new Exams module lets you add, edit, and delete upcoming exams with a date. The navbar shows the next exam at a glance with a live "X days" countdown, turning rose-coloured when it\'s within a week.',
        svgPath: 'M22 10L12 5 2 10l10 5 10-5zM6 12v5c0 1.5 3 3 6 3s6-1.5 6-3v-5',
      },
      {
        icon: 'rose',
        name: 'Exam days highlighted on the planner',
        desc: 'Days with an exam scheduled now appear with a soft rose tint in the weekly planner, so you can spot them at a glance alongside today and public holidays.',
        svgPath: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
      },
      {
        icon: 'blue',
        name: 'Backups now include exams',
        desc: 'Downloading a backup captures all your todos AND exams in a single file. Restoring brings both back — existing items are still never duplicated, and older backup files (without exams) keep working as before.',
        svgPath: 'M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3',
      },
      {
        icon: 'green',
        name: 'Smarter tooltips on truncated notes',
        desc: 'Day-note tooltips now only appear when the text is actually cut off — no more redundant hover popups on short notes that already fit.',
        svgPath: 'M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z',
      },
    ],
  },
  {
    version: '1.6',
    date: '2026-05-15',
    title: 'Tag alignment polish',
    features: [
      {
        icon: 'blue',
        name: 'Consistent tag order',
        desc: 'Tags on task rows now always appear in the same order: recurrence icon, then time, then weekday — regardless of which combination is present.',
        svgPath: 'M3 6h18M3 12h18M3 18h18',
      },
      {
        icon: 'blue',
        name: 'Tags aligned across task rows',
        desc: 'The time, recurrence, and day chips on task cards are now vertically centred relative to each other and pinned to the right edge, so they line up consistently across all rows regardless of content.',
        svgPath: 'M4 6h16M4 12h16M4 18h16',
      },
      {
        icon: 'rose',
        name: 'Security improvements',
        desc: 'Several server-side hardening measures were applied to improve input validation, error handling, and request processing.',
        svgPath: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
      },
      {
        icon: 'green',
        name: 'Performance & code quality improvements',
        desc: 'Database queries, server scheduling, and React rendering have all been tuned for lower overhead. Error messages from failed network requests are now surfaced as in-app notifications rather than silently dropped.',
        svgPath: 'M13 10V3L4 14h7v7l9-11h-7z',
      },
    ],
  },
  {
    version: '1.5',
    date: '2026-05-14',
    title: 'Weekday & weekend recurrence',
    features: [
      {
        icon: 'blue',
        name: 'No stray icons behind open dialogs',
        desc: 'Cards behind an open edit dialog, settings panel, or other modal no longer reveal their hover icons or tooltips when you move the mouse across them.',
        svgPath: 'M5 13l4 4L19 7',
      },
      {
        icon: 'blue',
        name: 'Daily email icons now render in Gmail',
        desc: 'The completed-task checkmark and the "Coming up" arrow now display correctly in Gmail (web and iOS). Already-completed tasks are also no longer listed in the "Coming up" section, so the email always reflects your actual state.',
        svgPath: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
      },
      {
        icon: 'green',
        name: 'Weekday and weekend repeat options',
        desc: 'Tasks can now repeat "Every weekday (Mon–Fri)" or "Every weekend (Sat–Sun)" — handy for habits that follow your work schedule or leisure days.',
        svgPath: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
      },
      {
        icon: 'rose',
        name: 'Choose what to delete for recurring tasks',
        desc: 'Deleting a recurring task now asks whether to remove just that one occurrence or all past and future instances — no more accidental cascade or stranded copies.',
        svgPath: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
      },
    ],
  },
  {
    version: '1.4',
    date: '2026-05-08',
    title: 'Emoji & UI polish',
    features: [
      {
        icon: 'blue',
        name: 'Daily summary counts cross-day completions',
        desc: 'Tasks you complete today now appear in the "Completed today" email section even if they were assigned to a different day. Fixes a timezone-related window where some completions near midnight could be missed.',
        svgPath: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
      },
      {
        icon: 'purple',
        name: 'Full emoji set',
        desc: 'The emoji picker now includes all iOS-supported emoji — flags, food, travel, objects, and more. Type `:` in any task field to search by name.',
        svgPath: 'M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
      },
      {
        icon: 'green',
        name: 'Auto-convert :name: shortcuts',
        desc: 'Type a complete shortcode like `:burger:` or `:rocket:` and it instantly becomes the emoji — no picker needed. Works in title and description fields.',
        svgPath: 'M13 10V3L4 14h7v7l9-11h-7z',
      },
      {
        icon: 'amber',
        name: 'Slower tooltip delay',
        desc: 'Tooltips now wait a little longer before appearing, so they stay out of the way during normal navigation.',
        svgPath: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
      },
      {
        icon: 'blue',
        name: 'Cleaner mobile planner cards',
        desc: 'Tap an assigned task on mobile to edit it; long-press still drags. The action buttons in the edit form are now compact icons on phones to save space.',
        svgPath: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z',
      },
      {
        icon: 'blue',
        name: 'Mobile-friendly todo cards',
        desc: 'Tap a todo on mobile to open it. The edit form now has bigger buttons for Mark complete, Unassign, and Delete. Tooltips no longer linger on touch.',
        svgPath: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z',
      },
      {
        icon: 'green',
        name: 'New tasks land at the bottom',
        desc: 'Tasks created with the + button on a planner day now consistently appear at the bottom of that day\'s list.',
        svgPath: 'M19 14l-7 7m0 0l-7-7m7 7V3',
      },
      {
        icon: 'blue',
        name: 'Cleaner desktop edit dialog',
        desc: 'The Mark complete, Unassign, and Delete buttons inside the edit dialog are now hidden on desktop — use the card\'s hover actions instead. Mobile keeps the in-form buttons.',
        svgPath: 'M4 6h16M4 12h10M4 18h7',
      },
      {
        icon: 'rose',
        name: 'Signups disabled',
        desc: 'New accounts can no longer be registered. Existing accounts continue to work as normal.',
        svgPath: 'M12 15v2m0 0v.01M4.93 4.93l14.14 14.14M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
      },
      {
        icon: 'blue',
        name: 'Tooltip overlap fix',
        desc: 'Tooltips no longer pop up over modals and dialogs when the underlying button is hidden by an overlay.',
        svgPath: 'M5 13l4 4L19 7',
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
