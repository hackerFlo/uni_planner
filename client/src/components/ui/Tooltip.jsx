import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useIsMobile from '../../hooks/useIsMobile';
import { useAnyModalOpen } from '../../context/ModalContext';

export function recurrenceLabel(days, pattern) {
  if (pattern === 'weekdays') return 'Repeats on weekdays';
  if (pattern === 'weekends') return 'Repeats on weekends';
  if (days === 1) return 'Repeats daily';
  if (days === 7) return 'Repeats weekly';
  return `Repeats every ${days} days`;
}

const SHOW_DELAY = 800;
const HIDE_FADE = 150;
const MARGIN = 8;

function isInsideModal(el) {
  return !!el?.closest('[data-modal-root]');
}

export default function Tooltip({ text, children, className = '', onlyWhenTruncated = false }) {
  const isMobile = useIsMobile();
  const anyModalOpen = useAnyModalOpen();
  const triggerRef = useRef(null);
  const tipRef = useRef(null);
  const showTimer = useRef(null);
  const hideTimer = useRef(null);
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, placement: 'top' });

  function show() {
    clearTimeout(hideTimer.current);
    if (mounted) return;
    if (anyModalOpen && !isInsideModal(triggerRef.current)) return;
    if (onlyWhenTruncated) {
      const el = triggerRef.current?.firstElementChild ?? triggerRef.current;
      if (el && el.scrollWidth <= el.clientWidth + 1) return;
    }
    showTimer.current = setTimeout(() => setMounted(true), SHOW_DELAY);
  }

  function hide() {
    clearTimeout(showTimer.current);
    setShown(false);
    hideTimer.current = setTimeout(() => setMounted(false), HIDE_FADE);
  }

  useEffect(() => {
    if (!mounted) return;
    if (anyModalOpen && !isInsideModal(triggerRef.current)) {
      setMounted(false);
      return;
    }
    const tr = triggerRef.current.getBoundingClientRect();
    const cx = tr.left + tr.width / 2;
    const cy = tr.top + tr.height / 2;
    const topEl = document.elementFromPoint(cx, cy);
    if (topEl && !triggerRef.current.contains(topEl)) {
      setMounted(false);
      return;
    }
    const tip = tipRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let placement = 'top';
    let top = tr.top - tip.height - MARGIN;
    if (top < MARGIN) {
      placement = 'bottom';
      top = tr.bottom + MARGIN;
    }
    let left = tr.left + tr.width / 2 - tip.width / 2;
    left = Math.max(MARGIN, Math.min(left, vw - tip.width - MARGIN));
    top = Math.max(MARGIN, Math.min(top, vh - tip.height - MARGIN));
    setPos({ top, left, placement });
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [mounted, text, anyModalOpen]);

  useEffect(() => () => {
    clearTimeout(showTimer.current);
    clearTimeout(hideTimer.current);
  }, []);

  if (isMobile) return <span className={`inline-flex ${className}`}>{children}</span>;

  return (
    <>
      <span
        ref={triggerRef}
        className={`inline-flex ${className}`}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>
      {mounted && createPortal(
        <span
          ref={tipRef}
          className={`pointer-events-none fixed z-[9999] bg-zinc-800 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg shadow-lg whitespace-nowrap transition-[opacity,transform] duration-150 ease-out ${
            pos.placement === 'top' ? 'origin-bottom' : 'origin-top'
          } ${
            shown
              ? 'opacity-100 scale-100'
              : 'opacity-0 scale-95'
          }`}
          style={{ top: pos.top, left: pos.left }}
        >
          {text}
        </span>,
        document.body,
      )}
    </>
  );
}
