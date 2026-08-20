import { getLocalTimeZone, today } from '@internationalized/date';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Button,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  Calendar as CalendarRac,
  Heading,
  composeRenderProps,
} from 'react-aria-components';
import { cn } from '../../lib/cn';

function CalendarHeader() {
  return (
    <header className="flex w-full items-center gap-1 pb-1">
      <Button
        slot="previous"
        className="flex size-9 items-center justify-center rounded-lg text-zinc-400 dark:text-zinc-500 outline-offset-2 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-200 focus:outline-none data-[focus-visible]:outline data-[focus-visible]:outline-2 data-[focus-visible]:outline-indigo-300"
      >
        <ChevronLeft size={16} strokeWidth={2} />
      </Button>
      <Heading className="grow text-center text-sm font-semibold text-zinc-800 dark:text-zinc-100" />
      <Button
        slot="next"
        className="flex size-9 items-center justify-center rounded-lg text-zinc-400 dark:text-zinc-500 outline-offset-2 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-200 focus:outline-none data-[focus-visible]:outline data-[focus-visible]:outline-2 data-[focus-visible]:outline-indigo-300"
      >
        <ChevronRight size={16} strokeWidth={2} />
      </Button>
    </header>
  );
}

function CalendarGridComponent() {
  const now = today(getLocalTimeZone());

  return (
    <CalendarGrid>
      <CalendarGridHeader>
        {(day) => (
          <CalendarHeaderCell className="size-9 rounded-lg p-0 text-xs font-medium text-zinc-400 dark:text-zinc-500">
            {day}
          </CalendarHeaderCell>
        )}
      </CalendarGridHeader>
      <CalendarGridBody className="[&_td]:px-0">
        {(date) => (
          <CalendarCell
            date={date}
            className={cn(
              'relative flex size-9 items-center justify-center whitespace-nowrap rounded-lg border border-transparent p-0 text-sm font-normal text-zinc-900 dark:text-zinc-50 outline-offset-2 duration-150 [transition-property:color,background-color,border-radius,box-shadow] focus:outline-none data-[disabled]:pointer-events-none data-[unavailable]:pointer-events-none data-[focus-visible]:z-10 data-[hovered]:bg-zinc-100 data-[selected]:bg-indigo-500 data-[hovered]:text-zinc-700 data-[selected]:text-white data-[unavailable]:line-through data-[disabled]:opacity-30 data-[unavailable]:opacity-30 data-[focus-visible]:outline data-[focus-visible]:outline-2 data-[focus-visible]:outline-indigo-300',
              date.compare(now) === 0 &&
                'font-semibold text-indigo-600 ring-2 ring-inset ring-indigo-300 data-[selected]:text-white data-[selected]:ring-0',
            )}
          />
        )}
      </CalendarGridBody>
    </CalendarGrid>
  );
}

export default function Calendar({ className, ...props }) {
  return (
    <CalendarRac
      firstDayOfWeek="mon"
      {...props}
      className={composeRenderProps(className, (cls) => cn('w-fit', cls))}
    >
      <CalendarHeader />
      <CalendarGridComponent />
    </CalendarRac>
  );
}
