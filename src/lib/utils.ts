import { getNow } from './clock';
import {
  MS_PER_DAY,
  MIN_VALID_YEAR,
  MAX_VALID_YEAR,
  DOSE_UNIT_NORMALIZE,
  COMPOUND_MFR_NAMES,
  SINGLE_MFR_NAMES,
  STRENGTH_UNIT_PATTERN,
} from './constants';

// === DATUM ===

/** Formaterar Date-objekt som "ÅÅÅÅ-MM-DD" i UTC. */
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

/** Lägger till n dagar (kan vara negativt). Returnerar nytt Date-objekt. */
export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * MS_PER_DAY);
}

/**
 * Lägger till n kalendermånader. Dag som saknas i målmånaden klampas till månadens
 * sista dag (31 januari + 1 månad → 28/29 februari).
 */
export function addMonths(d: Date, n: number): Date {
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + n, day = d.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, last)));
}

/** Antal hela dagar från d2 till d1 (d1 − d2). */
export function getDaysDiff(d1: Date, d2: Date): number {
  return Math.round((d1.getTime() - d2.getTime()) / MS_PER_DAY);
}

/**
 * Parsar ett datum i strikt format ÅÅÅÅ-MM-DD (UTC-midnatt). Returnerar null vid annat format,
 * t.ex. ett ofullständigt "2026-09-1" som annars skulle tolkas som 1 september.
 */
export function parseDateUTC(str: string): Date | null {
  if (!str || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  const parts = str.split('-');
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

/** Extraherar läkemedelsnamn utan tillverkare. "Sertralin Krka 50 mg" → "Sertralin 50 mg". */
export function stripManufacturer(name: string): string {
  if (!name) return name;
  return name.replace(_mfrRe, "").replace(/\s+/g, " ").trim();
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

// === SIFFROR PÅ SVENSKA ===

/** Tal med fast antal decimaler och decimalkomma: 6.5 → "6,50". */
export function fmtFixed(n: number, decimals: number): string {
  return n.toFixed(decimals).replace('.', ',');
}

/** Tal med högst en decimal, heltal utan decimal: 7.714 → "7,7", 250 → "250". */
export function fmtQty(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : fmtFixed(r, 1);
}

/** Procent med högst en decimal: 101.69 → "101,7 %", 600 → "600 %". */
export function fmtPct(p: number): string {
  return fmtQty(p) + ' %';
}

/** Parsar ett tal från inmatning, med komma eller punkt. Tom sträng → NaN. */
export function parseNum(raw: string): number {
  const s = (raw ?? '').trim().replace(',', '.');
  if (s === '') return NaN;
  const v = Number(s);
  return Number.isFinite(v) ? v : NaN;
}
