/**
 * E2E-tester: Receptförnyelseflöde
 * Portad från test-ui.js (96 tester) + test-integration.js (32 tester)
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

test.describe('Formulär → beräkning → resultat', () => {

  test('OK-recept — fyll i formulär, resultat visas', async ({ page }) => {
    await page.fill('#medInput', 'Metformin 500 mg');
    await page.fill('#dateInput', '2025-01-01');
    await page.fill('#doseInput', '2');
    await page.fill('#amtInput', '100');
    await page.fill('#refInput', '3');
    await page.waitForTimeout(400);

    await expect(page.locator('.result-grid')).toBeVisible();
    await expect(page.locator('.copy-body')).not.toBeEmpty();
  });

  test('Ofullständigt — fyll bara läkemedelsnamn → status "Ej ifyllt"', async ({ page }) => {
    await page.fill('#medInput', 'Test');
    await page.waitForTimeout(400);
    await expect(page.locator('.result-empty-state')).toBeVisible();
  });

  test('Hög förbrukning — early-decision-box syns', async ({ page }) => {
    await page.fill('#medInput', 'Alvedon 500 mg');
    await page.fill('#dateInput', '2025-02-01');
    await page.fill('#doseInput', '1');
    await page.fill('#amtInput', '100');
    await page.fill('#refInput', '3');
    await page.fill('#leftInput', '0');
    await page.waitForTimeout(400);
    await expect(page.locator('.early-decision-box')).toBeVisible();
  });

  test('Lång period kvar → resultat visas', async ({ page }) => {
    await page.fill('#medInput', 'Losartan 50 mg');
    await page.fill('#dateInput', '2025-06-05');
    await page.fill('#doseInput', '1');
    await page.fill('#amtInput', '100');
    await page.fill('#refInput', '3');
    await page.fill('#leftInput', '290');
    await page.waitForTimeout(400);
    await expect(page.locator('.result-grid')).toBeVisible();
  });

  test('Early-decision-box alltid synlig vid giltigt resultat', async ({ page }) => {
    await page.fill('#medInput', 'Alvedon 500 mg');
    await page.fill('#dateInput', '2025-02-01');
    await page.fill('#doseInput', '1');
    await page.fill('#amtInput', '100');
    await page.fill('#refInput', '3');
    await page.fill('#leftInput', '0');
    await page.waitForTimeout(400);
    await expect(page.locator('.early-decision-box')).toBeVisible();
  });

  test('Kvarvarande doser — fyll i leftInput → faktisk förbrukning', async ({ page }) => {
    await page.fill('#medInput', 'Metformin 500 mg');
    await page.fill('#dateInput', '2025-01-01');
    await page.fill('#doseInput', '2');
    await page.fill('#amtInput', '100');
    await page.fill('#refInput', '3');
    await page.fill('#leftInput', '40');
    await page.waitForTimeout(400);
    await expect(page.locator('.result-grid')).toBeVisible();
  });

  test('Tidslinje — tlFill element finns', async ({ page }) => {
    await page.fill('#medInput', 'Metformin 500 mg');
    await page.fill('#dateInput', '2025-01-01');
    await page.fill('#doseInput', '2');
    await page.fill('#amtInput', '100');
    await page.fill('#refInput', '3');
    await page.waitForTimeout(400);
    const tlFill = page.locator('.tl-fill');
    await expect(tlFill).toHaveCount(1);
  });

  test('Metrics — 3 rader renderas', async ({ page }) => {
    await page.fill('#medInput', 'Metformin 500 mg');
    await page.fill('#dateInput', '2025-01-01');
    await page.fill('#doseInput', '2');
    await page.fill('#amtInput', '100');
    await page.fill('#refInput', '3');
    await page.waitForTimeout(400);
    const metrics = page.locator('.result-grid .rk');
    await expect(metrics).toHaveCount(3);
  });
});

test.describe('Copy-sektion och flikar', () => {

  test('Patientbrev genereras vid Förnya', async ({ page }) => {
    await page.fill('#medInput', 'Metformin 500 mg');
    await page.fill('#dateInput', '2025-01-01');
    await page.fill('#doseInput', '2');
    await page.fill('#amtInput', '100');
    await page.fill('#refInput', '3');
    await page.waitForTimeout(400);
    await page.click('.early-btn-yes');
    await page.waitForTimeout(200);
    const body = page.locator('.copy-body');
    await expect(body).toContainText('Vi förnyar');
  });

  test('Journal-flik — växla och verifiera text', async ({ page }) => {
    await page.fill('#medInput', 'Metformin 500 mg');
    await page.fill('#dateInput', '2025-01-01');
    await page.fill('#doseInput', '2');
    await page.fill('#amtInput', '100');
    await page.fill('#refInput', '3');
    await page.waitForTimeout(400);
    await page.click('.copy-tab:nth-child(2)');
    const body = page.locator('.copy-body');
    await expect(body).toContainText('Receptförnyelse');
  });
});

test.describe('Flera läkemedelskort', () => {

  test('Lägg till kort — formulär töms för nytt kort', async ({ page }) => {
    await page.fill('#medInput', 'Metformin 500 mg');
    await page.fill('#dateInput', '2025-01-01');
    await page.fill('#doseInput', '2');
    await page.fill('#amtInput', '100');
    await page.fill('#refInput', '3');
    await page.waitForTimeout(400);
    await page.click('.btn-add-med');
    await page.waitForTimeout(200);
    // Nytt kort ska ha tomt medInput
    await expect(page.locator('#medInput')).toHaveValue('');
  });

  test('Kortlista — status-dot visas', async ({ page }) => {
    await page.fill('#medInput', 'Metformin 500 mg');
    await page.fill('#dateInput', '2025-01-01');
    await page.fill('#doseInput', '2');
    await page.fill('#amtInput', '100');
    await page.fill('#refInput', '3');
    await page.waitForTimeout(400);
    const dot = page.locator('.med-item .status-dot');
    await expect(dot).toBeVisible();
  });
});

test.describe('Sjuksköterskevy', () => {

  test('Slå på ssk-vy → journalflik visas, ingen patientflik', async ({ page }) => {
    await page.click('.btn-nurse-toggle');
    await page.fill('#medInput', 'Metformin 500 mg');
    await page.fill('#dateInput', '2025-01-01');
    await page.fill('#doseInput', '2');
    await page.fill('#amtInput', '100');
    await page.fill('#refInput', '3');
    await page.waitForTimeout(400);
    // Ingen "Svar till patient"-flik i ssk-läge
    await expect(page.locator('.copy-tab').first()).toContainText('Journal');
    await expect(page.locator('.copy-tab').first()).not.toContainText('Svar till patient');
  });

  test('Ssk-vy — kryssa i checkboxar → innehåller adekvat', async ({ page }) => {
    await page.click('.btn-nurse-toggle');
    await page.locator('.nurse-checkbox input').first().check();
    await page.locator('.nurse-checkbox input').nth(1).check();
    await page.fill('#medInput', 'Metformin 500 mg');
    await page.fill('#dateInput', '2025-01-01');
    await page.fill('#doseInput', '2');
    await page.fill('#amtInput', '100');
    await page.fill('#refInput', '3');
    await page.waitForTimeout(400);
    await expect(page.locator('.copy-body')).toContainText('adekvat');
  });
});

test.describe('Långvarig förbrukning', () => {

  test('Fyll i period → resultat visas', async ({ page }) => {
    await page.click('[data-tab="longterm"]');
    await page.fill('#lt-med', 'Metformin 500 mg');
    await page.fill('#lt-dose', '2');
    await page.fill('#lt-start-0', '2024-01-01');
    await page.fill('#lt-total-0', '600');
    await page.fill('#lt-end-0', '2024-07-01');
    await page.waitForTimeout(500);
    await expect(page.locator('#lt-resGrid')).toBeVisible();
  });

  test('Långvarig — journaltext genereras', async ({ page }) => {
    await page.click('[data-tab="longterm"]');
    await page.fill('#lt-med', 'Metformin 500 mg');
    await page.fill('#lt-dose', '2');
    await page.fill('#lt-start-0', '2024-01-01');
    await page.fill('#lt-total-0', '600');
    await page.fill('#lt-end-0', '2024-07-01');
    await page.waitForTimeout(500);
    await expect(page.locator('#lt-copyBody')).toContainText('Förbrukningsanalys');
  });
});
