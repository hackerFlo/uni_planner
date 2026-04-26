import { useState, useEffect } from 'react';
import { EMOJIS } from '../../data/emojis';

const RECENT_KEY = 'recentEmojis';
function getRecents() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY)) ?? []; } catch { return []; }
}
function addRecent(emoji) {
  const list = [emoji, ...getRecents().filter(e => e !== emoji)].slice(0, 5);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list));
}

export default function EmojiPicker({ query, onSelect, onClose }) {
  const [idx, setIdx] = useState(0);

  const q = query.toLowerCase();
  const results = q.length > 0
    ? EMOJIS.filter(({ n }) => n.some(name => name.startsWith(q))).slice(0, 8)
    : getRecents().map(e => EMOJIS.find(em => em.e === e) ?? { e, n: [e] });

  useEffect(() => { setIdx(0); }, [query]);

  useEffect(() => {
    if (results.length === 0) { onClose(); return; }

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

  return (
    <div className="flex flex-col bg-white border border-zinc-200 rounded-xl shadow-lg p-1.5 min-w-max">
      {q.length === 0 && (
        <p className="text-[9px] text-zinc-400 px-1 mb-1 uppercase tracking-wide font-medium">Recent</p>
      )}
      <div className="flex items-center gap-0.5">
        {results.map(({ e, n }, i) => (
          <button
            key={e}
            type="button"
            onPointerDown={ev => { ev.preventDefault(); handleClick(e); }}
            title={`:${n[0]}:`}
            className={`text-xl w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
              i === idx ? 'bg-indigo-50 ring-2 ring-indigo-200' : 'hover:bg-zinc-100'
            }`}
          >
            {e}
          </button>
        ))}
      </div>
      {results[idx] && (
        <p className="text-[10px] text-zinc-400 px-1 mt-0.5 truncate max-w-[288px]">
          :{results[idx].n[0]}:
        </p>
      )}
    </div>
  );
}
