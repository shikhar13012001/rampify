import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, './package.json'), 'utf-8')) as { version: string };

export default defineConfig({
  // Exposed to client code as the literal string, so analytics events can
  // report which build emitted them without a network round-trip. package.json's
  // version isn't currently bumped per release (still "0.0.0") — see
  // docs/validation/METRICS.md for that limitation.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    tailwindcss(),
    // Offline PWA. Deliberately minimal scope:
    //  - precache: the app shell (index.html + js/css chunks + svg). Small.
    //  - runtime CacheFirst: the heavy pieces the editor fetches on demand
    //    (ffmpeg-core wasm chunk under /assets, onnxruntime-web's wasm from
    //    jsdelivr, the demo clip). Marketing visitors never download them;
    //    anyone who has exported once can export again with no network.
    //  - navigation fallback ONLY for /editor: marketing routes stay plain
    //    network requests so the per-route prerendered HTML is what a real
    //    request (or a crawler) sees. Offline, /editor still opens.
    //  - /api and /_vercel are never touched by the worker.
    // The RIFE model (21 MB) is cached by opticalFlowWorker.ts in IndexedDB
    // already, so it is excluded here on purpose — no double caching.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null, // registered by src/lib/pwa.ts so the app can show install/update UI
      manifest: false,      // hand-written: public/manifest.webmanifest
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        globIgnores: ['**/models/**', '**/demo/**', '**/*.wasm', 'assets/*Worker*.js'],
        // ffmpeg-core.js is ~1 MB of glue; keep it out of precache and let
        // runtime caching pick it up together with its wasm.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackAllowlist: [/^\/editor(\/|$|\?)/],
        navigateFallbackDenylist: [/^\/api\//, /^\/_vercel\//, /^\/__\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin &&
              (url.pathname.endsWith('.wasm') || /\/assets\/.*Worker.*\.js$/.test(url.pathname) || url.pathname.startsWith('/demo/')),
            handler: 'CacheFirst',
            options: {
              cacheName: 'rampcut-engine-v1',
              expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('onnxruntime-web'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'rampcut-onnxruntime-v1',
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy':   'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
    // Proxy Firebase auth handler to our own origin (Option 3 from Firebase redirect
    // best practices). Needed because Chrome 115+ blocks cross-origin iframe storage
    // access, which Firebase's getRedirectResult relies on. With the proxy, authDomain
    // matches localhost:3000, so credentials stay same-origin.
    proxy: {
      '/__/auth': {
        target: 'https://rampify-720b4.firebaseapp.com',
        changeOrigin: true,
        secure: true,
      },
      '/__/firebase': {
        target: 'https://rampify-720b4.firebaseapp.com',
        changeOrigin: true,
        secure: true,
      },
      // Local-only: lets plain `npm run dev` (or the Skyvern harness) reach
      // real /api/* handlers by pointing a separate `vercel dev` instance at
      // this port — see test/skyvern/run_export_test.ps1. No-op otherwise:
      // with nothing listening on 3001, requests just fail closed exactly
      // like today's plain `npm run dev` (see exportLimits.ts's existing
      // fetch-failure fallbacks). Routing /api through vercel dev directly
      // (instead of this proxy) was tried first and made vite's own dev
      // module graph hang under vercel dev's proxy layer — this way only
      // the lightweight /api calls cross that boundary, not ffmpeg.wasm/
      // onnxruntime-web/the rest of the app's module graph.
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy':   'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  // Build all Web Workers as classic IIFE bundles (not ES modules).
  // Vite's default ES module workers fail in dev because the HMR client injected
  // into the worker uses importScripts(), which is unavailable in module workers.
  worker: {
    format: 'iife',
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util', '@ffmpeg/core'],
  },
  // Emit .wasm files as URL assets so ?url imports resolve to same-origin paths
  assetsInclude: ['**/*.wasm'],
  build: {
    rollupOptions: {
      output: {
        // Split heavy, stable vendor deps into their own chunks so they cache
        // independently of the app code. Improves repeat-visit LCP by avoiding
        // re-downloading React/Firebase when only app code changes.
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'react-vendor';
            }
            if (id.includes('firebase')) {
              return 'firebase-vendor';
            }
          }
        },
      },
    },
  },
});
