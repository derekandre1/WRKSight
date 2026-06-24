import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Prevent Vite from picking up the parent WRKSight postcss/tailwind config.
  css: { postcss: { plugins: [] } },
  test: {
    root: import.meta.dirname,
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
