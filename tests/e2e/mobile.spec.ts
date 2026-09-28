// Mobil (iPhone-storlek, pekskärm): allt syns utan sidledes scroll, flödet fungerar,
// tillgängligheten håller och rensningen i bakgrunden följer reglerna.
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-01T10:00:00') });
  await page.goto('/');
});

async function noSideScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
}

async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

async function fillSertralin(page: Page) {
  await page.getByRole('combobox', { name: 'Läkemedel och styrka' }).fill('Sertralin 50 mg');
  await page.keyboard.press('Escape');
  await page.getByLabel('Receptdatum', { exact: true }).fill('2025-12-10');
  await page.locator('#f-dose').fill('1');
  await page.locator('#f-pkg').fill('100');
  await page.getByLabel('Antal uttag').fill('3');
}

test('förnyelse på mobil: roll, resultat och texter utan sidledes scroll', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Sjuksköterska' })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Byt till mörkt tema' })).toBeInViewport();
  await fillSertralin(page);
  await expect(page.getByRole('region', { name: 'Resultat' })).toContainText('2026-10-05');
  await page.getByRole('button', { name: 'Förnya', exact: true }).click();
  await expect(page.getByLabel('Svar till patient')).toHaveValue(/räcker till 2027-04-01/);
  // "Ny patient" ligger sist, efter texterna.
  const copy = await page.getByRole('button', { name: 'Kopiera' }).boundingBox();
  const newPatient = await page.getByRole('button', { name: 'Ny patient' }).boundingBox();
  expect(newPatient!.y).toBeGreaterThan(copy!.y);
  // Fälten har minst 16 px text, så att iPhone inte zoomar vid tryck.
  expect(await page.locator('#f-dose').evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  await noSideScroll(page);
  await axe(page);
});

test('långtidsanalys på mobil: alla fält får plats', async ({ page }) => {
  await page.getByRole('tab', { name: 'Långtidsanalys' }).click();
  await page.locator('#lt-dose').fill('1');
  await page.getByLabel('Från, period 1', { exact: true }).fill('2026-01-01');
  await page.getByLabel('Till och med, period 1', { exact: true }).fill('2026-03-31');
  await page.getByLabel('Uttaget, period 1').fill('90');
  for (const name of ['Dos (enheter/dag)', 'Uttaget, period 1', 'Ta bort period 1', 'Rensa']) {
    const box = (await page.getByLabel(name, { exact: true }).or(page.getByRole('button', { name, exact: true })).first().boundingBox())!;
    expect(box.x + box.width, name).toBeLessThanOrEqual(390);
  }
  await expect(page.getByRole('region', { name: 'Resultat' })).toContainText('100 %');
  await noSideScroll(page);
  await axe(page);
});

test('appbyte: kort stund i bakgrunden behåller datan, 5 minuter eller mer rensar', async ({ page }) => {
  await fillSertralin(page);
  const hide = () => page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  const show = () => page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));

  await hide();
  await page.clock.runFor('04:00');
  await show();
  await expect(page.getByRole('combobox', { name: 'Läkemedel och styrka' })).toHaveValue('Sertralin 50 mg');

  await hide();
  await page.clock.runFor('05:00');
  await show();
  await expect(page.getByRole('combobox', { name: 'Läkemedel och styrka' })).toHaveValue('');
});

test('fliken stängs: allt rensas direkt', async ({ page }) => {
  await fillSertralin(page);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })));
  await expect(page.getByRole('combobox', { name: 'Läkemedel och styrka' })).toHaveValue('');
});
