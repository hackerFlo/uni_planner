import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Tooltip from './Tooltip';

const MARGIN = 8;

export default function ConfirmPopover({ options, onSelect, tooltipText, children }) {
  const triggerRef = useRef(null);
  const popRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, placement: 'top' });

  function toggle(e) {
    e.stopPropagation();
    setOpen(v => !v);
  }

  useEffect(() => {
    if (!open) { setShown(false); return; }
    const tr = triggerRef.current.getBoundingClientRect();
    const pop = popRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let placement = 'top';
    let top = tr.top - pop.height - MARGIN;
    if (top < MARGIN) { placement = 'bottom'; top = tr.bottom + MARGIN; }
    let left = tr.left + tr.width / 2 - pop.width / 2;
    left = Math.max(MARGIN, Math.min(left, vw - pop.width - MARGIN));
    top = Math.max(MARGIN, Math.min(top, vh - pop.height - MARGIN));
    setPos({ top, left, placement });
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e) {
      if (popRef.current && !popRef.current.contains(e.target) &&
          triggerRef.current && !triggerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    function onScroll() { setOpen(false); }
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, { capture: true });
    };
  }, [open]);

  return (
    <>
      <span ref={triggerRef} className="inline-flex" onClick={toggle} onPointerDown={e => e.stopPropagation()}>
        {tooltipText && !open ? <Tooltip text={tooltipText}>{children}</Tooltip> : children}
      </span>
      {open && createPortal(
        <div
          ref={popRef}
          className={`fixed z-[9999] bg-white border border-zinc-200 rounded-lg shadow-lg overflow-hidden transition-[opacity,transform] duration-150 ease-out ${
            pos.placement === 'top' ? 'origin-bottom' : 'origin-top'
          } ${shown ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
          style={{ top: pos.top, left: pos.left, display: 'inline-block' }}
          onPointerDown={e => e.stopPropagation()}
        >
          {options.map(({ label, tone }, i) => (
            <button
              key={i}
              type="button"
              onClick={e => { e.stopPropagation(); setOpen(false); onSelect(label); }}
              className={`block text-left px-3 py-2 text-xs font-medium transition ${
                tone === 'danger'
                  ? 'text-red-600 hover:bg-red-50'
                  : 'text-zinc-700 hover:bg-zinc-50'
              }${i > 0 ? ' border-t border-zinc-100' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
