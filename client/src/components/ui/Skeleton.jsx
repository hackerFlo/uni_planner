import { useLayoutEffect, useRef } from 'react';
import { loadExamHint, skeletonBoardScroll } from '../../utils/paintHints';
import { loadBoardScroll, sessionStore } from '../../utils/boardScroll';
import { todayIso } from '../../utils/dates';

const TITLE_WIDTHS = ['w-4/5', 'w-3/5', 'w-2/3'];
const DAY_CARD_COUNTS = [3, 2, 3, 2, 2, 1, 1];
const SIDEBAR_CARD_COUNTS = [3, 2, 2];

export function SkeletonLine({ className = '' }) {
  return <div aria-hidden="true" className={`skeleton rounded-full ${className}`} />;
}

// AssignedCard's box: checkbox and list tag, title, then the action icons --
// 90px tall, so a real card replacing it does not shift the column.
export function SkeletonCard({ variant = 0 }) {
  return (
    <div
      aria-hidden="true"
      className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-lg p-2.5 shadow-sm"
    >
      <div className="h-[18px] mb-1.5 flex items-center gap-2">
        <div className="skeleton w-3.5 h-3.5 rounded" />
        <SkeletonLine className="h-3.5 w-10" />
      </div>
      <div className="h-[17px] flex items-center">
        <SkeletonLine className={`h-2.5 ${TITLE_WIDTHS[variant % TITLE_WIDTHS.length]}`} />
      </div>
      <div className="h-5 mt-[7px] flex items-center gap-3">
        {[0, 1, 2].map(i => <div key={i} className="skeleton w-3 h-3 rounded" />)}
      </div>
    </div>
  );
}

// TodoCard's single-line box in the sidebar: 46px tall.
export function SkeletonRow({ variant = 0 }) {
  return (
    <div
      aria-hidden="true"
      className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-lg p-3 shadow-sm"
    >
      <div className="h-5 flex items-center">
        <SkeletonLine className={`h-2.5 ${TITLE_WIDTHS[variant % TITLE_WIDTHS.length]}`} />
      </div>
    </div>
  );
}

function SkeletonDay({ cards }) {
  return (
    <div className="flex flex-col w-[180px] flex-shrink-0 md:w-auto md:flex-1 md:min-w-[180px] overflow-hidden rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <div className="px-3 py-3 border-b border-zinc-100 dark:border-zinc-800">
        <div className="h-4 flex items-center"><SkeletonLine className="h-2.5 w-8" /></div>
        <div className="h-8 flex items-center"><SkeletonLine className="h-4 w-14" /></div>
      </div>
      <div className="flex-1 p-2.5 min-h-[120px] space-y-2">
        {Array.from({ length: cards }, (_, i) => <SkeletonCard key={i} variant={i} />)}
      </div>
    </div>
  );
}

// Same order as Navbar: exam control (the next-exam pill when the last visit
// had one, else a plain button), archive, settings.
function SkeletonNavbar() {
  const examPill = loadExamHint();
  return (
    <div aria-hidden="true" className="h-14 flex-shrink-0 border-b border-zinc-100 dark:border-zinc-800 flex items-center px-3 sm:px-5 gap-2 sm:gap-4 bg-white dark:bg-zinc-900">
      <div className="flex items-center gap-2.5 mr-auto">
        <div className="skeleton w-7 h-7 rounded-lg" />
        <SkeletonLine className="hidden sm:block h-3 w-[74px]" />
      </div>
      {examPill ? <SkeletonLine className="h-8 w-20 sm:w-28" /> : <div className="skeleton w-8 h-8 rounded-lg" />}
      <div className="skeleton w-8 h-8 rounded-lg" />
      <div className="skeleton w-8 h-8 rounded-lg" />
    </div>
  );
}

function SkeletonSidebar() {
  return (
    <div aria-hidden="true" className="h-1/2 md:h-auto md:w-72 flex-shrink-0 md:flex-none overflow-hidden bg-zinc-50 dark:bg-zinc-900 order-2 md:order-1 border-t border-zinc-200 dark:border-zinc-800 md:border-t-0">
      <div className="p-5 space-y-6">
        {SIDEBAR_CARD_COUNTS.map((cards, list) => (
          <div key={list}>
            <div className="flex items-center justify-between mb-3 h-5">
              <div className="flex items-center gap-2">
                <div className="skeleton w-1.5 h-1.5 rounded-full" />
                <SkeletonLine className="h-2.5 w-20" />
              </div>
              <SkeletonLine className="h-3 w-3" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: cards }, (_, i) => <SkeletonRow key={i} variant={i + list} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function useSkeletonBoardScroll() {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const container = ref.current;
    const row = container?.firstElementChild;
    if (!row) return;
    container.scrollLeft = skeletonBoardScroll({
      columnLefts: [...row.children].map(col => col.offsetLeft - row.offsetLeft),
      maxScroll: container.scrollWidth - container.clientWidth,
      todayIndex: (new Date().getDay() + 6) % 7,
      saved: loadBoardScroll(sessionStore(), todayIso()),
    });
  }, []);
  return ref;
}

function SkeletonWeek() {
  const boardRef = useSkeletonBoardScroll();
  return (
    <main aria-hidden="true" className="h-1/2 md:h-auto md:flex-1 flex-shrink-0 overflow-hidden order-1 md:order-2">
      <div className="h-full flex flex-col p-5">
        <div className="flex items-center justify-between mb-4">
          <SkeletonLine className="h-2.5 w-20" />
          <div className="flex items-center gap-2">
            <SkeletonLine className="h-6 w-16 md:w-[124px]" />
            <SkeletonLine className="h-6 w-[65px] md:w-[101px]" />
          </div>
        </div>
        <div ref={boardRef} className="flex-1 min-h-0 overflow-hidden">
          <div className="flex gap-3 min-h-full min-w-full">
            {DAY_CARD_COUNTS.map((cards, day) => <SkeletonDay key={day} cards={cards} />)}
          </div>
        </div>
      </div>
    </main>
  );
}

// Mirrors PlannerPage: navbar, then a column on phones (week on top, tasks
// below) or a row on desktop (tasks left, week right).
export function PlannerSkeleton() {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-white dark:bg-zinc-900">
      <span role="status" className="sr-only">Loading planner…</span>
      <SkeletonNavbar />
      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
        <SkeletonWeek />
        <SkeletonSidebar />
      </div>
    </div>
  );
}
