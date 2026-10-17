// Gränsfall för inmatning, status, nyförskrivning, långtidsanalys och datum.
// Porterade från 4.0 (calc.test.ts "gränsfall") och anpassade till 5.0:s modell,
// kompletterade med gränser som 4.0 saknade. Idag = 2026-10-01.
import { describe, it, expect } from 'vitest';
import { calcRenewal, isRenewalOk, type RenewalOk } from '../../src/lib/domain/renewal';
import { calcPrescription } from '../../src/lib/domain/prescribe';
import { calcLongterm, parseCount } from '../../src/lib/domain/longterm';
import { addDays, addMonths, fmtDate, fmtPct, parseDateUTC } from '../../src/lib/utils';
import type { LtDoseUnit, LtInterval, MedForm, PrescribeSettings } from '../../src/lib/types';

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
  it.each([['1x2', '2'], ['1+0+1', '2'], ['½', '0,5'], ['1x2 st', '2'], ['1+1+1+1', '4']])('dosuttrycket "%s" räknas som %s', (expr, num) => {
    const a = ok({ doseRaw: expr });
    const b = ok({ doseRaw: num });
    expect(a.dailyDose).toBe(b.dailyDose);
    expect(a.endDate).toEqual(b.endDate);
    expect(a.status).toBe(b.status);
  });
  it.each(['1-2', '5 ml', '1x2x3', '2 vid behov'])('dosuttrycket "%s" avvisas med förklaring', (d) => {
    const r = calc({ doseRaw: d });
    expect(r.kind).toBe('invalid');
    expect(r.errors.dose).toBe('Skriv dosen som ett tal, t.ex. 2, 1x2 eller 1+0+1.');
  });
  it('uttryck omfattas av samma högsta dos', () => {
    expect(calc({ doseRaw: '25x2' }).kind).toBe('ok');
    expect(calc({ doseRaw: '26x2' }).errors.dose).toBe('Högst 50 st per dag.');
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

type LtRow = [date: string, count: string, strength?: string];
function ltb(fills: LtRow[], max: string | [string, string][] | null = '1', unit: LtDoseUnit = 'st', interval: LtInterval = 1) {
  const maxDoses = max === null ? [{ fromRaw: '', doseRaw: '' }]
    : typeof max === 'string' ? [{ fromRaw: '', doseRaw: max }]
    : max.map(([fromRaw, doseRaw]) => ({ fromRaw, doseRaw }));
  return calcLongterm(fills.map(([dateRaw, countRaw, strengthRaw = '7,5']) => ({ dateRaw, countRaw, strengthRaw })), maxDoses, unit, interval, TODAY);
}
function okb(...a: Parameters<typeof ltb>) {
  const r = ltb(...a);
  if (r.kind !== 'ok') throw new Error(`förväntade ok, fick ${r.kind} ${JSON.stringify(r.fillErrors)}`);
  return r;
}
const pct = (p: number | null | undefined) => (p == null ? null : fmtPct(p));

describe('Långtidsanalys — uttagen', () => {
  it.each([['30', 30], ['2x30', 60], ['2 x 30', 60], ['2×30', 60], ['3*28', 84]])('antal "%s" = %i', (c, n) => {
    expect(parseCount(c)).toBe(n);
  });
  it.each(['0', '0x30', '30,5', '-3', '+3', '1e1', 'abc', '2x'])('antal "%s" ger fel och raden räknas inte', (c) => {
    const r = ltb([['2026-09-01', c]]);
    expect(r.fillErrors[0].count).toBe('Ange ett heltal, t.ex. 30 eller 2x30.');
    expect(r.skipped).toEqual([0]);
    expect(r.kind).toBe('empty');
  });
  it.each(['0', '1e1', 'abc', '0x5'])('styrka "%s" ger fel', (s) => {
    expect(ltb([['2026-09-01', '30', s]]).fillErrors[0].strength).toBe('Ange styrkan i mg.');
  });
  it('en rad utan styrka bland rader med styrka ger fel och räknas inte', () => {
    const r = ltb([['2026-08-01', '30'], ['2026-09-01', '30', '']]);
    expect(r.unit).toBe('mg');
    expect(r.fillErrors[1].strength).toBe('Ange styrkan.');
    expect(r.kind === 'ok' && r.fills.length).toBe(1);
  });
  it('utan styrka på alla rader räknas antal', () => {
    const r = okb([['2026-08-01', '4', ''], ['2026-08-29', '4', '']]);
    expect(r.unit).toBe('antal');
    expect(r.total).toBe(8);
  });
  it('framtida datum ger fel', () => {
    const r = ltb([['2026-10-02', '30']]);
    expect(r.fillErrors[0].date).toBe('Datumet är i framtiden.');
    expect(r.kind).toBe('empty');
  });
  it('ofullständigt datum godtas inte', () => {
    expect(ltb([['2026-09-1', '30']]).fillErrors[0].date).toBe('Ange ÅÅÅÅ-MM-DD.');
  });
  it('rad med bara datum eller bara antal räknas inte, utan fel, men övriga räknas', () => {
    const r = ltb([['2026-08-01', '30'], ['2026-09-01', ''], ['', '30']]);
    expect(r.fillErrors).toEqual([{}, {}, {}]);
    expect(r.skipped).toEqual([1, 2]);
    expect(r.kind === 'ok' && r.fills.length).toBe(1);
  });
  it('tomma rader ignoreras helt, även med förifylld styrka', () => {
    const r = ltb([['', '', '7,5'], ['2026-09-01', '30'], ['', '', '']]);
    expect(r.skipped).toEqual([]);
    expect(r.kind === 'ok' && r.fills.length).toBe(1);
  });
  it('inga uttag ger tomt resultat', () => {
    expect(ltb([['', '']]).kind).toBe('empty');
  });
});

describe('Långtidsanalys — maxdos', () => {
  it('dosuttryck: 1x2 st = 15 mg/dag med 7,5 mg', () => {
    expect(pct(okb([['2026-09-01', '30'], ['2026-09-16', '30']], '1x2').fills[0].pct)).toBe('100 %');
  });
  it('½ st = 3,75 mg/dag', () => {
    expect(pct(okb([['2026-09-01', '30'], ['2026-09-16', '30']], '½').fills[0].pct)).toBe('400 %');
  });
  it('maxdos i mg godtar "7,5 mg" men inte ett annat enhetsord', () => {
    expect(pct(okb([['2026-09-01', '30'], ['2026-10-01', '30']], '7,5 mg', 'mg').fills[0].pct)).toBe('100 %');
    expect(ltb([['2026-09-01', '30']], '7,5 st', 'mg').doseErrors[0].dose).toBe('Ange en dos större än 0.');
  });
  it('maxdos i st med två styrkor ger fel och ingen procent', () => {
    const r = okb([['2026-08-01', '30', '5'], ['2026-09-01', '30', '7,5']], '1', 'st');
    expect(r.doseErrors[0].dose).toBe('Ange maxdosen i mg när uttagen har olika styrkor.');
    expect(r.maxDose).toBeNull();
    expect(r.fills[0].pct).toBeNull();
  });
  it('maxdos i mg när uttagen saknar styrka ger fel', () => {
    expect(ltb([['2026-09-01', '4', '']], '1', 'mg').doseErrors[0].dose).toBe('Uttagen saknar styrka i mg. Ange maxdosen i antal.');
  });
  it.each(['0', '-1', 'abc'])('maxdos "%s" ger fel', (d) => {
    expect(ltb([['2026-09-01', '30']], d).doseErrors[0].dose).toBe('Ange en dos större än 0.');
  });
  it('ändring utan datum, med fel datum eller samma datum två gånger ger fel', () => {
    const r = ltb([['2026-09-01', '30']], [['', '1'], ['', '2'], ['2026-13-01', '2'], ['2026-07-01', '2'], ['2026-07-01', '3']]);
    expect(r.doseErrors.map((e) => e.from)).toEqual([undefined, 'Ange datum.', 'Ange ÅÅÅÅ-MM-DD.', undefined, 'Samma datum som en annan ändring.']);
    expect(r.kind === 'ok' && r.maxDose).toBeNull();
  });
  it('ändring utan första maxdos ger fel vid första', () => {
    expect(ltb([['2026-09-01', '30']], [['', ''], ['2026-07-01', '2']]).doseErrors[0].dose).toBe('Ange maxdosen.');
  });
  it('ändring mitt i ett intervall delar upp maxdosen dag för dag', () => {
    // 15 dagar à 7,5 mg + 15 dagar à 15 mg = 337,5 mg; uttaget 225 mg = 66,7 %.
    const r = okb([['2026-06-01', '30'], ['2026-07-01', '30']], [['', '1'], ['2026-06-16', '2']]);
    expect(pct(r.fills[0].pct)).toBe('66,7 %');
  });
  it('ändring före första uttaget gäller hela tiden', () => {
    const r = okb([['2026-07-03', '30'], ['2026-08-02', '30']], [['', '1'], ['2026-01-01', '2']]);
    expect(pct(r.average!.pct)).toBe('50 %');
  });
  it('ändringarna sorteras efter datum oavsett ordning', () => {
    const a = okb([['2026-06-01', '30'], ['2026-08-01', '30']], [['', '1'], ['2026-07-15', '3'], ['2026-07-01', '2']]);
    const b = okb([['2026-06-01', '30'], ['2026-08-01', '30']], [['', '1'], ['2026-07-01', '2'], ['2026-07-15', '3']]);
    expect(a.fills[0].pct).toBeCloseTo(b.fills[0].pct!, 10);
  });
  it('maxdos per vecka ger samma procent som samma dos per dag', () => {
    const day = okb([['2026-09-01', '30'], ['2026-09-21', '30']], '7,5', 'mg', 1);
    const week = okb([['2026-09-01', '30'], ['2026-09-21', '30']], '52,5', 'mg', 7);
    expect(week.fills[0].pct).toBeCloseTo(day.fills[0].pct!, 10);
  });
});

describe('Långtidsanalys — gränser i tid', () => {
  it('sista uttaget idag: ingen takt för det, men snittet räknas', () => {
    const r = okb([['2026-09-01', '30'], ['2026-10-01', '30']]);
    expect(r.fills[1]).toMatchObject({ days: 0, rate: null, pct: null, last: true });
    expect(pct(r.average!.pct)).toBe('100 %');
    expect(pct(r.ifOutToday!.pct)).toBe('200 %');
  });
  it('enda uttaget idag: varken snitt eller "om slut idag"', () => {
    const r = okb([['2026-10-01', '30']]);
    expect(r.average).toBeNull();
    expect(r.ifOutToday).toBeNull();
    expect(r.fills[0].rate).toBeNull();
  });
  it('uttag i går: takten räknas på en dag', () => {
    expect(okb([['2026-09-30', '30']]).fills[0].rate).toBe(225);
  });
  it('nästa uttag exakt när lagret tar slut: inget kvar; en dag tidigare: en dags dos kvar', () => {
    expect(okb([['2026-09-01', '20'], ['2026-09-21', '20']]).shouldRemain).toBe(0);
    expect(okb([['2026-09-01', '20'], ['2026-09-20', '20']]).shouldRemain).toBe(7.5);
  });
  it('lagret går aldrig under 0 och följer med mellan uttagen', () => {
    // 10 dagar tidigt, sedan 30 dagar sent (lagret når 0), sedan 5 dagar tidigt.
    const r = okb([['2026-05-01', '30'], ['2026-05-21', '30'], ['2026-07-10', '30'], ['2026-08-04', '30']]);
    expect(r.shouldRemain! / 7.5).toBe(5);
  });
  it('skottdag räknas: 2024-02-28 till 2024-03-01 är 2 dagar', () => {
    expect(okb([['2024-02-28', '2'], ['2024-03-01', '2']]).fills[0].days).toBe(2);
  });
});
