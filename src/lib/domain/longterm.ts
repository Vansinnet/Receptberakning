// === LÅNGTIDSANALYS ===
// Ren funktion. Båda datumen räknas in i en period (1–31 januari = 31 dagar).
// Överlappande perioder räknas en gång i den totala tiden (union av datumintervall),
// men allt uttaget räknas. Godkänt i Kliniska testfall (T30–T32).

import type { LtPeriodInput, Tone } from '../types';
import { CONSUMPTION_NORMAL_HIGH, CONSUMPTION_NORMAL_LOW, MAX_PERIOD_SPAN_DAYS } from '../constants';
import { getDaysDiff, parseDateUTC, parseNum } from '../utils';

export interface LtPeriodError {
  start?: string;
  end?: string;
  total?: string;
}

export type LtClass = 'ok' | 'over' | 'under';

export interface LtPeriodResult {
  /** Index i inmatningen, så att raden går att koppla tillbaka. */
  index: number;
  start: Date;
  end: Date;
  days: number;
  total: number;
  avgPerDay: number;
  pct: number;
  cls: LtClass;
}

export type LongtermResult =
  | { kind: 'incomplete'; errors: LtPeriodError[]; doseError: string }
  | {
      kind: 'ok'; errors: LtPeriodError[]; doseError: string;
      periods: LtPeriodResult[]; unionDays: number; total: number;
      avgPerDay: number; pct: number; cls: LtClass; tone: Tone; overlap: boolean;
      first: Date; last: Date;
    };

function classify(pct: number): LtClass {
  return pct > CONSUMPTION_NORMAL_HIGH ? 'over' : pct < CONSUMPTION_NORMAL_LOW ? 'under' : 'ok';
}

export function calcLongterm(periods: LtPeriodInput[], doseRaw: string, today: Date): LongtermResult {
  const dose = parseNum(doseRaw);
  const doseError = doseRaw.trim() && !(dose > 0) ? 'Ange en dos större än 0.' : '';
  const errors: LtPeriodError[] = [];
  const valid: Omit<LtPeriodResult, 'avgPerDay' | 'pct' | 'cls'>[] = [];

  periods.forEach((p, index) => {
    const e: LtPeriodError = {};
    const start = parseDateUTC(p.startRaw.trim());
    const end = parseDateUTC(p.endRaw.trim());
    const total = parseNum(p.totalRaw);
    if (p.startRaw.trim() && (!start || start > today)) e.start = start ? 'Datumet är i framtiden.' : 'Ange ÅÅÅÅ-MM-DD.';
    if (p.endRaw.trim()) {
      if (!end) e.end = 'Ange ÅÅÅÅ-MM-DD.';
      else if (end > today) e.end = 'Datumet är i framtiden.';
      else if (start && end < start) e.end = 'Före startdatum.';
    }
    if (p.totalRaw.trim() && (!Number.isInteger(total) || total <= 0)) e.total = 'Ange ett heltal över 0.';
    if (start && end && !e.start && !e.end && !e.total && total > 0) {
      const days = getDaysDiff(end, start) + 1;
      if (days > MAX_PERIOD_SPAN_DAYS) e.end = 'Orimligt lång period.';
      else valid.push({ index, start, end, days, total });
    }
    errors.push(e);
  });

  if (!(dose > 0) || valid.length === 0) return { kind: 'incomplete', errors, doseError };

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
    kind: 'ok', errors, doseError, overlap, unionDays, total, avgPerDay, pct, cls,
    tone: cls === 'ok' ? 'ok' : 'warn',
    first: sorted[0].start, last,
    periods: sorted.map((p) => {
      const ppct = (p.total / p.days / dose) * 100;
      return { ...p, avgPerDay: p.total / p.days, pct: ppct, cls: classify(ppct) };
    }),
  };
}
