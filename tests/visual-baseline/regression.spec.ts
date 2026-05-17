/**
 * 8.4 — Visuell regression mot 3.0-baslinjen.
 * Samma 8 scenarion som snapshot.spec.ts, mot 4.0 dev-server.
 */
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173';

test.use({
  locale: 'sv-SE',
});

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2025-03-15T10:00:00Z'));
  await page.goto(BASE);
  await page.waitForLoadState('networkidle');
});

test.describe('4.0 visuell regression mot 3.0', () => {

  test('tomt formulär', async ({ page }) => {
    await expect(page).toHaveScreenshot('empty-form.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });

  test('receptförnyelse OK', async ({ page }) => {
    await page.fill('#medInput', 'Metformin 500 mg');
    await page.fill('#dateInput', '2025-01-01');
    await page.fill('#doseInput', '2');
    await page.fill('#amtInput', '100');
    await page.fill('#refInput', '3');
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('result-ok.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });

  test('överförbrukning', async ({ page }) => {
    await page.fill('#medInput', 'Alvedon 500 mg');
    await page.fill('#dateInput', '2025-02-01');
    await page.fill('#doseInput', '1');
    await page.fill('#amtInput', '100');
    await page.fill('#refInput', '3');
    await page.fill('#leftInput', '0');
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('result-overuse.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });

  test('för tidig förnyelse', async ({ page }) => {
    await page.fill('#medInput', 'Losartan 50 mg');
    await page.fill('#dateInput', '2025-01-01');
    await page.fill('#doseInput', '1');
    await page.fill('#amtInput', '100');
    await page.fill('#refInput', '12');
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('result-too-early.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });

  test('sjuksköterskevy', async ({ page }) => {
    await page.click('.btn-nurse-toggle');
    await page.fill('#medInput', 'Metformin 500 mg');
    await page.fill('#dateInput', '2025-01-01');
    await page.fill('#doseInput', '2');
    await page.fill('#amtInput', '100');
    await page.fill('#refInput', '3');
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('nurse-view.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });

  test('mörkt tema', async ({ page }) => {
    await page.selectOption('#themeSelect', 'dark');
    await expect(page).toHaveScreenshot('theme-dark.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });

  test('två läkemedelskort', async ({ page }) => {
    await page.fill('#medInput', 'Metformin 500 mg');
    await page.fill('#dateInput', '2025-01-01');
    await page.fill('#doseInput', '2');
    await page.fill('#amtInput', '100');
    await page.fill('#refInput', '3');
    await page.click('.btn-add-med');
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot('two-cards.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });

  test('långvarig förbrukning', async ({ page }) => {
    await page.click('[data-tab="longterm"]');
    await page.fill('#lt-med', 'Metformin 500 mg');
    await page.fill('#lt-dose', '2');
    await page.fill('#lt-start-0', '2024-01-01');
    await page.fill('#lt-total-0', '600');
    await page.fill('#lt-end-0', '2024-07-01');
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('longterm.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });

});
