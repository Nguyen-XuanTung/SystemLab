import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/integration/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/engine/**/*.ts', 'src/schemas/**/*.ts', 'src/features/scenarios/**/*.ts'],
      thresholds: {
        'src/engine/**/*.ts': {
          lines: 85,
          branches: 80,
          functions: 85,
          statements: 85,
        },
      },
    },
  },
});
