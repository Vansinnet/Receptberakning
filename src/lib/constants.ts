// === KONFIGURATIONSKONSTANTER — enda källan för alla trösklar, gränsvärden och mappningar ===
// STYRNING: Alla kliniska och tekniska konstanter samlas här. Ändra ALDRIG ett värde
// direkt i en funktion — uppdatera denna fil och dokumentera kliniska beslut med
// AKTIVT VAL-kommentarer. Värdena i avsnitt 1–3 är godkända i "Recept 5.0 — planering",
// fliken Kliniska testfall (2026-09-27).

// ============================================================================
// 1. KLINISKA TRÖSKLAR — RECEPTFÖRNYELSE
// ============================================================================

// AKTIVT VAL: 14 dagar — vid 14 dagar kvar eller fler är statusen "Räcker".
// 0–13 dagar kvar ger "Tar snart slut". Används även för påminnelse i patienttexten
// och för frågan om nyförskrivningen ska räknas från dagens datum.
export const DAYS_REMAINING_WARN = 14;

// AKTIVT VAL: 90 dagar — slut sedan mer än 90 dagar ger statusen "Slut sedan länge".
// Godkänt som fråga 2 i Kliniska testfall (T06).
export const LONG_OVERDUE_DAYS = 90;

// AKTIVT VAL: 80–110 % — förbrukning "om patienten har slut nu" inom detta intervall
// visas grön, annars gul. Samma gränser gäller i långtidsanalysen.
export const CONSUMPTION_NORMAL_LOW = 80;
export const CONSUMPTION_NORMAL_HIGH = 110;

/**
 * Är procenten inom 80–110 %? Avgörs på värdet avrundat till en decimal — samma värde
 * som visas — så att färgen alltid stämmer med siffran. Utan avrundning blir t.ex.
 * 1100 ÷ 1000 × 100 = 110,00000000000001 och visas gult trots texten "110 %".
 */
export function isWithinNormal(pct: number): boolean {
  const shown = Math.round(pct * 10) / 10;
  return shown >= CONSUMPTION_NORMAL_LOW && shown <= CONSUMPTION_NORMAL_HIGH;
}

// AKTIVT VAL: 7 dagar — i patienttexten vid avslag ombeds patienten höra av sig
// denna tid före beräknat slutdatum.
export const CONTACT_BEFORE_END_DAYS = 7;

// AKTIVT VAL: 10 år (3650 dagar) — ett recept som skulle räcka längre än så beror
// med hög sannolikhet på felinmatning och ger "Orimliga värden".
export const MAX_TOTAL_DAYS = 3650;

// AKTIVT VAL: Ingen separat datakontrollsvarning vid hög förbrukning (4.0 varnade
// vid 2,5 × dosen). Godkänt som fråga 3 i Kliniska testfall — procenten och färgen räcker.

// ============================================================================
// 2. RIMLIGHETSGRÄNSER FÖR INMATNING
// ============================================================================

// AKTIVT VAL: Dosen begränsas per dygn och enhet i stället för det fasta taket 50
// i 4.0, så att t.ex. 60 st per månad eller 60 ml per dag går att ange.
export const MAX_DAILY_DOSE: Record<DoseUnit, number> = { st: 50, ml: 1000, dos: 100 };

export const MAX_PACKAGE_SIZE = 10000;
export const MIN_REFILLS = 1;
export const MAX_REFILLS = 12;
export const MAX_MED_NAME_LENGTH = 100;
export const MIN_VALID_YEAR = 1950;
export const MAX_VALID_YEAR = 2100;

// ============================================================================
// 3. LÅNGTIDSANALYS
// ============================================================================

export const MAX_LT_PERIODS = 10;
// AKTIVT VAL: 50 år — längre perioder är med hög sannolikhet felinmatning.
export const MAX_PERIOD_SPAN_DAYS = 365 * 50 + 13;
// Diagrammets skala går till 160 % av ordinerad dos; högre värden klampas visuellt.
export const LT_CHART_MAX_PCT = 160;

// ============================================================================
// 4. ÄRENDE OCH NYFÖRSKRIVNING
// ============================================================================

export const MAX_MED_CARDS = 8;
export const MAX_PRESCRIBE_MONTHS = 12;
export const DEFAULT_PRESCRIBE_MONTHS = 6;

// ============================================================================
// 5. DATUM
// ============================================================================

export const VALID_INTERVALS = [1, 7, 30] as const;
export type DoseInterval = (typeof VALID_INTERVALS)[number];
export const MS_PER_DAY = 86400000;

// ============================================================================
// 6. TIMER
// ============================================================================

export const ACTIVITY_RESET_DEBOUNCE_MS = 2000;
// AKTIVT VAL: 22 minuter + 60 sekunders nedräkning innan allt rensas. Skyddar
// patientdata på delade kliniska datorer utan att avbryta pågående arbete.
export const INACTIVITY_WARN_MS = 22 * 60 * 1000;
export const INACTIVITY_COUNTDOWN_SEC = 60;
// AKTIVT VAL: 5 minuter — om sidan läggs i bakgrunden (t.ex. appbyte på mobilen) rensas
// ingenting direkt; kommer användaren tillbaka efter 5 minuter eller mer rensas allt.
// Stängs fliken på riktigt rensas allt direkt. Godkänt 2026-09-28.
export const BACKGROUND_CLEAR_MS = 5 * 60 * 1000;
export const COUNTDOWN_TICK_MS = 1000;
export const COPY_CONFIRM_MS = 2000;

// ============================================================================
// 7. ENHETER
// ============================================================================

export type DoseUnit = 'st' | 'ml' | 'dos';

export const UNIT_DISPLAY: Record<DoseUnit, { short: string; long: string; en: string }> = {
  st: { short: 'st', long: 'tabletter', en: 'tablets' },
  ml: { short: 'ml', long: 'ml', en: 'ml' },
  dos: { short: 'doser', long: 'doser', en: 'doses' },
};

export const INTERVAL_LABEL: Record<DoseInterval, string> = { 1: 'dag', 7: 'vecka', 30: 'månad' };

// Dos-enhetsnormalisering: rå enhet → kanonisk enhet.
export const DOSE_UNIT_NORMALIZE: Record<string, string> = {
  mikrogram: 'µg', mikrog: 'µg', microgram: 'µg', mcg: 'µg',
  nanogram: 'ng', gram: 'g', ie: 'IE', iu: 'IE',
  mmol: 'mmol',
};

export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_STORAGE_KEY = 'recept5-theme';

// ============================================================================
// 8. LÄKEMEDELSTILLVERKARE — används av stripManufacturer()
// ============================================================================

export const COMPOUND_MFR_NAMES: string[] = [
  "Medical Valley", "Abacus Medicine", "EQL Pharma",
  "G\\.L\\.\\s*Pharma", "1A Farma", "Omet Pharma", "Nordic Drugs",
];

export const SINGLE_MFR_NAMES: string[] = [
  "STADA", "Sandoz", "Accord(?:pharma)?", "Teva", "Krka", "Ebb",
  "Viatris", "Orion", "Actavis", "Zentiva", "Orifarm", "Bluefish",
  "Glenmark", "Evolan", "APL", "ABECE", "Avansor", "Apofri",
  "SUN", "Amarox", "Aurobindo", "Hexal", "Alternova",
  "Mylan", "Bijon", "Grindeks", "Newbury", "Jubilant", "Strides",
  "Holsten", "Vitabalans", "Medartuum", "Abcur", "2care4",
  "Amdipharm", "Brown", "Pfizer", "Xiromed", "Pilum",
  "Rivopharm", "Novum", "Aristo", "Tillomed", "Waymade", "Baxter",
];

// ============================================================================
// 9. LÄKEMEDELSSÖKNING
// ============================================================================

export const MIN_SEARCH_QUERY_LENGTH = 2;
export const MAX_AUTOCOMPLETE_RESULTS = 20;
export const DEDUP_THRESHOLD = 8;
export const MAX_SEARCH_QUERY_LENGTH = 100;

export const STRENGTH_UNIT_PATTERN = 'mg|ml|µg|μg|g|IE|mmol|mikrogram|mikrog|microgram|mcg|ng|gram|nanogram|IU';
