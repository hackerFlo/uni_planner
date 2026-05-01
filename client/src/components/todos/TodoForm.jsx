import { useState, useRef } from 'react';
import EmojiPicker from '../ui/EmojiPicker';

function toIso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function getAssignableDates(extraDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = toIso(today);

  const day = today.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const thisMonday = new Date(today);
  thisMonday.setDate(today.getDate() + diffToMonday);

  const dates = [];
  for (let week = 0; week <= 1; week++) {
    for (let i = 0; i < 7; i++) {
      const d = new Date(thisMonday);
      d.setDate(thisMonday.getDate() + week * 7 + i);
      if (d < today) continue;
      const iso = toIso(d);
      const isToday = iso === todayIso;
      const label = isToday
        ? 'Today'
        : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
      dates.push({ value: iso, label, isNextWeek: week === 1 });
    }
  }

  if (extraDate && !dates.find(d => d.value === extraDate)) {
    const [y, m, dd] = extraDate.split('-').map(Number);
    const d = new Date(y, m - 1, dd);
    const label = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    dates.unshift({ value: extraDate, label, isNextWeek: false });
  }

  return dates;
}

const TIME_PRESETS = ['5m', '10m', '15m', '30m', '45m', '90m', '1h', '2h', '3h', '4h'];
function isPreset(v) { return v === '' || TIME_PRESETS.includes(v); }

function detectEmojiTrigger(value, cursorPos) {
  const before = value.substring(0, cursorPos);
  const match = before.match(/(^|[^:\w]):([\w]*)$/);
  if (!match) return null;
  const query = match[2];
  const colonIdx = match.index + match[1].length;
  return { query, triggerStart: colonIdx };
}

export default function TodoForm({ mode, todo, defaults = {}, onClose, onCreate, onUpdate }) {
  const assignableDates = getAssignableDates(todo?.day_assigned ?? defaults.day_assigned);
  const [title, setTitle] = useState(todo?.title ?? '');
  const [description, setDescription] = useState(todo?.description ?? '');
  const [listType, setListType] = useState(todo?.list_type ?? defaults.list_type ?? 'university');
  const [dayAssigned, setDayAssigned] = useState(todo?.day_assigned ?? defaults.day_assigned ?? '');
  const initialApproxTime = todo?.approx_time ?? '';
  const [approxTime, setApproxTime] = useState(isPreset(initialApproxTime) ? initialApproxTime : 'custom');
  const [customTime, setCustomTime] = useState(!isPreset(initialApproxTime) ? initialApproxTime : '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [emojiState, setEmojiState] = useState(null);

  const titleRef = useRef(null);
  const descRef = useRef(null);

  function handleTitleChange(e) {
    const val = e.target.value;
    setTitle(val);
    const trigger = detectEmojiTrigger(val, e.target.selectionStart);
    setEmojiState(trigger ? { field: 'title', ...trigger } : null);
  }

  function handleDescChange(e) {
    const val = e.target.value;
    setDescription(val);
    const trigger = detectEmojiTrigger(val, e.target.selectionStart);
    setEmojiState(trigger ? { field: 'description', ...trigger } : null);
  }

  function handleEmojiSelect(emoji) {
    if (!emojiState) return;
    const isTitle = emojiState.field === 'title';
    const ref = isTitle ? titleRef : descRef;
    const value = isTitle ? title : description;
    const cursorPos = ref.current?.selectionStart ?? value.length;
    const newVal = value.substring(0, emojiState.triggerStart) + emoji + ' ' + value.substring(cursorPos);
    if (isTitle) {
      setTitle(newVal);
    } else {
      setDescription(newVal);
    }
    setEmojiState(null);
    const newCursor = emojiState.triggerStart + [...emoji].length + 1;
    setTimeout(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(newCursor, newCursor);
    }, 0);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) return setError('Title is required');
    setError('');
    setLoading(true);
    try {
      const data = {
        title: title.trim(),
        description: description.trim(),
        list_type: listType,
        day_assigned: dayAssigned || null,
        approx_time: approxTime === 'custom' ? (customTime.trim() || null) : (approxTime || null),
      };
      if (mode === 'edit') {
        await onUpdate(todo.id, data);
      } else {
        await onCreate(data);
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={e => { if (e.key === 'Escape' && !emojiState) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-zinc-800">
            {mode === 'edit' ? 'Edit item' : 'New item'}
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 transition p-1 rounded-lg hover:bg-zinc-50"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm px-3 py-2.5 rounded-lg mb-4">
            {error}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleSubmit(e); }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1.5">
              Title <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              {emojiState?.field === 'title' && (
                <div className="absolute bottom-full left-0 mb-1.5 z-50">
                  <EmojiPicker
                    query={emojiState.query}
                    onSelect={handleEmojiSelect}
                    onClose={() => setEmojiState(null)}
                  />
                </div>
              )}
              <input
                ref={titleRef}
                type="text"
                value={title}
                onChange={handleTitleChange}
                onBlur={() => setTimeout(() => setEmojiState(null), 150)}
                maxLength={200}
                autoFocus
                required
                className="w-full px-3.5 py-2.5 text-sm bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                placeholder="What needs to be done?"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1.5">
              Description
            </label>
            <div className="relative">
              {emojiState?.field === 'description' && (
                <div className="absolute bottom-full left-0 mb-1.5 z-50">
                  <EmojiPicker
                    query={emojiState.query}
                    onSelect={handleEmojiSelect}
                    onClose={() => setEmojiState(null)}
                  />
                </div>
              )}
              <textarea
                ref={descRef}
                value={description}
                onChange={handleDescChange}
                onBlur={() => setTimeout(() => setEmojiState(null), 150)}
                rows={3}
                maxLength={5000}
                className="w-full px-3.5 py-2.5 text-sm bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition resize-none"
                placeholder="Optional details…"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1.5">
                List
              </label>
              <select
                value={listType}
                onChange={e => setListType(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
              >
                <option value="university">University</option>
                <option value="private">Private</option>
                <option value="future">Future</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1.5">
                Assign to day
              </label>
              <select
                value={dayAssigned}
                onChange={e => setDayAssigned(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition capitalize"
              >
                <option value="">None</option>
                {assignableDates.map(({ value, label, isNextWeek }, idx) => {
                  const prevIsThisWeek = idx > 0 && !assignableDates[idx - 1].isNextWeek;
                  return (
                    <>
                      {isNextWeek && prevIsThisWeek && (
                        <option key="sep" disabled>── Next Week ──</option>
                      )}
                      <option key={value} value={value}>{label}</option>
                    </>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1.5">
                Approx. time <span className="normal-case text-zinc-400 font-normal">(optional)</span>
              </label>
              <select
                value={approxTime}
                onChange={e => setApproxTime(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
              >
                <option value="">None</option>
                <option value="5m">5m</option>
                <option value="10m">10m</option>
                <option value="15m">15m</option>
                <option value="30m">30m</option>
                <option value="45m">45m</option>
                <option value="90m">90m</option>
                <option value="1h">1h</option>
                <option value="2h">2h</option>
                <option value="3h">3h</option>
                <option value="4h">4h</option>
                <option value="custom">Custom…</option>
              </select>
              {approxTime === 'custom' && (
                <input
                  type="text"
                  value={customTime}
                  onChange={e => {
                    const raw = e.target.value.toLowerCase().replace(/[^0-9mh]/g, '');
                    const m = raw.match(/^(\d{0,2})([mh]?).*$/);
                    setCustomTime(m ? m[1] + m[2] : '');
                  }}
                  placeholder="e.g. 20m or 3h"
                  maxLength={3}
                  className="mt-1.5 w-full px-3.5 py-2.5 text-sm bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                />
              )}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 text-sm font-medium text-zinc-600 bg-zinc-100 hover:bg-zinc-200 py-2.5 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 text-sm font-medium text-white bg-indigo-500 hover:bg-indigo-600 disabled:opacity-60 py-2.5 rounded-lg transition flex items-center justify-center gap-2"
            >
              {loading && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {mode === 'edit' ? 'Save changes' : 'Add item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
