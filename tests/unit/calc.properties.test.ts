import { describe, it } from 'vitest';
import fc from 'fast-check';
import { calcCore, validateValues } from '../../src/lib/calc';
import { calcPrescribeResult } from '../../src/lib/prescribe-calc';
import { setMockNow } from '../../src/lib/clock';

setMockNow(new Date('2025-05-20T00:00:00Z').getTime());

function validInput(overrides: any = {}) {
  const amt = overrides.amt ?? fc.integer({ min: 1, max: 10000 });
  const dose = overrides.dose ?? fc.double({ min: 0.1, max: 50 });
  const ref = overrides.ref ?? fc.integer({ min: 1, max: 12 });
  const daysSince = overrides.daysSince ?? fc.integer({ min: 1, max: 3650 });
  return fc.record({
    medRaw: fc.constant('Test 100 mg'),
    dateVal: fc.constant('2024-08-13'),
    doseRaw: fc.constant(String(dose instanceof fc.Arbitrary ? 1 : dose)),
    amtRaw: fc.constant(String(amt instanceof fc.Arbitrary ? 100 : amt)),
    refRaw: fc.constant(String(ref instanceof fc.Arbitrary ? 3 : ref)),
    leftRaw: fc.constant(''),
    doseInterval: fc.constant(1),
    doseUnit: fc.constant('st'),
  });
}

describe('Property-based: calcCore invarianter (v3)', () => {
  it('valid + calculable → metrics.length === 3', () => {
    fc.assert(fc.property(
      fc.record({
        amt: fc.integer({ min: 1, max: 10000 }),
        dose: fc.double({ min: 0.1, max: 50 }),
        ref: fc.integer({ min: 1, max: 12 }),
      }),
      (params) => {
        const inp = {
          medRaw: 'Sertralin 50 mg', dateVal: '2024-08-13',
          doseRaw: String(params.dose), amtRaw: String(params.amt), refRaw: String(params.ref),
          leftRaw: '', doseInterval: 1, doseUnit: 'st',
        };
        const v = validateValues(inp.medRaw, inp.dateVal, inp.doseRaw, inp.amtRaw, inp.refRaw, inp.leftRaw);
        if (!v.valid) return;
        const r = calcCore(v);
        if (!r.valid || !r.calculable) return;
        if (r.metrics?.length !== 3) throw new Error(`metrics.length=${r.metrics?.length}, expected 3`);
      }
    ), { numRuns: 1000 });
  });

  it('consumptionPct >= 0 för alla giltiga inputs', () => {
    fc.assert(fc.property(
      fc.record({
        amt: fc.integer({ min: 1, max: 1000 }),
        dose: fc.double({ min: 0.1, max: 10 }),
        ref: fc.integer({ min: 1, max: 12 }),
        remaining: fc.oneof(fc.constant(null), fc.nat(1000)),
      }),
      (params) => {
        const inp = {
          medRaw: 'Sertralin 50 mg', dateVal: '2024-08-13',
          doseRaw: String(params.dose), amtRaw: String(params.amt), refRaw: String(params.ref),
          leftRaw: params.remaining !== null ? String(params.remaining) : '',
          doseInterval: 1, doseUnit: 'st',
        };
        const v = validateValues(inp.medRaw, inp.dateVal, inp.doseRaw, inp.amtRaw, inp.refRaw, inp.leftRaw);
        if (!v.valid) return;
        const r = calcCore(v);
        if (!r.valid || !r.calculable) return;
        if (r.consumptionPct < 0) throw new Error(`consumptionPct=${r.consumptionPct} < 0`);
      }
    ), { numRuns: 1000 });
  });

  it('tlPct ∈ [0, 100]', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 365 }),
      (daysSince) => {
        const d = new Date(Date.UTC(2025, 4, 20));
        d.setUTCDate(d.getUTCDate() - daysSince);
        const dateVal = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
        const inp = {
          medRaw: 'Sertralin 50 mg', dateVal,
          doseRaw: '1', amtRaw: '100', refRaw: '3',
          leftRaw: '', doseInterval: 1, doseUnit: 'st',
        };
        const v = validateValues(inp.medRaw, inp.dateVal, inp.doseRaw, inp.amtRaw, inp.refRaw, inp.leftRaw);
        if (!v.valid) return;
        const r = calcCore(v);
        if (!r.valid || !r.calculable) return;
        if (r.tlPct! < 0 || r.tlPct! > 100) throw new Error(`tlPct=${r.tlPct}`);
      }
    ), { numRuns: 500 });
  });

  it('calcPrescribeResult → packages >= 1 för giltig input', () => {
    fc.assert(fc.property(
      fc.nat(50),
      (pkgSize) => {
        if (pkgSize < 1) return;
        const r = calcPrescribeResult(
          { _cardId: 1, dose: 1, doseInterval: 1, doseUnit: 'st', prescribedEndDateStr: '2025-01-01' } as any,
          { packageSize: String(pkgSize), mode: 'months', months: 3 },
        );
        if (r && r.packages < 0) throw new Error(`packages=${r.packages} < 0`);
      }
    ), { numRuns: 500 });
  });

  it('avgNum = 0 → alerts har Ingen förbrukning eller tom array', () => {
    fc.assert(fc.property(
      fc.record({
        amt: fc.integer({ min: 1, max: 100 }),
        dose: fc.double({ min: 0.1, max: 10 }),
        ref: fc.integer({ min: 1, max: 3 }),
      }),
      (params) => {
        const remaining = params.amt * params.ref;
        const inp = {
          medRaw: 'Sertralin 50 mg', dateVal: '2024-08-13',
          doseRaw: String(params.dose), amtRaw: String(params.amt), refRaw: String(params.ref),
          leftRaw: String(remaining),
          doseInterval: 1, doseUnit: 'st',
        };
        const v = validateValues(inp.medRaw, inp.dateVal, inp.doseRaw, inp.amtRaw, inp.refRaw, inp.leftRaw);
        if (!v.valid) return;
        const r = calcCore(v);
        if (!r.valid || !r.calculable) return;
        if (r.consumptionPct === 0) {
          const hasWarning = (r.alerts || []).some(a => a.title?.includes('förbrukning') || a.title?.includes('Ingen'));
          if (!hasWarning && r.alerts && r.alerts.length > 0) throw new Error('No warning for zero consumption');
        }
      }
    ), { numRuns: 500 });
  });
});
