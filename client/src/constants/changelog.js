// CURRENT_VERSION is compared against localStorage 'uniPlanner.lastSeenVersion'.
// Bump CURRENT_VERSION only on the FIRST push of each Watchtower window (04:00–04:00 local time).
// Subsequent pushes in the same window append features to the top entry instead of bumping.
// This way every Watchtower deploy maps to exactly one version.
// Versioning: X.Y — increment Y for regular updates, bump X (reset Y to 0) for big releases.
// Add a new entry to CHANGELOG (newest first) on first push of a window; append to top entry otherwise.
export const CURRENT_VERSION = '3.0';

// icon: 'purple' | 'green' | 'amber' | 'blue' | 'rose'
// Each feature needs: icon, name, desc, and a 24×24 SVG path string (stroke icons).
export const CHANGELOG = [
  {
    version: '3.0',
    date: '2026-08-21',
    title: 'A quote a day, and a calmer board',
    features: [
      {
        icon: 'purple',
        name: 'A motivational quote each day',
        desc: 'A new quote sits at the top of the planner every day, drawn at random from 191 to start with. Every quote is shown once before any of them comes round again. Click an author to read about them on Wikipedia.',
        svgPath: 'M7 8h10M7 12h6M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
      },
      {
        icon: 'blue',
        name: 'Quotes on your terms',
        desc: 'Hover a quote to hide it for good or to put quotes away until tomorrow. Hidden by mistake? The message that appears has an Undo, and Settings can bring every hidden quote back at once. You can also switch quotes off entirely.',
        svgPath: 'M10 14L21 3m0 0v7m0-7h-7M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6',
      },
      {
        icon: 'green',
        name: 'Bring your own quotes',
        desc: 'Settings takes a CSV of your own quotes and adds them to the rotation. Upload the same file twice and nothing is duplicated -- anything already in your library is simply skipped.',
        svgPath: 'M12 4v12m0-12l-4 4m4-4l4 4M4 20h16',
      },
      {
        icon: 'amber',
        name: 'A quieter week view',
        desc: 'Empty days no longer say "Nothing planned" -- an empty column speaks for itself. The eye that reveals completed items now appears when you hover a day, the way the note button already did, so the headers stay clean.',
        svgPath: 'M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.5 12C3.7 7.9 7.5 5 12 5s8.3 2.9 9.5 7c-1.2 4.1-5 7-9.5 7s-8.3-2.9-9.5-7z',
      },
      {
        icon: 'rose',
        name: 'One task list again',
        desc: 'Tasks planned for another week no longer sit in a section of their own. The sidebar is a single list: everything unassigned first, then everything you have scheduled, whichever week it falls in.',
        svgPath: 'M4 6h16M4 12h16M4 18h16',
      },
      {
        icon: 'purple',
        name: 'Updates arrive even after a sign-in expires',
        desc: 'The app could get stuck on an old version once its sign-in ran out: it kept answering with its own saved copy of the page, so the sign-in screen never appeared, so the update could never download -- each problem holding the other in place. The page is now always fetched fresh, so an expired sign-in takes you straight to the sign-in screen and the next update installs by itself.',
        svgPath: 'M12 3l7 4v5c0 4.4-3 8.3-7 9-4-.7-7-4.6-7-9V7l7-4zM9 12l2 2 4-4',
      },
    ],
  },
  {
    version: '2.6',
    date: '2026-08-19',
    title: 'Updates that actually arrive',
    features: [
      {
        icon: 'purple',
        name: 'Updates reach you',
        desc: 'The app could quietly keep running an old version for days, because the file that carries an update was being cached along the way. Browsers are now told never to hold on to it, and if a page is still running an outdated version it says so and offers a Reload.',
        svgPath: 'M21 2v6h-6M3 12a9 9 0 0115-6.7L21 8M3 22v-6h6M21 12a9 9 0 01-15 6.7L3 16',
      },
      {
        icon: 'amber',
        name: 'Sign-in problems name themselves',
        desc: 'When the security gate in front of the app expires mid-session, you now get a message saying exactly that with a Reload button, instead of a generic failure that blamed the server.',
        svgPath: 'M12 16v-4M12 8h.01M22 12a10 10 0 11-20 0 10 10 0 0120 0z',
      },
      {
        icon: 'blue',
        name: 'Backups actually contain everything',
        desc: 'The backup file you can download in Settings was quietly leaving out your day notes, and repeating tasks came back as ordinary one-off items. Both are now included, so a restore returns the planner you actually had.',
        svgPath: 'M4 7c0-1.66 3.58-3 8-3s8 1.34 8 3M4 7v10c0 1.66 3.58 3 8 3s8-1.34 8-3V7M4 7c0 1.66 3.58 3 8 3s8-1.34 8-3M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3',
      },
      {
        icon: 'green',
        name: 'Repeating tasks stop disappearing',
        desc: 'A repeating task quietly stopped generating new copies once you ticked off its first occurrence, so after a couple of weeks it simply vanished. Completing an occurrence no longer ends the series — only deleting it does.',
        svgPath: 'M17 2l4 4-4 4M3 11V9a4 4 0 014-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 01-4 4H3',
      },
      {
        icon: 'blue',
        name: 'Restoring a backup works again',
        desc: 'Any backup larger than a few dozen tasks was rejected on upload, and the error blamed the file rather than the size limit that caused it. Real backups now restore.',
        svgPath: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3',
      },
      {
        icon: 'purple',
        name: 'Dark mode, and a planner that fits you',
        desc: 'Settings now carries an Appearance section: dark, light or follow-your-system, a compact card density, and a reduce-motion switch. Public holidays are no longer fixed to one region — pick your country and state, or turn them off.',
        svgPath: 'M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z',
      },
      {
        icon: 'green',
        name: 'See what you finished',
        desc: 'Every day column has an eye toggle that reveals the tasks you completed on that day, listed underneath. Creating an item from a day column can also tick it off immediately, so you can record something you have already done.',
        svgPath: 'M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7zM15 12a3 3 0 11-6 0 3 3 0 016 0z',
      },
      {
        icon: 'amber',
        name: 'The planner stops showing yesterday',
        desc: 'Left open overnight, the app kept highlighting the wrong day and froze every exam countdown at whatever it was when you opened it. It now keeps up on its own, and a task parked on a week you can no longer reach is listed rather than silently hidden.',
        svgPath: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
      },
      {
        icon: 'rose',
        name: 'Signing out is per device',
        desc: 'Logging out used to leave the session valid for another week, so a copied session stayed usable. It now ends properly — and only on the device you signed out from, so your phone and your laptop are independent.',
        svgPath: 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
      },
      {
        icon: 'green',
        name: 'Holidays that stay put',
        desc: 'Public holidays were fetched straight from an outside service every time, so they silently disappeared whenever it was unreachable or you were offline. The app now keeps its own copy, so once a year has been loaded it stays available — including holidays that fall on a weekend.',
        svgPath: 'M8 7V3m8 4V3M3 11h18M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
      },
      {
        icon: 'amber',
        name: 'Check for updates yourself',
        desc: 'Settings now shows which version you are running and whether a newer one exists, with a button to install it right away instead of waiting for the nightly update.',
        svgPath: 'M12 4v12m0 0l-4-4m4 4l4-4M4 20h16',
      },
      {
        icon: 'blue',
        name: 'Smoother on a phone',
        desc: 'Pull down to refresh in the installed app, and a slim progress bar across the top shows when something is still loading.',
        svgPath: 'M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0114.65-3.36L20 7M20 15a9 9 0 01-14.65 3.36L4 17',
      },
    ],
  },
  {
    version: '2.5',
    date: '2026-08-18',
    title: 'Staying signed in',
    features: [
      {
        icon: 'purple',
        name: 'Signing in sticks',
        desc: 'Logging in no longer flashes the planner and bounces you straight back to the login screen. Your session is now kept correctly whether you open the app over the internet or on your home network.',
        svgPath: 'M5 11h14v10H5zM8 11V7a4 4 0 018 0v4',
      },
      {
        icon: 'amber',
        name: 'Errors say what went wrong',
        desc: 'If the server is unreachable or busy, you now get a message telling you so instead of being quietly returned to the login screen as though you had been signed out.',
        svgPath: 'M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
      },
      {
        icon: 'blue',
        name: 'Simpler summary email',
        desc: 'The daily summary email no longer carries an "Open Uni Planner" button. Open the app from your bookmark or home-screen icon instead.',
        svgPath: 'M4 5h16v14H4zM4 7l8 6 8-6',
      },
      {
        icon: 'rose',
        name: 'Failures no longer pass unnoticed',
        desc: 'A refresh that fails no longer empties your planner without a word, and an edit that could not be saved now tells you instead of vanishing. Messages also name the real cause — an expired Cloudflare Access sign-in now says so and offers a reload, rather than claiming the server is down.',
        svgPath: 'M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0',
      },
      {
        icon: 'green',
        name: 'You can see which version you are running',
        desc: 'The sign-in screen now shows the version and build at the bottom, so you can tell at a glance whether an update has arrived. When a new version has been installed in the background, a notice appears with a Reload button instead of updating invisibly.',
        svgPath: 'M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82zM7 7h.01',
      },
    ],
  },
  {
    version: '2.4',
    date: '2026-06-23',
    title: 'Fixes & security',
    features: [
      {
        icon: 'purple',
        name: 'Account security hardening',
        desc: 'Changing your password now signs you out on your other devices, alongside behind-the-scenes safeguards that keep your tasks and exams private to your account.',
        svgPath: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
      },
      {
        icon: 'green',
        name: 'Recurring tasks stay put',
        desc: 'Repeating tasks — including weekday and weekend repeats — no longer disappear from the planner after a couple of weeks. They now stay filled in across the weeks you can see.',
        svgPath: 'M17 2l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3',
      },
    ],
  },
  {
    version: '2.3',
    date: '2026-06-22',
    title: 'Mobile drag tweaks',
    features: [
      {
        icon: 'blue',
        name: 'Drag cards from anywhere on mobile',
        desc: 'On phones you can now drag a card by touching anywhere on it, just like on desktop. The separate drag grip has been removed.',
        svgPath: 'M7 11l5-5 5 5M7 13l5 5 5-5',
      },
      {
        icon: 'green',
        name: 'Drop on any day on mobile',
        desc: 'Dragging a task onto the week now drops it on whichever day is under your finger — previously on phones only the first and last visible days would accept it.',
        svgPath: 'M12 3v12m0 0l-4-4m4 4l4-4M4 19h16',
      },
    ],
  },
  {
    version: '2.2',
    date: '2026-05-18',
    title: 'Undo everywhere & polish',
    features: [
      {
        icon: 'purple',
        name: 'Undo for exams',
        desc: 'Adding, editing, or deleting an exam now joins the existing 30-second shake-to-undo window — give your phone a shake (or hit ⌘Z on desktop) to revert.',
        svgPath: 'M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6',
      },
      {
        icon: 'green',
        name: 'Edits save when you close',
        desc: 'Closing the edit modal (Esc, backdrop click, or the ✕) now saves your changes automatically instead of discarding them.',
        svgPath: 'M5 13l4 4L19 7',
      },
      {
        icon: 'amber',
        name: 'Click-drag on backdrop keeps modal open',
        desc: 'If you mousedown inside a modal and release on the backdrop, the modal stays open. Only a clean click on the backdrop closes it.',
        svgPath: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
      },
      {
        icon: 'rose',
        name: 'Arrow shortcuts',
        desc: 'Type -> or <- in a title or description and it auto-converts to → or ←.',
        svgPath: 'M17 8l4 4m0 0l-4 4m4-4H3',
      },
    ],
  },
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
