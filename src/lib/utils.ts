import { getNow } from './clock';
import {
  MS_PER_DAY,
  MIN_VALID_YEAR,
  MAX_VALID_YEAR,
  DOSE_UNIT_NORMALIZE,
  COMPOUND_MFR_NAMES,
  SINGLE_MFR_NAMES,
  PROGRESS_BAR_STEP_PCT,
  STRENGTH_UNIT_PATTERN,
  CONSUMPTION_NORMAL_LOW,
  CONSUMPTION_NORMAL_HIGH,
  DAYS_REMAINING_WARN,
} from './constants';

// === DATUM ===

export function fmtDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

let _todayCache: Date | null = null;
let _todayCacheKey = '';

export function getToday(): Date {
  const n = getNow();
  const key = `${n.getFullYear()}-${n.getMonth()}-${n.getDate()}`;
  if (_todayCache && _todayCacheKey === key) return _todayCache;
  _todayCache = new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
  _todayCacheKey = key;
  return _todayCache;
}

export function todayStr(): string {
  return fmtDate(getToday());
}

export function oneYearAgoStr(): string {
  const n = getNow();
  const d = new Date(Date.UTC(n.getFullYear() - 1, n.getMonth(), n.getDate()));
  return fmtDate(d);
}

export function getDaysDiff(d1: Date, d2: Date): number {
  return Math.round((d1.getTime() - d2.getTime()) / MS_PER_DAY);
}

export function parseDateUTC(str: string): Date | null {
  if (!str) return null;
  const parts = str.split('-');
  if (parts.length !== 3) return null;
  const y = parseInt(parts[0], 10), m = parseInt(parts[1], 10), day = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(day) || m < 1 || m > 12 || day < 1 || day > 31) return null;
  if (y < MIN_VALID_YEAR || y > MAX_VALID_YEAR) return null;
  const d = new Date(Date.UTC(y, m - 1, day));
  if (isNaN(d.getTime())) return null;
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== m - 1 || d.getUTCDate() !== day) return null;
  return d;
}

// === DOSE UNIT EXTRACTION ===

const _doseUnitRe = new RegExp('(\\d+(?:[.,]\\d+)?)\\s*(' + STRENGTH_UNIT_PATTERN + ')\\b', 'i');

export function extractDoseUnit(medRaw: string): { amount: number; unit: string } | null {
  const m = medRaw.match(_doseUnitRe);
  if (!m) return null;
  const amount  = parseFloat(m[1].replace(',', '.'));
  const rawUnit = m[2].toLowerCase();
  const unit = DOSE_UNIT_NORMALIZE[rawUnit] ?? rawUnit;
  return { amount, unit };
}

// === FASS URL ===

export function getFassUrl(medRaw: string, nplId?: string | null): string {
  if (nplId && /^\d+$/.test(nplId)) return `https://www.fass.se/LIF/product?nplId=${nplId}&userType=0`;
  return `https://www.fass.se/LIF/result?query=${encodeURIComponent(medRaw.trim())}&userType=0`;
}

// === TILLVERKARSTRIPPNING ===

const _mfrRe = new RegExp("\\b(?:" + COMPOUND_MFR_NAMES.concat(SINGLE_MFR_NAMES).join("|") + ")\\b", "gi");

export function stripManufacturer(name: string): string {
  if (!name) return name;
  return name.replace(_mfrRe, "").replace(/\s+/g, " ").trim();
}

export function pctClass(pct: number, prefix: string): string {
  const step = Math.round(Math.min(100, Math.max(0, pct)) / PROGRESS_BAR_STEP_PCT) * PROGRESS_BAR_STEP_PCT;
  return `${prefix}${step}`;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text || !navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function applyDateMask(input: HTMLInputElement, onChanged: (val: string) => void): void {
  const originalVal = input.value;
  let val = originalVal.replace(/\D/g, '').substring(0, 8);
  if (val.length > 4) val = val.substring(0, 4) + '-' + val.substring(4);
  if (val.length > 7) val = val.substring(0, 7) + '-' + val.substring(7);
  const sel = input.selectionStart ?? 0;
  const digitsBefore = originalVal.substring(0, sel).replace(/\D/g, '').length;
  onChanged(val);
  if (val !== originalVal) {
    let newPos = 0, count = 0;
    for (let i = 0; i < val.length; i++) {
      if (/\d/.test(val[i])) count++;
      if (count === digitsBefore) { newPos = i + 1; break; }
    }
    if (count < digitsBefore) newPos = val.length;
    const target = newPos;
    requestAnimationFrame(() => {
      try { input.setSelectionRange(target, target); } catch (_) {}
    });
  }
}

export function needsRenewalWarning(consumptionPct: number, daysToPrescribedEnd: number): boolean {
  return consumptionPct < CONSUMPTION_NORMAL_LOW
    || consumptionPct > CONSUMPTION_NORMAL_HIGH
    || daysToPrescribedEnd >= DAYS_REMAINING_WARN;
}
