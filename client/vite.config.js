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
      // So the worker keeps self-activating, and components/UpdatePrompt.jsx
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
        // Without this the navigation fallback answers /api/health with the
        // precached index.html, so opening the health endpoint in a tab returns
        // the SPA and looks broken.
        navigateFallbackDenylist: [/^\/api\//],
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
