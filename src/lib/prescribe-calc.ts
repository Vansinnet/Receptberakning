import type { MedState } from './types';
import { getToday, getDaysDiff, fmtDate, parseDateUTC } from './utils';
import {
  DEFAULT_PRESCRIBE_MODE,
  DEFAULT_PRESCRIBE_MONTHS,
  DEFAULT_PRESCRIBE_END_DATE,
  MAX_PRESCRIBE_MONTHS,
  UNIT_DISPLAY,
} from './constants';

// === CAN RENEW ===

export function canRenewMed(s: MedState): boolean {
  return !!(s.valid && s.calculable !== false && s.decision !== 'no');
}

// === CALC PRESCRIBE RESULT ===

export interface PrescribeResult {
  startDate: Date;
  startDateStr: string;
  daysAlreadyCovered: number;
  endDate: Date | null;
  endDateStr: string | null;
  totalDays: number;
  totalTablets: number;
  packages: number;
  packageSize: number;
  dose: number;
  doseUnit: string;
  unitLabelLong: string;
  unitLabelShort: string;
}

export function calcPrescribeResult(
  s: MedState,
  ps: { packageSize: string; mode?: string; months?: number; endDate?: string; startFromToday?: boolean } | null
): PrescribeResult | null {
  if (!ps) return null;

  const today         = getToday();
  const prescribedEnd = parseDateUTC(s.prescribedEndDateStr || '');

  let startDate          = (prescribedEnd && prescribedEnd > today) ? prescribedEnd : today;
  let startDateStr       = fmtDate(startDate);
  let daysAlreadyCovered = (prescribedEnd && prescribedEnd > today) ? getDaysDiff(prescribedEnd, today) : 0;

  if (ps.startFromToday) {
    startDate = today;
    daysAlreadyCovered = 0;
    startDateStr = fmtDate(startDate);
  }

  let endDate: Date | null = null;
  let totalDays = 0;

  const mode = ps.mode ?? DEFAULT_PRESCRIBE_MODE;
  const months = ps.months ?? DEFAULT_PRESCRIBE_MONTHS;
  const endDateRaw = ps.endDate ?? DEFAULT_PRESCRIBE_END_DATE;

  if (mode === 'months' && months > 0) {
    // AKTIVT DESIGNVAL: targetEnd baseras på today (nästa planerade läkarbesök),
    // INTE startDate (receptets slutdatum). Månadsväljaren representerar
    // "N månader framåt från idag till nästa besök", oavsett hur lång tid
    // nuvarande recept har kvar. startDate (som kan vara prescribedEnd om
    // receptet fortfarande gäller) avgör varifrån förpackningarna räknas.
    const tYear  = today.getUTCFullYear();
    const tMonth = today.getUTCMonth() + months;
    const tDay   = today.getUTCDate();
    const lastDayOfTargetMonth = new Date(Date.UTC(tYear, tMonth + 1, 0)).getUTCDate();
    const targetEnd = new Date(Date.UTC(tYear, tMonth, Math.min(tDay, lastDayOfTargetMonth)));
    totalDays = getDaysDiff(targetEnd, startDate);
    if (totalDays <= 0) {
      return { startDate, startDateStr, daysAlreadyCovered, endDate: null, endDateStr: null, totalDays: 0, totalTablets: 0, packages: 0, packageSize: 0, dose: 0, doseUnit: 'st', unitLabelLong: 'tabletter', unitLabelShort: 'st' };
    }
    endDate = targetEnd;
  } else if (mode === 'date' && endDateRaw) {
    const ed = parseDateUTC(endDateRaw);
    if (ed && ed > startDate) { endDate = ed; totalDays = getDaysDiff(ed, startDate); }
  }

  const dose            = s.dose || 0;
  const doseInterval    = s.doseInterval || 1;
  const effectiveDose   = dose / doseInterval;
  const packageSize     = parseFloat(ps.packageSize) || 0;

  if (!totalDays || !dose || packageSize <= 0) {
    return { startDate, startDateStr, daysAlreadyCovered, endDate: null, endDateStr: null, totalDays: 0, totalTablets: 0, packages: 0, packageSize: 0, dose: 0, doseUnit: 'st', unitLabelLong: 'tabletter', unitLabelShort: 'st' };
  }

  const totalTablets = Math.ceil(totalDays * effectiveDose);
  const packages     = Math.ceil(totalTablets / packageSize);
  const doseUnitVal  = s.doseUnit || 'st';
  const ds           = UNIT_DISPLAY[doseUnitVal as keyof typeof UNIT_DISPLAY] || UNIT_DISPLAY.st;
  const unitLabelLong  = ds.long;
  const unitLabelShort = ds.short;
  return {
    startDate, startDateStr, daysAlreadyCovered,
    endDate, endDateStr: endDate ? fmtDate(endDate) : null,
    totalDays, totalTablets, packages,
    packageSize, dose, doseUnit: doseUnitVal,
    unitLabelLong, unitLabelShort,
  };
}

// === PRESCRIBE VALIDATION HINT ===

export interface PrescribeHint {
  type: 'info' | 'warn';
  field: string;
  msg: string;
}

export function prescribeValidationHint(
  s: MedState,
  ps: { packageSize: string; mode?: string; months?: number; endDate?: string } | null
): PrescribeHint[] {
  if (!ps) return [];

  let pkgHint: PrescribeHint | null = null;
  let dateHint: PrescribeHint | null = null;

  const pkgVal = ps.packageSize;
  const pkgNum = parseFloat(pkgVal) || 0;
  if (!pkgVal || pkgNum <= 0) {
    pkgHint = pkgVal !== ''
      ? { type: 'warn', field: 'pkg', msg: 'Förpackningsstorleken måste vara ett heltal om minst 1.' }
      : { type: 'info', field: 'pkg', msg: 'Ange förpackningsstorlek för att beräkna antal förpackningar.' };
  } else if (!Number.isInteger(pkgNum)) {
    pkgHint = { type: 'warn', field: 'pkg', msg: 'Förpackningsstorleken måste vara ett heltal.' };
  }

  const mode = ps.mode || DEFAULT_PRESCRIBE_MODE;
  const endDateRaw = ps.endDate || DEFAULT_PRESCRIBE_END_DATE;

  if (mode === 'date') {
    if (!endDateRaw) {
      dateHint = { type: 'info', field: 'date', msg: 'Ange ett slutdatum för att beräkna antal förpackningar.' };
    } else {
      const today    = getToday();
      const prescEnd = parseDateUTC(s.prescribedEndDateStr || '');
      const start    = (prescEnd && prescEnd > today) ? prescEnd : today;
      const ed       = parseDateUTC(endDateRaw);
      if (!ed)          dateHint = { type: 'warn', field: 'date', msg: 'Ange ett giltigt datum (ÅÅÅÅ-MM-DD).' };
      else if (ed <= start) dateHint = { type: 'warn', field: 'date', msg: `Slutdatumet måste vara efter ${fmtDate(start)}.` };
    }
  }

  const hints: PrescribeHint[] = [];
  if (pkgHint)  hints.push(pkgHint);
  if (dateHint) hints.push(dateHint);
  return hints;
}
