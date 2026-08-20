import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { loadEmojis } from '../../data/loadEmojis';

const RECENT_KEY = 'recentEmojis';
function getRecents() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY)) ?? []; } catch { return []; }
}
function addRecent(emoji) {
  const list = [emoji, ...getRecents().filter(e => e !== emoji)].slice(0, 5);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list));
}

function rank(names, q) {
  if (names.some(n => n === q)) return 0;
  if (names.some(n => n.startsWith(q))) return 1;
  return 2;
}

export default function EmojiPicker({ anchorRef, query, onSelect, onClose }) {
  const [emojis, setEmojis] = useState(null);
  const [idx, setIdx] = useState(0);
  const [pos, setPos] = useState({ top: -9999, left: -9999 });
  const pickerRef = useRef(null);

  useEffect(() => {
    loadEmojis().then(setEmojis);
  }, []);

  const q = query.toLowerCase();
  const results = emojis == null ? [] : q.length > 0
    ? emojis
        .filter(({ n }) => n.some(name => name.startsWith(q)))
        .sort((a, b) => rank(a.n, q) - rank(b.n, q))
        .slice(0, 8)
    : getRecents().map(e => emojis.find(em => em.e === e) ?? { e, n: [e] });

  useEffect(() => { setIdx(0); }, [query]);

  function reposition() {
    const anchor = anchorRef?.current;
    const picker = pickerRef.current;
    if (!anchor || !picker) return;
    const rect = anchor.getBoundingClientRect();
    const ph = picker.offsetHeight;
    const pw = picker.offsetWidth;
    let top = rect.bottom + 4;
    if (top + ph > window.innerHeight - 8) top = rect.top - ph - 4;
    let left = rect.left;
    left = Math.min(Math.max(8, left), window.innerWidth - pw - 8);
    setPos({ top, left });
  }

  useLayoutEffect(() => {
    reposition();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results.length]);

  useEffect(() => {
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (emojis !== null && results.length === 0) { onClose(); return; }

    function onKey(e) {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setIdx(i => Math.min(i + 1, results.length - 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setIdx(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (results[idx]) { addRecent(results[idx].e); onSelect(results[idx].e); }
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        onClose();
      }
    }

    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [idx, results, onSelect, onClose]);

  if (results.length === 0) return null;

  function handleClick(emoji) {
    addRecent(emoji);
    onSelect(emoji);
  }

  return createPortal(
    <div
      ref={pickerRef}
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
      className="flex flex-col bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg p-1.5"
    >
      {q.length === 0 && (
        <p className="text-[9px] text-zinc-400 dark:text-zinc-500 px-1 mb-1 uppercase tracking-wide font-medium">Recent</p>
      )}
      <div className="flex items-center gap-0.5">
        {results.map(({ e, n }, i) => (
          <button
            key={e}
            type="button"
            onPointerDown={ev => { ev.preventDefault(); handleClick(e); }}
            title={`:${n[0]}:`}
            className={`text-xl w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
              i === idx ? 'bg-indigo-50 dark:bg-indigo-950 ring-2 ring-indigo-200' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            {e}
          </button>
        ))}
      </div>
      {results[idx] && (
        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 px-1 mt-0.5 truncate max-w-[288px]">
          :{results[idx].n[0]}:
        </p>
      )}
    </div>,
    document.body,
  );
}
