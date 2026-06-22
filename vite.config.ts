import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
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
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util', '@ffmpeg/core'],
  },
  // Emit .wasm files as URL assets so ?url imports resolve to same-origin paths
  assetsInclude: ['**/*.wasm'],
});
