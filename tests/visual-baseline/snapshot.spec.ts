/**
 * 8.0 — Visuella snapshots från 3.0-appen.
 * Kör mot Kod/ serverad via npx serve.
 * Starta i separat terminal: npx serve Kod/ -p 5000
 * Kör sedan: npx playwright test tests/visual-baseline/snapshot.spec.ts --update-snapshots
 */
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5000';

test.use({
  // Fast klocka för reproducerbara snapshots
  locale: 'sv-SE',
});

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2025-03-15T10:00:00Z'));
  await page.goto(BASE);
  await page.waitForLoadState('networkidle');
});

test.describe('3.0 visuella snapshots', () => {

  test('tomt formulär', async ({ page }) => {
    await expect(page).toHaveScreenshot('empty-form.png', { fullPage: true });
  });

  test('receptförnyelse OK', async ({ page }) => {
    await page.fill('#medInput', 'Metformin 500 mg');
    await page.fill('#dateInput', '2025-01-01');
    await page.fill('#doseInput', '2');
    await page.fill('#amtInput', '100');
    await page.fill('#refInput', '3');
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('result-ok.png', { fullPage: true });
  });

  test('överförbrukning', async ({ page }) => {
    await page.fill('#medInput', 'Alvedon 500 mg');
    await page.fill('#dateInput', '2025-02-01');
    await page.fill('#doseInput', '1');
    await page.fill('#amtInput', '100');
    await page.fill('#refInput', '3');
    await page.fill('#leftInput', '0');
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('result-overuse.png', { fullPage: true });
  });

  test('för tidig förnyelse', async ({ page }) => {
    await page.fill('#medInput', 'Losartan 50 mg');
    await page.fill('#dateInput', '2025-01-01');
    await page.fill('#doseInput', '1');
    await page.fill('#amtInput', '100');
    await page.fill('#refInput', '12');
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('result-too-early.png', { fullPage: true });
  });

  test('sjuksköterskevy', async ({ page }) => {
    await page.click('#nurseViewToggle');
    await page.fill('#medInput', 'Metformin 500 mg');
    await page.fill('#dateInput', '2025-01-01');
    await page.fill('#doseInput', '2');
    await page.fill('#amtInput', '100');
    await page.fill('#refInput', '3');
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('nurse-view.png', { fullPage: true });
  });

  test('mörkt tema', async ({ page }) => {
    await page.selectOption('#themeSelect', 'dark');
    await expect(page).toHaveScreenshot('theme-dark.png', { fullPage: true });
  });

  test('två läkemedelskort', async ({ page }) => {
    await page.fill('#medInput', 'Metformin 500 mg');
    await page.fill('#dateInput', '2025-01-01');
    await page.fill('#doseInput', '2');
    await page.fill('#amtInput', '100');
    await page.fill('#refInput', '3');
    await page.click('#addMedBtn');
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot('two-cards.png', { fullPage: true });
  });

  test('långvarig förbrukning', async ({ page }) => {
    await page.click('[data-tab="longterm"]');
    await page.fill('#lt-med', 'Metformin 500 mg');
    await page.fill('#lt-dose', '2');
    await page.fill('#lt-start-0', '2024-01-01');
    await page.fill('#lt-total-0', '600');
    await page.fill('#lt-end-0', '2024-07-01');
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('longterm.png', { fullPage: true });
  });

});
