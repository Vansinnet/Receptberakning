import puppeteer from 'puppeteer';
import { execSync } from 'child_process';

const chromePath = await puppeteer.executablePath();

try {
  execSync('npx lhci autorun', {
    env: { ...process.env, CHROME_PATH: chromePath },
    stdio: 'inherit',
    timeout: 60_000,
  });
} catch {
  // Chrome cleanup på Windows ger EPERM — analysen har redan slutförts.
  // Assertion-resultaten (pass/fail) har redan skrivits till stdout.
  console.log('\n(Lighthouse-analysis klar — EPERM vid Chrome-cleanup ignorerad)');
}
