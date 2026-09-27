import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-01T10:00:00'));
  await page.goto('/');
});

async function fillMed(page: Page, o: { name: string; date: string; dose: string; pkg: string; refills: string }) {
  await page.getByRole('combobox', { name: 'Läkemedel och styrka' }).fill(o.name);
  await page.keyboard.press('Escape');
  await page.getByLabel('Receptdatum', { exact: true }).fill(o.date);
  await page.locator('#f-dose').fill(o.dose);
  await page.locator('#f-pkg').fill(o.pkg);
  await page.getByLabel('Antal uttag').fill(o.refills);
}

async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

test('förnyelse från början till kopierad text (T03 + T25)', async ({ page }) => {
  await fillMed(page, { name: 'Sertralin 50 mg', date: '20251210', dose: '1', pkg: '100', refills: '3' });
  const results = page.getByRole('region', { name: 'Resultat' });
  await expect(results).toContainText('2026-10-05');
  await expect(results).toContainText('4 dagar kvar');
  await expect(results).toContainText('5 st');
  await expect(results).toContainText('101,7 %');
  await expect(results).toContainText('Tar snart slut');

  await page.getByRole('button', { name: 'Förnya' }).click();
  await expect(page.getByLabel('Nyförskrivning')).toContainText('2 förp. à 100 st');
  await expect(page.getByLabel('Nyförskrivning')).toContainText('178 st för 178 dagar, 2026-10-06 – 2027-04-01');

  const text = page.getByLabel('Svar till patient');
  await expect(text).toHaveValue(/räcker till 2027-04-01/);
  await page.getByRole('button', { name: 'Kopiera' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Kopierad' })).toBeVisible();

  await page.getByRole('tab', { name: 'Journalanteckning' }).click();
  await expect(page.locator('#text-body')).toHaveValue(/Åtgärd: Förnyat, 2 förp\. à 100 st/);
  await axe(page);
});


test('fältfel visas vid fältet (T20)', async ({ page }) => {
  await fillMed(page, { name: 'Sertralin 50 mg', date: '20261002', dose: '1', pkg: '100', refills: '3' });
  await expect(page.getByText('Datumet är satt i framtiden.')).toBeVisible();
  await expect(page.getByLabel('Receptdatum', { exact: true })).toHaveAttribute('aria-invalid', 'true');
});

test('sjuksköterskeläge: journaltext med tre lägen', async ({ page }) => {
  await fillMed(page, { name: 'Sertralin 50 mg', date: '2025-12-10', dose: '1', pkg: '100', refills: '3' });
  await page.getByRole('button', { name: 'Sjuksköterska' }).click();
  await expect(page.getByRole('button', { name: 'Förnya' })).toHaveCount(0);
  const journal = page.locator('#text-body');
  await expect(journal).toHaveValue(/Vitalparametrar har inte bedömts/);
  await page.getByRole('radio', { name: 'Normala' }).click();
  await expect(journal).toHaveValue(/Vitalparametrar bedöms normala/);
  await axe(page);
});

test('flera läkemedel och ny patient', async ({ page }) => {
  await fillMed(page, { name: 'Sertralin 50 mg', date: '2025-12-10', dose: '1', pkg: '100', refills: '3' });
  await page.getByRole('button', { name: 'Lägg till läkemedel' }).click();
  await fillMed(page, { name: 'Melatonin 2 mg', date: '2026-06-01', dose: '1', pkg: '30', refills: '1' });
  await expect(page.locator('.med-list')).toContainText('Slut sedan länge');
  await expect(page.getByLabel('Svar till patient')).toHaveValue(/följande läkemedel: Sertralin 50 mg, Melatonin 2 mg/);
  await page.getByRole('button', { name: 'Ny patient' }).click();
  await page.getByRole('button', { name: 'Rensa', exact: true }).click();
  await expect(page.locator('.med-item')).toHaveCount(1);
  await expect(page.getByRole('combobox', { name: 'Läkemedel och styrka' })).toHaveValue('');
});

test('långtidsanalys med överlapp (T31) och mörkt tema', async ({ page }) => {
  await page.getByRole('tab', { name: 'Långtidsanalys' }).click();
  await page.locator('#lt-med').fill('Metylfenidat 36 mg');
  await page.locator('#lt-dose').fill('1');
  await page.getByLabel('Från, period 1', { exact: true }).fill('20260101');
  await page.getByLabel('Till och med, period 1', { exact: true }).fill('20260415');
  await page.getByLabel('Uttaget, period 1', { exact: true }).fill('105');
  await page.getByRole('button', { name: 'Lägg till period' }).click();
  await page.getByLabel('Från, period 2', { exact: true }).fill('20260401');
  await page.getByLabel('Till och med, period 2', { exact: true }).fill('20260630');
  await page.getByLabel('Uttaget, period 2', { exact: true }).fill('91');
  const res = page.getByRole('region', { name: 'Resultat' });
  await expect(res).toContainText('Perioderna överlappar');
  await expect(res).toContainText('181 dagar');
  await expect(res).toContainText('108,3 %');
  await page.getByRole('button', { name: 'Byt till mörkt tema' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.waitForTimeout(200);
  await axe(page);
});

test('receptdatum kan väljas i kalendern', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Läkemedel och styrka' }).fill('Sertralin 50 mg');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Välj datum i kalender' }).first()).toBeVisible();
  // Kalendern är webbläsarens egen; här väljs datumet via det underliggande datumfältet.
  await page.locator('.date-field__native').first().fill('2025-12-10');
  await expect(page.getByLabel('Receptdatum', { exact: true })).toHaveValue('2025-12-10');
  await page.locator('#f-dose').fill('1');
  await page.locator('#f-pkg').fill('100');
  await page.getByLabel('Antal uttag').fill('3');
  await expect(page.getByRole('region', { name: 'Resultat' })).toContainText('2026-10-05');
});
