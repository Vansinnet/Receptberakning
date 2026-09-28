// === NYFÖRSKRIVNING ===
// Ren funktion. Regler, godkända i Kliniska testfall (T24–T28):
//   start   = dagen efter att nuvarande recept tar slut, eller idag om det redan är slut
//             eller om läkaren valt "från dagens datum" (bara när minst 14 dagar återstår)
//   mål     = idag + N månader, eller angivet slutdatum
//   dagar   = mål − start + 1 (båda datumen inräknade)
//   mängd   = ⌈dagar × dygnsdos⌉, förpackningar = ⌈mängd ÷ förpackningsstorlek⌉

import type { PrescribeSettings } from '../types';
import { DAYS_REMAINING_WARN } from '../constants';
import { addDays, addMonths, fmtDate, getDaysDiff, parseDateUTC, parseNum } from '../utils';
import type { RenewalOk } from './renewal';

export type PrescriptionResult =
  | { kind: 'needDate'; askStart: boolean; start: Date; message: string }
  | { kind: 'badDate'; askStart: boolean; start: Date; message: string }
  | { kind: 'covered'; askStart: boolean; start: Date; target: Date; message: string }
  | { kind: 'needPackage'; askStart: boolean; start: Date; target: Date; message: string }
  | {
      kind: 'ok'; askStart: boolean; start: Date; target: Date;
      days: number; units: number; packages: number; packageSize: number;
    };

const EPS = 1e-9;

/** Ska frågan om startdatum visas? Bara vid förnyelse och minst 14 dagar kvar. */
export function shouldAskStart(renewal: RenewalOk): boolean {
  return renewal.daysLeft >= DAYS_REMAINING_WARN;
}

/** Förpackningsstorleken som används: egen inmatning, annars formulärets. */
export function effectivePackage(settings: PrescribeSettings, formPackage: number): number {
  return settings.packageRaw === null ? formPackage : parseNum(settings.packageRaw);
}

export function calcPrescription(renewal: RenewalOk, settings: PrescribeSettings, today: Date): PrescriptionResult {
  const askStart = shouldAskStart(renewal);
  const fromToday = askStart && settings.fromToday;
  const start = renewal.daysLeft >= 0 && !fromToday ? addDays(renewal.endDate, 1) : today;

  let target: Date | null;
  if (settings.period === 'date') {
    if (!settings.endDateRaw.trim()) return { kind: 'needDate', askStart, start, message: 'Ange ett slutdatum.' };
    target = parseDateUTC(settings.endDateRaw.trim());
    if (!target) return { kind: 'badDate', askStart, start, message: 'Ange datum som ÅÅÅÅ-MM-DD.' };
    if (target < today) return { kind: 'badDate', askStart, start, message: 'Slutdatumet har redan passerat.' };
  } else {
    target = addMonths(today, settings.period);
  }

  const days = getDaysDiff(target, start) + 1;
  if (days <= 0) {
    return {
      kind: 'covered', askStart, start, target,
      message: `Nuvarande recept täcker redan hela perioden (räcker t.o.m. ${fmtDate(renewal.endDate)}).`,
    };
  }

  const packageSize = effectivePackage(settings, renewal.packageSize);
  if (!(packageSize > 0)) return { kind: 'needPackage', askStart, start, target, message: 'Ange förpackningsstorlek.' };

  const units = Math.ceil(days * renewal.dailyDose - EPS);
  const packages = Math.ceil(units / packageSize - EPS);
  return { kind: 'ok', askStart, start, target, days, units, packages, packageSize };
}
