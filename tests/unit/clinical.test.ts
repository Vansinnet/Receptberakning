// Kliniska testfall T01–T32, godkända 2026-09-27 i "Recept 5.0 — planering",
// fliken Kliniska testfall. Idag = 2026-10-01 i alla fall.
// Ändra ALDRIG ett förväntat värde här utan att fallet först ändrats och godkänts i dokumentet.
import { describe, it, expect } from 'vitest';
import { calcRenewal, daysLeftText, isRenewalOk, STATUS_LABEL, type RenewalOk } from '../../src/lib/domain/renewal';
import { calcPrescription } from '../../src/lib/domain/prescribe';
import { calcLongterm } from '../../src/lib/domain/longterm';
import { fmtDate, fmtFixed, fmtPct, fmtQty } from '../../src/lib/utils';
import type { MedForm, PrescribeSettings } from '../../src/lib/types';

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

describe('F. Långtidsanalys', () => {
  it('T30 två perioder i nivå', () => {
    const r = calcLongterm([
      { startRaw: '2026-01-01', endRaw: '2026-03-31', totalRaw: '90' },
      { startRaw: '2026-04-01', endRaw: '2026-06-30', totalRaw: '91' },
    ], '1', TODAY);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.periods.map((p) => p.days)).toEqual([90, 91]);
    expect(r.unionDays).toBe(181);
    expect(r.total).toBe(181);
    expect(fmtPct(r.pct)).toBe('100 %');
    expect(r.periods.every((p) => p.cls === 'ok')).toBe(true);
    expect(r.overlap).toBe(false);
  });
  it('T31 överlappande perioder', () => {
    const r = calcLongterm([
      { startRaw: '2026-01-01', endRaw: '2026-04-15', totalRaw: '105' },
      { startRaw: '2026-04-01', endRaw: '2026-06-30', totalRaw: '91' },
    ], '1', TODAY);
    if (r.kind !== 'ok') throw new Error('förväntade ok');
    expect(r.overlap).toBe(true);
    expect(r.unionDays).toBe(181);
    expect(r.total).toBe(196);
    expect(fmtPct(r.pct)).toBe('108,3 %');
    expect(r.cls).toBe('ok');
  });
  it('T32 två identiska perioder', () => {
    const r = calcLongterm([
      { startRaw: '2026-01-01', endRaw: '2026-03-31', totalRaw: '90' },
      { startRaw: '2026-01-01', endRaw: '2026-03-31', totalRaw: '90' },
    ], '1', TODAY);
    if (r.kind !== 'ok') throw new Error('förväntade ok');
    expect(r.overlap).toBe(true);
    expect(r.unionDays).toBe(90);
    expect(r.periods.map((p) => p.index)).toEqual([0, 1]);
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
  it('långtidsanalysen behåller radnumret när perioderna sorteras', () => {
    const r = calcLongterm([
      { startRaw: '2026-03-01', endRaw: '2026-03-31', totalRaw: '31' },
      { startRaw: '2026-01-01', endRaw: '2026-01-31', totalRaw: '10' },
    ], '1', TODAY);
    if (r.kind !== 'ok') throw new Error('förväntade ok');
    expect(r.periods.map((p) => p.index)).toEqual([1, 0]);
  });
});
