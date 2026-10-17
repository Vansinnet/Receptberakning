import { getNow } from './clock';
import {
  MS_PER_DAY,
  MIN_VALID_YEAR,
  MAX_VALID_YEAR,
  DOSE_UNIT_NORMALIZE,
  DOSE_UNIT_WORDS,
  DOSE_EXPR_DECIMALS,
  COMPOUND_MFR_NAMES,
  SINGLE_MFR_NAMES,
  STRENGTH_UNIT_PATTERN,
  type DoseUnit,
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

/**
 * Formaterar datumfältet medan man skriver. Siffror fördelas på år (4), månad (2) och dag (2)
 * med bindestreck emellan. Ett skrivet skiljetecken (- . / eller mellanslag) avslutar en del
 * i förtid, så att "2026-6-20" går att skriva. Rena siffror: "20260620" → "2026-06-20".
 * Kompletteringen till ÅÅÅÅ-MM-DD görs av {@link normalizeDateInput} när fältet lämnas.
 */
export function formatDateInput(raw: string): string {
  const limits = [4, 2, 2];
  const groups: string[] = [''];
  for (const ch of raw ?? '') {
    const g = groups.length - 1;
    if (ch >= '0' && ch <= '9') {
      // Skrivs första delen kortare än ett år (DD-MM-ÅÅÅÅ) får sista delen fyra siffror, så att
      // inget kortas av till ett annat, giltigt datum. Formen avvisas eller tolkas i normalizeDateInput.
      const limit = g === 2 && groups[0].length < 4 ? 4 : limits[g];
      if (groups[g].length < limit) groups[g] += ch;
      else if (groups.length < limits.length) groups.push(ch);
    } else if (groups[g].length > 0 && groups.length < limits.length) {
      groups.push('');
    }
  }
  return groups.join('-');
}

/**
 * Kompletterar ett datum när fältet lämnas (eller vid Enter). Ändrar bara värden som
 * entydigt kan bli ett giltigt datum; allt annat lämnas orört och valideras som vanligt.
 *   "2026-6-20" → "2026-06-20"  (ensiffrig månad eller dag)
 *   "260620"    → "2026-06-20"  (ÅÅMMDD, som masken visar som "2606-20")
 *   "20-6-2026" → "2026-06-20"  (D-M-ÅÅÅÅ)
 * Tvåsiffrigt år tolkas alltid som 20ÅÅ. "2026-09-1" lämnas orört (kan vara ofullständigt).
 */
export function normalizeDateInput(value: string): string {
  const s = (value ?? '').trim();
  const pad = (x: string) => x.padStart(2, '0');
  const valid = (iso: string) => (parseDateUTC(iso) ? iso : null);
  // ÅÅÅÅ-M-D: en ensiffrig dag kompletteras bara när månaden också skrevs med en siffra, så att
  // ett ofullständigt "2026-09-1" inte blir 1 september när man råkar lämna fältet.
  const full = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (full && (full[3].length === 2 || full[2].length === 1)) return `${full[1]}-${pad(full[2])}-${pad(full[3])}`;
  // ÅÅMMDD (visas av masken som "ÅÅMM-DD"). ÅÅ-M-D tolkas inte: "20/6-26" betyder i vardagssvenska
  // 20 juni 2026 och skulle annars bli 2020-06-26.
  const short = s.match(/^(\d{2})(\d{2})-(\d{2})$/) ?? s.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (short) return valid(`20${short[1]}-${pad(short[2])}-${pad(short[3])}`) ?? value;
  // D-M-ÅÅÅÅ: fyrsiffrigt år sist är entydigt.
  const dmy = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmy) return valid(`${dmy[3]}-${pad(dmy[2])}-${pad(dmy[1])}`) ?? value;
  return value;
}

/** Formaterar datumfältet vid inmatning (se {@link formatDateInput}) och behåller markörens plats. */
export function applyDateMask(input: HTMLInputElement, onChanged: (val: string) => void): void {
  const originalVal = input.value;
  const val = formatDateInput(originalVal);
  const sel = input.selectionStart ?? originalVal.length;
  const atEnd = sel >= originalVal.length;
  const digitsBefore = originalVal.substring(0, sel).replace(/\D/g, '').length;
  onChanged(val);
  if (val !== originalVal) {
    let target = val.length;
    if (!atEnd) {
      // Markören står mitt i fältet: placera den efter lika många siffror som före ändringen.
      let count = 0;
      target = 0;
      for (let i = 0; i < val.length && count < digitsBefore; i++) {
        if (/\d/.test(val[i])) count++;
        target = i + 1;
      }
    }
    // Bara om fältet fortfarande har fokus och samma värde: annars har användaren (eller
    // kompletteringen vid blur) hunnit ändra fältet, och markören ska inte flyttas.
    requestAnimationFrame(() => {
      if (document.activeElement !== input || input.value !== val) return;
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

/**
 * Mängd i mg med upp till fyra decimaler, utan avslutande nollor: 3.75 → "3,75", 56.25 → "56,25",
 * 7.5 → "7,5", 375 → "375". Används för styrkor och uttag i mg, där fmtQty:s avrundning till
 * en decimal skulle göra 3,75 mg till 3,8 mg.
 */
export function fmtMg(n: number): string {
  return String(Math.round(n * 10000) / 10000).replace('.', ',');
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

// === DOSUTTRYCK ===

const _DOSE_NUM = '\\d+(?:[.,]\\d+)?';
const _doseNumRe = new RegExp(`^${_DOSE_NUM}$`);
const _doseProductRe = new RegExp(`^(${_DOSE_NUM})x(${_DOSE_NUM})$`);
const _doseSumRe = new RegExp(`^${_DOSE_NUM}(?:\\+${_DOSE_NUM})+$`);
const _doseUnitWordRe = /^(.*?)\s*([a-zåäö]+)\.?$/;

/** Innehåller dosfältet ett uttryck (1x2, 1+0+1, ½, enhetsord) och inte bara ett tal? */
export function isDoseExpression(raw: string): boolean {
  return /[x×*+½a-zåäö]/i.test(raw ?? '');
}

/**
 * Parsar ordinerad dos. Ett vanligt tal ("1,5") parsas som med {@link parseNum}. Dessutom godtas:
 *   "1x2", "1 x 2", "1×2" → 2  (antal × gånger)
 *   "1+0+1", "1+1+1+1"   → 2, 4 (morgon + middag + kväll + natt)
 *   "½", "1½", "½x2"      → 0,5, 1,5, 1
 *   ett enhetsord sist, om det hör till vald enhet: "2 st", "1x2 tabl", "5 ml"
 * Allt annat (t.ex. "1-2", "1,2,3", "5 ml" när enheten är st) ger NaN.
 */
export function parseDose(raw: string, unit: DoseUnit): number {
  if (!isDoseExpression(raw)) return parseNum(raw);
  let s = (raw ?? '').trim().toLowerCase();
  const word = s.match(_doseUnitWordRe);
  if (word && word[2] !== 'x') {
    if (!DOSE_UNIT_WORDS[unit].includes(word[2])) return NaN;
    s = word[1];
  }
  s = s.replace(/(\d)½/g, '$1.5').replace(/½/g, '0.5').replace(/[×*]/g, 'x').replace(/\s*([x+])\s*/g, '$1');
  const num = (t: string) => Number(t.replace(',', '.'));
  let v: number;
  const product = s.match(_doseProductRe);
  if (_doseNumRe.test(s)) v = num(s);
  else if (product) v = num(product[1]) * num(product[2]);
  else if (_doseSumRe.test(s)) v = s.split('+').reduce((a, t) => a + num(t), 0);
  else return NaN;
  const f = 10 ** DOSE_EXPR_DECIMALS;
  return Math.round(v * f) / f;
}

/**
 * Ersätter ett dosuttryck med talet det betyder, med decimalkomma: "1x2" → "2", "½" → "0,5".
 * Ett vanligt tal eller ett uttryck som inte går att tolka lämnas orört.
 */
export function normalizeDoseInput(raw: string, unit: DoseUnit): string {
  if (!isDoseExpression(raw)) return raw;
  const v = parseDose(raw, unit);
  return v > 0 ? String(v).replace('.', ',') : raw;
}
