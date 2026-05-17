import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  snapshotDir: 'tests/visual-baseline/snapshots',
  use: {
    viewport: { width: 1280, height: 900 },
  },
});
