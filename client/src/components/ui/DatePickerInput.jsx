import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { parseDate } from '@internationalized/date';
import { CalendarIcon } from 'lucide-react';
import Calendar from './Calendar';

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDisplay(isoStr) {
  if (!isoStr) return null;
  const [y, m, d] = isoStr.split('-').map(Number);
  return `${MONTH_SHORT[m - 1]} ${String(d).padStart(2, '0')}, ${y}`;
}

export default function DatePickerInput({ value, onChange, className = '', minValue }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const popupRef = useRef(null);

  const calValue = value ? parseDate(value) : null;

  function openPicker() {
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 6, left: rect.left });
    setOpen(true);
  }

  // Adjust popup position after it renders to avoid viewport overflow
  useLayoutEffect(() => {
    if (!open || !popupRef.current) return;
    const popup = popupRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rect = triggerRef.current.getBoundingClientRect();
    let { top, left } = pos;
    if (left + popup.width > vw - 8) left = vw - popup.width - 8;
    if (top + popup.height > vh - 8) top = rect.top - popup.height - 6;
    setPos({ top: Math.max(8, top), left: Math.max(8, left) });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e) {
      if (!triggerRef.current?.contains(e.target) && !popupRef.current?.contains(e.target)) {
        setOpen(false);
      }
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function handleSelect(date) {
    onChange(date.toString());
    setOpen(false);
  }

  return (
    <div ref={triggerRef} className={className}>
      <button
        type="button"
        onClick={openPicker}
        className="w-full flex items-center gap-2 text-sm font-medium border border-indigo-200 dark:border-indigo-900 bg-white dark:bg-zinc-900 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition text-left"
      >
        <CalendarIcon size={14} className="text-zinc-400 dark:text-zinc-500 flex-shrink-0" />
        <span className={value ? 'text-zinc-900 dark:text-zinc-50' : 'text-zinc-400 dark:text-zinc-500'}>
          {value ? formatDisplay(value) : 'Select date…'}
        </span>
      </button>

      {open && createPortal(
        <div
          ref={popupRef}
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-[9999] bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xl p-3 animate-[fadeIn_0.15s_ease]"
        >
          <Calendar value={calValue} onChange={handleSelect} minValue={minValue} />
        </div>,
        document.body,
      )}
    </div>
  );
}
