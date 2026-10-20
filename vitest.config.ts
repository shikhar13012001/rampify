import { configDefaults, defineConfig } from 'vitest/config';
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
    // Keep real FFmpeg subprocesses and SEO builds from competing with dozens
    // of forked test workers on the desktop validation machine.
    maxWorkers: 2,
    exclude: [...configDefaults.exclude, '.claude/**', '.build/**', '.audit-build/**', 'temp/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
