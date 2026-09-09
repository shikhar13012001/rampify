import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
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
  plugins: [react(), tailwindcss()],
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
