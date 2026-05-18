import { describe, it, beforeAll } from 'vitest';
import fc from 'fast-check';
import { setMockNow } from '../../src/lib/clock';
import { calcCore } from '../../src/lib/calc';
import { calcPrescribeResult } from '../../src/lib/prescribe-calc';
import { buildPatientText, buildJournalText } from '../../src/lib/text-gen';
import type { PrevCalcResult, MedState } from '../../src/lib/types';

const MOCK_TODAY_MS = new Date('2025-06-15T00:00:00.000Z').getTime();
const NO_PREV: PrevCalcResult = { isOveruse: false, isTooEarly: false, earlyRenewalDecision: null };

beforeAll(() => {
  setMockNow(MOCK_TODAY_MS);
});

function makePropInput(overrides: {
  amt: number; dose: number; ref: number; daysSince: number; remaining?: number;
}): any {
  const { amt, dose, ref, daysSince, remaining } = overrides;
  const today = new Date(MOCK_TODAY_MS);
  const pDate = new Date(today.getTime() - daysSince * 86400000);
  const hasRemaining = remaining !== undefined;
  return {
    valid: true,
    medRaw: 'Testabol 10 mg',
    pDate,
    amt,
    dose,
    ref,
    remaining: hasRemaining ? remaining : null,
    doseRaw: String(dose),
    amtRaw: String(amt),
    refRaw: String(ref),
    leftRaw: hasRemaining ? String(remaining) : '',
    doseInterval: 1,
    doseUnit: 'st' as const,
    notCalculable: false,
  };
}

describe('Property-based: calcCore invarianter', () => {
  // Invariant 1: Om avgNum > effectiveDailyDose * 1.10 och daysRemaining > 7
  // ska isOveruse alltid vara true (såvida inte totalDays > 3650)
  it('avgNum > 1.10x dos AND daysRemaining > 7 → isOveruse=true', () => {
    fc.assert(
      fc.property(
        fc.record({
          amt: fc.integer({ min: 1, max: 10000 }),
          dose: fc.integer({ min: 1, max: 50 }),
          ref: fc.integer({ min: 1, max: 12 }),
          daysSince: fc.integer({ min: 1, max: 365 }),
        }),
        ({ amt, dose, ref, daysSince }) => {
          const input = makePropInput({ amt, dose, ref, daysSince });
          const total = amt * ref;
          const totalDays = total / dose;

          // Skip om totalDays är orimligt stort
          if (totalDays > 3650) return;

          // Skip om daysSince är för få för att ge överförbrukning
          // avgNum = total/daysSince > dose * 1.10 → daysSince < total/(dose*1.10)
          const maxDaysForOveruse = total / (dose * 1.10);
          if (daysSince >= maxDaysForOveruse) return;

          const r = calcCore(input, NO_PREV);
          const remainingDays = r.daysRemaining ?? Infinity;

          if (!r.valid || !r.calculable) return;

          // När avgNum > dose*1.10 OCH daysRemaining > 7 → isOveruse=true
          // (med undantag för daysToPrescribedEnd ≤ 14 suppress)
          if (remainingDays > 7 && (r.daysToPrescribedEnd ?? 0) > 14) {
            if (!r.isOveruse) {
              throw new Error(
                `isOveruse=false trots avgNum=${(total/daysSince).toFixed(2)} > ${(dose * 1.10).toFixed(2)} ` +
                `och daysRemaining=${remainingDays} > 7 (amt=${amt}, dose=${dose}, ref=${ref}, daysSince=${daysSince})`
              );
            }
          }
        }
      ),
      { numRuns: 1000 }
    );
  }, 15000);

  // Invariant 2: Om daysToPrescribedEnd <= totalDays * 0.20 ska isTooEarly alltid vara false
  it('daysToPrescribedEnd ≤ 20% av totalDays → isTooEarly=false', () => {
    fc.assert(
      fc.property(
        fc.record({
          amt: fc.integer({ min: 10, max: 500 }),
          dose: fc.integer({ min: 1, max: 10 }),
          ref: fc.integer({ min: 1, max: 6 }),
          daysSince: fc.integer({ min: 1, max: 2000 }),
        }),
        ({ amt, dose, ref, daysSince }) => {
          const input = makePropInput({ amt, dose, ref, daysSince });
          const totalDays = (amt * ref) / dose;

          // Skip orimliga värden
          if (totalDays > 3650) return;

          const r = calcCore(input, NO_PREV);
          if (!r.valid || !r.calculable) return;
          if (r.isOveruse) return; // isTooEarly är false när isOveruse är true

          const earlyThreshold = Math.round(totalDays * 0.20);
          const dtpe = r.daysToPrescribedEnd ?? Infinity;

          if (dtpe <= earlyThreshold) {
            if (r.isTooEarly) {
              throw new Error(
                `isTooEarly=true trots daysToPrescribedEnd=${dtpe} ≤ earlyThreshold=${earlyThreshold} ` +
                `(totalDays=${totalDays.toFixed(1)}, amt=${amt}, dose=${dose}, ref=${ref}, daysSince=${daysSince})`
              );
            }
          }
        }
      ),
      { numRuns: 1000 }
    );
  }, 15000);

  // Invariant 3: calcCore ska aldrig returnera isOveruse=true och isTooEarly=true samtidigt
  it('isOveruse och isTooEarly är ömsesidigt uteslutande', () => {
    fc.assert(
      fc.property(
        fc.record({
          amt: fc.integer({ min: 1, max: 1000 }),
          dose: fc.double({ min: 0.1, max: 50.0 }),
          ref: fc.integer({ min: 1, max: 12 }),
          daysSince: fc.integer({ min: 1, max: 3650 }),
          hasRemaining: fc.boolean(),
        }),
        ({ amt, dose, ref, daysSince, hasRemaining }) => {
          const remaining = hasRemaining ? Math.floor(Math.random() * (amt * ref)) : undefined;
          const input = makePropInput({ amt, dose, ref, daysSince, remaining });

          const r = calcCore(input, NO_PREV);
          if (!r.valid || !r.calculable) return;

          if (r.isOveruse && r.isTooEarly) {
            throw new Error(
              `isOveruse=true OCH isTooEarly=true samtidigt — detta ska vara omöjligt ` +
              `(amt=${amt}, dose=${dose}, ref=${ref}, daysSince=${daysSince})`
            );
          }
        }
      ),
      { numRuns: 1000 }
    );
  }, 15000);

  // Invariant 4: valid:true → metrics har alltid exakt 3 rader
  it('valid + calculable → metrics.length === 3', () => {
    fc.assert(
      fc.property(
        fc.record({
          amt: fc.integer({ min: 1, max: 1000 }),
          dose: fc.integer({ min: 1, max: 50 }),
          ref: fc.integer({ min: 1, max: 12 }),
          daysSince: fc.integer({ min: 1, max: 365 }),
        }),
        ({ amt, dose, ref, daysSince }) => {
          const input = makePropInput({ amt, dose, ref, daysSince });
          const totalDays = (amt * ref) / dose;
          if (totalDays > 3650) return;
          const r = calcCore(input, NO_PREV);
          if (!r.valid || !r.calculable) return;
          if ((r.metrics?.length ?? 0) !== 3) {
            throw new Error(`metrics.length=${r.metrics?.length}, förväntade 3`);
          }
        }
      ),
      { numRuns: 500 }
    );
  });

  // Invariant 5: tlPct är alltid i [0, 100]
  it('tlPct ∈ [0, 100]', () => {
    fc.assert(
      fc.property(
        fc.record({
          amt: fc.integer({ min: 1, max: 1000 }),
          dose: fc.double({ min: 0.1, max: 50.0 }),
          ref: fc.integer({ min: 1, max: 12 }),
          daysSince: fc.integer({ min: 1, max: 3650 }),
        }),
        ({ amt, dose, ref, daysSince }) => {
          const input = makePropInput({ amt, dose, ref, daysSince });
          const totalDays = (amt * ref) / dose;
          if (totalDays > 3650) return;
          const r = calcCore(input, NO_PREV);
          if (!r.valid || !r.calculable) return;
          if (r.tlPct! < 0 || r.tlPct! > 100) {
            throw new Error(`tlPct=${r.tlPct} utanför [0, 100]`);
          }
        }
      ),
      { numRuns: 500 }
    );
  });

  // Invariant 6: buildPatientText returnerar aldrig tom sträng vid giltig input
  it('buildPatientText → aldrig tom sträng för giltig input', () => {
    fc.assert(
      fc.property(
        fc.record({
          medRaw: fc.constantFrom('Elvanse 50 mg', 'Metformin 500 mg', 'Losartan 50 mg', 'Alvedon 500 mg'),
          total: fc.integer({ min: 30, max: 1200 }),
          dose: fc.integer({ min: 1, max: 10 }),
          doseUnitLabel: fc.constantFrom('st/dag', 'st/vecka', 'st/månad'),
          daysToPrescribedEnd: fc.integer({ min: 1, max: 365 }),
          lang: fc.constantFrom<'sv' | 'en'>('sv', 'en'),
        }),
        ({ medRaw, total, dose, doseUnitLabel, daysToPrescribedEnd, lang }) => {
          const s: MedState = {
            _cardId: 1,
            medRaw, dose, doseUnitLabel, total,
            pDateStr: '2024-09-28',
            prescribedEndDateStr: '2025-06-25',
            displayAvgStr: '1.00 st/dag',
            avgNote: '(beräknat)',
            valid: true, calculable: true,
            daysToPrescribedEnd,
            prescribedContactDateStr: '2025-08-25',
            prescribedContactIsPast: false,
            renewDateStr: '2025-10-12',
            doseUnit: 'st',
            remainingDoses: null,
            daysRemaining: daysToPrescribedEnd,
            isOveruse: false,
            isTooEarly: false,
            earlyRenewalDecision: null,
          };
          const items = [{ name: medRaw, i: 0, state: s }];
          const text = buildPatientText(lang, items, [], [], 1, {}, [s]);
          if (text.length === 0) {
            throw new Error(`buildPatientText returned empty string for valid input (lang=${lang}, med=${medRaw})`);
          }
        }
      ),
      { numRuns: 500 }
    );
  });

  // Invariant 7: buildJournalText returnerar aldrig tom sträng vid giltig input
  it('buildJournalText → aldrig tom sträng för giltig input', () => {
    fc.assert(
      fc.property(
        fc.record({
          medRaw: fc.constantFrom('Elvanse 50 mg', 'Metformin 500 mg', 'Losartan 50 mg'),
          total: fc.integer({ min: 30, max: 1200 }),
          dose: fc.integer({ min: 1, max: 10 }),
          doseUnitLabel: fc.constantFrom('st/dag', 'st/vecka'),
          daysToPrescribedEnd: fc.integer({ min: 1, max: 365 }),
          scenario: fc.constantFrom<'toRenew' | 'tooEarly' | 'overuse'>('toRenew', 'tooEarly', 'overuse'),
        }),
        ({ medRaw, total, dose, doseUnitLabel, daysToPrescribedEnd, scenario }) => {
          const s: MedState = {
            _cardId: 1,
            medRaw, dose, doseUnitLabel, total,
            pDateStr: '2024-09-28',
            prescribedEndDateStr: '2025-06-25',
            displayAvgStr: '1.00 st/dag',
            avgNote: '(beräknat)',
            valid: true, calculable: true,
            daysToPrescribedEnd,
            doseUnit: 'st',
            remainingDoses: null,
            daysRemaining: daysToPrescribedEnd,
            isOveruse: false,
            isTooEarly: false,
            earlyRenewalDecision: null,
          };
          const items = [{ name: medRaw, i: 0, state: s }];
          let text: string;
          if (scenario === 'toRenew') {
            text = buildJournalText(items, [], [], 1, {}, [s]);
          } else if (scenario === 'tooEarly') {
            text = buildJournalText([], items, [], 1, {}, [s]);
          } else {
            text = buildJournalText([], [], items, 1, {}, [s]);
          }
          if (text.length === 0) {
            throw new Error(`buildJournalText returned empty string for valid input (scenario=${scenario}, med=${medRaw})`);
          }
        }
      ),
      { numRuns: 500 }
    );
  });

  // Invariant 8: calcPrescribeResult → packages ≥ 1 när input är giltig
  it('calcPrescribeResult → packages ≥ 1 vid giltig input', () => {
    fc.assert(
      fc.property(
        fc.record({
          dose: fc.integer({ min: 1, max: 10 }),
          doseInterval: fc.constantFrom(1, 7, 30),
          pkgSize: fc.integer({ min: 10, max: 100 }),
          daysRemaining: fc.integer({ min: 0, max: 30 }),
        }),
        ({ dose, doseInterval, pkgSize, daysRemaining }) => {
          const endStr = daysRemaining === 0
            ? '2025-06-01'
            : `2025-${String(6 + Math.ceil(daysRemaining / 30)).padStart(2, '0')}-15`;
          const s: MedState = {
            _cardId: 1,
            dose,
            doseInterval: doseInterval as 1 | 7 | 30,
            doseUnit: 'st',
            prescribedEndDateStr: endStr,
            valid: true, calculable: true,
          };
          const r = calcPrescribeResult(s, { packageSize: String(pkgSize), mode: 'months', months: 3 });
          if (!r) return;
          if (r.packages < 1 && r.totalDays > 0) {
            throw new Error(
              `packages=${r.packages} men totalDays=${r.totalDays} > 0 ` +
              `(dose=${dose}, interval=${doseInterval}, pkgSize=${pkgSize}, endDate=${endStr})`
            );
          }
        }
      ),
      { numRuns: 500 }
    );
  });
});
