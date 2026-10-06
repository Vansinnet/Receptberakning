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

test('långtidsanalys i mg: två styrkor räknas ihop, och utskriften är en egen rapport', async ({ page }) => {
  await page.getByRole('tab', { name: 'Långtidsanalys' }).click();
  const lt = page.locator('#view-longterm');
  const combo = lt.getByRole('combobox', { name: 'Läkemedel och styrka' });
  const pick = async (q: string, name: string) => {
    await combo.fill(q);
    await lt.getByRole('listbox', { name: 'Förslag från läkemedelsdatabasen' }).getByRole('option', { name: new RegExp(name) }).first().click();
  };
  // Läkemedlet väljs ur läkemedelsdatabasen, som vid förnyelse.
  await pick('imovane 7,5', 'Imovane 7,5 mg');
  await expect(combo).toHaveValue('Imovane 7,5 mg');
  await page.getByRole('radio', { name: 'mg, flera styrkor' }).click();
  // Första styrkan hämtas från namnet; nästa val ur databasen lägger till sin styrka.
  await expect(page.getByLabel('Styrka 1 (mg)')).toHaveValue('7,5');
  await pick('imovane 5', 'Imovane 5 mg');
  await expect(page.getByLabel('Styrka 2 (mg)')).toHaveValue('5');
  await expect(combo).toHaveValue('Imovane');
  await page.getByLabel('Dos (mg/dag)').fill('7,5');
  await page.getByLabel('Från, period 1', { exact: true }).fill('2026-01-01');
  await page.getByLabel('Till och med, period 1', { exact: true }).fill('2026-03-31');
  await page.getByLabel('Antal 7,5 mg, period 1').fill('30');
  await page.getByLabel('Antal 5 mg, period 1').fill('30');
  await expect(page.locator('.lt-counts__sum').first()).toHaveText('= 375 mg');
  const results = page.getByRole('region', { name: 'Resultat' });
  await expect(results).toContainText('375 mg');
  await expect(results).toContainText('55,6 %');
  await expect(page.locator('.lt-view textarea')).toHaveValue(/30 × 7,5 mg \+ 30 × 5 mg = 375 mg/);
  await axe(page);

  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.lt-view .workspace')).toBeHidden();
  await expect(page.locator('.topbar')).toBeHidden();
  const report = page.locator('.lt-print');
  await expect(report).toBeVisible();
  await expect(report.getByRole('heading', { name: 'Imovane', exact: true })).toBeVisible();
  await expect(report.getByRole('img')).toHaveAttribute('aria-label', /Period 1, 2026-01-01 – 2026-03-31: 55,6 %/);
  await expect(report.getByText('30 × 7,5 mg + 30 × 5 mg = 375 mg').first()).toBeVisible();
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
