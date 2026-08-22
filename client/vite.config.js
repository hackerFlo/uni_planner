import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  // Baked in by client/Dockerfile from the CI build args. Shown on the login
  // page so the deployed build can be identified without signing in.
  define: {
    __APP_VERSION__: JSON.stringify(process.env.VITE_APP_VERSION || pkg.version),
    __APP_COMMIT__: JSON.stringify(process.env.VITE_APP_COMMIT || 'dev'),
  },
  plugins: [
    react(),
    VitePWA({
      // Deliberately still 'autoUpdate'. Switching to 'prompt' would leave every
      // already-installed client on a *waiting* worker until all its tabs close,
      // because the currently-active worker is the one that decides to hand over.
      // So the worker keeps self-activating, and components/NewVersionNotice.jsx
      // watches for the handover to offer a reload -- visibility without the
      // stuck-worker trap.
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Uni Planner',
        short_name: 'Uni Planner',
        description: 'Weekly planner and todo manager for university',
        theme_color: '#6366f1',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // index.html is deliberately NOT precached. Dropping the NavigationRoute
        // below is necessary but not sufficient: precacheAndRoute still resolves
        // "/" to a precached index.html through Workbox's directoryIndex default,
        // so the document would keep being served from cache and the boundary
        // would stay masked. This is the client-side half of AR-14's rule that
        // index.html must never be cacheable. nginx's `try_files $uri $uri/
        // /index.html` serves deep links, so routing is unaffected.
        // registerSW.js goes with it. Together with index.html and sw.js these are
        // AR-14's three unhashed files -- the bootstrap chain that decides which
        // worker runs. Keeping all of it out of the precache means a worker can
        // never serve the code responsible for replacing that worker.
        globIgnores: ['index.html', 'registerSW.js'],
        // No NavigationRoute, deliberately -- this is AR-14's second lock.
        //
        // Answering navigations from the precache makes the service worker mask
        // the Cloudflare Access boundary: the browser never reaches the edge, so
        // an expired session cannot present its sign-in screen, so the session is
        // never renewed, so the /sw.js update check keeps being redirected and the
        // browser keeps the worker it has. Each failure holds the other shut.
        //
        // Letting navigations reach the network breaks that cycle at the cause and
        // needs no unauthenticated path through Access. Bypassing Access for
        // /sw.js would only fix the update check while leaving the boundary
        // masked, and a 401 instead of a 302 would fail the update check just the
        // same -- the redirect was never the real problem.
        //
        // Hashed /assets/ stay precached, so the only loss is offline navigation,
        // which is worth nothing here: every view needs an authenticated /api/
        // call. Do not reintroduce navigateFallback.
        navigateFallback: null,
      },
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
