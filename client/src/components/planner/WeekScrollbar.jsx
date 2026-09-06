import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { thumbGeometry, scrollLeftForThumbLeft } from '../../utils/weekScroll';

// A visible, permanent scrollbar for the week row. It sits below the scroll
// container rather than inside it: the container hides both native bars (see
// weekScroll.js) and a second scrollable element would break dnd auto-scroll.

export default function WeekScrollbar({ scrollRef }) {
  const [metrics, setMetrics] = useState({ scrollLeft: 0, clientWidth: 0, scrollWidth: 0 });
  const [trackWidth, setTrackWidth] = useState(0);
  // A callback ref, not useRef: the track is unmounted whenever the row fits, so
  // the effect that observes it has to re-run when it comes back.
  const [track, setTrack] = useState(null);
  const [controlsId, setControlsId] = useState(null);
  const grabOffsetPx = useRef(null);
  const fallbackId = useId();

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setMetrics(prev => (
      prev.scrollLeft === el.scrollLeft && prev.clientWidth === el.clientWidth && prev.scrollWidth === el.scrollWidth
        ? prev
        : { scrollLeft: el.scrollLeft, clientWidth: el.clientWidth, scrollWidth: el.scrollWidth }
    ));
  }, [scrollRef]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    // aria-controls needs an id on a container this component does not render.
    if (!el.id) el.id = fallbackId;
    setControlsId(el.id);
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    // The row's own width changes without the container resizing (columns flex),
    // and the container resizes without the row changing (the sidebar resizer).
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => {
      el.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [scrollRef, measure, fallbackId]);

  useEffect(() => {
    if (!track) return undefined;
    setTrackWidth(track.clientWidth);
    const observer = new ResizeObserver(() => setTrackWidth(track.clientWidth));
    observer.observe(track);
    return () => observer.disconnect();
  }, [track]);

  const { visible, widthPx, leftPx } = thumbGeometry({ ...metrics, trackWidth });
  const maxScrollLeft = Math.max(0, metrics.scrollWidth - metrics.clientWidth);

  function startDrag(e) {
    if (!scrollRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    grabOffsetPx.current = e.clientX - e.currentTarget.getBoundingClientRect().left;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function dragTo(e) {
    const el = scrollRef.current;
    if (grabOffsetPx.current === null || !el || !track) return;
    el.scrollLeft = scrollLeftForThumbLeft({
      thumbLeftPx: e.clientX - track.getBoundingClientRect().left - grabOffsetPx.current,
      trackWidth,
      thumbWidthPx: widthPx,
      clientWidth: metrics.clientWidth,
      scrollWidth: metrics.scrollWidth,
    });
  }

  function endDrag(e) {
    if (grabOffsetPx.current === null) return;
    grabOffsetPx.current = null;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }

  // A click on the bare track pages one viewport toward where it landed.
  function pageTowardClick(e) {
    const el = scrollRef.current;
    if (!el || e.target !== e.currentTarget) return;
    const clickX = e.clientX - e.currentTarget.getBoundingClientRect().left;
    const direction = clickX < leftPx ? -1 : 1;
    el.scrollBy({ left: direction * el.clientWidth, behavior: 'smooth' });
  }

  if (!visible) return null;

  return (
    <div className="mt-2 flex-shrink-0">
      <div
        ref={setTrack}
        role="scrollbar"
        aria-orientation="horizontal"
        aria-label="Scroll the week"
        aria-controls={controlsId ?? undefined}
        aria-valuemin={0}
        aria-valuemax={Math.round(maxScrollLeft)}
        aria-valuenow={Math.round(Math.min(metrics.scrollLeft, maxScrollLeft))}
        onPointerDown={pageTowardClick}
        className="relative h-1.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800/60 cursor-pointer"
      >
        <div
          onPointerDown={startDrag}
          onPointerMove={dragTo}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{ left: `${leftPx}px`, width: `${widthPx}px`, touchAction: 'none' }}
          className="absolute top-0 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600 hover:bg-zinc-400 dark:hover:bg-zinc-500 transition-colors"
        />
      </div>
    </div>
  );
}
