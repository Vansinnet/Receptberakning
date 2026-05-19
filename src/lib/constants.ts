// === KONFIGURATIONSKONSTANTER — enda källan för alla trösklar, gränsvärden och mappningar ===
// STYRNING: Alla kliniska och tekniska konstanter samlas här. Ändra ALDRIG ett värde
// direkt i en funktion — uppdatera denna fil och använd AKTIVT VAL-kommentarer för
// att dokumentera kliniska beslut. Framtida utvecklare ska kunna förstå varför varje
// tröskel är satt som den är.

// ============================================================================
// 1. KLINISKA TRÖSKLAR — RECEPTFÖRNYELSE
// ============================================================================

// AKTIVT VAL: 80% — undre gräns för normal förbrukning. Vid 80–110% av
// ordinerad dos visas snittförbrukningen grönt. Under 80% visas gul.
export const CONSUMPTION_NORMAL_LOW = 80;

// AKTIVT VAL: 110% — övre gräns för normal förbrukning. Vid 80–110% av
// ordinerad dos visas snittförbrukningen grönt. Över 110% visas gul.
export const CONSUMPTION_NORMAL_HIGH = 110;

// AKTIVT VAL: 14 dagar — tröskel för "Räcker t.o.m."-radens färg.
// Vid 14 dagar eller mer kvar av receptperioden blir raden gul.
// Under 14 dagar kvar visas raden grön.
export const DAYS_REMAINING_WARN = 14;

// AKTIVT VAL: 2.5x — vid denna multiplikator av ordinerad dos triggas en
// datakontrollsvarning. Fångar orimlig inmatning (t.ex. fel enhet) utan att
// blockera legitima fall (t.ex. titrering).
export const VERY_HIGH_CONSUMPTION_MULTIPLIER = 2.5;

// AKTIVT VAL: 10 år (3650 dagar) — maximal rimlig recepttid. Överstiger
// förskrivningen 10 år är indata med hög sannolikhet felaktig.
export const MAX_TOTAL_DAYS = 3650;

// ============================================================================
// 2. KLINISKA TRÖSKLAR — LÅNGVARIG FÖRBRUKNING
// ============================================================================

// AKTIVT VAL: Samma 10%-marginal som receptförnyelse — konsekvent klinisk
// bedömning över hela verktyget.
export const LT_OVER = 1.10;

// AKTIVT VAL: 80% — symmetriskt med receptförnyelsens lågförbrukningströskel.
export const LT_UNDER = 0.80;

// AKTIVT VAL: 50 år (18250 dagar) — maximal rimlig periodlängd för
// långvarig förbrukningsanalys.
export const MAX_PERIOD_SPAN_DAYS = 365 * 50;

// AKTIVT VAL: 150% — maxgräns för förbrukningsstapeln i UI:t. Värden över
// 150% av ordination är extrema och klampas visuellt.
export const LT_BAR_MAX_PCT = 150;

// AKTIVT VAL: 20% — tröskel under vilken procenttexten i förbrukningsstapeln
// döljs (för liten för att vara läsbar).
export const LT_BAR_TEXT_THRESHOLD_PCT = 20;

// AKTIVT VAL: 5 procentenheter — stegstorlek för CSP-säkra breddklasser
// (w0, w5, w10...w100) som används av progressbars istället för inline style:width.
export const PROGRESS_BAR_STEP_PCT = 5;

// ============================================================================
// 3. GRÄNSVÄRDEN — ANTAL / MÄNGDER
// ============================================================================

export const MAX_MED_CARDS = 8;
export const MAX_LT_PERIODS = 10;
export const MIN_LT_PERIODS = 1;
export const MAX_PRESCRIBE_MONTHS = 12;
export const DEFAULT_PRESCRIBE_MONTHS = 7;

// ============================================================================
// 4. VALIDERING — DIMENSIONER
// ============================================================================

export const MAX_MED_NAME_LENGTH = 100;
export const MAX_DATE_LENGTH = 10;
export const MAX_AMT_VALUE = 10000;
export const MIN_DOSE_VALUE = 0.1;
export const MAX_DOSE_VALUE = 50;
export const MIN_REF_VALUE = 1;
export const MAX_REF_VALUE = 12;

// ============================================================================
// 5. DATUM — INTERVALL
// ============================================================================

export const VALID_INTERVALS: number[] = [1, 7, 30];
export const MIN_VALID_YEAR = 1950;
export const MAX_VALID_YEAR = 2100;
export const MS_PER_DAY = 86400000;

// ============================================================================
// 6. TIMER / DEBOUNCE
// ============================================================================

export const ACTIVITY_RESET_DEBOUNCE_MS = 2000;

// AKTIVT VAL: 22 minuter — användaren varnas om inaktivitet efter denna tid.
// Tillräckligt långt för att inte avbryta arbetsflöden, tillräckligt kort
// för att skydda patientdata vid bortglömd session.
export const INACTIVITY_WARN_MS = 22 * 60 * 1000;

// AKTIVT VAL: 60 sekunder — nedräkning som visas i toasten före rensning.
export const INACTIVITY_COUNTDOWN_SEC = 60;

// 1 sekund mellan varje nedräkningssteg.
export const COUNTDOWN_TICK_MS = 1000;

// ============================================================================
// 7. ENHETER / DISPLAY-MAPPNINGAR
// ============================================================================

export const VALID_THEMES = new Set(['dark', 'klinisk', 'sakura']);

export const UNIT_DISPLAY = {
  st:  { short: 'st',  long: 'tabletter' },
  ml:  { short: 'ml',  long: 'ml' },
  dos: { short: 'dos', long: 'doser' },
} as const;

// Dos-enhetsnormalisering: rå enhet → kanonisk enhet.
export const DOSE_UNIT_NORMALIZE: Record<string, string> = {
  mikrogram: 'µg', mikrog: 'µg', microgram: 'µg', mcg: 'µg',
  nanogram: 'ng', gram: 'g', ie: 'IE', iu: 'IE',
  mmol: 'mmol',
};

// ============================================================================
// 8. DEFAULT-VÄRDEN — PANELER / FORMULÄR
// ============================================================================

export const DEFAULT_PRESCRIBE_MODE = 'months';
export const DEFAULT_PRESCRIBE_END_DATE = '';

// ============================================================================
// 9. LÄKEMEDELSTILLVERKARE — används av stripManufacturer() för att
//     rensa bort tillverkarnamn ur läkemedelssträngar.
// ============================================================================

// Flerordiga tillverkarnamn — kräver matchning av hela frasen.
export const COMPOUND_MFR_NAMES: string[] = [
  "Medical Valley", "Abacus Medicine", "EQL Pharma",
  "G\\.L\\.\\s*Pharma", "1A Farma", "Omet Pharma", "Nordic Drugs",
];

// Enordiga tillverkarnamn.
export const SINGLE_MFR_NAMES: string[] = [
  "STADA", "Sandoz", "Accord(?:pharma)?", "Teva", "Krka", "Ebb",
  "Viatris", "Orion", "Actavis", "Zentiva", "Orifarm", "Bluefish",
  "Glenmark", "Evolan", "APL", "ABECE", "Avansor", "Apofri",
  "SUN", "Amarox", "Aurobindo", "Hexal", "HEXAL", "Alternova",
  "Mylan", "Bijon", "Grindeks", "Newbury", "Jubilant", "Strides",
  "Holsten", "Vitabalans", "Medartuum", "Abcur", "2care4",
  "Amdipharm", "Brown", "Pfizer", "Xiromed", "Pilum",
  "Rivopharm", "Novum", "Aristo", "Tillomed", "Waymade", "Baxter",
];

// ============================================================================
// 10. LÄKEMEDELSSÖKNING / AUTOCOMPLETE
// ============================================================================

export const MIN_SEARCH_QUERY_LENGTH = 2;
export const MAX_AUTOCOMPLETE_RESULTS = 20;
