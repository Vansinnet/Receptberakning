// Gränsfall för inmatning, status, nyförskrivning, långtidsanalys och datum.
// Porterade från 4.0 (calc.test.ts "gränsfall") och anpassade till 5.0:s modell,
// kompletterade med gränser som 4.0 saknade. Idag = 2026-10-01.
import { describe, it, expect } from 'vitest';
import { calcRenewal, isRenewalOk, type RenewalOk } from '../../src/lib/domain/renewal';
import { calcPrescription } from '../../src/lib/domain/prescribe';
import { calcLongterm } from '../../src/lib/domain/longterm';
import { addDays, addMonths, fmtDate, parseDateUTC } from '../../src/lib/utils';
import type { MedForm, PrescribeSettings } from '../../src/lib/types';

const TODAY = new Date(Date.UTC(2026, 9, 1));
const ago = (n: number) => fmtDate(addDays(TODAY, -n));

function form(o: Partial<MedForm> = {}): MedForm {
  return {
    name: 'Test 10 mg', atcCode: null, nplId: null, doseForm: '', regulation: null, notCalculable: false,
    unit: 'st', dateRaw: '2026-08-12', doseRaw: '1', interval: 1, packageRaw: '100', refillsRaw: '3', ...o,
  };
}
const calc = (o: Partial<MedForm> = {}) => calcRenewal(form(o), TODAY);
function ok(o: Partial<MedForm> = {}): RenewalOk {
  const r = calc(o);
  if (!isRenewalOk(r)) throw new Error(`förväntade ok, fick ${r.kind} ${JSON.stringify(r.errors)}`);
  return r;
}
const settings = (o: Partial<PrescribeSettings> = {}): PrescribeSettings => ({
  period: 6, endDateRaw: '', packageRaw: null, fromToday: false, ...o,
});

describe('Dos', () => {
  it.each(['1.0', '1,0', '1.50', '1,50', '2.00', ' 1 '])('"%s" godtas', (d) => {
    expect(calc({ doseRaw: d }).kind).toBe('ok');
  });
  it('komma och punkt ger samma resultat', () => {
    expect(ok({ doseRaw: '1,5' }).endDate).toEqual(ok({ doseRaw: '1.5' }).endDate);
  });
  it.each(['0', '-1', 'abc', '1,2,3'])('"%s" avvisas', (d) => {
    const r = calc({ doseRaw: d });
    expect(r.kind).toBe('invalid');
    expect(r.errors.dose).toBeTruthy();
  });
  it.each([
    ['st', 1, '50', true], ['st', 1, '50.1', false],
    ['st', 7, '350', true], ['st', 7, '351', false],
    ['st', 30, '1500', true], ['st', 30, '1501', false],
    ['ml', 1, '1000', true], ['ml', 1, '1001', false],
    ['dos', 1, '100', true], ['dos', 1, '101', false],
  ] as const)('%s per %i dagar: dos %s godtas=%s', (unit, interval, dose, accepted) => {
    const r = calc({ unit, interval, doseRaw: dose, packageRaw: '10000', refillsRaw: '1', dateRaw: ago(10) });
    expect(r.errors.dose === undefined).toBe(accepted);
  });
});

describe('Förpackningsstorlek och antal uttag', () => {
  it('decimaler avvisas för tabletter', () => {
    expect(calc({ packageRaw: '100.5' }).errors.package).toBe('Ange ett heltal.');
  });
  it.each(['ml', 'dos'] as const)('decimaler godtas för %s', (unit) => {
    expect(calc({ unit, packageRaw: '100,5' }).kind).toBe('ok');
  });
  it.each(['0', '-5', '10001', 'x'])('förpackning "%s" avvisas', (p) => {
    expect(calc({ packageRaw: p }).errors.package).toBeTruthy();
  });
  it('förpackning 10000 godtas', () => {
    expect(calc({ packageRaw: '10000', refillsRaw: '1', doseRaw: '50' }).errors.package).toBeUndefined();
  });
  it.each([['0', false], ['1', true], ['12', true], ['13', false], ['1.5', false], ['-1', false]])('uttag "%s" godtas=%s', (n, accepted) => {
    expect(calc({ refillsRaw: n }).errors.refills === undefined).toBe(accepted);
  });
  it('13 uttag ger meddelandet "Max 12 uttag."', () => {
    expect(calc({ refillsRaw: '13' }).errors.refills).toBe('Max 12 uttag.');
  });
});

describe('Namn och datum', () => {
  it('namn på 100 tecken godtas, 101 ger fel', () => {
    expect(calc({ name: 'a'.repeat(100) }).errors.name).toBeUndefined();
    expect(calc({ name: 'a'.repeat(101) }).errors.name).toBeTruthy();
  });
  it.each([
    ['2024-02-29', true], ['2025-02-29', false], ['1950-01-01', true], ['1949-12-31', false],
    ['2026-10-01', true], ['2026-10-02', false], ['2026-13-01', false], ['2026-09-1', false], ['20260901', false],
  ])('receptdatum %s godtas=%s', (d, accepted) => {
    expect(calc({ dateRaw: d }).errors.date === undefined).toBe(accepted);
  });
  it('tomt formulär ger "empty"', () => {
    expect(calc({ name: '', dateRaw: '', doseRaw: '', packageRaw: '', refillsRaw: '' }).kind).toBe('empty');
  });
  it('bara namn ger lista över vad som saknas', () => {
    const r = calc({ dateRaw: '', doseRaw: '', packageRaw: '', refillsRaw: '' });
    expect(r.kind).toBe('incomplete');
    if (r.kind === 'incomplete') expect(r.missing).toEqual(['receptdatum', 'dos', 'förpackningsstorlek', 'antal uttag']);
  });
  it('allt utom namn ger "läkemedel" som saknat', () => {
    const r = calc({ name: '' });
    expect(r.kind).toBe('incomplete');
    if (r.kind === 'incomplete') expect(r.missing).toEqual(['läkemedel']);
  });
  it('mindre än en dags förbrukning ger orimliga värden', () => {
    expect(calc({ packageRaw: '1', refillsRaw: '1', doseRaw: '2' }).kind).toBe('implausible');
  });
  it('exakt 3650 dagar godtas, 3651 ger orimliga värden', () => {
    expect(calc({ packageRaw: '3650', refillsRaw: '1', doseRaw: '1', dateRaw: ago(0) }).kind).toBe('ok');
    expect(calc({ packageRaw: '3651', refillsRaw: '1', doseRaw: '1', dateRaw: ago(0) }).kind).toBe('implausible');
  });
});

describe('Statusgränser', () => {
  // 100 st × 1, 1 st/dag: räcker 100 dagar, dagar kvar = 99 − dagar sedan receptdatum.
  const status = (daysSince: number) => ok({ refillsRaw: '1', dateRaw: ago(daysSince) });
  it.each([
    [85, 14, 'enough'], [86, 13, 'soon'], [99, 0, 'soon'], [100, -1, 'out'],
    [189, -90, 'out'], [190, -91, 'longOut'],
  ])('%i dagar sedan receptdatum → %i dagar kvar → %s', (since, left, st) => {
    const r = status(since);
    expect(r.daysLeft).toBe(left);
    expect(r.status).toBe(st);
  });
  it.each([
    ['80', 'ok'], ['79.9', 'warn'], ['110', 'ok'], ['110.1', 'warn'], ['100', 'ok'],
  ])('förbrukning %s procent → %s', (pct, tone) => {
    // förskrivet = pct × 10, 1000 dagar sedan, 1 st/dag → pct %.
    const r = ok({ unit: 'ml', packageRaw: String(Number(pct) * 10), refillsRaw: '1', dateRaw: ago(1000) });
    expect(r.consumption!.tone).toBe(tone);
  });
  it('recept utfärdat idag ger ingen förbrukningsprocent', () => {
    expect(ok({ dateRaw: ago(0) }).consumption).toBeNull();
  });
});

describe('Månadsaritmetik', () => {
  const d = (s: string) => parseDateUTC(s)!;
  it.each([
    ['2026-01-31', 1, '2026-02-28'], ['2028-01-31', 1, '2028-02-29'], ['2026-08-31', 6, '2027-02-28'],
    ['2026-10-01', 12, '2027-10-01'], ['2026-12-15', 1, '2027-01-15'], ['2026-03-31', 1, '2026-04-30'],
  ])('%s + %i månader = %s', (from, n, to) => {
    expect(fmtDate(addMonths(d(from), n))).toBe(to);
  });
});

describe('Nyförskrivning', () => {
  const slut = { dateRaw: '2025-06-01' }; // recept slut, start = idag
  it('ml: mängd i ml', () => {
    const r = ok({ ...slut, unit: 'ml', doseRaw: '5', packageRaw: '100', refillsRaw: '1' });
    expect(calcPrescription(r, settings({ period: 1 }), TODAY)).toMatchObject({ kind: 'ok', days: 32, units: 160, packages: 2 });
  });
  it('veckodos delas med 7', () => {
    const r = ok({ ...slut, interval: 7, doseRaw: '1', packageRaw: '4', refillsRaw: '3' });
    const p = calcPrescription(r, settings({ period: 6 }), TODAY);
    expect(p).toMatchObject({ kind: 'ok', days: 183, units: 27, packages: 7 });
  });
  it('månadsdos delas med 30', () => {
    const r = ok({ ...slut, interval: 30, doseRaw: '1', packageRaw: '1', refillsRaw: '6' });
    expect(calcPrescription(r, settings({ period: 12 }), TODAY)).toMatchObject({ kind: 'ok', days: 366, units: 13, packages: 13 });
  });
  it('slutdatum samma dag som start ger 1 dag', () => {
    const r = ok(slut);
    expect(calcPrescription(r, settings({ period: 'date', endDateRaw: '2026-10-01' }), TODAY)).toMatchObject({ kind: 'ok', days: 1, units: 1 });
  });
  it.each([['', 'needDate'], ['2026-13-01', 'badDate'], ['2026-9-30', 'badDate'], ['2026-09-30', 'badDate']])('slutdatum "%s" → %s', (e, kind) => {
    expect(calcPrescription(ok(slut), settings({ period: 'date', endDateRaw: e }), TODAY).kind).toBe(kind);
  });
  it.each(['0', '-5', 'abc'])('förpackning "%s" → needPackage', (p) => {
    expect(calcPrescription(ok(slut), settings({ packageRaw: p }), TODAY).kind).toBe('needPackage');
  });
  it('alla perioder 1–12 månader ger resultat som slutar på rätt datum', () => {
    const r = ok(slut);
    for (let m = 1; m <= 12; m++) {
      const p = calcPrescription(r, settings({ period: m }), TODAY);
      expect(p.kind).toBe('ok');
      if (p.kind === 'ok') expect(fmtDate(p.target)).toBe(fmtDate(addMonths(TODAY, m)));
    }
  });
  it('tar slut idag: ny period börjar i morgon', () => {
    const r = ok({ refillsRaw: '1', dateRaw: ago(99) });
    expect(r.daysLeft).toBe(0);
    expect(fmtDate(calcPrescription(r, settings(), TODAY).start)).toBe('2026-10-02');
  });
});

describe('Långtidsanalys — validering och klassning', () => {
  const lt = (rows: [string, string, string][], dose = '1') =>
    calcLongterm(rows.map(([s, e, t]) => ({ startRaw: s, endRaw: e, totalRaw: t })), dose, TODAY);

  it('total med decimaler ger fel', () => {
    expect(lt([['2026-01-01', '2026-03-31', '30.5']]).errors[0].total).toBeTruthy();
  });
  it('slutdatum före startdatum ger fel', () => {
    expect(lt([['2026-03-31', '2026-01-01', '90']]).errors[0].end).toBe('Före startdatum.');
  });
  it('framtida datum ger fel', () => {
    const r = lt([['2026-10-02', '2026-10-05', '4']]);
    expect(r.errors[0].start).toBeTruthy();
    expect(r.errors[0].end).toBeTruthy();
  });
  it('period längre än 50 år ger fel', () => {
    expect(lt([['1950-01-01', '2026-01-01', '100']]).errors[0].end).toBe('Orimligt lång period.');
  });
  it('en dag lång period räknas som 1 dag', () => {
    const r = lt([['2026-05-05', '2026-05-05', '1']]);
    expect(r.kind === 'ok' && r.unionDays).toBe(1);
  });
  it.each([['70', 'under'], ['80', 'ok'], ['110', 'ok'], ['120', 'over']])('%s st på 100 dagar → %s', (tot, cls) => {
    const r = lt([['2026-01-01', '2026-04-10', tot]]);
    expect(r.kind === 'ok' && r.cls).toBe(cls);
  });
  it('dos 0 ger dosfel och ingen analys', () => {
    const r = lt([['2026-01-01', '2026-04-10', '100']], '0');
    expect(r.kind).toBe('incomplete');
    expect(r.doseError).toBeTruthy();
  });
  it('ofullständig rad ignoreras, övriga räknas', () => {
    const r = lt([['2026-01-01', '2026-04-10', '100'], ['2026-05-01', '', '']]);
    expect(r.kind === 'ok' && r.periods.length).toBe(1);
  });
  it('angränsande perioder räknas inte som överlapp', () => {
    const r = lt([['2026-01-01', '2026-01-31', '31'], ['2026-02-01', '2026-02-28', '28']]);
    expect(r.kind === 'ok' && r.overlap).toBe(false);
    expect(r.kind === 'ok' && r.unionDays).toBe(59);
  });
});
