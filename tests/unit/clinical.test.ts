// Kliniska testfall T01–T41. T01–T32 godkända 2026-09-27 i "Recept 5.0 — planering", fliken
// Kliniska testfall; T33–T41 godkända 2026-10-18 i fliken Långtidsanalys 2.0. Idag = 2026-10-01.
// Ändra ALDRIG ett förväntat värde här utan att fallet först ändrats och godkänts i dokumentet.
import { describe, it, expect } from 'vitest';
import { calcRenewal, daysLeftText, isRenewalOk, STATUS_LABEL, type RenewalOk } from '../../src/lib/domain/renewal';
import { calcPrescription } from '../../src/lib/domain/prescribe';
import { calcLongterm } from '../../src/lib/domain/longterm';
import { ltRemainText } from '../../src/lib/domain/texts';
import { fmtDate, fmtFixed, fmtPct, fmtQty } from '../../src/lib/utils';
import type { LtDoseUnit, LtInterval, MedForm, PrescribeSettings } from '../../src/lib/types';

const TODAY = new Date(Date.UTC(2026, 9, 1));

function form(o: Partial<MedForm>): MedForm {
  return {
    name: 'Testmedel 10 mg', atcCode: null, nplId: null, doseForm: '', regulation: null, notCalculable: false,
    unit: 'st', dateRaw: '', doseRaw: '1', interval: 1, packageRaw: '100', refillsRaw: '3',
    ...o,
  };
}

function ok(o: Partial<MedForm>): RenewalOk {
  const r = calcRenewal(form(o), TODAY);
  if (!isRenewalOk(r)) throw new Error('Förväntade beräkning, fick ' + r.kind + ' ' + JSON.stringify(r.errors));
  return r;
}

function summary(r: RenewalOk) {
  return {
    tom: fmtDate(r.endDate),
    kvar: daysLeftText(r.daysLeft),
    borde: fmtQty(r.expectedLeft),
    pct: r.consumption ? fmtPct(r.consumption.pct) : null,
    status: STATUS_LABEL[r.status],
  };
}

const settings = (o: Partial<PrescribeSettings> = {}): PrescribeSettings => ({
  period: 6, endDateRaw: '', packageRaw: null, fromToday: false, ...o,
});

describe('A. Grundfall — 100 st × 3 uttag, 1 st/dag', () => {
  it('T01 recept idag', () => {
    const r = ok({ dateRaw: '2026-10-01' });
    expect(summary(r)).toEqual({ tom: '2027-07-27', kvar: '299 dagar kvar', borde: '300', pct: null, status: 'Räcker' });
    expect(r.total).toBe(300);
  });
  it('T02 50 dagar sedan', () => {
    const r = ok({ dateRaw: '2026-08-12' });
    expect(summary(r)).toEqual({ tom: '2027-06-07', kvar: '249 dagar kvar', borde: '250', pct: '600 %', status: 'Räcker' });
    expect(fmtFixed(r.consumption!.perInterval, 2)).toBe('6,00');
  });
  it('T03 295 dagar sedan, grön procent', () => {
    const r = ok({ dateRaw: '2025-12-10' });
    expect(summary(r)).toEqual({ tom: '2026-10-05', kvar: '4 dagar kvar', borde: '5', pct: '101,7 %', status: 'Tar snart slut' });
    expect(r.consumption!.tone).toBe('ok');
  });
  it('T04 tar slut idag', () => {
    const r = ok({ dateRaw: '2025-12-06' });
    expect(summary(r)).toEqual({ tom: '2026-10-01', kvar: 'Tar slut idag', borde: '1', pct: '100,3 %', status: 'Tar snart slut' });
  });
  it('T05 slut sedan 1 dag', () => {
    const r = ok({ dateRaw: '2025-12-05' });
    expect(summary(r)).toEqual({ tom: '2026-09-30', kvar: 'Slut sedan 1 dag', borde: '0', pct: '100 %', status: 'Slut' });
  });
  it('T06 slut sedan länge, gul procent', () => {
    const r = ok({ dateRaw: '2025-08-27' });
    expect(summary(r)).toEqual({ tom: '2026-06-22', kvar: 'Slut sedan 101 dagar', borde: '0', pct: '75 %', status: 'Slut sedan länge' });
    expect(r.consumption!.tone).toBe('warn');
  });
  it('T07a 14 dagar kvar ger Räcker', () => {
    const r = ok({ dateRaw: '2025-12-20' });
    expect(summary(r)).toEqual({ tom: '2026-10-15', kvar: '14 dagar kvar', borde: '15', pct: '105,3 %', status: 'Räcker' });
  });
  it('T07b 13 dagar kvar ger Tar snart slut', () => {
    const r = ok({ dateRaw: '2025-12-19' });
    expect(summary(r)).toEqual({ tom: '2026-10-14', kvar: '13 dagar kvar', borde: '14', pct: '104,9 %', status: 'Tar snart slut' });
  });
});

describe('B. Dos och enheter', () => {
  it('T08 halv tablett', () => {
    const r = ok({ doseRaw: '0,5', packageRaw: '30', refillsRaw: '1', dateRaw: '2026-09-21' });
    expect(r.coverDays).toBe(60);
    expect(summary(r)).toMatchObject({ tom: '2026-11-19', kvar: '49 dagar kvar', borde: '25', pct: '600 %' });
    expect(fmtFixed(r.consumption!.perInterval, 2)).toBe('3,00');
  });
  it('T09 plåster per vecka', () => {
    const r = ok({ doseRaw: '1', interval: 7, packageRaw: '4', refillsRaw: '3', dateRaw: '2026-09-01' });
    expect(r.total).toBe(12);
    expect(r.coverDays).toBe(84);
    expect(summary(r)).toMatchObject({ tom: '2026-11-23', kvar: '53 dagar kvar', borde: '7,7', pct: '280 %' });
    expect(fmtFixed(r.consumption!.perInterval, 2)).toBe('2,80');
  });
  it('T10 depåinjektion per månad', () => {
    const r = ok({ doseRaw: '1', interval: 30, packageRaw: '1', refillsRaw: '6', dateRaw: '2026-08-17' });
    expect(r.coverDays).toBe(180);
    expect(summary(r)).toMatchObject({ tom: '2027-02-12', kvar: '134 dagar kvar', borde: '4,5', pct: '400 %' });
    expect(fmtFixed(r.consumption!.perInterval, 2)).toBe('4,00');
  });
  it('T11 oral lösning 5 ml/dag', () => {
    const r = ok({ unit: 'ml', doseRaw: '5', packageRaw: '100', refillsRaw: '2', dateRaw: '2026-09-11' });
    expect(r.coverDays).toBe(40);
    expect(summary(r)).toMatchObject({ tom: '2026-10-20', kvar: '19 dagar kvar', borde: '100', pct: '200 %' });
    expect(fmtFixed(r.consumption!.perInterval, 2)).toBe('10,00');
  });
  it('T12 oral lösning 3 ml/dag, 33 hela dagar', () => {
    const r = ok({ unit: 'ml', doseRaw: '3', packageRaw: '100', refillsRaw: '1', dateRaw: '2026-09-21' });
    expect(r.coverDays).toBe(33);
    expect(summary(r)).toMatchObject({ tom: '2026-10-23', kvar: '22 dagar kvar', borde: '70', pct: '333,3 %' });
  });
  it('T13 inhalator 4 doser/dag', () => {
    const r = ok({ unit: 'dos', doseRaw: '4', packageRaw: '200', refillsRaw: '3', dateRaw: '2026-07-03' });
    expect(r.coverDays).toBe(150);
    expect(summary(r)).toMatchObject({ tom: '2026-11-29', kvar: '59 dagar kvar', borde: '240', pct: '166,7 %' });
    expect(fmtFixed(r.consumption!.perInterval, 2)).toBe('6,67');
  });
});

// C. Patientens uppgift och uttag kvar (T14–T19) togs bort 2026-09-27 på verksamhetens
// begäran: fälten finns inte längre i verktyget.

describe('D. Validering och ej beräkningsbara beredningar', () => {
  it('T20 framtida receptdatum', () => {
    const r = calcRenewal(form({ dateRaw: '2026-10-02' }), TODAY);
    expect(r.kind).toBe('invalid');
    expect(r.errors.date).toBe('Datumet är satt i framtiden.');
  });
  it('T21 13 uttag', () => {
    const r = calcRenewal(form({ dateRaw: '2026-08-12', refillsRaw: '13' }), TODAY);
    expect(r.kind).toBe('invalid');
    expect(r.errors.refills).toBe('Max 12 uttag.');
  });
  it('T22 orimliga värden', () => {
    const r = calcRenewal(form({ dateRaw: '2026-08-12', packageRaw: '10000', refillsRaw: '12', doseRaw: '0,1' }), TODAY);
    expect(r.kind).toBe('implausible');
    if (r.kind === 'implausible') expect(r.message).toMatch(/^Orimliga värden/);
  });
  it('T23 kräm, manuell bedömning', () => {
    const r = calcRenewal(form({ name: 'Hydrokortison 1 % kräm', notCalculable: true, dateRaw: '', doseRaw: '', packageRaw: '', refillsRaw: '' }), TODAY);
    expect(r.kind).toBe('manual');
  });
});

describe('E. Nyförskrivning', () => {
  it('T24 nuvarande recept täcker perioden', () => {
    const r = ok({ dateRaw: '2026-08-12' });
    const p = calcPrescription(r, settings({ period: 3 }), TODAY);
    expect(p.kind).toBe('covered');
    expect(fmtDate(p.start)).toBe('2027-06-08');
    if (p.kind === 'covered') expect(fmtDate(p.target)).toBe('2027-01-01');
  });
  it('T25 förnya 6 månader från beräknat slut', () => {
    const r = ok({ dateRaw: '2025-12-10' });
    const p = calcPrescription(r, settings({ period: 6 }), TODAY);
    expect(p.askStart).toBe(false);
    expect(p).toMatchObject({ kind: 'ok', days: 178, units: 178, packages: 2 });
    expect(fmtDate(p.start)).toBe('2026-10-06');
    if (p.kind === 'ok') expect(fmtDate(p.target)).toBe('2027-04-01');
  });
  it('T26 frågan om startdatum, båda alternativen', () => {
    const r = ok({ dateRaw: '2025-12-20' });
    const fromToday = calcPrescription(r, settings({ period: 6, fromToday: true }), TODAY);
    expect(fromToday.askStart).toBe(true);
    expect(fromToday).toMatchObject({ kind: 'ok', days: 183, units: 183, packages: 2 });
    expect(fmtDate(fromToday.start)).toBe('2026-10-01');
    const fromEnd = calcPrescription(r, settings({ period: 6, fromToday: false }), TODAY);
    expect(fromEnd).toMatchObject({ kind: 'ok', days: 168, units: 168, packages: 2 });
    expect(fmtDate(fromEnd.start)).toBe('2026-10-16');
  });
  it('T27 datumläge, recept slut, 2 st/dag, förpackning 30', () => {
    const r = ok({ dateRaw: '2025-06-01', doseRaw: '2' });
    expect(r.daysLeft).toBeLessThan(0);
    const p = calcPrescription(r, settings({ period: 'date', endDateRaw: '2026-12-31', packageRaw: '30' }), TODAY);
    expect(p).toMatchObject({ kind: 'ok', days: 92, units: 184, packages: 7 });
    expect(fmtDate(p.start)).toBe('2026-10-01');
  });
  it('"från dagens datum" används inte när frågan inte visas', () => {
    const r = ok({ dateRaw: '2025-12-10' });
    const p = calcPrescription(r, settings({ period: 6, fromToday: true }), TODAY);
    expect(p.askStart).toBe(false);
    expect(fmtDate(p.start)).toBe('2026-10-06');
  });
});

// Långtidsanalys 2.0: uttag i stället för perioder. T30–T32 utgick 2026-10-18 och ersattes av
// T33–T41, godkända samma dag i fliken "Långtidsanalys 2.0". Zopiklon 7,5 mg och maxdos 1 st/dag
// om inget annat anges.
type Fill = [date: string, count: string, strength?: string];
function lt(fills: Fill[], max: string | [string, string][] | null = '1', unit: LtDoseUnit = 'st', interval: LtInterval = 1) {
  const maxDoses = max === null ? [{ fromRaw: '', doseRaw: '' }]
    : typeof max === 'string' ? [{ fromRaw: '', doseRaw: max }]
    : max.map(([fromRaw, doseRaw]) => ({ fromRaw, doseRaw }));
  const r = calcLongterm(fills.map(([dateRaw, countRaw, strengthRaw = '7,5']) => ({ dateRaw, countRaw, strengthRaw })), maxDoses, unit, interval, TODAY);
  if (r.kind !== 'ok') throw new Error(`förväntade ok, fick ${r.kind}`);
  return r;
}
type LtOk = ReturnType<typeof lt>;
const per = (r: LtOk, interval: LtInterval = 1) => ({
  rates: r.fills.map((f) => (f.rate === null ? null : fmtFixed(f.rate * interval, 2))),
  pcts: r.fills.map((f) => (f.pct === null ? null : fmtPct(f.pct))),
  average: r.average && [fmtFixed(r.average.rate * interval, 2), r.average.pct === null ? null : fmtPct(r.average.pct)],
  ifOutToday: r.ifOutToday && [fmtFixed(r.ifOutToday.rate * interval, 2), r.ifOutToday.pct === null ? null : fmtPct(r.ifOutToday.pct)],
});
const T34_FILLS: Fill[] = [['2026-06-01', '30'], ['2026-07-01', '30'], ['2026-07-26', '30'], ['2026-08-15', '30'], ['2026-08-30', '30']];

describe('F. Långtidsanalys', () => {
  it('T33 jämn förbrukning', () => {
    const r = lt([['2026-07-03', '30'], ['2026-08-02', '30'], ['2026-09-01', '30']]);
    expect(per(r)).toEqual({
      rates: ['7,50', '7,50', '7,50'], pcts: ['100 %', '100 %', '100 %'],
      average: ['7,50', '100 %'], ifOutToday: ['7,50', '100 %'],
    });
    expect(r.fills.map((f) => f.last)).toEqual([false, false, true]);
    expect(ltRemainText(r, 'st')).toBe('0 st');
  });
  it('T34 ökande förbrukning', () => {
    const r = lt(T34_FILLS);
    expect(per(r)).toEqual({
      rates: ['7,50', '9,00', '11,25', '15,00', '7,03'], pcts: ['100 %', '120 %', '150 %', '200 %', '93,8 %'],
      average: ['10,00', '133,3 %'], ifOutToday: ['9,22', '123 %'],
    });
    expect(ltRemainText(r, 'st')).toBe('30 st');
  });
  it('T35 två styrkor räknas ihop i mg', () => {
    const r = lt([['2026-08-01', '30', '7,5'], ['2026-08-31', '30', '5'], ['2026-09-20', '30', '7,5']], '7,5', 'mg');
    expect(per(r)).toEqual({
      rates: ['7,50', '7,50', '20,45'], pcts: ['100 %', '100 %', '272,7 %'],
      average: ['7,50', '100 %'], ifOutToday: ['9,84', '131,1 %'],
    });
    expect(r.strengths).toEqual([5, 7.5]);
    expect(ltRemainText(r, 'st')).toBe('0 mg');
  });
  it('T36 uttag samma dag räknas som ett uttag', () => {
    const r = lt([['2026-09-01', '30'], ['2026-09-01', '30'], ['2026-09-21', '30']]);
    expect(r.fills.map((f) => f.rows)).toEqual([[0, 1], [2]]);
    expect(r.fills[0].amount).toBe(450);
    expect(per(r)).toEqual({
      rates: ['22,50', '22,50'], pcts: ['300 %', '300 %'], average: ['22,50', '300 %'], ifOutToday: ['22,50', '300 %'],
    });
    expect(ltRemainText(r, 'st')).toBe('40 st');
  });
  it('T37 ett uttag', () => {
    const r = lt([['2026-09-01', '30']]);
    expect(per(r)).toEqual({ rates: ['7,50'], pcts: ['100 %'], average: null, ifOutToday: ['7,50', '100 %'] });
    expect(r.shouldRemain).toBeNull();
  });
  it('T38 utan maxdos', () => {
    const r = lt(T34_FILLS, null);
    expect(per(r)).toEqual({
      rates: ['7,50', '9,00', '11,25', '15,00', '7,03'], pcts: [null, null, null, null, null],
      average: ['10,00', null], ifOutToday: ['9,22', null],
    });
    expect(r.shouldRemain).toBeNull();
  });
  it('T39 ändrad maxdos', () => {
    const r = lt([['2026-06-01', '30'], ['2026-07-01', '60'], ['2026-07-31', '60']], [['', '1'], ['2026-07-01', '2']]);
    expect(per(r)).toEqual({
      rates: ['7,50', '15,00', '7,26'], pcts: ['100 %', '100 %', '48,4 %'],
      average: ['11,25', '100 %'], ifOutToday: ['9,22', '70,1 %'],
    });
    expect(ltRemainText(r, 'st')).toBe('0 st');
  });
  it('T40 uppehåll sparar inga tabletter', () => {
    const r = lt([['2026-03-01', '30'], ['2026-05-30', '30'], ['2026-06-14', '30']]);
    expect(per(r)).toEqual({
      rates: ['2,50', '15,00', '2,06'], pcts: ['33,3 %', '200 %', '27,5 %'],
      average: ['4,29', '57,1 %'], ifOutToday: ['3,15', '42,1 %'],
    });
    expect(ltRemainText(r, 'st')).toBe('15 st');
  });
  it('T41 plåster räknas i antal, maxdos per vecka', () => {
    const r = lt([['2026-08-01', '4', ''], ['2026-08-29', '4', '']], '1', 'st', 7);
    expect(r.unit).toBe('antal');
    expect(per(r, 7)).toEqual({
      rates: ['1,00', '0,85'], pcts: ['100 %', '84,8 %'], average: ['1,00', '100 %'], ifOutToday: ['0,92', '91,8 %'],
    });
    expect(ltRemainText(r, 'plåster')).toBe('0 plåster');
  });
});

describe('Rättelser efter oberoende granskning', () => {
  it('ofullständigt datum godtas inte', () => {
    const r = calcRenewal(form({ dateRaw: '2026-09-1' }), TODAY);
    expect(r.kind).toBe('invalid');
    expect(r.errors.date).toBe('Ange datum som ÅÅÅÅ-MM-DD.');
  });
  it('datumläge: slutdatum inom nuvarande recept ger "täcker redan hela perioden"', () => {
    const r = ok({ dateRaw: '2026-08-12' });
    const p = calcPrescription(r, settings({ period: 'date', endDateRaw: '2026-10-15' }), TODAY);
    expect(p.kind).toBe('covered');
  });
  it('datumläge: slutdatum som passerat ger fel', () => {
    const r = ok({ dateRaw: '2025-06-01' });
    const p = calcPrescription(r, settings({ period: 'date', endDateRaw: '2026-09-30' }), TODAY);
    expect(p).toMatchObject({ kind: 'badDate', message: 'Slutdatumet har redan passerat.' });
  });
  it('långtidsanalysen behåller radnumret när uttagen sorteras', () => {
    const r = lt([['2026-03-01', '30'], ['2026-01-01', '10']]);
    expect(r.fills.map((f) => f.rows)).toEqual([[1], [0]]);
  });
});
