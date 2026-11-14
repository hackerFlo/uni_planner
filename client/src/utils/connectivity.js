export function readOnline(nav) {
  return nav?.onLine !== false;
}

export function onlineAfterEvent(type, current) {
  if (type === 'online') return true;
  if (type === 'offline') return false;
  return current;
}
