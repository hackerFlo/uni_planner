import { useOnlineStatus } from '../hooks/useOnlineStatus';

export default function OfflinePill() {
  if (useOnlineStatus()) return null;
  return (
    <div role="status" className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[190] px-3 py-1.5 rounded-full bg-amber-100 dark:bg-amber-950 border border-amber-300 dark:border-amber-800 text-xs font-medium text-amber-800 dark:text-amber-200 shadow-md pointer-events-none">
      Offline — changes can't be saved
    </div>
  );
}
