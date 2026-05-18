import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { setMockNow } from '../../src/lib/clock';
import { calcCore, validateValues } from '../../src/lib/calc';
import { calcLongtermCore } from '../../src/lib/calc-longterm';
import { calcPrescribeResult, canRenewMed, prescribeValidationHint } from '../../src/lib/prescribe-calc';
import { buildPatientText, buildJournalText, buildNurseJournalText, remainingDosesNote, resolveState } from '../../src/lib/text-gen';
import goldenFixtures from '../fixtures/calccore-golden.json';
import type { MedState, PrevCalcResult } from '../../src/lib/types';

const MOCK_TODAY_MS = new Date('2025-06-15T00:00:00.000Z').getTime();

beforeAll(() => {
  setMockNow(MOCK_TODAY_MS);
});

const NO_PREV: PrevCalcResult = { isOveruse: false, isTooEarly: false, earlyRenewalDecision: null };

// Hjälpare: skapa giltigt ValidatedInput utan DOM
function makeInput(overrides: {
  daysSince?: number;
  amt?: number;
  dose?: number;
  ref?: number;
  remaining?: number | null;
  medRaw?: string;
  doseInterval?: number;
  doseUnit?: string;
  notCalculable?: boolean;
} = {}): any {
  const d = overrides;
  const today = new Date(MOCK_TODAY_MS);
  const daysSince = d.daysSince ?? 100;
  const pDate = new Date(today.getTime() - daysSince * 86400000);
  return {
    valid: true,
    medRaw: d.medRaw ?? 'Testabol 10 mg',
    pDate,
    amt: d.amt ?? 100,
    dose: d.dose ?? 1,
    ref: d.ref ?? 3,
    remaining: d.remaining ?? null,
    doseRaw: String(d.dose ?? 1),
    amtRaw: String(d.amt ?? 100),
    refRaw: String(d.ref ?? 3),
    leftRaw: d.remaining !== null ? String(d.remaining) : '',
    doseInterval: d.doseInterval ?? 1,
    doseUnit: (d.doseUnit ?? 'st') as 'st' | 'ml' | 'dos',
    notCalculable: !!d.notCalculable,
  };
}

// Hjälpare för datum-sträng N dagar före MOCK_TODAY
function daysAgo(n: number): string {
  const d = new Date(MOCK_TODAY_MS - n * 86400000);
  return d.toISOString().slice(0, 10);
}

function daysFromNow(n: number): string {
  const d = new Date(MOCK_TODAY_MS + n * 86400000);
  return d.toISOString().slice(0, 10);
}

// Hjälpare: skapa minimal MedState
function makeRenewState(overrides: Partial<MedState> = {}): MedState {
  return {
    _cardId: 1,
    medRaw: 'Elvanse 50 mg',
    pDateStr: '2024-09-28',
    total: 300,
    dose: 1,
    doseUnit: 'st',
    doseUnitLabel: 'st/dag',
    prescribedEndDateStr: '2025-06-25',
    displayAvgStr: '1.00 st/dag',
    avgNote: '(beräknat under antagandet att alla tillgängliga doser är förbrukade)',
    remainingDoses: null,
    daysRemaining: 10,
    daysToPrescribedEnd: 10,
    earlyRenewalDecision: null,
    valid: true,
    calculable: true,
    ...overrides,
  };
}

// =====================================================
// CALCCORE
// =====================================================

describe('calcCore — Ogiltiga indata', () => {
  it('ofullständigt inputData → valid:false, statusText "Ej ifyllt"', () => {
    const r = calcCore({ valid: false, reason: 'incomplete' }, NO_PREV);
    expect(r.valid).toBe(false);
    expect(r.statusText).toBe('Ej ifyllt');
  });

  it('ogiltigt datum → valid:false, statusText "Ogiltigt datum"', () => {
    const r = calcCore({ valid: false, reason: 'invalid_date' }, NO_PREV);
    expect(r.valid).toBe(false);
    expect(r.statusText).toBe('Ogiltigt datum');
  });

  it('too_many_refs → valid:true med danger-alert', () => {
    const r = calcCore({ valid: false, reason: 'too_many_refs' }, NO_PREV);
    expect(r.valid).toBe(true);
    expect(r.alerts?.some(a => a.type === 'danger')).toBe(true);
  });
});

describe('calcCore — Kantfall: daysSince = 0', () => {
  it('recept utfärdat idag → calculable:false, "Kan ej beräknas"', () => {
    const r = calcCore(makeInput({ daysSince: 0 }), NO_PREV);
    expect(r.calculable).toBe(false);
    expect(r.statusText).toBe('Kan ej beräknas');
    expect(r.verdictTitle).toContain('Kan ej beräknas');
  });
});

describe('calcCore — Kantfall: orimliga värden', () => {
  it('totalDays > 3650 → "Orimliga värden"', () => {
    const r = calcCore(makeInput({ amt: 10000, dose: 1, ref: 3, daysSince: 50 }), NO_PREV);
    expect(r.verdictTitle).toContain('Orimliga värden');
    expect(r.isOveruse).toBe(false);
  });

  it('remaining > total → "Orimligt värde"', () => {
    const r = calcCore(makeInput({ amt: 100, ref: 1, daysSince: 50, remaining: 200 }), NO_PREV);
    expect(r.verdictTitle).toContain('Orimligt värde');
    expect(r.isOveruse).toBe(false);
  });
});

describe('calcCore — Normalfall: OK att förnya', () => {
  it('förbrukning inom ±10 %, <20 % av perioden kvar → OK att förnya', () => {
    const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 280 }), NO_PREV);
    expect(r.isOveruse).toBe(false);
    expect(r.isTooEarly).toBe(false);
    expect(r.verdictTitle).toContain('OK');
  });

  it('förbrukning exakt på 110 %-gränsen → OK (villkoret är >, inte >=)', () => {
    const r = calcCore(makeInput({ amt: 308, dose: 1, ref: 1, daysSince: 280 }), NO_PREV);
    expect(r.isOveruse).toBe(false);
  });

  it('låg förbrukning (<80 %) → OK att förnya med warn-alert', () => {
    const r = calcCore(makeInput({ amt: 50, dose: 1, ref: 1, daysSince: 40, remaining: 30 }), NO_PREV);
    expect(r.isOveruse).toBe(false);
    expect(r.isTooEarly).toBe(false);
    expect(r.alerts?.some(a => a.type === 'warn' && (a.title?.includes('förbrukning') || a.title?.includes('Låg')))).toBe(true);
  });
});

describe('calcCore — För tidigt att förnya', () => {
  it('>20 % av receptperioden kvar, normal förbrukning → isTooEarly', () => {
    const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 30, remaining: 80 }), NO_PREV);
    expect(r.isTooEarly).toBe(true);
    expect(r.isOveruse).toBe(false);
    expect(r.verdictTitle).toContain('För tidigt');
  });

  it('isTooEarly baseras på receptperiod, inte på kvarvarande dosdagar', () => {
    const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 10, remaining: 290 }), NO_PREV);
    expect(r.isTooEarly).toBe(true);
  });
});

describe('calcCore — Överförbrukning', () => {
  it('snitt >10 % över dos, >7 dosdagar kvar, >14 dagars receptperiod → isOveruse', () => {
    const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 1, daysSince: 50 }), NO_PREV);
    expect(r.isOveruse).toBe(true);
    expect(r.verdictTitle).toContain('bedömning krävs');
  });

  it('remaining=0 och hög avg → isOveruse', () => {
    const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 1, daysSince: 50, remaining: 0 }), NO_PREV);
    expect(r.isOveruse).toBe(true);
  });

  it('avg >10 % men ≤7 dosdagar OCH ≤14 dagars receptperiod → suppressad (ej isOveruse)', () => {
    const r = calcCore(makeInput({ amt: 50, dose: 1, ref: 1, daysSince: 45 }), NO_PREV);
    expect(r.isOveruse).toBe(false);
    expect(r.isTooEarly).toBe(false);
    expect(r.alerts?.some(a => a.type === 'warn' && (a.title?.includes('Förhöjd') || false))).toBe(true);
  });

  it('daysRemaining ≤ 7 men daysToPrescribedEnd > 14 → isOveruse=true', () => {
    const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 1, daysSince: 80, remaining: 5 }), NO_PREV);
    expect(r.isOveruse).toBe(true);
    expect(r.alerts?.some(a => a.title?.includes('Förhöjd'))).toBe(false);
  });

  it('daysSince = 1 → giltig beräkning', () => {
    const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 1 }), NO_PREV);
    expect(r.valid).toBe(true);
    expect(r.calculable).toBe(true);
    expect(r.isOveruse).toBe(true);
  });
});

describe('calcCore — Kantfall: ref = 12', () => {
  it('ref=12, normal förbrukning → korrekt beräkning', () => {
    const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 12, daysSince: 1100 }), NO_PREV);
    expect(r.valid).toBe(true);
    expect(r.isOveruse).toBe(false);
    expect(r.isTooEarly).toBe(false);
    expect(r.total).toBe(1200);
  });

  it('ref=12, tidigt i perioden → isTooEarly', () => {
    const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 12, daysSince: 30, remaining: 1170 }), NO_PREV);
    expect(r.isTooEarly).toBe(true);
    expect(r.isOveruse).toBe(false);
  });
});

describe('calcCore — doseInterval', () => {
  it('veckodos (doseInterval=7), förbrukning inom gräns → OK', () => {
    const r = calcCore(makeInput({ dose:1, doseInterval:7, amt:30, ref:1, remaining:5, daysSince:180 }), NO_PREV);
    expect(r.valid).toBe(true);
    expect(r.isOveruse).toBe(false);
    expect(r.isTooEarly).toBe(false);
    expect(r.statusText?.indexOf('OK')).toBe(0);
  });

  it('veckodos → displayAvgStr innehåller st/vecka', () => {
    const r = calcCore(makeInput({ dose:1, doseInterval:7, amt:30, ref:1, remaining:5, daysSince:180 }), NO_PREV);
    expect(r.displayAvgStr).toContain('st/vecka');
  });

  it('månadsdos (doseInterval=30), förbrukning inom gräns → OK', () => {
    const r = calcCore(makeInput({ dose:1, doseInterval:30, amt:30, ref:1, remaining:28, daysSince:60 }), NO_PREV);
    expect(r.valid).toBe(true);
    expect(r.isOveruse).toBe(false);
    expect(r.isTooEarly).toBe(true);
  });

  it('månadsdos → displayAvgStr innehåller st/månad', () => {
    const r = calcCore(makeInput({ dose:1, doseInterval:30, amt:30, ref:1, remaining:28, daysSince:60 }), NO_PREV);
    expect(r.displayAvgStr).toContain('st/månad');
  });
});

describe('calcCore — fraktionell dos', () => {
  it('dose=0.5, förbrukning inom ±10 % → korrekt beräkning', () => {
    const r = calcCore(makeInput({ amt: 100, dose: 0.5, ref: 1, daysSince: 190 }), NO_PREV);
    expect(r.valid).toBe(true);
    expect(r.isOveruse).toBe(false);
    expect(r.isTooEarly).toBe(false);
  });

  it('dose=0.5 med mg-styrka → displayAvgStr innehåller mg/dag', () => {
    const r = calcCore(makeInput({ amt: 100, dose: 0.5, ref: 1, daysSince: 190, medRaw: 'Depåtablett 5 mg' }), NO_PREV);
    expect(r.displayAvgStr).toContain('mg/dag');
  });
});

describe('calcCore — remaining-fält', () => {
  it('remaining sänker beräknad snittförbrukning korrekt', () => {
    const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 1, daysSince: 50, remaining: 70 }), NO_PREV);
    expect(r.isOveruse).toBe(false);
    expect(r.alerts?.some(a => a.type === 'warn')).toBe(true);
  });

  it('remaining=0 och avgNum=2.0 → isOveruse med korrekt avgNote', () => {
    const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 1, daysSince: 50, remaining: 0 }), NO_PREV);
    expect(r.isOveruse).toBe(true);
    expect(r.avgNote).toContain('faktisk förbrukning');
  });

  it('tidig uthämtning (remaining > accessibleTotal) → earlyPickup-alert', () => {
    const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 30, remaining: 150 }), NO_PREV);
    expect(r.valid).toBe(true);
    expect(r.alerts?.some(a => a.title?.includes('uthämtning'))).toBe(true);
  });

  it('remaining = accessibleTotal + 1 → tidig uthämtning, consumed ≥ 0', () => {
    const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 30, remaining: 101 }), NO_PREV);
    expect(r.valid).toBe(true);
    expect(r.alerts?.some(a => a.title?.includes('uthämtning'))).toBe(true);
  });

  it('remaining = accessibleTotal → consumed=0, avgNum=0, "Ingen förbrukning"', () => {
    const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 1, daysSince: 50, remaining: 100 }), NO_PREV);
    expect(r.isOveruse).toBe(false);
    expect(r.isTooEarly).toBe(true);
    expect(r.alerts?.some(a => a.type === 'danger' && (a.title?.includes('förbrukning') || a.title?.includes('Ingen')))).toBe(true);
  });
});

describe('calcCore — Klinisk override', () => {
  it('isTooEarly + override "yes" → statusText innehåller "OK"', () => {
    const r = calcCore(
      makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 30, remaining: 80 }),
      { isOveruse: false, isTooEarly: true, earlyRenewalDecision: 'yes' }
    );
    expect(r.isTooEarly).toBe(true);
    expect(r.earlyRenewalDecision).toBe('yes');
    expect(r.statusText).toContain('OK');
  });

  it('isOveruse + override "yes" → statusText innehåller "OK"', () => {
    const r = calcCore(
      makeInput({ amt: 100, dose: 1, ref: 1, daysSince: 50 }),
      { isOveruse: true, isTooEarly: false, earlyRenewalDecision: 'yes' }
    );
    expect(r.isOveruse).toBe(true);
    expect(r.earlyRenewalDecision).toBe('yes');
    expect(r.statusText).toContain('OK');
  });

  it('flaggbyte nollställer earlyRenewalDecision', () => {
    const r = calcCore(
      makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 280 }),
      { isOveruse: false, isTooEarly: true, earlyRenewalDecision: 'yes' }
    );
    expect(r.isTooEarly).toBe(false);
    expect(r.earlyRenewalDecision).toBeNull();
  });
});

describe('calcCore — Output-struktur', () => {
  it('metrics innehåller exakt tre rader', () => {
    const r = calcCore(makeInput({ daysSince: 280 }), NO_PREV);
    expect(r.metrics?.length).toBe(3);
  });

  it('tlPct är i intervallet [0, 100]', () => {
    const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 150 }), NO_PREV);
    expect(r.tlPct!).toBeGreaterThanOrEqual(0);
    expect(r.tlPct!).toBeLessThanOrEqual(100);
  });

  it('prescribedEndDateStr och pDateStr matchar ÅÅÅÅ-MM-DD', () => {
    const r = calcCore(makeInput({ daysSince: 100 }), NO_PREV);
    expect(r.prescribedEndDateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.pDateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('total = amt × ref', () => {
    const r = calcCore(makeInput({ amt: 150, dose: 2, ref: 4, daysSince: 280 }), NO_PREV);
    expect(r.total).toBe(600);
  });

  it('avgNote skiljer sig beroende på om remaining är ifyllt', () => {
    const withRem = calcCore(makeInput({ amt: 100, dose: 1, ref: 1, daysSince: 50, remaining: 40 }), NO_PREV);
    const withoutRem = calcCore(makeInput({ amt: 100, dose: 1, ref: 1, daysSince: 50 }), NO_PREV);
    expect(withRem.avgNote).toContain('faktisk förbrukning');
    expect(withoutRem.avgNote).toContain('tillgängliga');
    expect(withRem.avgNote).not.toBe(withoutRem.avgNote);
  });
});

describe('calcCore — statusText-grenar', () => {
  it('isOveruse + decision yes → "OK – förnyas (klinisk bed.)"', () => {
    const r = calcCore(
      makeInput({ amt: 100, dose: 1, ref: 1, daysSince: 50 }),
      { isOveruse: true, isTooEarly: false, earlyRenewalDecision: 'yes' }
    );
    expect(r.statusText).toBe('OK – förnyas (klinisk bed.)');
  });

  it('isTooEarly + decision yes → "OK – förnyas tidigt"', () => {
    const r = calcCore(
      makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 30, remaining: 80 }),
      { isOveruse: false, isTooEarly: true, earlyRenewalDecision: 'yes' }
    );
    expect(r.statusText).toBe('OK – förnyas tidigt');
  });

  it('isTooEarly utan beslut → statusText innehåller "För tidigt" och dagar kvar', () => {
    const r = calcCore(
      makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 30, remaining: 80 }),
      NO_PREV
    );
    expect(r.isTooEarly).toBe(true);
    expect(r.statusText).toContain('För tidigt');
    expect(r.statusText).toContain('d kvar');
  });
});

describe('calcCore — alerts (saknade grenar)', () => {
  it('avgNum = 0 → danger-alert "Ingen förbrukning"', () => {
    const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 1, daysSince: 50, remaining: 100 }), NO_PREV);
    expect(r.alerts?.some(a => a.type === 'danger' && (a.title?.includes('förbrukning') || a.title?.includes('Ingen')))).toBe(true);
  });

  it('avgNum > 2.5× dos → warn-alert "Datakontroll"', () => {
    const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 1, daysSince: 10, remaining: 0 }), NO_PREV);
    expect(r.alerts?.some(a => a.type === 'warn' && a.title === 'Datakontroll')).toBe(true);
  });

  it('låg förbrukning + isTooEarly → båda alert-typerna genereras', () => {
    const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 30, remaining: 80 }), NO_PREV);
    expect(r.isTooEarly).toBe(true);
    expect(r.alerts?.some(a => a.type === 'warn' && (a.title?.includes('Låg förbrukning') || false))).toBe(true);
    expect(r.alerts?.some(a => a.type === 'info' && (a.title?.includes('För tidigt') || false))).toBe(true);
  });
});

describe('calcCore — output-fält', () => {
  it('metrics[1].cls = danger när receptet löpt ut', () => {
    const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 400 }), NO_PREV);
    expect(r.metrics?.[1].cls).toBe('danger');
  });

  it('metrics[1].cls = warn inom 20%-tröskeln', () => {
    const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 255 }), NO_PREV);
    expect(r.metrics?.[1].cls).toBe('warn');
  });

  it('metrics[1].cls = ok med lång tid kvar', () => {
    const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 30, remaining: 80 }), NO_PREV);
    expect(r.metrics?.[1].cls).toBe('ok');
  });

  it('isOveruse → prescribedContactDateStr och prescribedContactIsPast finns', () => {
    const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 1, daysSince: 50 }), NO_PREV);
    expect(r.isOveruse).toBe(true);
    expect(r.prescribedContactDateStr).toBeDefined();
    expect(typeof r.prescribedContactIsPast).toBe('boolean');
  });

  it('isTooEarly → renewDateStr matchar ÅÅÅÅ-MM-DD', () => {
    const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 30, remaining: 80 }), NO_PREV);
    expect(r.isTooEarly).toBe(true);
    expect(r.renewDateStr).toBeDefined();
    expect(r.renewDateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('hasRemaining → endDateStr skiljer sig från prescribedEndDateStr', () => {
    const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 1, daysSince: 1, remaining: 50 }), NO_PREV);
    expect(r.endDateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.endDateStr).not.toBe(r.prescribedEndDateStr);
  });

  it('daysRemaining och daysToPrescribedEnd finns och är tal', () => {
    const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 150 }), NO_PREV);
    expect(typeof r.daysRemaining).toBe('number');
    expect(typeof r.daysToPrescribedEnd).toBe('number');
  });
});

// =====================================================
// VALIDATEVALUES
// =====================================================

describe('validateValues', () => {
  it('komplett giltig indata → valid:true', () => {
    const r = validateValues('Elvanse 50 mg', '2025-01-01', '1', '100', '3', '');
    expect(r.valid).toBe(true);
    if (r.valid) {
      expect(r.amt).toBe(100);
      expect(r.dose).toBe(1);
      expect(r.ref).toBe(3);
      expect(r.remaining).toBeNull();
    }
  });

  it('remaining ifyllt → remaining parsas korrekt', () => {
    const r = validateValues('Elvanse 50 mg', '2025-01-01', '1', '100', '3', '40');
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.remaining).toBe(40);
  });

  it('dateVal.length > 10 → invalid_date', () => {
    const r = validateValues('Elvanse 50 mg', '2025-01-01-extra', '1', '100', '3', '');
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe('invalid_date');
    if (!r.valid) expect(r.fieldErrors!.dateInput).not.toBe('');
  });

  it('framtida datum → invalid_date', () => {
    const r = validateValues('Elvanse 50 mg', '2030-06-15', '1', '100', '3', '');
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe('invalid_date');
    if (!r.valid) expect(r.fieldErrors!.dateInput).not.toBe('');
  });

  it('dos > 50 → incomplete', () => {
    const r = validateValues('Elvanse 50 mg', '2025-01-01', '99', '100', '3', '');
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.fieldErrors!.doseInput).not.toBe('');
  });

  it('ref = 12 → valid', () => {
    const r = validateValues('Elvanse 50 mg', '2025-01-01', '1', '100', '12', '');
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.ref).toBe(12);
  });

  it('ref = 13 → too_many_refs', () => {
    const r = validateValues('Elvanse 50 mg', '2025-01-01', '1', '100', '13', '');
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe('too_many_refs');
    if (!r.valid) expect(r.fieldErrors!.refInput).not.toBe('');
  });

  it('remaining negativt → incomplete', () => {
    const r = validateValues('Elvanse 50 mg', '2025-01-01', '1', '100', '3', '-1');
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.fieldErrors!.leftInput).not.toBe('');
  });

  it('läkemedelsnamn > 100 tecken → incomplete', () => {
    const r = validateValues('A'.repeat(101), '2025-01-01', '1', '100', '3', '');
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.fieldErrors!.medInput).not.toBe('');
  });

  it('ogiltigt datum "2025-02-30" → invalid_date', () => {
    const r = validateValues('Testabol 10 mg', '2025-02-30', '1', '100', '1', '');
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe('invalid_date');
    if (!r.valid) expect(r.fieldErrors!.dateInput).not.toBe('');
  });

  it('dos med kommatecken parsas korrekt', () => {
    const r = validateValues('Test 10 mg', '2025-01-01', '1,5', '100', '3', '');
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.dose).toBe(1.5);
  });

  it('amt = 1 (minimum) → valid', () => {
    const r = validateValues('Test 10 mg', '2025-01-01', '1', '1', '1', '');
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.amt).toBe(1);
  });

  it('amt = 10000 (maximum) → valid', () => {
    const r = validateValues('Test 10 mg', '2025-01-01', '1', '10000', '1', '');
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.amt).toBe(10000);
  });

  it('amt = 10001 → fieldErrors.amtInput satt', () => {
    const r = validateValues('Test 10 mg', '2025-01-01', '1', '10001', '1', '');
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.fieldErrors!.amtInput).not.toBe('');
  });

  it('leftRaw = "0" → valid, remaining = 0', () => {
    const r = validateValues('Test 10 mg', '2025-01-01', '1', '100', '3', '0');
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.remaining).toBe(0);
  });

  it('tom medRaw → incomplete', () => {
    const r = validateValues('', '2025-01-01', '1', '100', '3', '');
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe('incomplete');
  });

  it('ref = 1 (minimum) → valid', () => {
    const r = validateValues('Test 10 mg', '2025-01-01', '1', '100', '1', '');
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.ref).toBe(1);
  });
});

// =====================================================
// CALCLONGTERMCORE
// =====================================================

function makePeriod(startDaysAgo: number, endDaysAgo: number, total: number) {
  return { start: daysAgo(startDaysAgo), end: daysAgo(endDaysAgo), total: String(total) };
}

describe('calcLongtermCore — ogiltiga indata', () => {
  it('ordDose=NaN → valid:false', () => {
    const r = calcLongtermCore('Test 10 mg', NaN, [makePeriod(90, 0, 90)]);
    expect(r.valid).toBe(false);
    expect(Array.isArray(r.periodErrors)).toBe(true);
  });

  it('inga giltiga perioder → valid:false', () => {
    const r = calcLongtermCore('Test 10 mg', 1, [{ start: '', end: '', total: '' }]);
    expect(r.valid).toBe(false);
    expect(Array.isArray(r.periodErrors)).toBe(true);
  });

  it('startdatum i framtiden → periodErrors[0].startError=true', () => {
    const future = daysFromNow(1);
    const r = calcLongtermCore('Test 10 mg', 1, [{ start: future, end: daysAgo(0), total: '30' }]);
    expect(r.periodErrors[0].startError).toBe(true);
    expect(r.valid).toBe(false);
  });

  it('slutdatum före startdatum → periodErrors[0].endError=true', () => {
    const r = calcLongtermCore('Test 10 mg', 1, [{ start: daysAgo(10), end: daysAgo(30), total: '20' }]);
    expect(r.periodErrors[0].endError).toBe(true);
    expect(r.valid).toBe(false);
  });

  it('negativt totalvärde → periodErrors[0].totalError=true', () => {
    const r = calcLongtermCore('Test 10 mg', 1, [{ start: daysAgo(90), end: daysAgo(0), total: '-5' }]);
    expect(r.periodErrors[0].totalError).toBe(true);
    expect(r.valid).toBe(false);
  });

  it('periodErrors innehåller en post per inmatad period', () => {
    const r = calcLongtermCore('Test 10 mg', 1, [makePeriod(180, 90, 90), makePeriod(90, 0, 90)]);
    expect(r.periodErrors.length).toBe(2);
  });
});

describe('calcLongtermCore — normalfall', () => {
  it('normal förbrukning (100%) → valid, overallStatus "ok"', () => {
    const r = calcLongtermCore('Test 10 mg', 1, [makePeriod(90, 0, 90)]);
    expect(r.valid).toBe(true);
    expect(r.overallStatus).toBe('ok');
    expect(r.totalDays).toBe(90);
    expect(r.totalTablets).toBe(90);
  });

  it('överförbrukning (>110%) → overallStatus "over", alertType "danger"', () => {
    const r = calcLongtermCore('Test 10 mg', 1, [makePeriod(60, 0, 90)]);
    expect(r.valid).toBe(true);
    expect(r.overallStatus).toBe('over');
    expect(r.alertType).toBe('danger');
  });

  it('låg förbrukning (<80%) → overallStatus "under", alertType "warn"', () => {
    const r = calcLongtermCore('Test 10 mg', 1, [makePeriod(90, 0, 45)]);
    expect(r.valid).toBe(true);
    expect(r.overallStatus).toBe('under');
    expect(r.alertType).toBe('warn');
  });

  it('exakt 110%-gränsen → ok (villkoret är >, inte >=)', () => {
    const r = calcLongtermCore('Test 10 mg', 1, [makePeriod(100, 0, 110)]);
    expect(r.overallStatus).toBe('ok');
  });
});

describe('calcLongtermCore — perioder', () => {
  it('två perioder summerar totalDays och totalTablets korrekt', () => {
    const r = calcLongtermCore('Test 10 mg', 1, [makePeriod(180, 90, 90), makePeriod(90, 0, 90)]);
    expect(r.valid).toBe(true);
    expect(r.totalDays).toBe(180);
    expect(r.totalTablets).toBe(180);
    expect(r.periods.length).toBe(2);
  });

  it('överlappande perioder → hasOverlap:true, totalDays baseras på union', () => {
    const r = calcLongtermCore('Test 10 mg', 1, [makePeriod(120, 30, 90), makePeriod(40, 5, 35)]);
    expect(r.valid).toBe(true);
    expect(r.hasOverlap).toBe(true);
    expect(r.totalTablets).toBe(125);
    expect(r.totalDays).toBe(115);
  });

  it('angränsande (ej överlappande) perioder → hasOverlap:false', () => {
    const r = calcLongtermCore('Test 10 mg', 1, [makePeriod(180, 90, 90), makePeriod(90, 0, 90)]);
    expect(r.hasOverlap).toBe(false);
  });

  it('per-period klassificering sätts korrekt', () => {
    const r = calcLongtermCore('Test 10 mg', 1, [makePeriod(180, 120, 90), makePeriod(90, 0, 45)]);
    expect(r.valid).toBe(true);
    const p1 = r.periods.find(p => p.days === 60);
    const p2 = r.periods.find(p => p.days === 90);
    expect(p1?.classification).toBe('over');
    expect(p2?.classification).toBe('under');
  });
});

describe('calcLongtermCore — output-struktur', () => {
  it('journalText innehåller läkemedelsnamn och dosuppgifter', () => {
    const r = calcLongtermCore('Elvanse 50 mg', 1, [makePeriod(90, 0, 90)]);
    expect(r.journalText).toContain('Elvanse');
    expect(r.journalText).toContain('enheter/dag');
  });

  it('fassUrl pekar på fass.se', () => {
    const r = calcLongtermCore('Ritalin 10 mg', 1, [makePeriod(90, 0, 90)]);
    expect(r.fassUrl).toMatch(/^https:\/\/www\.fass\.se\//);
  });

  it('barPct är i intervallet [0, 150] och clampar vid extremvärden', () => {
    const rNorm = calcLongtermCore('Test 10 mg', 1, [makePeriod(90, 0, 90)]);
    expect(rNorm.barPct!).toBeGreaterThanOrEqual(0);
    expect(rNorm.barPct!).toBeLessThanOrEqual(150);
    const rExtreme = calcLongtermCore('Test 10 mg', 1, [makePeriod(10, 0, 100)]);
    expect(rExtreme.barPct).toBe(150);
  });
});

describe('calcLongtermCore — spanError', () => {
  it('period >50 år → spanError:true, exkluderas', () => {
    const r = calcLongtermCore('Test 10 mg', 1, [{ start: '1970-06-15', end: '2025-06-15', total: '100' }]);
    expect(r.periodErrors[0].spanError).toBe(true);
    expect(r.periodErrors[0].startError).toBe(false);
    expect(r.periodErrors[0].endError).toBe(false);
    expect(r.valid).toBe(false);
  });

  it('normal period → spanError:false', () => {
    const r = calcLongtermCore('Test 10 mg', 1, [makePeriod(90, 0, 90)]);
    expect(r.periodErrors[0].spanError).toBe(false);
  });

  it('en giltig + en >50-årsperiod → den giltiga beräknas', () => {
    const r = calcLongtermCore('Test 10 mg', 1, [
      { start: '1970-06-15', end: '2025-06-15', total: '100' },
      makePeriod(90, 0, 90),
    ]);
    expect(r.periodErrors[0].spanError).toBe(true);
    expect(r.periodErrors[1].spanError).toBe(false);
    expect(r.valid).toBe(true);
    expect(r.periods.length).toBe(1);
    expect(r.totalTablets).toBe(90);
  });
});

describe('calcLongtermCore: 1 period → hasOverlap=false', () => {
  it('exakt 1 period → hasOverlap=false, valid=true', () => {
    const r = calcLongtermCore('Test 10 mg', 1, [makePeriod(90, 0, 90)], null);
    expect(r.valid).toBe(true);
    expect(r.hasOverlap).toBe(false);
    expect(r.totalDays).toBe(90);
    expect(r.totalTablets).toBe(90);
    expect(r.periods.length).toBe(1);
  });
});

// =====================================================
// CANRENEWMED / PRESCRIBE
// =====================================================

describe('canRenewMed', () => {
  it('valid:false → false', () => {
    expect(canRenewMed({ _cardId: 1, valid: false })).toBe(false);
  });

  it('calculable:false → false', () => {
    expect(canRenewMed({ _cardId: 1, valid: true, calculable: false })).toBe(false);
  });

  it('valid, inga flaggor → true', () => {
    expect(canRenewMed({ _cardId: 1, valid: true, calculable: true, isOveruse: false, isTooEarly: false })).toBe(true);
  });

  it('isOveruse utan beslut → false', () => {
    expect(canRenewMed({ _cardId: 1, valid: true, calculable: true, isOveruse: true, earlyRenewalDecision: null })).toBe(false);
  });

  it('isTooEarly utan beslut → false', () => {
    expect(canRenewMed({ _cardId: 1, valid: true, calculable: true, isTooEarly: true, earlyRenewalDecision: null })).toBe(false);
  });

  it('isOveruse + earlyRenewalDecision "yes" → true', () => {
    expect(canRenewMed({ _cardId: 1, valid: true, calculable: true, isOveruse: true, earlyRenewalDecision: 'yes' })).toBe(true);
  });

  it('isTooEarly + earlyRenewalDecision "yes" → true', () => {
    expect(canRenewMed({ _cardId: 1, valid: true, calculable: true, isTooEarly: true, earlyRenewalDecision: 'yes' })).toBe(true);
  });
});

describe('prescribeValidationHint', () => {
  it('ps=null → tom array', () => {
    const hints = prescribeValidationHint({ _cardId: 1 }, null);
    expect(hints).toEqual([]);
  });

  it('packageSize="" → info-hint', () => {
    const hints = prescribeValidationHint({ _cardId: 1 }, { packageSize: '', mode: 'months', months: 3 });
    expect(hints.length).toBe(1);
    expect(hints[0].type).toBe('info');
    expect(hints[0].field).toBe('pkg');
  });

  it('packageSize="0" → warn-hint', () => {
    const hints = prescribeValidationHint({ _cardId: 1 }, { packageSize: '0', mode: 'months', months: 3 });
    expect(hints.length).toBe(1);
    expect(hints[0].type).toBe('warn');
    expect(hints[0].field).toBe('pkg');
  });

  it('giltig packageSize, månadsläge → tom array', () => {
    const hints = prescribeValidationHint({ _cardId: 1 }, { packageSize: '30', mode: 'months', months: 3 });
    expect(hints.length).toBe(0);
  });

  it('datumläge, ogiltigt slutdatum → warn', () => {
    const hints = prescribeValidationHint(
      { _cardId: 1, prescribedEndDateStr: '2025-06-01' },
      { packageSize: '30', mode: 'date', endDate: 'fel-datum' }
    );
    expect(hints.length).toBe(1);
    expect(hints[0].type).toBe('warn');
    expect(hints[0].field).toBe('date');
    expect(hints[0].msg).toContain('giltigt datum');
  });

  it('datumläge, slutdatum före startdatum → warn', () => {
    const hints = prescribeValidationHint(
      { _cardId: 1, prescribedEndDateStr: '2025-06-01' },
      { packageSize: '30', mode: 'date', endDate: daysAgo(5) }
    );
    expect(hints.length).toBe(1);
    expect(hints[0].type).toBe('warn');
    expect(hints[0].field).toBe('date');
    expect(hints[0].msg).toContain('efter');
  });

  it('datumläge, giltigt framtida slutdatum → tom array', () => {
    const hints = prescribeValidationHint(
      { _cardId: 1, prescribedEndDateStr: '2025-06-01' },
      { packageSize: '30', mode: 'date', endDate: '2025-12-31' }
    );
    expect(hints.length).toBe(0);
  });
});

describe('calcPrescribeResult', () => {
  it('ps null → null', () => {
    expect(calcPrescribeResult({ _cardId: 1, dose: 1, prescribedEndDateStr: '2025-06-01' }, null)).toBeNull();
  });

  it('recept utgånget → startDate=idag, daysAlreadyCovered=0', () => {
    const r = calcPrescribeResult(
      { _cardId: 1, dose: 1, doseInterval: 1, doseUnit: 'st', prescribedEndDateStr: '2025-06-01' },
      { packageSize: '100', mode: 'months', months: 3 }
    );
    expect(r).not.toBeNull();
    expect(r!.startDateStr).toBe('2025-06-15');
    expect(r!.daysAlreadyCovered).toBe(0);
    expect(r!.totalDays).toBe(92);
    expect(r!.packages).toBe(1);
  });

  it('recept fortfarande giltigt → startDate=receptslut, daysAlreadyCovered>0', () => {
    const end30 = daysFromNow(30);
    const r = calcPrescribeResult(
      { _cardId: 1, dose: 1, doseInterval: 1, doseUnit: 'st', prescribedEndDateStr: end30 },
      { packageSize: '100', mode: 'months', months: 3 }
    );
    expect(r).not.toBeNull();
    expect(r!.daysAlreadyCovered).toBe(30);
    expect(r!.startDateStr).toBe(end30);
    expect(r!.totalDays).toBe(62);
    expect(r!.packages).toBe(1);
  });

  it('befintligt recept täcker hela perioden → packages=0', () => {
    const end120 = daysFromNow(120);
    const r = calcPrescribeResult(
      { _cardId: 1, dose: 1, doseInterval: 1, doseUnit: 'st', prescribedEndDateStr: end120 },
      { packageSize: '100', mode: 'months', months: 3 }
    );
    expect(r).not.toBeNull();
    expect(r!.packages).toBe(0);
    expect(r!.totalDays).toBe(0);
    expect(r!.daysAlreadyCovered).toBeGreaterThan(0);
  });

  it('månadsklämning: 31 jan + 1 månad → 28 feb', () => {
    const JAN31 = new Date('2025-01-31T00:00:00.000Z').getTime();
    setMockNow(JAN31);
    const r = calcPrescribeResult(
      { _cardId: 1, dose: 1, doseInterval: 1, doseUnit: 'st', prescribedEndDateStr: '2025-01-30' },
      { packageSize: '28', mode: 'months', months: 1 }
    );
    expect(r).not.toBeNull();
    expect(r!.endDateStr).toBe('2025-02-28');
    expect(r!.totalDays).toBe(28);
    expect(r!.packages).toBe(1);
    setMockNow(MOCK_TODAY_MS);
  });

  it('datumläge: korrekt beräkning med avrundning uppåt', () => {
    const r = calcPrescribeResult(
      { _cardId: 1, dose: 1, doseInterval: 1, doseUnit: 'st', prescribedEndDateStr: '2025-06-01' },
      { packageSize: '90', mode: 'date', endDate: '2025-09-14' }
    );
    expect(r).not.toBeNull();
    expect(r!.totalDays).toBe(91);
    expect(r!.totalTablets).toBe(91);
    expect(r!.packages).toBe(2);
  });

  it('datumläge: slutdatum < startdatum → packages=0', () => {
    const r = calcPrescribeResult(
      { _cardId: 1, dose: 1, doseInterval: 1, doseUnit: 'st', prescribedEndDateStr: '2025-06-01' },
      { packageSize: '30', mode: 'date', endDate: daysAgo(5) }
    );
    expect(r).not.toBeNull();
    expect(r!.packages).toBe(0);
  });

  it('datumläge: fraktionell dos → korrekt tabletträkning', () => {
    const r = calcPrescribeResult(
      { _cardId: 1, dose: 0.5, doseInterval: 1, doseUnit: 'st', prescribedEndDateStr: '2025-06-01' },
      { packageSize: '30', mode: 'date', endDate: '2025-08-14' }
    );
    expect(r).not.toBeNull();
    expect(r!.totalDays).toBe(60);
    expect(r!.totalTablets).toBe(30);
    expect(r!.packages).toBe(1);
  });

  it('veckodos (doseInterval=7) → korrekt totalTablets', () => {
    const r = calcPrescribeResult(
      { _cardId: 1, dose: 1, doseInterval: 7, doseUnit: 'st', prescribedEndDateStr: '2025-06-01' },
      { packageSize: '10', mode: 'months', months: 3 }
    );
    expect(r).not.toBeNull();
    expect(r!.totalTablets).toBe(14);
    expect(r!.packages).toBe(2);
  });

  it('månadsdos (doseInterval=30) → korrekt totalTablets', () => {
    const r = calcPrescribeResult(
      { _cardId: 1, dose: 1, doseInterval: 30, doseUnit: 'st', prescribedEndDateStr: '2025-06-01' },
      { packageSize: '10', mode: 'months', months: 3 }
    );
    expect(r).not.toBeNull();
    expect(r!.totalTablets).toBe(4);
    expect(r!.packages).toBe(1);
  });

  it('packageSize=0 → packages=0', () => {
    const r = calcPrescribeResult(
      { _cardId: 1, dose: 1, doseInterval: 1, doseUnit: 'st', prescribedEndDateStr: '2025-06-01' },
      { packageSize: '0', mode: 'months', months: 3 }
    );
    expect(r).not.toBeNull();
    expect(r!.packages).toBe(0);
  });

  it('dos=0 → packages=0', () => {
    const r = calcPrescribeResult(
      { _cardId: 1, dose: 0, doseInterval: 1, doseUnit: 'st', prescribedEndDateStr: '2025-06-01' },
      { packageSize: '100', mode: 'months', months: 3 }
    );
    expect(r).not.toBeNull();
    expect(r!.packages).toBe(0);
  });
});

// =====================================================
// TEXT GENERATION
// =====================================================

describe('remainingDosesNote', () => {
  const rs = (s: Partial<MedState>) => ({ _cardId: 1, ...s } as MedState);

  it('remainingDoses = null → tom sträng', () => {
    expect(remainingDosesNote(rs({ remainingDoses: null }))).toBe('');
  });

  it('remainingDoses = 30, daysRemaining = 30 → nämner doser och dagar', () => {
    const note = remainingDosesNote(rs({ remainingDoses: 30, daysRemaining: 30, doseUnit: 'st' }));
    expect(note).toContain('30 st');
    expect(note).toContain('30 dagar');
  });

  it('remainingDoses = 0, daysRemaining = 0 → anger slut', () => {
    const note = remainingDosesNote(rs({ remainingDoses: 0, daysRemaining: 0, doseUnit: 'st' }));
    expect(note).toContain('slut');
  });
});

describe('buildPatientText', () => {
  it('single toRenew → brev innehåller läkemedelsnamn, handläggningstid, kontaktinfo', () => {
    const s = makeRenewState();
    const items = [{ name: 'Elvanse 50 mg', i: 0, state: s }];
    const text = buildPatientText('sv', items, [], [], 1, {}, [s]);
    expect(text).toContain('Elvanse 50 mg');
    expect(text).toContain('2–3 arbetsdagar');
    expect(text).toContain('1177');
  });

  it('single tooEarly → brev innehåller slutdatum och förnyelsedatum', () => {
    const s = makeRenewState({ prescribedEndDateStr: '2025-12-31', renewDateStr: '2025-10-12', daysToPrescribedEnd: 199 });
    const items = [{ name: 'Elvanse 50 mg', i: 0, state: s }];
    const text = buildPatientText('sv', [], items, [], 1, {}, [s]);
    expect(text).toContain('2025-12-31');
    expect(text).toContain('2025-10-12');
  });

  it('single overuse, prescribedEnd passerat → brev anger att receptet kan förnyas nu', () => {
    const s = makeRenewState({ prescribedEndDateStr: '2025-01-01', prescribedContactIsPast: true, prescribedContactDateStr: '2025-06-15' });
    const items = [{ name: 'Elvanse 50 mg', i: 0, state: s }];
    const text = buildPatientText('sv', [], [], items, 1, {}, [s]);
    expect(text).toContain('förnyas');
  });

  it('single overuse, prescribedEnd i framtiden → brev innehåller kontaktdatum', () => {
    const s = makeRenewState({ prescribedEndDateStr: '2025-09-01', prescribedContactIsPast: false, prescribedContactDateStr: '2025-08-25' });
    const items = [{ name: 'Elvanse 50 mg', i: 0, state: s }];
    const text = buildPatientText('sv', [], [], items, 1, {}, [s]);
    expect(text).toContain('2025-08-25');
  });

  it('multi: två läkemedel att förnya → båda namnen', () => {
    const s0 = makeRenewState({ medRaw: 'Elvanse 50 mg' });
    const s1 = makeRenewState({ medRaw: 'Melatonin 3 mg' });
    const states = [s0, s1];
    const text = buildPatientText('sv',
      [{ name: 'Elvanse 50 mg', i: 0, state: s0 }, { name: 'Melatonin 3 mg', i: 1, state: s1 }],
      [], [], 2, {}, states);
    expect(text).toContain('Elvanse 50 mg');
    expect(text).toContain('Melatonin 3 mg');
  });

  it('multi: ett att förnya, ett för tidigt → båda med rätt text', () => {
    const s0 = makeRenewState({ medRaw: 'Elvanse 50 mg' });
    const s1 = makeRenewState({ medRaw: 'Melatonin 3 mg', prescribedEndDateStr: '2025-12-31', renewDateStr: '2025-10-12', daysToPrescribedEnd: 199 });
    const states = [s0, s1];
    const text = buildPatientText('sv',
      [{ name: 'Elvanse 50 mg', i: 0, state: s0 }],
      [{ name: 'Melatonin 3 mg', i: 1, state: s1 }],
      [], 2, {}, states);
    expect(text).toContain('2–3 arbetsdagar');
    expect(text).toContain('2025-10-12');
  });
});

describe('buildJournalText', () => {
  it('single toRenew → journaltext innehåller kontaktorsak, dosuppgifter, åtgärd', () => {
    const s = makeRenewState();
    const items = [{ name: 'Elvanse 50 mg', i: 0, state: s }];
    const text = buildJournalText(items, [], [], 1, {}, [s]);
    expect(text).toContain('Receptförnyelse via 1177');
    expect(text).toContain('Nytt recept utfärdat');
    expect(text).toContain('Elvanse 50 mg');
    expect(text).toContain('1 st/dag');
    expect(text).toContain('300');
  });

  it('single tooEarly → "Ej förnyat" och beräknat slutdatum', () => {
    const s = makeRenewState({ prescribedEndDateStr: '2025-12-31', daysToPrescribedEnd: 199 });
    const items = [{ name: 'Elvanse 50 mg', i: 0, state: s }];
    const text = buildJournalText([], items, [], 1, {}, [s]);
    expect(text).toContain('Ej förnyat');
    expect(text).toContain('199');
    expect(text).toContain('2025-12-31');
  });

  it('single overuse utan beslut → platshållare', () => {
    const s = makeRenewState({ prescribedEndDateStr: '2025-09-01', daysRemaining: 78, earlyRenewalDecision: null });
    const items = [{ name: 'Elvanse 50 mg', i: 0, state: s }];
    const text = buildJournalText([], [], items, 1, {}, [s]);
    expect(text).toContain('[Nytt recept utfärdat');
  });
});

describe('buildNurseJournalText', () => {
  it('tom array → tom sträng', () => {
    expect(buildNurseJournalText([])).toBe('');
  });

  it('1 kort, alla adekvat → adekvat-bedömning', () => {
    const s = makeRenewState({ medNameStripped: 'Elvanse 50 mg', valid: true, calculable: true });
    const text = buildNurseJournalText([s], true, true);
    expect(text).toContain('Elvanse 50 mg');
    expect(text).toContain('adekvat');
    expect(text).toContain('Lägger receptärendet');
  });

  it('1 kort, båda avvikande → avvikande plural', () => {
    const s = makeRenewState({ medNameStripped: 'Elvanse 50 mg', valid: true, calculable: true });
    const text = buildNurseJournalText([s], false, false);
    expect(text).toContain('avvikande');
    expect(text).not.toContain('adekvat');
  });

  it('2 kort → båda namnen', () => {
    const s0 = makeRenewState({ medNameStripped: 'Elvanse 50 mg', valid: true, calculable: true });
    const s1 = makeRenewState({ medNameStripped: 'Sertralin 50 mg', medRaw: 'Sertralin 50 mg', valid: true, calculable: true });
    const text = buildNurseJournalText([s0, s1], true, true);
    expect(text).toContain('Elvanse 50 mg');
    expect(text).toContain('Sertralin 50 mg');
  });

  it('1 kort, endast vitalparametrar avvikande → singular', () => {
    const s = makeRenewState({ medNameStripped: 'Elvanse 50 mg', valid: true, calculable: true });
    const text = buildNurseJournalText([s], false, true);
    expect(text).toContain('avvikande');
    expect(text).toContain('vitalparametrar');
    expect(text).not.toContain('och medicinska uppföljning bedöms vara avvikande');
  });

  it('overuse-kort flaggar hasOutsideLimits', () => {
    const s = makeRenewState({
      medNameStripped: 'Elvanse 50 mg', valid: true, calculable: true,
      isOveruse: true, earlyRenewalDecision: null,
    });
    const text = buildNurseJournalText([s], true, true);
    expect(text).toContain('utifrån tidigare förskrivning');
  });
});

// =====================================================
// PRESCRIBE-SLUTDATUM I TEXTER
// =====================================================

describe('prescribe-slutdatum i patientbrev och journal', () => {
  it('patientbrev (sv) singleRenew med prescribeEnds → slutdatum', () => {
    const s = makeRenewState();
    const items = [{ name: 'Elvanse 50 mg', i: 0, state: s }];
    const text = buildPatientText('sv', items, [], [], 1, { 0: '2026-12-10' }, [s]);
    expect(text).toContain('räcker till och med 2026-12-10');
  });

  it('patientbrev (sv) multiRenew med prescribeEnds → slutdatum per läkemedel', () => {
    const s0 = makeRenewState({ medRaw: 'Sertralin 50 mg' });
    const s1 = makeRenewState({ medRaw: 'Voxra 300 mg' });
    const states = [s0, s1];
    const text = buildPatientText('sv', [
      { name: 'Sertralin 50 mg', i: 0, state: s0 },
      { name: 'Voxra 300 mg', i: 1, state: s1 },
    ], [], [], 2, { 0: '2026-12-10', 1: '2026-12-10' }, states);
    expect(text).toContain('Sertralin 50 mg: Vi förnyar ditt recept inom 2–3 arbetsdagar så att läkemedlet räcker till och med 2026-12-10');
    expect(text).toContain('Voxra 300 mg: Vi förnyar ditt recept inom 2–3 arbetsdagar så att läkemedlet räcker till och med 2026-12-10');
  });

  it('patientbrev (en) singleRenew med prescribeEnds → slutdatum', () => {
    const s = makeRenewState();
    const items = [{ name: 'Elvanse 50 mg', i: 0, state: s }];
    const text = buildPatientText('en', items, [], [], 1, { 0: '2026-12-10' }, [s]);
    expect(text).toContain('lasts until 2026-12-10');
  });

  it('patientbrev utan prescribeEnds → fallback utan datum', () => {
    const s = makeRenewState();
    const items = [{ name: 'Elvanse 50 mg', i: 0, state: s }];
    const text = buildPatientText('sv', items, [], [], 1, {}, [s]);
    expect(text).not.toContain('räcker till och med');
    expect(text).toContain('2–3 arbetsdagar');
  });

  it('journal summering med prescribeEnds → slutdatum per läkemedel', () => {
    const s0 = makeRenewState({ medRaw: 'Sertralin 50 mg' });
    const s1 = makeRenewState({ medRaw: 'Voxra 300 mg' });
    const states = [s0, s1];
    const text = buildJournalText(
      [{ name: 'Sertralin 50 mg', i: 0, state: s0 }, { name: 'Voxra 300 mg', i: 1, state: s1 }],
      [], [], 2, { 0: '2026-12-10', 1: '2026-12-10' }, states);
    expect(text).toContain('Sertralin 50 mg fram till och med 2026-12-10');
    expect(text).toContain('Voxra 300 mg fram till och med 2026-12-10');
  });

  it('journal summering utan prescribeEnds → fallback', () => {
    const s = makeRenewState({ medRaw: 'Elvanse 50 mg' });
    const text = buildJournalText([{ name: 'Elvanse 50 mg', i: 0, state: s }], [], [], 1, {}, [s]);
    expect(text).not.toContain('fram till och med');
  });

  it('journal single toRenew med prescribeEnds → slutdatum i åtgärdsraden', () => {
    const s = makeRenewState();
    const text = buildJournalText([{ name: 'Elvanse 50 mg', i: 0, state: s }], [], [], 1, { 0: '2026-12-10' }, [s]);
    expect(text).toContain('Åtgärd: Nytt recept utfärdat (räcker t.o.m. 2026-12-10)');
  });

  it('journal single toRenew (overuse) med prescribeEnds → slutdatum i åtgärdsraden', () => {
    const s = makeRenewState({
      medRaw: 'Elvanse 50 mg', prescribedEndDateStr: '2025-01-01', displayAvgStr: '1.50 st/dag',
    });
    const text = buildJournalText(
      [{ name: 'Elvanse 50 mg', i: 0, state: s, earlyRenewal: 'overuse' }],
      [], [], 1, { 0: '2026-12-10' }, [s]);
    expect(text).toContain('Åtgärd: Nytt recept utfärdat (räcker t.o.m. 2026-12-10)');
  });
});

// =====================================================
// buildPatientText — ytterligare fall
// =====================================================

describe('buildPatientText — ytterligare fall', () => {
  it('single overuse, prescribedEnd i framtiden och kontaktdatum passerat → closingContactPast', () => {
    const s = makeRenewState({
      prescribedEndDateStr: '2025-09-01', prescribedContactIsPast: true, prescribedContactDateStr: '2025-06-10',
    });
    const items = [{ name: 'Elvanse 50 mg', i: 0, state: s }];
    const text = buildPatientText('sv', [], [], items, 1, {}, [s]);
    expect(text).toContain('ta slut inom kort');
  });

  it('multi: ett att förnya, ett overuse med prescribedEnd passerat → "kan nu förnyas"', () => {
    const s0 = makeRenewState({ medRaw: 'Elvanse 50 mg' });
    const s1 = makeRenewState({ medRaw: 'Melatonin 3 mg', prescribedEndDateStr: '2025-01-01' });
    const states = [s0, s1];
    const text = buildPatientText('sv',
      [{ name: 'Elvanse 50 mg', i: 0, state: s0 }], [],
      [{ name: 'Melatonin 3 mg', i: 1, state: s1 }], 2, {}, states);
    expect(text).toContain('kan nu förnyas');
  });

  it('multi: overuse med kontaktdatum passerat → "ta slut inom kort"', () => {
    const s0 = makeRenewState({ medRaw: 'Elvanse 50 mg' });
    const s1 = makeRenewState({
      medRaw: 'Melatonin 3 mg', prescribedEndDateStr: '2025-09-01',
      prescribedContactIsPast: true, prescribedContactDateStr: '2025-06-10',
    });
    const states = [s0, s1];
    const text = buildPatientText('sv',
      [{ name: 'Elvanse 50 mg', i: 0, state: s0 }], [],
      [{ name: 'Melatonin 3 mg', i: 1, state: s1 }], 2, {}, states);
    expect(text).toContain('ta slut inom kort');
  });

  it('multi: overuse med kontaktdatum i framtiden → kontaktdatum nämns', () => {
    const s0 = makeRenewState({ medRaw: 'Elvanse 50 mg' });
    const s1 = makeRenewState({
      medRaw: 'Melatonin 3 mg', prescribedEndDateStr: '2025-10-01',
      prescribedContactIsPast: false, prescribedContactDateStr: '2025-09-24',
    });
    const states = [s0, s1];
    const text = buildPatientText('sv',
      [{ name: 'Elvanse 50 mg', i: 0, state: s0 }], [],
      [{ name: 'Melatonin 3 mg', i: 1, state: s1 }], 2, {}, states);
    expect(text).toContain('2025-09-24');
  });

  it('multi: toRenew=[] (alla i tooEarly/overuse) → multiIntro, inga förnyelser', () => {
    const s0 = makeRenewState({
      medRaw: 'Elvanse 50 mg', prescribedEndDateStr: '2025-12-31', renewDateStr: '2025-10-12', daysToPrescribedEnd: 199,
    });
    const s1 = makeRenewState({
      medRaw: 'Melatonin 3 mg', prescribedEndDateStr: '2025-09-01',
      prescribedContactIsPast: false, prescribedContactDateStr: '2025-08-25',
    });
    const states = [s0, s1];
    const text = buildPatientText('sv', [],
      [{ name: 'Elvanse 50 mg', i: 0, state: s0 }],
      [{ name: 'Melatonin 3 mg', i: 1, state: s1 }], 2, {}, states);
    expect(text).toContain('Vi har tagit emot');
    expect(text).toContain('Elvanse 50 mg');
    expect(text).toContain('Melatonin 3 mg');
    expect(text).not.toContain('förnyar');
  });

  it('engelsk version → brev på engelska med rätt terminologi', () => {
    const s = makeRenewState();
    const items = [{ name: 'Elvanse 50 mg', i: 0, state: s }];
    const text = buildPatientText('en', items, [], [], 1, {}, [s]);
    expect(text).toContain('working days');
    expect(text).toContain('1177');
  });

  it('okänt språk faller tillbaka på svenska', () => {
    const s = makeRenewState();
    const items = [{ name: 'Elvanse 50 mg', i: 0, state: s }];
    const textSv = buildPatientText('sv', items, [], [], 1, {}, [s]);
    const textXx = buildPatientText('xx', items, [], [], 1, {}, [s]);
    expect(textSv).toBe(textXx);
  });
});

// =====================================================
// buildJournalText — ytterligare fall
// =====================================================

describe('buildJournalText — ytterligare fall', () => {
  it('single toRenew (earlyRenewal=overuse) → klinisk bedömning', () => {
    const s = makeRenewState({ displayAvgStr: '1.50 st/dag' });
    const items = [{ name: 'Elvanse 50 mg', i: 0, state: s, earlyRenewal: 'overuse' }];
    const text = buildJournalText(items, [], [], 1, {}, [s]);
    expect(text).toContain('klinisk indikation');
    expect(text).toContain('1.50 st/dag');
  });

  it('single toRenew (earlyRenewal=tooEarly) → dagar kvar', () => {
    const s = makeRenewState({ prescribedEndDateStr: '2025-09-01', daysToPrescribedEnd: 78 });
    const items = [{ name: 'Elvanse 50 mg', i: 0, state: s, earlyRenewal: 'tooEarly' }];
    const text = buildJournalText(items, [], [], 1, {}, [s]);
    expect(text).toContain('78');
    expect(text).toContain('klinisk indikation');
  });

  it('single overuse med beslut "no" → "Ej förnyat"', () => {
    const s = makeRenewState({
      prescribedEndDateStr: '2025-09-01', daysRemaining: 78, earlyRenewalDecision: 'no',
    });
    const items = [{ name: 'Elvanse 50 mg', i: 0, state: s }];
    const text = buildJournalText([], [], items, 1, {}, [s]);
    expect(text).toContain('Ej förnyat efter klinisk');
  });

  it('single overuse med kvarvarande doser → dagar kvar', () => {
    const s = makeRenewState({
      prescribedEndDateStr: '2025-09-01', daysRemaining: 30, remainingDoses: 30, earlyRenewalDecision: null,
    });
    const items = [{ name: 'Elvanse 50 mg', i: 0, state: s }];
    const text = buildJournalText([], [], items, 1, {}, [s]);
    expect(text).toContain('30 st');
  });

  it('multi: toRenew + tooEarly → summering listar rätt läkemedel', () => {
    const s0 = makeRenewState({ medRaw: 'Elvanse 50 mg' });
    const s1 = makeRenewState({ medRaw: 'Melatonin 3 mg', prescribedEndDateStr: '2025-12-31', daysToPrescribedEnd: 199 });
    const states = [s0, s1];
    const text = buildJournalText(
      [{ name: 'Elvanse 50 mg', i: 0, state: s0 }],
      [{ name: 'Melatonin 3 mg', i: 1, state: s1 }],
      [], 2, {}, states);
    expect(text).toContain('Recept utfärdat för: Elvanse 50 mg');
    expect(text).toContain('Melatonin 3 mg');
    expect(text).toContain('Ej förnyat — för tidigt');
  });

  it('multi: enbart overuse → "Inga recept utfärdade"', () => {
    const s0 = makeRenewState({
      prescribedEndDateStr: '2025-09-01', daysRemaining: 78, earlyRenewalDecision: null,
    });
    const s1 = makeRenewState({
      medRaw: 'Melatonin 3 mg', prescribedEndDateStr: '2025-10-01', daysRemaining: 108, earlyRenewalDecision: null,
    });
    const states = [s0, s1];
    const text = buildJournalText([], [],
      [{ name: 'Elvanse 50 mg', i: 0, state: s0 }, { name: 'Melatonin 3 mg', i: 1, state: s1 }],
      2, {}, states);
    expect(text).toContain('Inga recept utfärdade');
  });

  it('multi: overuse med earlyRenewalDecision "no" → "Ej förnyat"', () => {
    const s0 = makeRenewState({ medRaw: 'Elvanse 50 mg' });
    const s1 = makeRenewState({
      medRaw: 'Melatonin 3 mg', prescribedEndDateStr: '2025-09-01', daysRemaining: 78, earlyRenewalDecision: 'no',
    });
    const states = [s0, s1];
    const text = buildJournalText(
      [{ name: 'Elvanse 50 mg', i: 0, state: s0 }], [],
      [{ name: 'Melatonin 3 mg', i: 1, state: s1 }], 2, {}, states);
    expect(text).toContain('Ej förnyat efter klinisk');
  });

  it('multi: earlyRenewal="overuse" i toRenew → överstiger ordination', () => {
    const s0 = makeRenewState({ medRaw: 'Elvanse 50 mg', displayAvgStr: '1.80 st/dag' });
    const text = buildJournalText(
      [{ name: 'Elvanse 50 mg', i: 0, state: s0, earlyRenewal: 'overuse' }],
      [], [], 2, {}, [s0]);
    expect(text).toContain('överstiger ordination');
    expect(text).toContain('klinisk, individuell bedömning');
  });

  it('multi: earlyRenewal="tooEarly" i toRenew → dagar kvar i åtgärdsraden', () => {
    const s0 = makeRenewState({
      medRaw: 'Elvanse 50 mg', prescribedEndDateStr: '2025-09-01', daysToPrescribedEnd: 78,
    });
    const text = buildJournalText(
      [{ name: 'Elvanse 50 mg', i: 0, state: s0, earlyRenewal: 'tooEarly' }],
      [], [], 2, {}, [s0]);
    expect(text).toContain('klinisk, individuell bedömning');
    expect(text).toContain('78d kvar');
  });

  it('multi: overuse med remainingDoses → doser kvar i journalen', () => {
    const s0 = makeRenewState({
      medRaw: 'Elvanse 50 mg', prescribedEndDateStr: '2025-09-01',
      daysRemaining: 30, remainingDoses: 30, earlyRenewalDecision: null,
    });
    const text = buildJournalText([], [], [{ name: 'Elvanse 50 mg', i: 0, state: s0 }], 2, {}, [s0]);
    expect(text).toContain('30 st');
  });
});

// =====================================================
// GOLDEN FIXTURE-VALIDERING — Fas 3.2 enligt MIGRATION_4.0.md
// Endast calcCore har identisk signatur mellan 3.0 och 4.0.
// Övriga funktioner (calcLongtermCore, buildPatientText, etc.)
// har ändrat signatur för att eliminera global state — de
// valideras genom de ordinarie enhetstesterna.
// =====================================================

describe('Golden fixtures — calcCore deep.equal', () => {
  const calcCoreFixtures = (goldenFixtures as Array<{
    name: string; fn: string; input?: any; prev?: any; expected: any;
  }>).filter(f => f.fn === 'calcCore');

  it.each(calcCoreFixtures.map(f => [f.name, f] as const))('%s', (_name, fixture) => {
    const input = { ...fixture.input };
    if (input.pDate && typeof input.pDate === 'string') {
      input.pDate = new Date(input.pDate);
    }
    const result = calcCore(input, fixture.prev);
    expect(result).toEqual(fixture.expected);
  });
});
