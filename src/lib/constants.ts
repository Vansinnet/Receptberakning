// === KONFIGURATIONSKONSTANTER — enda källan för alla trösklar, gränsvärden och mappningar ===
// STYRNING: Alla kliniska och tekniska konstanter samlas här. Ändra ALDRIG ett värde
// direkt i en funktion — uppdatera denna fil och använd AKTIVT VAL-kommentarer för
// att dokumentera kliniska beslut. Framtida utvecklare ska kunna förstå varför varje
// tröskel är satt som den är.

// ============================================================================
// 1. KLINISKA TRÖSKLAR — RECEPTFÖRNYELSE
// ============================================================================

// AKTIVT VAL: 1.10 (10% marginal) balanserar mellan att fånga verklig
// överkonsumtion och att undvika falsklarm vid naturlig dosvariation.
// Sänkning ökar falsklarmrisken; höjning riskerar missad överkonsumtion.
export const OVERUSE_THRESHOLD = 1.10;

// AKTIVT VAL: 0.20 (20% av receptperioden) — vid denna gräns är det för tidigt
// att förnya eftersom >80% av perioden återstår. Balanserar mellan att undvika
// onödiga förnyelser och att inte tvinga patienten till akutbesök vid gränsfall.
export const EARLY_RENEWAL_THRESHOLD = 0.20;

// AKTIVT VAL: 7 dagar — överanvändningsvarning undertrycks när medicinen
// beräknas ta slut inom 7 dagar. Patienten ska inte nekas förnyelse för att
// hen tagit lite mer sista veckan.
export const OVERUSE_SUPPRESSION_DAYS = 7;

// AKTIVT VAL: 14 dagar — undanträngningsskydd för recept med >14 dagar kvar.
// Se calcCore() för fullständig motivering (hasRemaining-fallet).
export const OVERUSE_MIN_RECEPT_DAYS = 14;

// AKTIVT VAL: 1.5x — tröskel för att flagga överanvändning när medicinen är helt
// slut (daysRemaining = 0) och snittförbrukningen överstiger ordination med minst 50%.
// Lägre än VERY_HIGH_CONSUMPTION_MULTIPLIER (2.5x) eftersom slut på medicin + förhöjd
// förbrukning alltid kräver klinisk uppmärksamhet, även vid måttlig överskridning.
export const OVERUSE_ZERO_STOCK_MULTIPLIER = 1.5;

// AKTIVT VAL: 2.5x — vid denna multiplikator av ordinerad dos triggas en
// datakontrollsvarning. Fångar orimlig inmatning (t.ex. fel enhet) utan att
// blockera legitima fall (t.ex. titrering).
export const VERY_HIGH_CONSUMPTION_MULTIPLIER = 2.5;

// AKTIVT VAL: 10 år (3650 dagar) — maximal rimlig recepttid. Överstiger
// förskrivningen 10 år är indata med hög sannolikhet felaktig.
export const MAX_TOTAL_DAYS = 3650;

// AKTIVT VAL: 80% — vid förbrukning under 80% av ordinerad dos triggas
// en varning för låg förbrukning. Tröskeln är satt för att fånga kliniskt
// relevant underanvändning (t.ex. följsamhetsproblem).
export const LOW_CONSUMPTION_PCT = 80;

// Kontaktdatum vid överanvändning sätts till 7 dagar före förskrivet slutdatum.
export const CONTACT_DATE_OFFSET_DAYS = 7;

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

// AKTIVT VAL: 23 minuter — sidan töms automatiskt efter denna tid.
// En minut efter varning, tillräckligt för att användaren ska hinna reagera.
export const INACTIVITY_CLEAR_MS = 23 * 60 * 1000;

// AKTIVT VAL: 60 sekunder — nedräkning som visas i toasten före rensning.
export const INACTIVITY_COUNTDOWN_SEC = 60;

// 1 sekund mellan varje nedräkningssteg.
export const COUNTDOWN_TICK_MS = 1000;

// ============================================================================
// 7. UI — TOAST / KOPIERING / TOOLTIP
// ============================================================================

export const TOAST_DURATION_MS = 3000;
export const TOAST_FADE_OUT_MS = 200;
export const COPY_CONFIRMATION_MS = 1800;
export const TOOLTIP_OFFSET_X = 12;
export const TOOLTIP_OFFSET_Y = 36;

// ============================================================================
// 8. UI — FLAGGOR
// ============================================================================

export const FLAG_VIEWBOX = '0 0 22 14';
export const FLAG_WIDTH = 20;
export const FLAG_HEIGHT = 13;

// ============================================================================
// 9. ENHETER / DISPLAY-MAPPNINGAR
// ============================================================================

export const VALID_THEMES = new Set(['dark', 'klinisk', 'sakura']);
export const SAFE_ALERT_TYPES = new Set(['danger', 'warn', 'info', 'ok']);

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
// 10. DEFAULT-VÄRDEN — PANELER / FORMULÄR
// ============================================================================

export const DEFAULT_PRESCRIBE_MODE = 'months';
export const DEFAULT_PRESCRIBE_END_DATE = '';

// ============================================================================
// 11. LÄKEMEDELSTILLVERKARE — används av stripManufacturer() för att
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
  "Amdipharm", "Brown", "Pfizer", "Xiromed", "Accordpharma", "Pilum",
  "Rivopharm", "Novum", "Aristo", "Tillomed", "Waymade", "Baxter",
];

// ============================================================================
// 12. LÄKEMEDELSSÖKNING / AUTOCOMPLETE
// ============================================================================

export const MIN_SEARCH_QUERY_LENGTH = 2;
export const MAX_AUTOCOMPLETE_RESULTS = 20;
