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
    packageRaw: String(i.pkg), refillsRaw: String(i.refills), reportedRaw: '', refillsLeftRaw: '', ...extra,
  };
}

describe('Egenskaper — förnyelse', () => {
  it('patientens uppgift ändrar aldrig någon beräkning', () => {
    fc.assert(fc.property(arbInput, fc.integer({ min: 0, max: 3000 }), (i, reported) => {
      const a = calcRenewal(mk(i), TODAY);
      const b = calcRenewal(mk(i, { reportedRaw: String(reported), refillsLeftRaw: String(Math.min(reported, i.refills)) }), TODAY);
      if (!isRenewalOk(a) || !isRenewalOk(b)) return a.kind === b.kind;
      return a.endDate.getTime() === b.endDate.getTime() && a.expectedLeft === b.expectedLeft
        && a.daysLeft === b.daysLeft && a.status === b.status && a.consumption?.pct === b.consumption?.pct;
    }), { numRuns: 2000 });
  });

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
  it('ordningen på perioderna påverkar inte resultatet', () => {
    const arbPeriod = fc.record({ start: fc.integer({ min: 30, max: 600 }), len: fc.integer({ min: 1, max: 120 }), total: fc.integer({ min: 1, max: 300 }) });
    fc.assert(fc.property(fc.array(arbPeriod, { minLength: 1, maxLength: 6 }), (ps) => {
      const rows = ps.map((p) => ({
        startRaw: fmtDate(addDays(TODAY, -p.start)),
        endRaw: fmtDate(addDays(TODAY, -p.start + p.len - 1)),
        totalRaw: String(p.total),
      }));
      const a = calcLongterm(rows, '1', TODAY);
      const b = calcLongterm([...rows].reverse(), '1', TODAY);
      if (a.kind !== 'ok' || b.kind !== 'ok') return a.kind === b.kind;
      return a.unionDays === b.unionDays && a.total === b.total && Math.abs(a.pct - b.pct) < 1e-9 && a.overlap === b.overlap;
    }), { numRuns: 1000 });
  });
});
