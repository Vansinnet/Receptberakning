import { getNow } from './clock';
import {
  MS_PER_DAY,
  MIN_VALID_YEAR,
  MAX_VALID_YEAR,
  DOSE_UNIT_NORMALIZE,
  COMPOUND_MFR_NAMES,
  SINGLE_MFR_NAMES,
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

export function extractDoseUnit(medRaw: string): { amount: number; unit: string } | null {
  const m = medRaw.match(/(\d+(?:[.,]\d+)?)\s*(mg|ml|µg|mikrogram|mikrog|microgram|mcg|nanogram|gram|ng|IU|IE|g|mmol)\b/i);
  if (!m) return null;
  const amount  = parseFloat(m[1].replace(',', '.'));
  const rawUnit = m[2].toLowerCase();
  const unit = DOSE_UNIT_NORMALIZE[rawUnit] ?? rawUnit;
  return { amount, unit };
}

// === FASS URL ===

export function getFassUrl(medRaw: string, nplId?: string | null): string {
  if (nplId) return `https://www.fass.se/LIF/product?nplId=${nplId}&userType=0`;
  const url = `https://www.fass.se/LIF/result?query=${encodeURIComponent(medRaw.trim())}&userType=0`;
  return url.startsWith('https://www.fass.se/') ? url : '#';
}

// === TILLVERKARSTRIPPNING ===

let _mfrRe: RegExp | null = null;

function buildMfrRe(): RegExp {
  if (_mfrRe) return _mfrRe;
  const all = COMPOUND_MFR_NAMES.concat(SINGLE_MFR_NAMES);
  _mfrRe = new RegExp("\\b(?:" + all.join("|") + ")\\b", "gi");
  return _mfrRe;
}

export function stripManufacturer(name: string): string {
  if (!name) return name;
  return name.replace(buildMfrRe(), "").replace(/\s+/g, " ").trim();
}

export function pctClass(pct: number, prefix: string): string {
  const step = Math.round(Math.min(100, Math.max(0, pct)) / 5) * 5;
  return `${prefix}${step}`;
}
