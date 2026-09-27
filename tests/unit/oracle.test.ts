// OBEROENDE KONTROLLRÄKNING
// En andra, medvetet enkel implementation av de godkända formlerna. Den räknar med heltal
// för dagar (dagnummer sedan 1970) och bråk i stället för Date-objekt, och delar ingen kod
// med appen utöver typerna. Tusentals slumpade fall ska ge exakt samma svar i båda.
// Om de skiljer sig är antingen appen eller reglerna fel — undersök, ändra inte bara testet.
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { calcRenewal, isRenewalOk } from '../../src/lib/domain/renewal';
import { calcPrescription } from '../../src/lib/domain/prescribe';
import type { MedForm } from '../../src/lib/types';

// ── Referensimplementation ──────────────────────────────────────────────────
const TODAY_DAY = 20727; // 2026-10-01 som dagnummer sedan 1970-01-01

function dayNumber(y: number, m: number, d: number): number {
  // Dagar sedan 1970-01-01 (proleptisk gregoriansk kalender), utan Date.
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  const jdn = d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
  return jdn - 2440588;
}

function isoFromDay(n: number): string {
  // Omvänd: dagnummer → ÅÅÅÅ-MM-DD (Richards algoritm).
  const J = n + 2440588;
  const f = J + 1401 + Math.floor((Math.floor((4 * J + 274277) / 146097) * 3) / 4) - 38;
  const e = 4 * f + 3;
  const g = Math.floor((e % 1461) / 4);
  const h = 5 * g + 2;
  const D = Math.floor((h % 153) / 5) + 1;
  const M = ((Math.floor(h / 153) + 2) % 12) + 1;
  const Y = Math.floor(e / 1461) - 4716 + Math.floor((14 - M) / 12);
  return `${Y}-${String(M).padStart(2, '0')}-${String(D).padStart(2, '0')}`;
}

/** Dosen som bråk: tiondelar, så att 0,5 och 1,5 räknas exakt. */
interface RefCase { daysAgo: number; doseTenths: number; interval: 1 | 7 | 30; pkg: number; refills: number }

function reference(c: RefCase) {
  // dygnsdos = dos / intervall = doseTenths / (10 × intervall), som bråk
  const num = c.doseTenths, den = 10 * c.interval;
  const total = c.pkg * c.refills;
  const coverDays = Math.floor((total * den) / num); // heltal, exakt
  const prescribed = TODAY_DAY - c.daysAgo;
  const endDay = prescribed + coverDays - 1;
  const daysLeft = endDay - TODAY_DAY;
  const expectedLeft = Math.max(0, total - (num * c.daysAgo) / den);
  const status = daysLeft >= 14 ? 'enough' : daysLeft >= 0 ? 'soon' : -daysLeft > 90 ? 'longOut' : 'out';
  const pct = c.daysAgo > 0 ? (total * den * 100) / (c.daysAgo * num) : null;
  const shown = pct === null ? null : Math.round(pct * 10) / 10;
  const tone = shown === null ? null : shown >= 80 && shown <= 110 ? 'ok' : 'warn';
  return { coverDays, endDate: isoFromDay(endDay), daysLeft, expectedLeft, status, pct, tone };
}

function referencePrescription(c: RefCase, months: number, pkgNew: number) {
  const r = reference(c);
  const start = r.daysLeft >= 0 ? TODAY_DAY + r.daysLeft + 1 : TODAY_DAY;
  // idag = 2026-10-01; +N månader, dag klampad till månadens sista
  const m0 = 9 + months; // 0-baserad månad
  const y = 2026 + Math.floor(m0 / 12), m = (m0 % 12) + 1;
  const lastDay = [31, (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  const target = dayNumber(y, m, Math.min(1, lastDay));
  const days = target - start + 1;
  if (days <= 0) return { kind: 'covered' as const };
  const units = Math.ceil((days * c.doseTenths) / (10 * c.interval));
  return { kind: 'ok' as const, days, units, packages: Math.ceil(units / pkgNew) };
}

// ── Koppling till appen ─────────────────────────────────────────────────────
const TODAY = new Date(Date.UTC(2026, 9, 1));

function appForm(c: RefCase): MedForm {
  return {
    name: 'Kontroll 1 mg', atcCode: null, nplId: null, doseForm: '', regulation: null, notCalculable: false, unit: 'st',
    dateRaw: isoFromDay(TODAY_DAY - c.daysAgo),
    doseRaw: (c.doseTenths / 10).toString().replace('.', ','),
    interval: c.interval, packageRaw: String(c.pkg), refillsRaw: String(c.refills),
  };
}

const arbCase = fc.record({
  daysAgo: fc.integer({ min: 0, max: 1500 }),
  doseTenths: fc.integer({ min: 1, max: 100 }),
  interval: fc.constantFrom(1 as const, 7 as const, 30 as const),
  pkg: fc.integer({ min: 1, max: 500 }),
  refills: fc.integer({ min: 1, max: 12 }),
});

describe('Referensimplementationen själv', () => {
  it('dagnummer stämmer mot kända datum', () => {
    expect(dayNumber(1970, 1, 1)).toBe(0);
    expect(dayNumber(2026, 10, 1)).toBe(TODAY_DAY);
    expect(isoFromDay(TODAY_DAY)).toBe('2026-10-01');
    expect(isoFromDay(dayNumber(2024, 2, 29))).toBe('2024-02-29');
  });
});

describe('Appen räknar som referensen', () => {
  it('förnyelse: räcker t.o.m., dagar kvar, borde finnas kvar, status, procent och färg', () => {
    fc.assert(fc.property(arbCase, (c) => {
      const ref = reference(c);
      const app = calcRenewal(appForm(c), TODAY);
      if (ref.coverDays < 1 || ref.coverDays > 3650) return app.kind === 'implausible';
      if (!isRenewalOk(app)) return false;
      expect(app.coverDays).toBe(ref.coverDays);
      expect(app.endDate.toISOString().slice(0, 10)).toBe(ref.endDate);
      expect(app.daysLeft).toBe(ref.daysLeft);
      expect(app.expectedLeft).toBeCloseTo(ref.expectedLeft, 9);
      expect(app.status).toBe(ref.status);
      if (ref.pct === null) expect(app.consumption).toBeNull();
      else {
        expect(app.consumption!.pct).toBeCloseTo(ref.pct, 9);
        expect(app.consumption!.tone).toBe(ref.tone);
      }
      return true;
    }), { numRuns: 5000 });
  });

  it('nyförskrivning: start, dagar, mängd och förpackningar', () => {
    fc.assert(fc.property(arbCase, fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 200 }), (c, months, pkgNew) => {
      const app = calcRenewal(appForm(c), TODAY);
      if (!isRenewalOk(app)) return true;
      const ref = referencePrescription(c, months, pkgNew);
      const p = calcPrescription(app, { period: months, endDateRaw: '', packageRaw: String(pkgNew), fromToday: false }, TODAY);
      if (ref.kind === 'covered') return p.kind === 'covered';
      expect(p).toMatchObject({ kind: 'ok', days: ref.days, units: ref.units, packages: ref.packages });
      return true;
    }), { numRuns: 5000 });
  });
});
