import { defineConfig } from '@playwright/test';

// PW_CHROMIUM_PATH kan pekas mot en förinstallerad Chromium (t.ex. i CI-miljöer utan nedladdning).
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: './tests/e2e',
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 5173',
    port: 5173,
    timeout: 30000,
    reuseExistingServer: false,
  },
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1280, height: 720 },
    permissions: ['clipboard-read', 'clipboard-write'],
    // Utan övergångar (app.css har dem bara vid prefers-reduced-motion: no-preference), så att
    // axe aldrig mäter kontrasten mitt i en färgövergång, t.ex. när Förnya just tryckts.
    reducedMotion: 'reduce',
    launchOptions: { executablePath },
  },
});
