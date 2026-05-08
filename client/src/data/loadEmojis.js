let cache = null;
let pending = null;

export function loadEmojis() {
  if (cache) return Promise.resolve(cache);
  if (!pending) pending = import('./emojis.js').then(m => { cache = m.EMOJIS; return cache; });
  return pending;
}

export function getLoadedEmojis() {
  return cache;
}
