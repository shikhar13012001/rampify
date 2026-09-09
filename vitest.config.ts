import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  // Mirrors vite.config.ts's define so modules referencing __APP_VERSION__
  // (analytics.ts) can be imported under Vitest without a ReferenceError —
  // vitest.config.ts is a separate config and does not inherit vite.config.ts.
  define: {
    __APP_VERSION__: JSON.stringify('test'),
  },
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
