// Skärmen visar exakt det som beräkningsfunktionen räknar ut.
// Slumpade fall matas in i gränssnittet; varje siffra på skärmen jämförs med calcRenewal.
// Fångar fel i visningen (avrundning, fel fält, fel enhet) som enhetstesterna inte ser.
import { test, expect } from '@playwright/test';
import { calcRenewal, daysLeftText, isRenewalOk, STATUS_LABEL } from '../../src/lib/domain/renewal';
import { calcPrescription } from '../../src/lib/domain/prescribe';
import { addDays, fmtDate, fmtPct, fmtQty } from '../../src/lib/utils';
import type { DoseInterval, DoseUnit, MedForm } from '../../src/lib/types';

const TODAY = new Date(Date.UTC(2026, 9, 1));

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cases(n: number): MedForm[] {
  const r = rng(4711);
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
  const out: MedForm[] = [];
  while (out.length < n) {
    const f: MedForm = {
      name: 'Test 10 mg', atcCode: null, nplId: null, doseForm: '', regulation: null, notCalculable: false,
      unit: pick(['st', 'ml', 'dos'] as const satisfies readonly DoseUnit[]),
      interval: pick([1, 1, 7, 30] as const satisfies readonly DoseInterval[]),
      doseRaw: pick(['0,5', '1', '1,5', '2', '3']),
      dateRaw: fmtDate(addDays(TODAY, -int(0, 500))),
      packageRaw: String(pick([10, 28, 30, 50, 98, 100])),
      refillsRaw: String(int(1, 12)),
    };
    if (isRenewalOk(calcRenewal(f, TODAY))) out.push(f);
  }
  return out;
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-01T10:00:00'));
  await page.goto('/');
});

test('skärmen visar samma siffror som beräkningen, 25 slumpade fall', async ({ page }) => {
  test.setTimeout(120_000);
  const results = page.getByRole('region', { name: 'Resultat' });
  for (const f of cases(25)) {
    await page.getByRole('combobox', { name: 'Läkemedel och styrka' }).fill(f.name);
    await page.keyboard.press('Escape');
    await page.locator('#f-pkg + select, .dose-row select[aria-label="Enhet"]').first().selectOption(f.unit);
    await page.getByLabel('Doseringsintervall').selectOption(String(f.interval));
    await page.getByLabel('Receptdatum', { exact: true }).fill(f.dateRaw);
    await page.locator('#f-dose').fill(f.doseRaw);
    await page.locator('#f-pkg').fill(f.packageRaw);
    await page.getByLabel('Antal uttag').fill(f.refillsRaw);

    const r = calcRenewal(f, TODAY);
    if (!isRenewalOk(r)) throw new Error('förväntade ok');
    const u = f.unit === 'dos' ? 'doser' : f.unit;
    const label = `${f.dateRaw} ${f.doseRaw} ${f.unit}/${f.interval}d ${f.packageRaw}×${f.refillsRaw}`;
    const tiles = results.locator('.tile');
    await expect(tiles.nth(0).locator('.tile__v'), label).toHaveText(fmtDate(r.endDate));
    await expect(tiles.nth(0).locator('.tile__s'), label).toHaveText(daysLeftText(r.daysLeft));
    await expect(tiles.nth(1).locator('.tile__v'), label).toHaveText(`${fmtQty(r.expectedLeft)} ${u}`);
    await expect(results.locator('.chip'), label).toHaveText(STATUS_LABEL[r.status]);
    await expect(tiles.nth(2).locator('.tile__v'), label).toHaveText(r.consumption ? fmtPct(r.consumption.pct) : '–');
    if (r.consumption) await expect(tiles.nth(2).locator('.tile__v'), label).toHaveClass(new RegExp(`fg-${r.consumption.tone}`));

    await page.getByRole('button', { name: 'Förnya', exact: true }).click();
    const p = calcPrescription(r, { period: 6, endDateRaw: '', packageRaw: null, fromToday: false }, TODAY);
    const panel = page.getByLabel('Nyförskrivning');
    if (p.kind === 'ok') await expect(panel.locator('.presc-result__big'), label).toHaveText(`${p.packages} förp. à ${fmtQty(p.packageSize)} ${u}`);
    else if (p.kind === 'covered') await expect(panel, label).toContainText('täcker redan hela perioden');
    await page.getByRole('button', { name: 'Förnya', exact: true }).click(); // ångra beslutet inför nästa fall
  }
});

test('siffrorna räknas om när fliken står öppen över midnatt', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-01T23:58:30') });
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Läkemedel och styrka' }).fill('Test 10 mg');
  await page.keyboard.press('Escape');
  await page.getByLabel('Receptdatum', { exact: true }).fill('2026-08-12');
  await page.locator('#f-dose').fill('1');
  await page.locator('#f-pkg').fill('100');
  await page.getByLabel('Antal uttag').fill('3');
  const results = page.getByRole('region', { name: 'Resultat' });
  await expect(results).toContainText('249 dagar kvar');
  await page.clock.runFor('03:00');
  await expect(page.locator('.topbar__date')).toContainText('2026-10-02');
  await expect(results).toContainText('248 dagar kvar');
});
