// === FÖRNYELSEBERÄKNING ===
// Ren funktion utan DOM eller state. Räknar enbart på receptet och ordinerad dos.
// Patientens uppgift om kvarvarande mängd används inte alls (beslut 2026-09-27).
//
// Regler, godkända i Kliniska testfall:
//   dygnsdos          = dos ÷ 1, 7 eller 30
//   förskrivet        = förpackningsstorlek × antal uttag
//   räcker t.o.m.     = receptdatum + hela dagar förskrivet räcker − 1 (receptdagen är dag 1)
//   dagar kvar        = räcker t.o.m. − idag
//   borde finnas kvar = förskrivet − dygnsdos × dagar sedan receptdatum, lägst 0
//   om slut nu        = förskrivet ÷ dagar sedan receptdatum, i % av dygnsdosen

import type { MedForm, Tone } from '../types';
import {
  CONSUMPTION_NORMAL_HIGH, CONSUMPTION_NORMAL_LOW, DAYS_REMAINING_WARN, LONG_OVERDUE_DAYS,
  MAX_DAILY_DOSE, MAX_PACKAGE_SIZE, MAX_REFILLS, MAX_TOTAL_DAYS, MIN_REFILLS, MAX_MED_NAME_LENGTH,
  UNIT_DISPLAY,
} from '../constants';
import { addDays, fmtQty, getDaysDiff, parseDateUTC, parseNum } from '../utils';

export type FieldKey = 'name' | 'date' | 'dose' | 'package' | 'refills';
export type FieldErrors = Partial<Record<FieldKey, string>>;

export type RenewalStatus = 'enough' | 'soon' | 'out' | 'longOut';

export const STATUS_LABEL: Record<RenewalStatus, string> = {
  enough: 'Räcker',
  soon: 'Tar snart slut',
  out: 'Slut',
  longOut: 'Slut sedan länge',
};

export const STATUS_TONE: Record<RenewalStatus, Tone> = {
  enough: 'ok', soon: 'warn', out: 'bad', longOut: 'bad',
};

export interface Consumption {
  /** Förbrukning om patienten har slut idag, i procent av ordinerad dygnsdos. */
  pct: number;
  /** Samma förbrukning uttryckt per doseringsintervall (dag, vecka eller månad). */
  perInterval: number;
  tone: Tone;
}

export interface RenewalOk {
  kind: 'ok';
  errors: FieldErrors;
  dailyDose: number;
  total: number;
  packageSize: number;
  refills: number;
  prescribedDate: Date;
  daysSince: number;
  coverDays: number;
  endDate: Date;
  daysLeft: number;
  expectedLeft: number;
  status: RenewalStatus;
  consumption: Consumption | null;
  /** Andel av receptperioden som förflutit, 0–100. */
  elapsedPct: number;
}

export type RenewalResult =
  | { kind: 'empty'; errors: FieldErrors }
  | { kind: 'incomplete'; errors: FieldErrors; missing: string[] }
  | { kind: 'invalid'; errors: FieldErrors }
  | { kind: 'implausible'; errors: FieldErrors; message: string }
  | { kind: 'manual'; errors: FieldErrors }
  | RenewalOk;

export function isRenewalOk(r: RenewalResult): r is RenewalOk {
  return r.kind === 'ok';
}

const EPS = 1e-9;

/** Beräknar förnyelseunderlaget för ett läkemedel. `today` = dagens datum kl 00:00 UTC. */
export function calcRenewal(f: MedForm, today: Date): RenewalResult {
  const errors: FieldErrors = {};
  const missing: string[] = [];
  const unitShort = UNIT_DISPLAY[f.unit].short;

  if (f.name.length > MAX_MED_NAME_LENGTH) errors.name = `Högst ${MAX_MED_NAME_LENGTH} tecken.`;

  if (f.notCalculable) {
    return f.name.trim() ? { kind: 'manual', errors } : { kind: 'empty', errors };
  }

  const allEmpty = !f.name.trim() && !f.dateRaw && !f.doseRaw && !f.packageRaw && !f.refillsRaw;
  if (allEmpty) return { kind: 'empty', errors };

  // Receptdatum
  const date = parseDateUTC(f.dateRaw.trim());
  if (!f.dateRaw.trim()) missing.push('receptdatum');
  else if (!date) errors.date = 'Ange datum som ÅÅÅÅ-MM-DD.';
  else if (date > today) errors.date = 'Datumet är satt i framtiden.';

  // Dos
  const dose = parseNum(f.doseRaw);
  const maxDose = MAX_DAILY_DOSE[f.unit] * f.interval;
  if (!f.doseRaw.trim()) missing.push('dos');
  else if (!(dose > 0)) errors.dose = 'Ange en dos större än 0.';
  else if (dose > maxDose) errors.dose = `Högst ${fmtQty(maxDose)} ${unitShort} per ${f.interval === 1 ? 'dag' : f.interval === 7 ? 'vecka' : 'månad'}.`;

  // Förpackningsstorlek
  const pkg = parseNum(f.packageRaw);
  if (!f.packageRaw.trim()) missing.push('förpackningsstorlek');
  else if (!(pkg > 0) || pkg > MAX_PACKAGE_SIZE) errors.package = `Ange ett tal mellan 1 och ${MAX_PACKAGE_SIZE}.`;
  else if (f.unit === 'st' && !Number.isInteger(pkg)) errors.package = 'Ange ett heltal.';

  // Antal uttag
  const refills = parseNum(f.refillsRaw);
  if (!f.refillsRaw.trim()) missing.push('antal uttag');
  else if (!Number.isInteger(refills) || refills < MIN_REFILLS) errors.refills = `Ange ett heltal ${MIN_REFILLS}–${MAX_REFILLS}.`;
  else if (refills > MAX_REFILLS) errors.refills = `Max ${MAX_REFILLS} uttag.`;

  if (!f.name.trim()) missing.unshift('läkemedel');

  const blocking = errors.date || errors.dose || errors.package || errors.refills;
  if (blocking) return { kind: 'invalid', errors };
  if (missing.length) return { kind: 'incomplete', errors, missing };

  const dailyDose = dose / f.interval;
  const total = pkg * refills;
  const coverDays = Math.floor(total / dailyDose + EPS);
  if (coverDays > MAX_TOTAL_DAYS || coverDays < 1) {
    return {
      kind: 'implausible', errors,
      message: coverDays < 1
        ? 'Orimliga värden – det förskrivna räcker inte en hel dag. Kontrollera inmatningen.'
        : 'Orimliga värden – receptet skulle räcka mer än 10 år. Kontrollera inmatningen.',
    };
  }

  const prescribedDate = date!;
  const daysSince = getDaysDiff(today, prescribedDate);
  const endDate = addDays(prescribedDate, coverDays - 1);
  const daysLeft = getDaysDiff(endDate, today);
  const expectedLeft = Math.max(0, total - dailyDose * daysSince);

  const status: RenewalStatus =
    daysLeft >= DAYS_REMAINING_WARN ? 'enough'
    : daysLeft >= 0 ? 'soon'
    : -daysLeft > LONG_OVERDUE_DAYS ? 'longOut'
    : 'out';

  let consumption: Consumption | null = null;
  if (daysSince > 0) {
    const pct = (total / daysSince / dailyDose) * 100;
    consumption = {
      pct,
      perInterval: (total / daysSince) * f.interval,
      tone: pct >= CONSUMPTION_NORMAL_LOW && pct <= CONSUMPTION_NORMAL_HIGH ? 'ok' : 'warn',
    };
  }

  return {
    kind: 'ok', errors,
    dailyDose, total, packageSize: pkg, refills, prescribedDate, daysSince, coverDays,
    endDate, daysLeft, expectedLeft, status, consumption,
    elapsedPct: Math.max(0, Math.min(100, (daysSince / coverDays) * 100)),
  };
}

/** "4 dagar kvar", "Tar slut idag", "Slut sedan 1 dag". */
export function daysLeftText(daysLeft: number): string {
  if (daysLeft > 0) return `${daysLeft} ${daysLeft === 1 ? 'dag' : 'dagar'} kvar`;
  if (daysLeft === 0) return 'Tar slut idag';
  const d = -daysLeft;
  return `Slut sedan ${d} ${d === 1 ? 'dag' : 'dagar'}`;
}

