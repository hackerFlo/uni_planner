export const CHUNK_RELOAD_KEY = 'uniPlanner.chunkReloadAt';
export const CHUNK_RELOAD_WINDOW_MS = 30_000;

function reloadedRecently(storage, now) {
  try {
    const at = Number(storage.getItem(CHUNK_RELOAD_KEY));
    return Number.isFinite(at) && at > 0 && now - at < CHUNK_RELOAD_WINDOW_MS;
  } catch {
    // Unreadable storage cannot prove a reload did not just happen, so refuse to reload.
    return true;
  }
}

function markReloading(storage, now) {
  try {
    storage.setItem(CHUNK_RELOAD_KEY, String(now));
    return true;
  } catch {
    return false;
  }
}

// After a deploy a tab that is still running the old bundle asks for a chunk
// filename that no longer exists. index.html is never cached (AR-14), so one
// reload fetches the new bundle and the right names. The timestamp bounds that
// to one reload per window, so a chunk that is genuinely broken ends in the
// ErrorBoundary rather than a loop. Offline, a reload would only lose the page.
export async function loadWithReload(importer, { storage, reload, isOnline = () => true, now = Date.now }) {
  try {
    return await importer();
  } catch (error) {
    const at = now();
    if (!isOnline() || reloadedRecently(storage, at) || !markReloading(storage, at)) throw error;
    reload();
    return new Promise(() => {});
  }
}
