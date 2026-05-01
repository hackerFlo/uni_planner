import * as SelectPrimitive from '@radix-ui/react-select';
import { ChevronDown, Check } from 'lucide-react';

function SelectTrigger({ children }) {
  return (
    <SelectPrimitive.Trigger className="group flex h-9 w-full items-center justify-between gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition disabled:cursor-not-allowed disabled:opacity-50">
      <span className="flex-1 text-center">{children}</span>
      <SelectPrimitive.Icon asChild>
        <ChevronDown size={14} className="opacity-40 shrink-0 transition-transform duration-150 group-data-[state=open]:rotate-180" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({ children }) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position="popper"
        sideOffset={4}
        className="z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-1"
      >
        <SelectPrimitive.Viewport className="max-h-48 overflow-y-auto p-1">
          {children}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectItem({ value, children }) {
  return (
    <SelectPrimitive.Item
      value={value}
      className="relative flex w-full cursor-default select-none items-center rounded-md py-1.5 pl-3 pr-8 text-sm text-zinc-700 outline-none focus:bg-indigo-50 focus:text-indigo-700 data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check size={13} className="text-indigo-500" />
        </SelectPrimitive.ItemIndicator>
      </span>
    </SelectPrimitive.Item>
  );
}

function to12h(hhmm) {
  const [h, m] = (hhmm || '22:00').split(':').map(Number);
  const amPm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return { hour: String(hour12).padStart(2, '0'), minute: String(m).padStart(2, '0'), amPm };
}

function to24h(hour, minute, amPm) {
  let h = parseInt(hour, 10);
  if (amPm === 'AM' && h === 12) h = 0;
  if (amPm === 'PM' && h !== 12) h += 12;
  return `${String(h).padStart(2, '0')}:${minute}`;
}

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

export function TimePicker({ value = '22:00', onChange }) {
  const { hour, minute, amPm } = to12h(value);

  const emit = (h, m, ap) => onChange?.(to24h(h, m, ap));

  return (
    <div className="flex items-center gap-2">
      <div className="w-16">
        <SelectPrimitive.Root value={hour} onValueChange={h => emit(h, minute, amPm)}>
          <SelectTrigger><SelectPrimitive.Value /></SelectTrigger>
          <SelectContent>
            {HOURS.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
          </SelectContent>
        </SelectPrimitive.Root>
      </div>
      <span className="text-zinc-400 font-medium text-sm select-none">:</span>
      <div className="w-16">
        <SelectPrimitive.Root value={minute} onValueChange={m => emit(hour, m, amPm)}>
          <SelectTrigger><SelectPrimitive.Value /></SelectTrigger>
          <SelectContent>
            {MINUTES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </SelectPrimitive.Root>
      </div>
      <div className="w-16">
        <SelectPrimitive.Root value={amPm} onValueChange={ap => emit(hour, minute, ap)}>
          <SelectTrigger><SelectPrimitive.Value /></SelectTrigger>
          <SelectContent>
            <SelectItem value="AM">AM</SelectItem>
            <SelectItem value="PM">PM</SelectItem>
          </SelectContent>
        </SelectPrimitive.Root>
      </div>
    </div>
  );
}
