// === LÅNGTIDSANALYS ===
// Ren funktion. Båda datumen räknas in i en period (1–31 januari = 31 dagar).
// Överlappande perioder räknas en gång i den totala tiden (union av datumintervall),
// men allt uttaget räknas. Godkänt i Kliniska testfall (T30–T32).
//
// Två lägen:
//   enheter — uttaget per period är ett antal enheter, dosen enheter/dag (som tidigare)
//   mg      — styrkorna anges en gång; varje period har ett antal per styrka och uttaget
//             blir Σ antal × styrka i mg. Dosen anges i mg/dag. Samma substans i olika
//             styrkor (Imovane 5 mg och 7,5 mg) räknas då ihop. Godkänt 2026-10-05.

import type { LtPeriodInput, Tone } from '../types';
import { CONSUMPTION_NORMAL_HIGH, isWithinNormal, MAX_PERIOD_SPAN_DAYS } from '../constants';
import { getDaysDiff, parseDateUTC, parseNum } from '../utils';

export interface LtPeriodError {
  start?: string;
  end?: string;
  total?: string;
  /** mg-läget: fel per antalsfält, i samma ordning som styrkorna. */
  counts?: (string | undefined)[];
}

export type LtClass = 'ok' | 'over' | 'under';

/** Enheten som uttag och dos räknas i. */
export type LtUnit = 'enheter' | 'mg';

/** Ett uttag i mg-läget: antal enheter av en styrka. */
export interface LtPart {
  count: number;
  strength: number;
}

export interface LtPeriodResult {
  /** Index i inmatningen, så att raden går att koppla tillbaka. */
  index: number;
  start: Date;
  end: Date;
  days: number;
  /** Uttaget under perioden, i enheter eller mg. */
  total: number;
  /** mg-läget: uttagen per styrka (bara styrkor med antal över 0). Tom i enhetsläget. */
  parts: LtPart[];
  avgPerDay: number;
  pct: number;
  cls: LtClass;
}

export type LongtermResult =
  | { kind: 'incomplete'; unit: LtUnit; errors: LtPeriodError[]; doseError: string; strengthErrors: string[] }
  | {
      kind: 'ok'; unit: LtUnit; errors: LtPeriodError[]; doseError: string; strengthErrors: string[];
      periods: LtPeriodResult[]; unionDays: number; total: number;
      avgPerDay: number; pct: number; cls: LtClass; tone: Tone; overlap: boolean;
      first: Date; last: Date;
    };

function classify(pct: number): LtClass {
  if (isWithinNormal(pct)) return 'ok';
  return pct > CONSUMPTION_NORMAL_HIGH ? 'over' : 'under';
}

/** Uttaget i mg-läget för en period: Σ antal × styrka, med fel per antalsfält. */
function mgTotal(countsRaw: string[], strengths: number[]): { total: number; parts: LtPart[]; errors?: (string | undefined)[] } {
  const errors: (string | undefined)[] = [];
  const parts: LtPart[] = [];
  let total = 0;
  let bad = false;
  strengths.forEach((strength, j) => {
    const raw = (countsRaw[j] ?? '').trim();
    if (!raw) return;
    if (!/^\d+$/.test(raw)) { errors[j] = 'Heltal.'; bad = true; return; }
    const count = Number(raw);
    if (!(strength > 0)) { errors[j] = 'Styrka saknas.'; bad = true; return; }
    if (count > 0) { parts.push({ count, strength }); total += count * strength; }
  });
  return bad ? { total: NaN, parts, errors } : { total, parts };
}

/**
 * Långtidsanalys över en eller flera perioder. `strengthsRaw` (mg-läget) anger styrkorna i mg;
 * utan den räknas uttaget i enheter som tidigare.
 */
export function calcLongterm(
  periods: LtPeriodInput[], doseRaw: string, today: Date, strengthsRaw: string[] | null = null,
): LongtermResult {
  const unit: LtUnit = strengthsRaw ? 'mg' : 'enheter';
  const dose = parseNum(doseRaw);
  const doseError = doseRaw.trim() && !(dose > 0) ? 'Ange en dos större än 0.' : '';
  const errors: LtPeriodError[] = [];
  const valid: Omit<LtPeriodResult, 'avgPerDay' | 'pct' | 'cls'>[] = [];

  // mg-läget: styrkorna. En styrka som används (har antal i någon period) måste vara ifylld.
  // Styrkor och antal tolkas strikt (inga 0x- eller e-tal, som parseNum annars godtar).
  const strengths = (strengthsRaw ?? []).map((r) => (/^\d+(?:[.,]\d+)?$/.test(r.trim()) ? parseNum(r) : NaN));
  const strengthErrors = (strengthsRaw ?? []).map((r, j) => {
    if (r.trim()) return strengths[j] > 0 ? '' : 'Ange styrkan i mg.';
    return periods.some((p) => (p.countsRaw?.[j] ?? '').trim()) ? 'Ange styrkan.' : '';
  });

  periods.forEach((p, index) => {
    const e: LtPeriodError = {};
    const start = parseDateUTC(p.startRaw.trim());
    const end = parseDateUTC(p.endRaw.trim());
    let total: number;
    let parts: LtPart[] = [];
    if (strengthsRaw) {
      const m = mgTotal(p.countsRaw ?? [], strengths);
      total = m.total;
      parts = m.parts;
      if (m.errors?.length) e.counts = m.errors;
      // Antal ifyllda men bara nollor: säg till i stället för att tyst hoppa över perioden.
      else if (total === 0 && (p.countsRaw ?? []).some((c) => c.trim())) e.total = 'Ange ett antal över 0.';
    } else {
      total = parseNum(p.totalRaw);
      if (p.totalRaw.trim() && (!Number.isInteger(total) || total <= 0)) e.total = 'Ange ett heltal över 0.';
    }
    if (p.startRaw.trim() && (!start || start > today)) e.start = start ? 'Datumet är i framtiden.' : 'Ange ÅÅÅÅ-MM-DD.';
    if (p.endRaw.trim()) {
      if (!end) e.end = 'Ange ÅÅÅÅ-MM-DD.';
      else if (end > today) e.end = 'Datumet är i framtiden.';
      else if (start && end < start) e.end = 'Före startdatum.';
    }
    if (start && end && !e.start && !e.end && !e.total && total > 0) {
      const days = getDaysDiff(end, start) + 1;
      if (days > MAX_PERIOD_SPAN_DAYS) e.end = 'Orimligt lång period.';
      else valid.push({ index, start, end, days, total, parts });
    }
    errors.push(e);
  });

  if (!(dose > 0) || valid.length === 0) return { kind: 'incomplete', unit, errors, doseError, strengthErrors };

  const sorted = [...valid].sort((a, b) => a.start.getTime() - b.start.getTime() || a.index - b.index);
  let overlap = false;
  let unionDays = 0;
  let curStart: Date | null = null;
  let curEnd: Date | null = null;
  for (const p of sorted) {
    if (curEnd && p.start <= curEnd) {
      overlap = true;
      if (p.end > curEnd) curEnd = p.end;
    } else {
      if (curStart && curEnd) unionDays += getDaysDiff(curEnd, curStart) + 1;
      curStart = p.start;
      curEnd = p.end;
    }
  }
  if (curStart && curEnd) unionDays += getDaysDiff(curEnd, curStart) + 1;

  const total = sorted.reduce((s, p) => s + p.total, 0);
  const avgPerDay = total / unionDays;
  const pct = (avgPerDay / dose) * 100;
  const cls = classify(pct);
  const last = sorted.reduce((m, p) => (p.end > m ? p.end : m), sorted[0].end);

  return {
    kind: 'ok', unit, errors, doseError, strengthErrors, overlap, unionDays, total, avgPerDay, pct, cls,
    tone: cls === 'ok' ? 'ok' : 'warn',
    first: sorted[0].start, last,
    periods: sorted.map((p) => {
      const ppct = (p.total / p.days / dose) * 100;
      return { ...p, avgPerDay: p.total / p.days, pct: ppct, cls: classify(ppct) };
    }),
  };
}
