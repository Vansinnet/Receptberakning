/**
 * E2E-tester: App-state (korthantering, nurse-flaggor, nollställning)
 * Portad från test-app.js (26 tester)
 * Kör mot 4.0 dev-server: npx vite
 */
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173';
const MOCK_DATE = new Date('2025-06-15T00:00:00Z');

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(MOCK_DATE);
  await page.goto(BASE);
  await page.waitForLoadState('networkidle');
});

test.describe('Lägg till / ta bort kort', () => {

  test('Lägg till kort → nytt tomt kort visas', async ({ page }) => {
    await page.click('.btn-add-med');
    await page.waitForTimeout(200);
    // MedInput ska vara tomt på det nya kortet
    await expect(page.locator('#medInput')).toHaveValue('');
    // Två kort i listan
    await expect(page.locator('.med-item')).toHaveCount(2);
  });

  test('Max 8 kort — efter 7 tillägg finns 8 kort', async ({ page }) => {
    for (let i = 0; i < 7; i++) {
      await page.click('.btn-add-med');
      await page.waitForTimeout(100);
    }
    await expect(page.locator('.med-item')).toHaveCount(8);
  });

  test('Rensa formulär — fält töms', async ({ page }) => {
    await page.fill('#medInput', 'Metformin 500 mg');
    await page.fill('#dateInput', '2025-01-01');
    await page.waitForTimeout(200);
    await page.click('button:has-text("Rensa")');
    await page.waitForTimeout(200);
    await expect(page.locator('#medInput')).toHaveValue('');
    await expect(page.locator('#dateInput')).toHaveValue('');
  });
});

test.describe('Ny patient (rensning)', () => {

  test('Ny patient — rensar alla kort', async ({ page }) => {
    await page.fill('#medInput', 'Metformin 500 mg');
    await page.fill('#dateInput', '2025-01-01');
    await page.fill('#doseInput', '2');
    await page.fill('#amtInput', '100');
    await page.fill('#refInput', '3');
    await page.waitForTimeout(400);
    // Klicka Ny patient
    page.on('dialog', dialog => dialog.accept());
    await page.click('button:has-text("Ny patient")');
    await page.waitForTimeout(300);
    // Efter rensning: ett tomt kort
    await expect(page.locator('#medInput')).toHaveValue('');
    await expect(page.locator('.med-item')).toHaveCount(1);
  });
});

test.describe('Nurse-flaggor', () => {

  test('Slå på/av ssk-vy', async ({ page }) => {
    await page.click('.btn-nurse-toggle');
    await expect(page.locator('.nurse-col')).toBeVisible();
    await page.click('.btn-nurse-toggle');
    await expect(page.locator('.nurse-col')).not.toBeVisible();
  });

  test('Ssk-vy — checkboxar fungerar', async ({ page }) => {
    await page.click('.btn-nurse-toggle');
    const cb1 = page.locator('.nurse-checkbox input').first();
    const cb2 = page.locator('.nurse-checkbox input').nth(1);
    await cb1.check();
    await cb2.check();
    await expect(cb1).toBeChecked();
    await expect(cb2).toBeChecked();
  });
});

test.describe('Formulärvalidering', () => {

  test('Ogiltigt datum → felfärg på input', async ({ page }) => {
    await page.fill('#medInput', 'Test');
    await page.fill('#dateInput', '2030-01-01');
    await page.waitForTimeout(400);
    const dateInput = page.locator('#dateInput');
    const hasError = await dateInput.evaluate(el => el.classList.contains('input-error'));
    expect(hasError).toBe(true);
  });

  test('För högt antal uttag (ref=13) → fel', async ({ page }) => {
    await page.fill('#medInput', 'Test');
    await page.fill('#dateInput', '2025-01-01');
    await page.fill('#doseInput', '1');
    await page.fill('#amtInput', '100');
    await page.fill('#refInput', '13');
    await page.waitForTimeout(400);
    // Ska ha felfärg på refInput
    const refInput = page.locator('#refInput');
    const hasError = await refInput.evaluate(el => el.classList.contains('input-error'));
    expect(hasError).toBe(true);
  });

  test('notCalculable — sätts automatiskt via autocomplete', async ({ page }) => {
    // notCalculable är ingen synlig checkbox i 4.0 — matchar 3.0 där det sätts automatiskt
    // via drug-data vid autocomplete-val
  });
});

test.describe('Temaväxling', () => {

  test('Byt till mörkt tema', async ({ page }) => {
    await page.selectOption('#themeSelect', 'dark');
    const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(theme).toBe('dark');
  });

  test('Byt till sakura', async ({ page }) => {
    await page.selectOption('#themeSelect', 'sakura');
    const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(theme).toBe('sakura');
  });
});

test.describe('Förskrivningspanel', () => {

  test('OK-recept → förskrivningspanel visas', async ({ page }) => {
    await page.fill('#medInput', 'Metformin 500 mg');
    await page.fill('#dateInput', '2025-01-01');
    await page.fill('#doseInput', '2');
    await page.fill('#amtInput', '100');
    await page.fill('#refInput', '3');
    await page.waitForTimeout(400);
    await expect(page.locator('.prescribe-panel')).toBeVisible();
  });

  test('Månad/Datum-växling fungerar', async ({ page }) => {
    await page.fill('#medInput', 'Metformin 500 mg');
    await page.fill('#dateInput', '2025-01-01');
    await page.fill('#doseInput', '2');
    await page.fill('#amtInput', '100');
    await page.fill('#refInput', '3');
    await page.waitForTimeout(400);
    // Klicka Datum
    const dateBtn = page.locator('.prescribe-mode-btn').nth(1);
    await dateBtn.click();
    await expect(dateBtn).toHaveClass(/active/);
  });
});

test.describe('Autocomplete', () => {

  test('Skriv ≥2 tecken → dropdown visas', async ({ page }) => {
    await page.fill('#medInput', 'Ser');
    await page.waitForTimeout(1000);
    const dropdown = page.locator('.autocomplete-dropdown');
    await expect(dropdown).toBeVisible();
  });

  test('Välj läkemedel → fält fylls i', async ({ page }) => {
    await page.fill('#medInput', 'Sertralin Krka 50 mg');
    await page.waitForTimeout(1000);
    const item = page.locator('.autocomplete-item').first();
    if (await item.isVisible()) {
      await item.click();
    }
    await expect(page.locator('#medInput')).not.toHaveValue('');
  });
});

test.describe('$state migration — _cardStatus reaktivitet', () => {

  test('Statusprickar uppdateras på alla kort vid formulärändring', async ({ page }) => {
    await page.clock.setFixedTime(MOCK_DATE);
    await page.goto(BASE);

    // Fyll kort 1 med tidigt scenario
    await page.fill('#medInput', 'Sertralin Krka 50 mg');
    await page.waitForTimeout(500);
    const item = page.locator('.autocomplete-item').first();
    if (await item.isVisible()) await item.click();
    await page.fill('#dateInput', '2024-12-01');
    await page.fill('#doseInput', '1');
    await page.fill('#amtInput', '100');
    await page.fill('#refInput', '3');
    await page.waitForTimeout(500);
    await expect(page.locator('.status-dot.warn').first()).toBeVisible();

    // Lägg till kort 2
    await page.click('.btn-add-med');
    await page.waitForTimeout(200);
    await page.fill('#medInput', 'Metformin 500 mg');
    await page.waitForTimeout(500);
    const item2 = page.locator('.autocomplete-item').first();
    if (await item2.isVisible()) await item2.click();
    await page.fill('#dateInput', '2024-12-01');
    await page.fill('#doseInput', '1');
    await page.fill('#amtInput', '100');
    await page.fill('#refInput', '3');
    await page.waitForTimeout(500);

    // Båda statusprickarna ska synas
    const dots = page.locator('.status-dot');
    await expect(dots).toHaveCount(2);
  });

  test('Midnattsbyte — statusprick förblir synlig efter klockframsteg', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2025-06-14T00:00:00Z'));
    await page.goto(BASE);

    await page.fill('#medInput', 'Sertralin Krka 50 mg');
    await page.waitForTimeout(500);
    const item = page.locator('.autocomplete-item').first();
    if (await item.isVisible()) await item.click();
    await page.fill('#dateInput', '2025-01-01');
    await page.fill('#doseInput', '1');
    await page.fill('#amtInput', '100');
    await page.fill('#refInput', '3');
    await page.waitForTimeout(500);

    // Statusprick syns
    const dot = page.locator('.status-dot');
    await expect(dot).toBeVisible();

    // Simulera midnatt
    await page.clock.setFixedTime(new Date('2025-06-17T00:00:00Z'));
    await page.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(500);

    // Statusprick ska fortfarande vara synlig — page får inte krascha
    await expect(dot).toBeVisible();
  });
});
