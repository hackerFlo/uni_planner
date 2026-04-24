import { useState } from 'react';

function toIso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function getAssignableDates() {
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
  return dates;
}

const ASSIGNABLE_DATES = getAssignableDates();

export default function TodoForm({ mode, todo, defaults = {}, onClose, onCreate, onUpdate }) {
  const [title, setTitle] = useState(todo?.title ?? '');
  const [description, setDescription] = useState(todo?.description ?? '');
  const [listType, setListType] = useState(todo?.list_type ?? defaults.list_type ?? 'university');
  const [dayAssigned, setDayAssigned] = useState(todo?.day_assigned ?? '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1.5">
              Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={200}
              autoFocus
              required
              className="w-full px-3.5 py-2.5 text-sm bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
              placeholder="What needs to be done?"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              maxLength={5000}
              className="w-full px-3.5 py-2.5 text-sm bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition resize-none"
              placeholder="Optional details…"
            />
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
                {ASSIGNABLE_DATES.map(({ value, label, isNextWeek }, idx) => {
                  const prevIsThisWeek = idx > 0 && !ASSIGNABLE_DATES[idx - 1].isNextWeek;
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
