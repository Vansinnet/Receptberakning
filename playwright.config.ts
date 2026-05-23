import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  snapshotDir: 'tests/visual-baseline/snapshots',
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 5173',
    port: 5173,
    timeout: 30000,
    reuseExistingServer: false,
  },
  use: {
    viewport: { width: 1280, height: 900 },
  },
});
