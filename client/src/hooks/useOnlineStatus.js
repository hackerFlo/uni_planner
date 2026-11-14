import { useEffect, useState } from 'react';
import { onlineAfterEvent, readOnline } from '../utils/connectivity.js';

export function useOnlineStatus() {
  const [online, setOnline] = useState(() => readOnline(navigator));
  useEffect(() => {
    const sync = event => setOnline(current => onlineAfterEvent(event.type, current));
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => { window.removeEventListener('online', sync); window.removeEventListener('offline', sync); };
  }, []);
  return online;
}
