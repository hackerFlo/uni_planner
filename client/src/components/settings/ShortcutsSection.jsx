import { Fragment } from 'react';

// navigator.platform is deprecated but still the only value that reports the
// keyboard rather than the browser; the user agent is the fallback, and the
// typeof guard keeps this importable outside a browser.
const IS_MAC = typeof navigator !== 'undefined'
  && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');

const MOD = IS_MAC ? '⌘' : 'Ctrl';
const ALT = IS_MAC ? '⌥' : 'Alt';

const SHORTCUTS = [
  { chords: [[ALT]], suffix: '+ pick up a card or divider', effect: 'Copies it; hold before the drag starts, the original stays put' },
  { chords: [[ALT]], suffix: "+ click a day's + button", effect: 'Adds a divider line to that day' },
  { chords: [[MOD, 'Z']], effect: 'Undoes the last change, for 30 seconds after it' },
  { chords: [], prefix: 'Shake the phone', effect: 'The same undo, on mobile' },
  { chords: [[MOD, 'Enter']], effect: 'Saves the item form' },
  { chords: [[MOD, 'B'], [MOD, 'I']], effect: 'Bold or italic in a description' },
  { chords: [['->'], ['<-']], prefix: 'Type', effect: 'Becomes → or ← in a title or description' },
  { chords: [[':name:']], prefix: 'Type', effect: 'Opens the emoji picker; the closing : inserts the match' },
];

function Key({ children }) {
  return (
    <kbd className="px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-[10px] font-mono text-zinc-600 dark:text-zinc-300">
      {children}
    </kbd>
  );
}

function Chord({ keys }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {keys.map((key, i) => (
        <Fragment key={key}>
          {i > 0 && <span className="text-[10px] text-zinc-300 dark:text-zinc-600">+</span>}
          <Key>{key}</Key>
        </Fragment>
      ))}
    </span>
  );
}

function ShortcutRow({ chords, prefix, suffix, effect }) {
  return (
    <li>
      <span className="flex items-center gap-1 flex-wrap">
        {prefix && <span className="text-xs text-zinc-600 dark:text-zinc-300">{prefix}</span>}
        {chords.map((chord, i) => (
          <Fragment key={chord.join('+')}>
            {i > 0 && <span className="text-[11px] text-zinc-400 dark:text-zinc-500">or</span>}
            <Chord keys={chord} />
          </Fragment>
        ))}
        {suffix && <span className="text-xs text-zinc-600 dark:text-zinc-300">{suffix}</span>}
      </span>
      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-relaxed mt-0.5">{effect}</p>
    </li>
  );
}

export default function ShortcutsSection() {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 uppercase tracking-widest">Shortcuts</h3>

      <ul className="space-y-2.5">
        {SHORTCUTS.map(row => <ShortcutRow key={row.effect} {...row} />)}
      </ul>
    </div>
  );
}
