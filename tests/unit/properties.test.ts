// Egenskaper som alltid ska gälla, testade med tusentals slumpade fall (fast-check).
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { calcRenewal, isRenewalOk } from '../../src/lib/domain/renewal';
import { calcPrescription } from '../../src/lib/domain/prescribe';
import { calcLongterm } from '../../src/lib/domain/longterm';
import { addDays, fmtDate } from '../../src/lib/utils';
import type { MedForm } from '../../src/lib/types';

const TODAY = new Date(Date.UTC(2026, 9, 1));

const arbInput = fc.record({
  daysAgo: fc.integer({ min: 0, max: 900 }),
  dose: fc.constantFrom('0,5', '1', '1,5', '2', '3', '4'),
  interval: fc.constantFrom(1 as const, 7 as const, 30 as const),
  pkg: fc.integer({ min: 1, max: 200 }),
  refills: fc.integer({ min: 1, max: 12 }),
});

function mk(i: { daysAgo: number; dose: string; interval: 1 | 7 | 30; pkg: number; refills: number }, extra: Partial<MedForm> = {}): MedForm {
  return {
    name: 'Test 10 mg', atcCode: null, nplId: null, doseForm: '', regulation: null, notCalculable: false, unit: 'st',
    dateRaw: fmtDate(addDays(TODAY, -i.daysAgo)), doseRaw: i.dose, interval: i.interval,
    packageRaw: String(i.pkg), refillsRaw: String(i.refills), ...extra,
  };
}

describe('Egenskaper — förnyelse', () => {
  it('fler dagar sedan receptdatum ger aldrig mer kvar', () => {
    fc.assert(fc.property(arbInput, (i) => {
      if (i.daysAgo === 0) return true;
      const later = calcRenewal(mk(i), TODAY);
      const earlier = calcRenewal(mk({ ...i, daysAgo: i.daysAgo - 1 }), TODAY);
      if (!isRenewalOk(later) || !isRenewalOk(earlier)) return true;
      return later.expectedLeft <= earlier.expectedLeft && later.daysLeft === earlier.daysLeft - 1;
    }), { numRuns: 2000 });
  });

  it('inga NaN, negativa mängder eller datum före receptdatum', () => {
    fc.assert(fc.property(arbInput, (i) => {
      const r = calcRenewal(mk(i), TODAY);
      if (!isRenewalOk(r)) return r.kind === 'implausible';
      const nums = [r.dailyDose, r.total, r.coverDays, r.daysLeft, r.expectedLeft, r.elapsedPct, r.consumption?.pct ?? 0];
      return nums.every(Number.isFinite) && r.expectedLeft >= 0 && r.endDate >= r.prescribedDate
        && r.elapsedPct >= 0 && r.elapsedPct <= 100;
    }), { numRuns: 3000 });
  });

  it('räcker t.o.m. stämmer med förskriven mängd', () => {
    fc.assert(fc.property(arbInput, (i) => {
      const r = calcRenewal(mk(i), TODAY);
      if (!isRenewalOk(r)) return true;
      // Hela dagar: coverDays doser ryms, coverDays + 1 gör det inte.
      return r.coverDays * r.dailyDose <= r.total + 1e-9 && (r.coverDays + 1) * r.dailyDose > r.total - 1e-9;
    }), { numRuns: 2000 });
  });

  it('exakt följsamhet ger 100 % när perioden precis tagit slut', () => {
    fc.assert(fc.property(arbInput, (i) => {
      const probe = calcRenewal(mk(i), TODAY);
      if (!isRenewalOk(probe)) return true;
      const exactDays = probe.total / probe.dailyDose;
      if (!Number.isInteger(Math.round(exactDays * 1e9) / 1e9)) return true;
      const r = calcRenewal(mk({ ...i, daysAgo: Math.round(exactDays) }), TODAY);
      if (!isRenewalOk(r)) return true;
      return Math.abs(r.consumption!.pct - 100) < 1e-6 && r.expectedLeft === 0;
    }), { numRuns: 2000 });
  });
});

describe('Egenskaper — nyförskrivning', () => {
  it('antal förpackningar räcker alltid hela perioden', () => {
    fc.assert(fc.property(arbInput, fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 200 }), (i, months, pkg) => {
      const r = calcRenewal(mk(i), TODAY);
      if (!isRenewalOk(r)) return true;
      const p = calcPrescription(r, { period: months, endDateRaw: '', packageRaw: String(pkg), fromToday: false }, TODAY);
      if (p.kind !== 'ok') return p.kind === 'covered';
      return p.packages * p.packageSize >= p.days * r.dailyDose - 1e-9 && (p.packages - 1) * p.packageSize < p.units;
    }), { numRuns: 2000 });
  });
});

describe('Egenskaper — långtidsanalys', () => {
  const arbFill = fc.record({ ago: fc.integer({ min: 0, max: 600 }), count: fc.integer({ min: 1, max: 300 }), s: fc.constantFrom('5', '7,5', '10') });
  const rows = (fs: { ago: number; count: number; s: string }[], k = 1) =>
    fs.map((f) => ({ dateRaw: fmtDate(addDays(TODAY, -f.ago)), countRaw: String(f.count * k), strengthRaw: f.s }));
  const max = (mg: number) => [{ fromRaw: '', doseRaw: String(mg).replace('.', ',') }];

  it('ordningen på uttagen påverkar inte resultatet', () => {
    fc.assert(fc.property(fc.array(arbFill, { minLength: 1, maxLength: 8 }), (fs) => {
      const a = calcLongterm(rows(fs), max(7.5), 'mg', 1, TODAY);
      const b = calcLongterm(rows(fs).reverse(), max(7.5), 'mg', 1, TODAY);
      if (a.kind !== 'ok' || b.kind !== 'ok') return a.kind === b.kind;
      return a.fills.length === b.fills.length && a.total === b.total
        && a.fills.every((f, i) => f.amount === b.fills[i].amount && f.pct === b.fills[i].pct)
        && a.average?.pct === b.average?.pct && a.shouldRemain === b.shouldRemain;
    }), { numRuns: 1000 });
  });

  it('skalas alla uttag och maxdosen lika blir procenten densamma', () => {
    fc.assert(fc.property(fc.array(arbFill, { minLength: 2, maxLength: 8 }), fc.integer({ min: 2, max: 5 }), (fs, k) => {
      const a = calcLongterm(rows(fs), max(7.5), 'mg', 1, TODAY);
      const b = calcLongterm(rows(fs, k), max(7.5 * k), 'mg', 1, TODAY);
      if (a.kind !== 'ok' || b.kind !== 'ok') return false;
      const close = (x: number | null | undefined, y: number | null | undefined) => (x == null ? y == null : Math.abs(x - y!) < 1e-9 * Math.max(1, x));
      return a.fills.every((f, i) => close(f.pct, b.fills[i].pct)) && close(a.average?.pct, b.average?.pct)
        && close(a.ifOutToday?.pct, b.ifOutToday?.pct) && close((a.shouldRemain ?? 0) * k, b.shouldRemain ?? 0);
    }), { numRuns: 1000 });
  });

  it('ett uttag delat på två rader samma dag ger samma resultat', () => {
    fc.assert(fc.property(fc.array(arbFill, { minLength: 1, maxLength: 6 }), (fs) => {
      const split = fs.flatMap((f) => (f.count > 1 ? [{ ...f, count: Math.floor(f.count / 2) }, { ...f, count: f.count - Math.floor(f.count / 2) }] : [f]));
      const a = calcLongterm(rows(fs), max(7.5), 'mg', 1, TODAY);
      const b = calcLongterm(rows(split), max(7.5), 'mg', 1, TODAY);
      if (a.kind !== 'ok' || b.kind !== 'ok') return false;
      return a.fills.length === b.fills.length && a.fills.every((f, i) => Math.abs(f.amount - b.fills[i].amount) < 1e-9);
    }), { numRuns: 1000 });
  });
});
