import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import os from 'node:os';

/** Each jsdom fork is heavy; too many OOM on Windows, too few crawl. */
const workers = Math.max(2, Math.min(4, os.availableParallelism?.() ?? os.cpus().length));

export default defineConfig({
  plugins: [tsconfigPaths()],
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Forks isolate memory better than threads for Next page graphs on Windows.
    pool: 'forks',
    maxWorkers: workers,
    // Skip CSS parsing — we don't assert styles in unit tests.
    css: false,
  },
});
