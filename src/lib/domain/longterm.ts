// === LÅNGTIDSANALYS ===
// Ren funktion utan DOM eller state. Bygger på uttagen i uttagshistoriken, inte på perioder.
// Beslutat 2026-10-18 ("Långtidsanalys 2.0" i planeringsdokumentet), testfall T33–T41.
//
// Regler (uttagsdagen är dag 1, som receptdagen i förnyelsen):
//   uttaget            = antal × styrka i mg. Utan styrka (t.ex. plåster) räknas antal.
//   samma dag          = flera uttag samma dag räknas som ett uttag
//   intervall          = från ett uttag till nästa; takt = uttaget ÷ dagar till nästa uttag
//   sista uttaget      = takt om patienten har slut idag: uttaget ÷ dagar från uttaget till idag
//   snitt              = allt uttaget utom sista ÷ dagar mellan första och sista uttaget
//   om slut idag       = allt uttaget ÷ dagar från första uttaget till idag
//   procent av maxdos  = uttaget ÷ maxdosen summerad dag för dag under samma tid × 100
//   borde finnas kvar  = lagret vid senaste uttaget: uttag läggs till, maxdosen dras av dag
//                        för dag och lagret går aldrig under 0 (ett uppehåll sparar inget)
// Verktyget tolkar inte: inga ord som Över/Under och inga färger, bara procenten.

import type { LtDoseUnit, LtFillInput, LtInterval, LtMaxDoseInput } from '../types';
import { getDaysDiff, parseDateUTC, parseDose, parseNum } from '../utils';

export interface LtFillError {
  date?: string;
  count?: string;
  strength?: string;
}

export interface LtDoseError {
  from?: string;
  dose?: string;
}

/** Uttagen räknas i mg (styrka angiven) eller i antal (styrka saknas, t.ex. plåster). */
export type LtUnit = 'mg' | 'antal';

/** En rad i ett uttag: antal av en styrka. strength är null när uttagen räknas i antal. */
export interface LtPart {
  count: number;
  strength: number | null;
}

export interface LtFillResult {
  /** Raderna i inmatningen (flera när uttag samma dag räknats ihop). */
  rows: number[];
  date: Date;
  /** Uttaget i mg, eller i antal när uttagen saknar styrka. */
  amount: number;
  parts: LtPart[];
  /** Dagar till nästa uttag, eller till idag för sista uttaget. */
  days: number;
  /** Uttaget per dag under intervallet. null när sista uttaget gjordes idag. */
  rate: number | null;
  /** Procent av maxdosen under intervallet. null utan maxdos eller utan dagar. */
  pct: number | null;
  /** Sista uttaget: takten gäller "om patienten har slut idag". */
  last: boolean;
}

/** Ett mått över flera uttag: uttaget, dagarna, takten per dag och procent av maxdosen. */
export interface LtMeasure {
  amount: number;
  days: number;
  rate: number;
  pct: number | null;
}

/** Maxdosen från och med ett datum (null = från början), i uttagens enhet per intervall. */
export interface LtMaxSegment {
  from: Date | null;
  dose: number;
}

interface LtCommon {
  unit: LtUnit;
  fillErrors: LtFillError[];
  doseErrors: LtDoseError[];
  /** Rader med innehåll som inte räknas: ofullständiga (datum eller antal saknas) eller med fel. */
  skipped: number[];
}

export type LongtermResult =
  | ({ kind: 'empty' } & LtCommon)
  | ({
      kind: 'ok';
      fills: LtFillResult[];
      first: Date;
      last: Date;
      total: number;
      /** Snittet mellan första och sista uttaget. null med bara ett uttag. */
      average: LtMeasure | null;
      /** Allt uttaget fram till idag. null när första uttaget gjordes idag. */
      ifOutToday: LtMeasure | null;
      /** Borde finnas kvar vid senaste uttaget, räknat med maxdos. null utan maxdos eller med ett uttag. */
      shouldRemain: number | null;
      /** Styrkorna som används, stigande (tom när uttagen räknas i antal). */
      strengths: number[];
      /** Maxdosen enligt receptet, eller null om den saknas eller är felaktig. */
      maxDose: LtMaxSegment[] | null;
    } & LtCommon);

const COUNT_RE = /^(\d+)(?:\s*[x×*]\s*(\d+))?$/;
const STRENGTH_RE = /^\d+(?:[.,]\d+)?$/;

/** Antal uttagna enheter: "30" eller förpackningar × storlek, "2x30" → 60. NaN om det inte är ett heltal över 0. */
export function parseCount(raw: string): number {
  const m = raw.trim().match(COUNT_RE);
  if (!m) return NaN;
  const n = Number(m[1]) * (m[2] ? Number(m[2]) : 1);
  return n > 0 ? n : NaN;
}

/** Maxdosen enligt receptet: "1", "1x2", "½" eller i mg-läget "7,5 mg". NaN om den inte går att tolka. */
export function parseMaxDose(raw: string, unit: LtDoseUnit): number {
  const s = raw.trim();
  if (unit === 'st') return parseDose(s, 'st');
  const v = s.replace(/\s*mg\.?$/i, '');
  return /[a-zåäö]/i.test(v) ? NaN : parseDose(v, 'st');
}

const hasContent = (f: LtFillInput) => !!(f.dateRaw.trim() || f.countRaw.trim());

/**
 * Långtidsanalys av uttagen. `maxDoses[0]` är maxdosen enligt receptet (tom = ingen jämförelse);
 * följande rader är ändringar som gäller från och med sitt datum.
 */
export function calcLongterm(
  fillsIn: LtFillInput[], maxDosesIn: LtMaxDoseInput[], doseUnit: LtDoseUnit, interval: LtInterval, today: Date,
): LongtermResult {
  // Uttagen räknas i mg så snart någon rad har en styrka; rader utan styrka får då ett fel.
  const unit: LtUnit = fillsIn.some((f) => hasContent(f) && f.strengthRaw.trim()) ? 'mg' : 'antal';
  const fillErrors: LtFillError[] = [];
  const skipped: number[] = [];
  const valid: { row: number; date: Date; part: LtPart }[] = [];

  fillsIn.forEach((f, row) => {
    const e: LtFillError = {};
    fillErrors.push(e);
    if (!hasContent(f)) return;
    const dateRaw = f.dateRaw.trim(), countRaw = f.countRaw.trim(), strengthRaw = f.strengthRaw.trim();
    const date = parseDateUTC(dateRaw);
    if (dateRaw && !date) e.date = 'Ange ÅÅÅÅ-MM-DD.';
    else if (date && date > today) e.date = 'Datumet är i framtiden.';
    const count = parseCount(countRaw);
    if (countRaw && !(count > 0)) e.count = 'Ange ett heltal, t.ex. 30 eller 2x30.';
    let strength: number | null = null;
    if (unit === 'mg') {
      strength = STRENGTH_RE.test(strengthRaw) ? parseNum(strengthRaw) : NaN;
      if (!strengthRaw) e.strength = 'Ange styrkan.';
      else if (!(strength > 0)) e.strength = 'Ange styrkan i mg.';
    }
    if (!date || !(count > 0) || e.date || e.strength) { skipped.push(row); return; }
    valid.push({ row, date, part: { count, strength } });
  });

  // Maxdosen. Ändringar kräver ett giltigt datum; samma datum två gånger är ett fel.
  const doseErrors: LtDoseError[] = maxDosesIn.map(() => ({}));
  const segments: LtMaxSegment[] = [];
  const strengths = [...new Set(valid.map((v) => v.part.strength).filter((s): s is number => s !== null))].sort((a, b) => a - b);
  const hasMax = !!maxDosesIn[0]?.doseRaw.trim();
  maxDosesIn.forEach((m, i) => {
    const e = doseErrors[i];
    let from: Date | null = null;
    if (i > 0) {
      from = parseDateUTC(m.fromRaw.trim());
      if (!m.fromRaw.trim()) e.from = 'Ange datum.';
      else if (!from) e.from = 'Ange ÅÅÅÅ-MM-DD.';
      else if (maxDosesIn.slice(1, i).some((x) => x.fromRaw.trim() === m.fromRaw.trim())) e.from = 'Samma datum som en annan ändring.';
    }
    const doseRaw = m.doseRaw.trim();
    if (!doseRaw) {
      if (i > 0 || maxDosesIn.length > 1) e.dose = 'Ange maxdosen.';
      return;
    }
    let dose = parseMaxDose(doseRaw, doseUnit);
    if (!(dose > 0)) { e.dose = 'Ange en dos större än 0.'; return; }
    if (doseUnit === 'st' && unit === 'mg') {
      // Maxdos i st räknas om till mg med uttagens styrka; med flera styrkor går det inte.
      if (strengths.length > 1) { e.dose = 'Ange maxdosen i mg när uttagen har olika styrkor.'; return; }
      if (strengths.length === 1) dose *= strengths[0];
    }
    if (doseUnit === 'mg' && unit === 'antal' && valid.length) { e.dose = 'Uttagen saknar styrka i mg. Ange maxdosen i antal.'; return; }
    if (!e.from) segments.push({ from, dose });
  });
  const doseOk = hasMax && doseErrors.every((e) => !e.from && !e.dose) && segments.length === maxDosesIn.length;
  const maxDose = doseOk ? [...segments].sort((a, b) => (a.from?.getTime() ?? -Infinity) - (b.from?.getTime() ?? -Infinity)) : null;

  const common: LtCommon = { unit, fillErrors, doseErrors, skipped };
  if (valid.length === 0) return { kind: 'empty', ...common };

  // Uttag samma dag räknas ihop. Ordningen i inmatningen spelar ingen roll.
  const byDay = new Map<number, { rows: number[]; date: Date; parts: LtPart[] }>();
  for (const v of valid) {
    const key = v.date.getTime();
    const g = byDay.get(key) ?? { rows: [], date: v.date, parts: [] };
    g.rows.push(v.row);
    g.parts.push(v.part);
    byDay.set(key, g);
  }
  const days = [...byDay.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
  const amountOf = (parts: LtPart[]) => parts.reduce((s, p) => s + p.count * (p.strength ?? 1), 0);
  const first = days[0].date;
  const last = days[days.length - 1].date;

  /** Maxdosen summerad dag för dag från a till (men inte med) b, i uttagens enhet. */
  const maxSum = (a: Date, b: Date): number => {
    if (!maxDose) return NaN;
    let sum = 0;
    maxDose.forEach((seg, k) => {
      const segStart = seg.from && seg.from > a ? seg.from : a;
      const next = maxDose[k + 1]?.from;
      const segEnd = next && next < b ? next : b;
      const n = getDaysDiff(segEnd, segStart);
      if (n > 0) sum += (n * seg.dose) / interval;
    });
    return sum;
  };
  const pctOf = (amount: number, a: Date, b: Date) => (maxDose ? (amount / maxSum(a, b)) * 100 : null);
  const measure = (amount: number, a: Date, b: Date): LtMeasure => {
    const n = getDaysDiff(b, a);
    return { amount, days: n, rate: amount / n, pct: pctOf(amount, a, b) };
  };

  const fills: LtFillResult[] = days.map((d, i) => {
    const isLast = i === days.length - 1;
    const end = isLast ? today : days[i + 1].date;
    const n = getDaysDiff(end, d.date);
    const amount = amountOf(d.parts);
    return {
      rows: d.rows, date: d.date, amount, parts: d.parts, days: n, last: isLast,
      rate: n > 0 ? amount / n : null,
      pct: n > 0 ? pctOf(amount, d.date, end) : null,
    };
  });

  const total = fills.reduce((s, f) => s + f.amount, 0);
  const average = fills.length >= 2 ? measure(total - fills[fills.length - 1].amount, first, last) : null;
  const ifOutToday = getDaysDiff(today, first) > 0 ? measure(total, first, today) : null;

  let shouldRemain: number | null = null;
  if (maxDose && fills.length >= 2) {
    let stock = fills[0].amount;
    for (let i = 1; i < fills.length; i++) {
      const before = Math.max(0, stock - maxSum(fills[i - 1].date, fills[i].date));
      if (i === fills.length - 1) shouldRemain = before;
      stock = before + fills[i].amount;
    }
  }

  return { kind: 'ok', ...common, fills, first, last, total, average, ifOutToday, shouldRemain, strengths, maxDose };
}
