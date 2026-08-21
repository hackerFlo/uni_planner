// Fails the build if the generated service worker can answer a navigation.
//
// AR-14's second lock: a worker that serves the document from its own precache
// hides the Cloudflare Access boundary, so an expired session can never present
// its sign-in screen, so /sw.js keeps being redirected, so the worker is never
// replaced. Each failure holds the other shut, and nothing errors -- the app
// simply stays on an old build for days.
//
// This regressed silently once. It runs as `postbuild`, so it fails the Docker
// image build too, not just a local one.
import { readFileSync } from 'node:fs';

const SW = new URL('../dist/sw.js', import.meta.url);
// Workbox resolves "/" to a precached index.html via its directoryIndex default,
// so dropping the NavigationRoute alone is not enough -- the document must not
// be in the manifest either. registerSW.js goes with it: a worker must never
// serve the bootstrap responsible for replacing that worker.
const FORBIDDEN_ROUTES = ['NavigationRoute', 'createHandlerBoundToURL'];
const FORBIDDEN_PRECACHE = ['index.html', 'registerSW.js'];

let sw;
try {
  sw = readFileSync(SW, 'utf8');
} catch {
  console.error(`[sw] cannot read ${SW.pathname} -- did the PWA plugin run?`);
  process.exit(1);
}

const failures = [
  ...FORBIDDEN_ROUTES.filter((t) => sw.includes(t)).map(
    (t) => `${t} is registered -- navigations would be served from the precache`,
  ),
  ...FORBIDDEN_PRECACHE.filter((f) => sw.includes(`url:"${f}"`)).map(
    (f) => `${f} is precached -- it must always be fetched through Access`,
  ),
];

if (failures.length > 0) {
  console.error('\n[sw] service worker would mask the Access boundary (AR-14):');
  for (const f of failures) console.error(`  - ${f}`);
  console.error('\n  Fix: keep navigateFallback: null and globIgnores in the');
  console.error('  workbox block of vite.config.js. Do not reintroduce them.\n');
  process.exit(1);
}

console.log('[sw] ok - no navigation route, bootstrap files not precached');
