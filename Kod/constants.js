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
const OVERUSE_THRESHOLD = 1.10;

// AKTIVT VAL: 0.20 (20% av receptperioden) — vid denna gräns är det för tidigt
// att förnya eftersom >80% av perioden återstår. Balanserar mellan att undvika
// onödiga förnyelser och att inte tvinga patienten till akutbesök vid gränsfall.
const EARLY_RENEWAL_THRESHOLD = 0.20;

// AKTIVT VAL: 7 dagar — överanvändningsvarning undertrycks när medicinen
// beräknas ta slut inom 7 dagar. Patienten ska inte nekas förnyelse för att
// hen tagit lite mer sista veckan.
const OVERUSE_SUPPRESSION_DAYS = 7;

// AKTIVT VAL: 14 dagar — undanträngningsskydd för recept med >14 dagar kvar.
// Se calcCore() för fullständig motivering (hasRemaining-fallet).
const OVERUSE_MIN_RECEPT_DAYS = 14;

// AKTIVT VAL: 2.5x — vid denna multiplikator av ordinerad dos triggas en
// datakontrollsvarning. Fångar orimlig inmatning (t.ex. fel enhet) utan att
// blockera legitima fall (t.ex. titrering).
const VERY_HIGH_CONSUMPTION_MULTIPLIER = 2.5;

// AKTIVT VAL: 10 år (3650 dagar) — maximal rimlig recepttid. Överstiger
// förskrivningen 10 år är indata med hög sannolikhet felaktig.
const MAX_TOTAL_DAYS = 3650;

// AKTIVT VAL: 80% — vid förbrukning under 80% av ordinerad dos triggas
// en varning för låg förbrukning. Tröskeln är satt för att fånga kliniskt
// relevant underanvändning (t.ex. följsamhetsproblem).
const LOW_CONSUMPTION_PCT = 80;

// Kontaktdatum vid överanvändning sätts till 7 dagar före förskrivet slutdatum.
const CONTACT_DATE_OFFSET_DAYS = 7;

// ============================================================================
// 2. KLINISKA TRÖSKLAR — LÅNGVARIG FÖRBRUKNING
// ============================================================================

// AKTIVT VAL: Samma 10%-marginal som receptförnyelse — konsekvent klinisk
// bedömning över hela verktyget.
const LT_OVER = 1.10;

// AKTIVT VAL: 80% — symmetriskt med receptförnyelsens lågförbrukningströskel.
const LT_UNDER = 0.80;

// AKTIVT VAL: 50 år (18250 dagar) — maximal rimlig periodlängd för
// långvarig förbrukningsanalys.
const MAX_PERIOD_SPAN_DAYS = 365 * 50;

// AKTIVT VAL: 150% — maxgräns för förbrukningsstapeln i UI:t. Värden över
// 150% av ordination är extrema och klampas visuellt.
const LT_BAR_MAX_PCT = 150;

// AKTIVT VAL: 20% — tröskel under vilken procenttexten i förbrukningsstapeln
// döljs (för liten för att vara läsbar).
const LT_BAR_TEXT_THRESHOLD_PCT = 20;

// ============================================================================
// 3. GRÄNSVÄRDEN — ANTAL / MÄNGDER
// ============================================================================

const MAX_MED_CARDS = 8;
const MAX_LT_PERIODS = 10;
const MIN_LT_PERIODS = 1;
const MAX_PRESCRIBE_MONTHS = 12;
const DEFAULT_PRESCRIBE_MONTHS = 7;

// ============================================================================
// 4. VALIDERING — DIMENSIONER
// ============================================================================

const MAX_MED_NAME_LENGTH = 100;
const MAX_DATE_LENGTH = 10;
const MAX_AMT_VALUE = 10000;
const MIN_DOSE_VALUE = 0.1;
const MAX_DOSE_VALUE = 50;
const MIN_REF_VALUE = 1;
const MAX_REF_VALUE = 12;

// ============================================================================
// 5. DATUM — INTERVALL
// ============================================================================

const VALID_INTERVALS = [1, 7, 30];
const MIN_VALID_YEAR = 1950;
const MAX_VALID_YEAR = 2100;
const MS_PER_DAY = 86400000;

// ============================================================================
// 6. TIMER / DEBOUNCE
// ============================================================================

const CALC_DEBOUNCE_MS = 120;
const LONGTERM_DEBOUNCE_MS = 150;
const ADD_MED_LOCK_MS = 300;
const CLEAR_CARD_LOCK_MS = 300;
const RECALC_ON_DATE_DEBOUNCE_MS = 50;
const DEFAULT_DEBOUNCE_MS = 120;
const ACTIVITY_RESET_DEBOUNCE_MS = 2000;

// AKTIVT VAL: 22 minuter — användaren varnas om inaktivitet efter denna tid.
// Tillräckligt långt för att inte avbryta arbetsflöden, tillräckligt kort
// för att skydda patientdata vid bortglömd session.
const INACTIVITY_WARN_MS = 22 * 60 * 1000;

// AKTIVT VAL: 23 minuter — sidan töms automatiskt efter denna tid.
// En minut efter varning, tillräckligt för att användaren ska hinna reagera.
const INACTIVITY_CLEAR_MS = 23 * 60 * 1000;

// AKTIVT VAL: 60 sekunder — nedräkning som visas i toasten före rensning.
const INACTIVITY_COUNTDOWN_SEC = 60;

// 1 sekund mellan varje nedräkningssteg.
const COUNTDOWN_TICK_MS = 1000;

// ============================================================================
// 7. UI — TOAST / KOPIERING / TOOLTIP
// ============================================================================

const TOAST_DURATION_MS = 3000;
const TOAST_FADE_OUT_MS = 200;
const COPY_CONFIRMATION_MS = 1800;
const TOOLTIP_OFFSET_X = 12;
const TOOLTIP_OFFSET_Y = 36;

// ============================================================================
// 8. UI — FLAGGOR
// ============================================================================

const FLAG_VIEWBOX = '0 0 22 14';
const FLAG_WIDTH = 20;
const FLAG_HEIGHT = 13;

// ============================================================================
// 9. ENHETER / DISPLAY-MAPPNINGAR
// ============================================================================

const VALID_THEMES = new Set(['dark', 'klinisk', 'sakura']);
const VALID_SEASONAL_THEMES = new Set(['jul', 'pask', 'midsommar', 'halloween']);
const SEASONAL_THEME_SCHEDULE = [
  { start: {m:12,d:1}, end: {m:1,d:6},  theme: 'jul',        label: '🎄 Jul' },
  { start: {m:3,d:20},  end: {m:4,d:15}, theme: 'pask',       label: '🐣 Påsk' },
  { start: {m:6,d:20},  end: {m:6,d:26}, theme: 'midsommar',  label: '🌸 Midsommar' },
  { start: {m:10,d:24}, end: {m:10,d:31}, theme: 'halloween', label: '🎃 Halloween' },
];
const SAFE_ALERT_TYPES = new Set(['danger', 'warn', 'info', 'ok']);

const UNIT_DISPLAY = {
  st:  { short: 'st',  long: 'tabletter' },
  ml:  { short: 'ml',  long: 'ml' },
  dos: { short: 'dos', long: 'doser' },
};

// Dos-enhetsnormalisering: rå enhet → kanonisk enhet.
const DOSE_UNIT_NORMALIZE = {
  mikrogram: 'µg', microgram: 'µg', mcg: 'µg',
  nanogram: 'ng', gram: 'g', ie: 'IE', iu: 'IE',
};

// ============================================================================
// 10. DEFAULT-VÄRDEN — PANELER / FORMULÄR
// ============================================================================

const DEFAULT_PRESCRIBE_MODE = 'months';
const DEFAULT_PRESCRIBE_END_DATE = '';

// ============================================================================
// 11. LÄKEMEDELSTILLVERKARE — används av stripManufacturer() för att
//     rensa bort tillverkarnamn ur läkemedelssträngar.
// ============================================================================

// Flerordiga tillverkarnamn — kräver matchning av hela frasen.
const COMPOUND_MFR_NAMES = [
  "Medical Valley", "Abacus Medicine", "EQL Pharma",
  "G\\.L\\.\\s*Pharma", "1A Farma", "Omet Pharma", "Nordic Drugs",
];

// Enordiga tillverkarnamn.
const SINGLE_MFR_NAMES = [
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

const MIN_SEARCH_QUERY_LENGTH = 2;
const MAX_AUTOCOMPLETE_RESULTS = 10;
