// Vite content-hashes everything under /assets/, so the set of asset URLs named
// by index.html is a fingerprint of the deployed build. Comparing the one the
// server is serving now against the one this page loaded from detects a client
// left behind by a deploy -- which a stale service worker can do indefinitely.
const ASSET_PATTERN = /\/assets\/[A-Za-z0-9._-]+/g;

export function parseAssetUrls(html) {
  return [...new Set(String(html ?? '').match(ASSET_PATTERN) ?? [])].sort();
}

// Deliberately asymmetric: the running document is allowed to hold *more*
// assets than index.html names, because Vite injects modulepreload links for
// lazily imported chunks as you navigate. Staleness is only ever "index.html
// names something this page does not have".
export function isStale(running, deployed) {
  // Either side unreadable means we cannot tell, and a false "you are out of
  // date" banner is worse than a missed one.
  if (!deployed?.length || !running?.length) return false;
  const loaded = new Set(running);
  return deployed.some((url) => !loaded.has(url));
}
