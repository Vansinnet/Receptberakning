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
  // Förvalt: 7 månader.
  await expect(page.getByLabel('Förskriv för')).toHaveValue('7');
  await expect(page.getByLabel('Nyförskrivning')).toContainText('3 förp. à 100 st');
  await expect(page.getByLabel('Nyförskrivning')).toContainText('208 st för 208 dagar, 2026-10-06 – 2027-05-01');
  // T25 gäller 6 månader.
  await page.getByLabel('Förskriv för').selectOption('6');
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

/** Skriver ett uttag på rad i (räknat från 0): datum, antal och, om den anges, styrka. */
async function fillLt(page: Page, i: number, date: string, count: string, strength?: string) {
  await page.getByLabel(`Datum, uttag ${i + 1}`, { exact: true }).fill(date);
  await page.getByLabel(`Antal, uttag ${i + 1}`, { exact: true }).fill(count);
  if (strength !== undefined) await page.getByLabel(`Styrka i mg, uttag ${i + 1}`, { exact: true }).fill(strength);
}

async function pickLtDrug(page: Page, q: string, name: string) {
  const lt = page.locator('#view-longterm');
  await lt.getByRole('combobox', { name: 'Läkemedel och styrka' }).fill(q);
  await lt.getByRole('listbox', { name: 'Förslag från läkemedelsdatabasen' }).getByRole('option', { name: new RegExp(name) }).first().click();
}

test('långtidsanalys: uttag med Enter, maxdos och mörkt tema (T34)', async ({ page }) => {
  await page.getByRole('tab', { name: 'Långtidsanalys' }).click();
  await pickLtDrug(page, 'imovane 7,5', 'Imovane 7,5 mg');
  await expect(page.getByText('Narkotika klass V', { exact: true })).toBeVisible();
  // Styrkan hämtas från läkemedlet; Enter i antal ger en ny rad och flyttar fokus till dess datum.
  const dates = ['2026-06-01', '2026-07-01', '2026-07-26', '2026-08-15', '2026-08-30'];
  for (const [i, d] of dates.entries()) {
    await fillLt(page, i, d, '30');
    await expect(page.getByLabel(`Styrka i mg, uttag ${i + 1}`, { exact: true })).toHaveValue('7,5');
    if (i < dates.length - 1) {
      await page.getByLabel(`Antal, uttag ${i + 1}`, { exact: true }).press('Enter');
      await expect(page.getByLabel(`Datum, uttag ${i + 2}`, { exact: true })).toBeFocused();
    }
  }
  const res = page.getByRole('region', { name: 'Resultat' });
  // Utan maxdos: bara mg per dag.
  await expect(res).toContainText('10,00 mg/dag');
  await expect(res).not.toContainText('av maxdos');
  await page.getByLabel('Maxdos', { exact: true }).fill('1');
  await expect(res).toContainText('133,3 % av maxdos');
  await expect(res).toContainText('9,22 mg/dag');
  await expect(res).toContainText('123 % av maxdos');
  await expect(res.locator('.tile').nth(2)).toContainText('30 st');
  await expect(res.locator('tbody tr')).toHaveCount(5);
  await expect(res.locator('tbody tr').nth(3)).toContainText('15,00');
  await expect(res.locator('tbody tr').nth(4)).toContainText('32 till idag');
  await expect(page.locator('.lt-view textarea')).toHaveValue(/Mg per dag mellan uttagen: 7,50 – 9,00 – 11,25 – 15,00\./);
  await axe(page);
  await page.getByRole('button', { name: 'Byt till mörkt tema' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.waitForTimeout(200);
  await axe(page);
});

test('snabbare inmatning: fokus till receptdatum, ÅÅMMDD och dosuttryck', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Läkemedel och styrka' }).fill('Sertralin 50');
  await page.getByRole('listbox', { name: 'Förslag från läkemedelsdatabasen' }).getByRole('option').first().click();
  const date = page.getByLabel('Receptdatum', { exact: true });
  await expect(date).toBeFocused();

  // ÅÅMMDD skrivs tecken för tecken och kompletteras när fältet lämnas.
  await page.keyboard.type('251210');
  await expect(date).toHaveValue('2512-10');
  await page.keyboard.press('Tab');
  await expect(date).toHaveValue('2025-12-10');

  // Ensiffrig månad med bindestreck.
  await date.fill('');
  await expect(date).toHaveValue('');
  await date.pressSequentially('2025-9-5');
  await expect(date).toHaveValue('2025-9-5');
  await date.press('Enter');
  await expect(date).toHaveValue('2025-09-05');
  await date.fill('2025-12-10');

  // Dosuttryck visas omräknat och ersätts med talet när fältet lämnas.
  const dose = page.locator('#f-dose');
  await dose.fill('1+0+1');
  await expect(page.locator('#hint-dose')).toHaveText('= 2 st per dag');
  await page.locator('#f-pkg').fill('100');
  await expect(dose).toHaveValue('2');
  await page.getByLabel('Antal uttag').fill('3');
  await expect(page.getByRole('region', { name: 'Resultat' })).toContainText('mot ordinerat 2 st/dag');

  await dose.fill('5 ml');
  await expect(page.getByText('Skriv dosen som ett tal, t.ex. 2, 1x2 eller 1+0+1.')).toBeVisible();
  await axe(page);
});

test('långtidsanalys: två styrkor, 2x15 och maxdos i mg (T35); utskriften är en egen rapport', async ({ page }) => {
  await page.getByRole('tab', { name: 'Långtidsanalys' }).click();
  await pickLtDrug(page, 'imovane 7,5', 'Imovane 7,5 mg');
  await fillLt(page, 0, '2026-08-01', '30');
  await page.getByRole('button', { name: 'Lägg till uttag' }).click();
  await fillLt(page, 1, '2026-08-31', '2x15', '5');
  await page.getByRole('button', { name: 'Lägg till uttag' }).click();
  await fillLt(page, 2, '2026-09-20', '30', '7,5');
  // Maxdos i st går inte med två styrkor; i mg går det.
  await page.getByLabel('Maxdos', { exact: true }).fill('1');
  await expect(page.getByText('Ange maxdosen i mg när uttagen har olika styrkor.')).toBeVisible();
  await page.getByLabel('Enhet för maxdos').selectOption('mg');
  await page.getByLabel('Maxdos', { exact: true }).fill('7,5');
  const res = page.getByRole('region', { name: 'Resultat' });
  await expect(res.locator('.tile').first()).toContainText('7,50 mg/dag');
  await expect(res.locator('.tile').first()).toContainText('100 % av maxdos');
  await expect(res).toContainText('Uttag i styrkorna 5 mg och 7,5 mg, räknat i mg.');
  await expect(res.locator('tbody tr').nth(1)).toContainText('30 × 5 mg');
  await expect(res.locator('tbody tr').nth(2)).toContainText('272,7 %');
  await axe(page);

  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.lt-view .workspace')).toBeHidden();
  await expect(page.locator('.topbar')).toBeHidden();
  const report = page.locator('.lt-print');
  await expect(report).toBeVisible();
  await expect(report.getByRole('heading', { name: 'Imovane 7,5 mg', exact: true })).toBeVisible();
  await expect(report).toContainText('Maxdos enligt receptet 7,5 mg/dag');
  await expect(report.getByRole('img')).toHaveAttribute('aria-label', /2026-08-31: 7,50/);
  await expect(report.locator('.ltp-table')).toContainText('30 × 5 mg');
  await expect(report.getByRole('heading', { name: 'Analystext' })).toBeVisible();
  await expect(report.getByRole('heading', { name: 'Bedömning' })).toBeVisible();
  await expect(report.locator('.ltp-pre')).not.toContainText('Bedömning:');
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

test('interaktioner enligt Janusmed visas direkt under Lägg till läkemedel', async ({ page }) => {
  const combo = page.getByRole('combobox', { name: 'Läkemedel och styrka' });
  const pick = async (query: string) => {
    await combo.fill(query);
    await page.getByRole('listbox', { name: 'Förslag från läkemedelsdatabasen' }).getByRole('option').first().click();
  };
  await pick('Sertralin 50');
  await page.getByRole('button', { name: 'Lägg till läkemedel' }).click();
  await pick('Citalopram 20');
  const box = page.getByRole('status').filter({ hasText: 'Interaktioner enligt Janusmed' });
  await expect(box).toContainText('sertralin – citalopram');
  await expect(box).toContainText('Bör undvikas');
  await expect(box.getByRole('link', { name: /Janusmed/ })).toHaveAttribute('href', /^https:\/\/janusmed\.se\/interaktioner\?nplIds=\d{14}&nplIds=\d{14}$/);

  // Ett handskrivet läkemedel kan inte kontrolleras — det ska framgå.
  await page.getByRole('button', { name: 'Lägg till läkemedel' }).click();
  await combo.fill('Egen beredning');
  await page.keyboard.press('Escape');
  await expect(page.getByText('Kunde inte kontrolleras mot interaktionsdatan: Egen beredning.')).toBeVisible();
  await axe(page);
});
