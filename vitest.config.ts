import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';

export default defineConfig({
  plugins: [svelte()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**'],
      thresholds: { lines: 70, functions: 70 },
      reporter: ['text', 'lcov'],
    },
  },
  resolve: {
    alias: {
      '$lib': path.resolve(__dirname, 'src/lib'),
    },
    conditions: ['browser'],
  },
});
