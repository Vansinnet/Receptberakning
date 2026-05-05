/**
 * Enhetstester för calcCore (calc-renew.js), calcLongtermCore (longterm.js)
 * och calcPrescribeResult / canRenewMed / prescribeValidationHint (prescribe.js)
 *
 * Kör: node test-calc.js
 *
 * calcCore täcker: ofullständiga indata, daysSince=0, remaining>total,
 * totalDays>3650, ref=12, fraktionell dos, 7-dagars-suppression,
 * klinisk override och output-struktur.
 *
 * calcLongtermCore täcker: ogiltiga indata, periodfältsfel, normalfall,
 * över/underförbrukning, gränsvärden, överlappande perioder,
 * per-period klassificering och output-struktur.
 *
 * prescribe.js täcker: canRenewMed (giltighetskontroll för förnyelse),
 * prescribeValidationHint (inmatningsgranskning av förskrivningspanel) och
 * calcPrescribeResult (förpackningsberäkning, månadsklämning, befintlig
 * recepttäckning, datumläge och avrundning uppåt).
 */
'use strict';

const fs   = require('fs');
const vm   = require('vm');
const path = require('path');

// ═══════════════════════════════════════════════════════════
// SETUP: ladda källfilerna i en isolerad VM-kontext
// ═══════════════════════════════════════════════════════════

// Minimal DOM-stub: calcCore anropar aldrig DOM-funktioner, men utils.js
// definierar el() och getEl() som refererar till document — de måste
// kunna parsas utan att krascha vid laddning.
const domStub = {
  getElementById: () => null,
  createElement:  () => ({ style: {}, className: '', textContent: '', appendChild: () => {} }),
  createTextNode: () => ({}),
};

const ctx = vm.createContext({ console, document: domStub, _mockToday: null });

vm.runInContext(fs.readFileSync(path.join(__dirname, 'utils.js'), 'utf8'), ctx);

// Patcha getToday för deterministisk testning: sätt ctx._mockToday (ms sedan epoch)
// för att styra vad "idag" är utan att beröra systemklockan.
vm.runInContext(`
  const _origGetToday = getToday;
  getToday = function() {
    if (_mockToday !== null) return new Date(_mockToday);
    return _origGetToday();
  };
`, ctx);

// state.js måste laddas före prescribe.js eftersom prescribe.js läser states[] och prescribeState[]
vm.runInContext(fs.readFileSync(path.join(__dirname, 'state.js'),      'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'calc-renew.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'longterm.js'),   'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'prescribe.js'),  'utf8'), ctx);

// states[] och prescribeState[] är `let`-variabler och syns inte på ctx-objektet.
// Exponera hjälpfunktioner inifrån VM-kontexten för att sätta state per test.
vm.runInContext(`
  function __setTestState(i, data) {
    while (states.length <= i) states.push({});
    states[i] = data || {};
  }
  function __setTestPS(i, data) {
    prescribeState[i] = (data !== null && data !== undefined) ? data : null;
  }
`, ctx);

if (typeof ctx.calcCore !== 'function') {
  console.error('FEL: calcCore kunde inte laddas — kontrollera sökväg och filnamn.');
  process.exit(1);
}
if (typeof ctx.calcLongtermCore !== 'function') {
  console.error('FEL: calcLongtermCore kunde inte laddas — kontrollera sökväg och filnamn.');
  process.exit(1);
}
if (typeof ctx.calcPrescribeResult !== 'function') {
  console.error('FEL: calcPrescribeResult kunde inte laddas — kontrollera prescribe.js.');
  process.exit(1);
}

const calcCore             = ctx.calcCore;
const calcLongtermCore     = ctx.calcLongtermCore;
const canRenewMed          = ctx.canRenewMed;
const calcPrescribeResult  = ctx.calcPrescribeResult;
const prescribeValidationHint = ctx.prescribeValidationHint;
const setTestState         = ctx.__setTestState;
const setTestPS            = ctx.__setTestPS;

// Fast datum för alla tester — undviker flytande dagsavhängiga gränsvärden.
// Valt mitt i ett vanligt år, långt ifrån DST-gränser och skottår.
const MOCK_TODAY_MS = new Date('2025-06-15T00:00:00.000Z').getTime();
ctx._mockToday = MOCK_TODAY_MS;

// ═══════════════════════════════════════════════════════════
// TESTVERKTYG
// ═══════════════════════════════════════════════════════════

let passed = 0, failed = 0;

function group(name) {
  console.log(`\n${name}`);
}

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`    → ${e.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Villkor uppfylls inte');
}

function assertEqual(actual, expected, label) {
  if (actual !== expected)
    throw new Error(
      `${label ? label + ': ' : ''}förväntade ${JSON.stringify(expected)}, fick ${JSON.stringify(actual)}`
    );
}

function assertContains(str, substr, label) {
  if (!String(str).includes(substr))
    throw new Error(
      `${label ? label + ': ' : ''}"${str}" innehåller inte "${substr}"`
    );
}

// Konstruera ett giltigt inputData utan att gå via DOM-beroende validateInputs.
// daysSince styr pDate relativt MOCK_TODAY.
function makeInput({
  daysSince = 100,
  amt       = 100,
  dose      = 1,
  ref       = 3,
  remaining = null,   // null = fältet lämnat tomt
  medRaw    = 'Testabol 10 mg',
} = {}) {
  const today = new Date(MOCK_TODAY_MS);
  const pDate = new Date(today.getTime() - daysSince * 86400000);
  return {
    valid:    true,
    medRaw,
    pDate,
    amt,
    dose,
    ref,
    remaining,
    doseRaw:  String(dose),
    amtRaw:   String(amt),
    refRaw:   String(ref),
    leftRaw:  remaining !== null ? String(remaining) : '',
  };
}

const NO_PREV = { isOveruse: false, isTooEarly: false, earlyRenewalDecision: null };

// ═══════════════════════════════════════════════════════════
// TESTER
// ═══════════════════════════════════════════════════════════

group('Ogiltiga indata');

test('ofullständigt inputData → valid:false, statusText "Ej ifyllt"', () => {
  const r = calcCore({ valid: false, reason: 'incomplete' }, NO_PREV);
  assertEqual(r.valid, false);
  assertEqual(r.statusText, 'Ej ifyllt');
});

test('ogiltigt datum → valid:false, statusText "Ogiltigt datum"', () => {
  const r = calcCore({ valid: false, reason: 'invalid_date' }, NO_PREV);
  assertEqual(r.valid, false);
  assertEqual(r.statusText, 'Ogiltigt datum');
});

test('too_many_refs → valid:true med danger-alert (renderas som varning, ej tomt)', () => {
  const r = calcCore({ valid: false, reason: 'too_many_refs' }, NO_PREV);
  assertEqual(r.valid, true, 'valid');
  assert(r.alerts.some(a => a.type === 'danger'), 'danger-alert saknas');
});


group('Kantfall: daysSince = 0');

test('recept utfärdat idag → calculable:false, "Kan ej beräknas"', () => {
  // daysSince=0 → getDaysDiff returnerar 0 → tidig exit
  const r = calcCore(makeInput({ daysSince: 0 }), NO_PREV);
  assertEqual(r.calculable, false);
  assertEqual(r.statusText, 'Kan ej beräknas');
  assertContains(r.verdictTitle, 'Kan ej beräknas');
});


group('Kantfall: orimliga värden');

test('totalDays > 3650 → "Orimliga värden" utan undantag', () => {
  // amt=10 000, dose=1, ref=3 → total=30 000, totalDays=30 000 > 3650
  const r = calcCore(makeInput({ amt: 10000, dose: 1, ref: 3, daysSince: 50 }), NO_PREV);
  assertContains(r.verdictTitle, 'Orimliga värden');
  assertEqual(r.isOveruse, false);
});

test('remaining > total → "Orimligt värde" utan undantag', () => {
  // total=100×1=100; remaining=200 → omöjligt
  const r = calcCore(makeInput({ amt: 100, ref: 1, daysSince: 50, remaining: 200 }), NO_PREV);
  assertContains(r.verdictTitle, 'Orimligt värde');
  assertEqual(r.isOveruse, false);
});


group('Normalfall: OK att förnya');

test('förbrukning inom ±10 %, <20 % av perioden kvar → OK att förnya', () => {
  // amt=100, dose=1, ref=3 → total=300, totalDays=300
  // daysSince=280 → batchesDispensed=3, avg=300/280≈1.07 (7% över, inom ±10%)
  // daysToPrescribedEnd=20 < earlyThreshold=round(300×0.20)=60 → inte för tidigt
  const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 280 }), NO_PREV);
  assertEqual(r.isOveruse, false);
  assertEqual(r.isTooEarly, false);
  assertContains(r.verdictTitle, 'OK');
});

test('förbrukning exakt på 110 %-gränsen → OK (villkoret är >, inte >=)', () => {
  // dose=1, amt=308, ref=1 → total=308, totalDays=308
  // daysSince=280 → avg=308/280=1.10 exakt → ej >1.10 → isOveruse=false
  const r = calcCore(makeInput({ amt: 308, dose: 1, ref: 1, daysSince: 280 }), NO_PREV);
  assertEqual(r.isOveruse, false, 'gränsvärde 110 % ska ej ge overuse');
});

test('låg förbrukning (<80 %) → OK att förnya med warn-alert', () => {
  // amt=50, dose=1, ref=1, daysSince=40, remaining=30
  // accessibleTotal=50; consumed=20; avg=0.5 = 50% av dos → <80%
  // daysToPrescribedEnd=10, earlyThreshold=10 → 10>10? Nej → inte för tidigt
  const r = calcCore(makeInput({ amt: 50, dose: 1, ref: 1, daysSince: 40, remaining: 30 }), NO_PREV);
  assertEqual(r.isOveruse, false);
  assertEqual(r.isTooEarly, false);
  assert(
    r.alerts.some(a => a.type === 'warn' && a.title.includes('förbrukning')),
    'warn-alert för låg förbrukning saknas'
  );
});


group('För tidigt att förnya');

test('>20 % av receptperioden kvar, normal förbrukning → isTooEarly', () => {
  // amt=100, dose=1, ref=3, daysSince=30, remaining=80
  // accessibleTotal=100 vid batchesDispensed=1; remaining=80<100 → calcBase=100
  // consumed=100-80=20; avg=0.67 → ej overuse; daysToPrescribedEnd=270>60 → isTooEarly ✓
  const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 30, remaining: 80 }), NO_PREV);
  assertEqual(r.isTooEarly, true);
  assertEqual(r.isOveruse, false);
  assertContains(r.verdictTitle, 'För tidigt');
});

test('isTooEarly baseras på receptperiod, inte på kvarvarande dosdagar', () => {
  // remaining=290 ger 290 dosdagar — men receptperioden har 290 dagar kvar → för tidigt.
  // daysSince=10; batchDuration=100, batchesDispensed=1, accessibleTotal=100
  // earlyPickup: remaining(290) > accessibleTotal(100)? Ja → earlyPickup=true
  // calcBase=min(3,3)*100=300; consumed=300-290=10; avg=10/10=1.0 → ej overuse
  // daysToPrescribedEnd=300-10=290 > earlyThreshold=60 → isTooEarly=true ✓
  const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 10, remaining: 290 }), NO_PREV);
  assertEqual(r.isTooEarly, true, 'isTooEarly ska styras av receptperiod, inte dosdagar');
});


group('Överförbrukning');

test('snitt >10 % över dos, >7 dosdagar kvar, >14 dagars receptperiod → isOveruse', () => {
  // amt=100, dose=1, ref=1, daysSince=50
  // batchDuration=100, batchesDispensed=1, accessibleTotal=100; avg=100/50=2.0
  // daysRemaining=50>7 ✓; daysToPrescribedEnd=50>14 ✓ → isOveruse=true
  const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 1, daysSince: 50 }), NO_PREV);
  assertEqual(r.isOveruse, true);
  assertContains(r.verdictTitle, 'bedömning krävs');
});

test('remaining=0 (medicinen slut) och hög avg → isOveruse', () => {
  // consumed=100-0=100; avg=2.0; daysToPrescribedEnd=50>14 → isOveruse=true
  const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 1, daysSince: 50, remaining: 0 }), NO_PREV);
  assertEqual(r.isOveruse, true);
});

test('avg >10 % men ≤7 dosdagar OCH ≤14 dagars receptperiod → suppressad (ej isOveruse)', () => {
  // amt=50, dose=1, ref=1, daysSince=45
  // total=50, totalDays=50; batchesDispensed=1, accessibleTotal=50
  // avg=50/45≈1.111 > dose×1.10=1.10 ✓
  // daysRemaining=5 ≤ 7 ✓; daysToPrescribedEnd=5 ≤ 14 ✓ → suppression aktiv
  // isOveruse = true AND (false OR false) = false ✓
  // earlyThreshold=round(50×0.20)=10; daysToPrescribedEnd(5) > 10? Nej → ej isTooEarly
  const r = calcCore(makeInput({ amt: 50, dose: 1, ref: 1, daysSince: 45 }), NO_PREV);
  assertEqual(r.isOveruse, false, 'suppressad av 7-dagarsregeln');
  assertEqual(r.isTooEarly, false);
  assert(
    r.alerts.some(a => a.type === 'warn' && a.title.includes('Förhöjd')),
    '"Förhöjd förbrukning noterad" saknas som warn-notering'
  );
});


group('Kantfall: ref = 12 (max)');

test('ref=12, normal förbrukning → korrekt beräkning utan undantag', () => {
  // total=100×12=1200, totalDays=1200; daysSince=1100
  // batchDuration=100, batchesDispensed=min(12,11+1)=12, accessibleTotal=1200
  // avg=1200/1100≈1.09 < 1.10 → ej overuse
  // daysToPrescribedEnd=100 < earlyThreshold=round(1200×0.20)=240 → ej för tidigt
  const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 12, daysSince: 1100 }), NO_PREV);
  assertEqual(r.valid, true);
  assertEqual(r.isOveruse, false);
  assertEqual(r.isTooEarly, false);
  assertEqual(r.total, 1200, 'total = amt × ref');
});

test('ref=12, tidigt i perioden → isTooEarly', () => {
  // daysSince=30; remaining=1170 > accessibleTotal=100 → earlyPickup=true
  // calcBase=min(12,12)*100=1200; consumed=1200-1170=30; avg=30/30=1.0 → ej overuse
  // daysToPrescribedEnd=1170>240 → isTooEarly
  const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 12, daysSince: 30, remaining: 1170 }), NO_PREV);
  assertEqual(r.isTooEarly, true);
  assertEqual(r.isOveruse, false);
});


group('Kantfall: fraktionell dos (dose = 0.5)');

test('dose=0.5, förbrukning inom ±10 % → korrekt beräkning', () => {
  // amt=100, dose=0.5, ref=1 → total=100, totalDays=200
  // daysSince=190; batchDuration=200, batchesDispensed=1, accessibleTotal=100
  // avg=100/190≈0.526; dose×1.10=0.55 → 0.526<0.55 → ej overuse
  // daysToPrescribedEnd=10 < earlyThreshold=round(200×0.20)=40 → ej för tidigt
  const r = calcCore(makeInput({ amt: 100, dose: 0.5, ref: 1, daysSince: 190 }), NO_PREV);
  assertEqual(r.valid, true);
  assertEqual(r.isOveruse, false);
  assertEqual(r.isTooEarly, false);
});

test('dose=0.5 med mg-styrka i läkemedelsnamn → displayAvgStr innehåller mg/dag', () => {
  // extractDoseUnit('Depåtablett 5 mg') → {amount:5, unit:'mg'}
  // displayAvg = "X st/dag (Y mg/dag)"
  const r = calcCore(makeInput({ amt: 100, dose: 0.5, ref: 1, daysSince: 190, medRaw: 'Depåtablett 5 mg' }), NO_PREV);
  assertContains(r.displayAvgStr, 'mg/dag', 'enhet saknas i displayAvgStr');
});


group('Med kvarvarande doser (remaining-fält)');

test('remaining sänker beräknad snittförbrukning korrekt', () => {
  // amt=100, dose=1, ref=1, daysSince=50, remaining=70
  // earlyPickup? 70>100? Nej → calcBase=100; consumed=30; avg=0.6 → låg förbrukning
  const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 1, daysSince: 50, remaining: 70 }), NO_PREV);
  assertEqual(r.isOveruse, false);
  assert(r.alerts.some(a => a.type === 'warn'), 'warn-alert för låg förbrukning saknas');
});

test('remaining=0 och avgNum=2.0 → isOveruse med korrekt avgNote', () => {
  // consumed=100-0=100; avg=100/50=2.0 → isOveruse
  // avgNote ska innehålla "faktisk förbrukning" (hasRemaining=true path)
  const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 1, daysSince: 50, remaining: 0 }), NO_PREV);
  assertEqual(r.isOveruse, true);
  assertContains(r.avgNote, 'faktisk förbrukning', 'avgNote ska referera till faktisk förbrukning');
});

test('tidig uthämtning (remaining > accessibleTotal) → earlyPickup-alert och valid beräkning', () => {
  // daysSince=30; batchDuration=100, batchesDispensed=1, accessibleTotal=100
  // remaining=150 > 100 → earlyPickup=true
  // minB=ceil(150/100)=2; calcBase=min(2,3)*100=200; consumed=50; avg≈1.67 → isOveruse
  const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 30, remaining: 150 }), NO_PREV);
  assertEqual(r.valid, true);
  assert(
    r.alerts.some(a => a.title && a.title.includes('uthämtning')),
    '"Tidig uthämtning"-alert saknas'
  );
});


group('Klinisk override (earlyRenewalDecision)');

test('isTooEarly + override "yes" → statusText innehåller "OK", decision bevaras', () => {
  // daysSince=30, remaining=80 → isTooEarly=true (se ovan)
  // prev.isTooEarly=true, earlyRenewalDecision='yes' → flagsChanged=false → decision bevaras
  const r = calcCore(
    makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 30, remaining: 80 }),
    { isOveruse: false, isTooEarly: true, earlyRenewalDecision: 'yes' }
  );
  assertEqual(r.isTooEarly, true, 'fortfarande isTooEarly');
  assertEqual(r.earlyRenewalDecision, 'yes');
  assertContains(r.statusText, 'OK');
});

test('isOveruse + override "yes" → statusText innehåller "OK", decision bevaras', () => {
  // amt=100, dose=1, ref=1, daysSince=50 → isOveruse=true (se ovan)
  const r = calcCore(
    makeInput({ amt: 100, dose: 1, ref: 1, daysSince: 50 }),
    { isOveruse: true, isTooEarly: false, earlyRenewalDecision: 'yes' }
  );
  assertEqual(r.isOveruse, true, 'fortfarande isOveruse');
  assertEqual(r.earlyRenewalDecision, 'yes');
  assertContains(r.statusText, 'OK');
});

test('flaggbyte (isTooEarly ändras) nollställer earlyRenewalDecision', () => {
  // daysSince=280, remaining=null → isTooEarly=false; prev säger isTooEarly=true
  // flagsChanged = (false !== false) OR (true !== false) = true → nollställ
  const r = calcCore(
    makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 280 }),
    { isOveruse: false, isTooEarly: true, earlyRenewalDecision: 'yes' }
  );
  assertEqual(r.isTooEarly, false);
  assertEqual(r.earlyRenewalDecision, null, 'decision ska nollställas vid flaggbyte');
});


group('Output-struktur');

test('metrics innehåller exakt tre rader', () => {
  const r = calcCore(makeInput({ daysSince: 280 }), NO_PREV);
  assertEqual(r.metrics.length, 3);
});

test('tlPct är i intervallet [0, 100]', () => {
  const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 150 }), NO_PREV);
  assert(r.tlPct >= 0 && r.tlPct <= 100, `tlPct=${r.tlPct} är utanför [0, 100]`);
});

test('prescribedEndDateStr och pDateStr matchar ÅÅÅÅ-MM-DD', () => {
  const r = calcCore(makeInput({ daysSince: 100 }), NO_PREV);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(r.prescribedEndDateStr), `prescribedEndDateStr: "${r.prescribedEndDateStr}"`);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(r.pDateStr), `pDateStr: "${r.pDateStr}"`);
});

test('total = amt × ref', () => {
  // amt=150, dose=2, ref=4 → total=600
  const r = calcCore(makeInput({ amt: 150, dose: 2, ref: 4, daysSince: 280 }), NO_PREV);
  assertEqual(r.total, 600);
});

test('avgNote skiljer sig beroende på om remaining är ifyllt', () => {
  const withRemaining    = calcCore(makeInput({ amt: 100, dose: 1, ref: 1, daysSince: 50, remaining: 40 }), NO_PREV);
  const withoutRemaining = calcCore(makeInput({ amt: 100, dose: 1, ref: 1, daysSince: 50 }), NO_PREV);
  assertContains(withRemaining.avgNote,    'faktisk förbrukning', 'avgNote med remaining');
  assertContains(withoutRemaining.avgNote, 'tillgängliga doser',  'avgNote utan remaining');
  assert(withRemaining.avgNote !== withoutRemaining.avgNote, 'avgNote ska skilja sig');
});


// ═══════════════════════════════════════════════════════════
// HJÄLPARE FÖR LONGTERM-TESTER
// ═══════════════════════════════════════════════════════════

// YYYY-MM-DD för N dagar före MOCK_TODAY
function daysAgo(n) {
  const d = new Date(MOCK_TODAY_MS - n * 86400000);
  return d.getUTCFullYear() + '-' +
    String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(d.getUTCDate()).padStart(2, '0');
}

// Konstruera ett råperiod-objekt
function makePeriod(startDaysAgo, endDaysAgo, total) {
  return { start: daysAgo(startDaysAgo), end: daysAgo(endDaysAgo), total: String(total) };
}


// ═══════════════════════════════════════════════════════════
// calcLongtermCore — TESTER
// ═══════════════════════════════════════════════════════════

group('calcLongtermCore — ogiltiga indata');

test('ordDose=NaN → valid:false med periodErrors', () => {
  const r = calcLongtermCore('Test 10 mg', NaN, [makePeriod(90, 0, 90)]);
  assertEqual(r.valid, false);
  assert(Array.isArray(r.periodErrors), 'periodErrors ska vara en array');
});

test('inga giltiga perioder → valid:false', () => {
  const r = calcLongtermCore('Test 10 mg', 1, [{ start: '', end: '', total: '' }]);
  assertEqual(r.valid, false);
  assert(Array.isArray(r.periodErrors), 'periodErrors ska finnas');
});

test('startdatum i framtiden → periodErrors[0].startError=true', () => {
  const future = new Date(MOCK_TODAY_MS + 86400000);
  const futureStr = future.getUTCFullYear() + '-' +
    String(future.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(future.getUTCDate()).padStart(2, '0');
  const r = calcLongtermCore('Test 10 mg', 1, [{ start: futureStr, end: daysAgo(0), total: '30' }]);
  assertEqual(r.periodErrors[0].startError, true, 'startError ska vara true för framtida datum');
  assertEqual(r.valid, false);
});

test('slutdatum före startdatum → periodErrors[0].endError=true', () => {
  // start=daysAgo(10), end=daysAgo(30) → end < start
  const r = calcLongtermCore('Test 10 mg', 1, [{ start: daysAgo(10), end: daysAgo(30), total: '20' }]);
  assertEqual(r.periodErrors[0].endError, true, 'endError för omvänt datumpar');
  assertEqual(r.valid, false);
});

test('negativt totalvärde → periodErrors[0].totalError=true', () => {
  const r = calcLongtermCore('Test 10 mg', 1, [{ start: daysAgo(90), end: daysAgo(0), total: '-5' }]);
  assertEqual(r.periodErrors[0].totalError, true);
  assertEqual(r.valid, false);
});

test('periodErrors innehåller en post per inmatad period', () => {
  const r = calcLongtermCore('Test 10 mg', 1, [makePeriod(180, 90, 90), makePeriod(90, 0, 90)]);
  assertEqual(r.periodErrors.length, 2, 'periodErrors ska ha en post per period');
});


group('calcLongtermCore — normalfall');

test('normal förbrukning (100%) → valid, overallStatus "ok"', () => {
  // 90 dagar, 90 tabletter, dos=1 → avg=1.0 → exakt på dos
  const r = calcLongtermCore('Test 10 mg', 1, [makePeriod(90, 0, 90)]);
  assertEqual(r.valid, true);
  assertEqual(r.overallStatus, 'ok');
  assertEqual(r.totalDays, 90);
  assertEqual(r.totalTablets, 90);
});

test('överförbrukning (>110%) → overallStatus "over", alertType "danger"', () => {
  // 60 dagar, 90 tabletter, dos=1 → avg=1.5 (150%)
  const r = calcLongtermCore('Test 10 mg', 1, [makePeriod(60, 0, 90)]);
  assertEqual(r.valid, true);
  assertEqual(r.overallStatus, 'over');
  assertEqual(r.alertType, 'danger');
});

test('låg förbrukning (<80%) → overallStatus "under", alertType "warn"', () => {
  // 90 dagar, 45 tabletter, dos=1 → avg=0.5 (50%)
  const r = calcLongtermCore('Test 10 mg', 1, [makePeriod(90, 0, 45)]);
  assertEqual(r.valid, true);
  assertEqual(r.overallStatus, 'under');
  assertEqual(r.alertType, 'warn');
});

test('exakt 110%-gränsen → ok (villkoret är >, inte >=)', () => {
  // dos=1, 100 dagar, 110 tabletter → avg=1.10 exakt → ej >1.10 → ok
  const r = calcLongtermCore('Test 10 mg', 1, [makePeriod(100, 0, 110)]);
  assertEqual(r.overallStatus, 'ok', 'gränsvärde 110% ska ge ok, inte over');
});


group('calcLongtermCore — perioder');

test('två perioder summerar totalDays och totalTablets korrekt', () => {
  // Period 1: 180→90 dagar sedan (90 dagar), Period 2: 90→0 dagar sedan (90 dagar)
  const r = calcLongtermCore('Test 10 mg', 1, [makePeriod(180, 90, 90), makePeriod(90, 0, 90)]);
  assertEqual(r.valid, true);
  assertEqual(r.totalDays, 180);
  assertEqual(r.totalTablets, 180);
  assertEqual(r.periods.length, 2);
});

test('överlappande perioder → hasOverlap:true, valid:true, totalDays baseras på union', () => {
  // P1: 120→30 dagar sedan (90 dagar, 90 tabletter), P2: 40→5 dagar sedan (35 dagar, 35 tabletter)
  // P1 slutar 30 dagar sedan, P2 börjar 40 dagar sedan → överlapp 10 dagar
  // Union: 120→5 dagar sedan = 115 dagar (inte 125 = 90+35)
  const r = calcLongtermCore('Test 10 mg', 1, [makePeriod(120, 30, 90), makePeriod(40, 5, 35)]);
  assertEqual(r.valid, true);
  assertEqual(r.hasOverlap, true);
  assertEqual(r.totalTablets, 125, 'alla tabletter räknas in');
  assertEqual(r.totalDays, 115, 'union av perioder = 115 dagar, ej 125');
});

test('angränsande (ej överlappande) perioder → hasOverlap:false', () => {
  // Period 1 slutar exakt när Period 2 börjar
  const r = calcLongtermCore('Test 10 mg', 1, [makePeriod(180, 90, 90), makePeriod(90, 0, 90)]);
  assertEqual(r.hasOverlap, false);
});

test('per-period klassificering sätts korrekt', () => {
  // Period 1: 60 dagar, 90 st → avg=1.5 → over
  // Period 2: 90 dagar, 45 st → avg=0.5 → under
  const r = calcLongtermCore('Test 10 mg', 1, [makePeriod(180, 120, 90), makePeriod(90, 0, 45)]);
  assertEqual(r.valid, true);
  const p1 = r.periods.find(p => p.days === 60);
  const p2 = r.periods.find(p => p.days === 90);
  assertEqual(p1.classification, 'over',  'period 1 ska klassas som over');
  assertEqual(p2.classification, 'under', 'period 2 ska klassas som under');
});


group('calcLongtermCore — output-struktur');

test('journalText innehåller läkemedelsnamn och dosuppgifter', () => {
  const r = calcLongtermCore('Elvanse 50 mg', 1, [makePeriod(90, 0, 90)]);
  assertContains(r.journalText, 'Elvanse 50 mg', 'läkemedelsnamn saknas i journalText');
  assertContains(r.journalText, '1 st/dag', 'dos saknas i journalText');
});

test('fassUrl pekar på fass.se', () => {
  const r = calcLongtermCore('Ritalin 10 mg', 1, [makePeriod(90, 0, 90)]);
  assert(r.fassUrl.startsWith('https://www.fass.se/'), 'fassUrl ska peka på fass.se');
});

test('barPct är i intervallet [0, 150] och clampar vid extremvärden', () => {
  // Normal: consumptionPct=100 → barPct=100
  const rNorm = calcLongtermCore('Test 10 mg', 1, [makePeriod(90, 0, 90)]);
  assert(rNorm.barPct >= 0 && rNorm.barPct <= 150, `barPct ${rNorm.barPct} utanför [0, 150]`);
  // Extrem överförbrukning: consumptionPct=1000% → barPct ska clampa vid 150
  const rExtreme = calcLongtermCore('Test 10 mg', 1, [makePeriod(10, 0, 100)]);
  assertEqual(rExtreme.barPct, 150, 'barPct ska clampa vid 150');
});


// ═══════════════════════════════════════════════════════════
// HJÄLPARE FÖR PRESCRIBE-TESTER
// ═══════════════════════════════════════════════════════════

// YYYY-MM-DD för N dagar efter MOCK_TODAY
function daysFromNow(n) {
  const d = new Date(MOCK_TODAY_MS + n * 86400000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}


// ═══════════════════════════════════════════════════════════
// canRenewMed — TESTER
// ═══════════════════════════════════════════════════════════

group('canRenewMed — förnyelsebehörighet');

test('valid:false → false (formulär ej ifyllt)', () => {
  setTestState(0, { valid: false });
  assertEqual(canRenewMed(0), false);
});

test('calculable:false → false (recept utfärdat idag, beräkning omöjlig)', () => {
  setTestState(0, { valid: true, calculable: false });
  assertEqual(canRenewMed(0), false);
});

test('valid, inga flaggor → true (normalfall, OK att förnya)', () => {
  setTestState(0, { valid: true, calculable: true, isOveruse: false, isTooEarly: false });
  assertEqual(canRenewMed(0), true);
});

test('isOveruse utan beslut → false', () => {
  setTestState(0, { valid: true, calculable: true, isOveruse: true, earlyRenewalDecision: null });
  assertEqual(canRenewMed(0), false);
});

test('isTooEarly utan beslut → false', () => {
  setTestState(0, { valid: true, calculable: true, isTooEarly: true, earlyRenewalDecision: null });
  assertEqual(canRenewMed(0), false);
});

test('isOveruse + earlyRenewalDecision "yes" → true', () => {
  setTestState(0, { valid: true, calculable: true, isOveruse: true, earlyRenewalDecision: 'yes' });
  assertEqual(canRenewMed(0), true);
});

test('isTooEarly + earlyRenewalDecision "yes" → true', () => {
  setTestState(0, { valid: true, calculable: true, isTooEarly: true, earlyRenewalDecision: 'yes' });
  assertEqual(canRenewMed(0), true);
});


// ═══════════════════════════════════════════════════════════
// prescribeValidationHint — TESTER
// ═══════════════════════════════════════════════════════════

group('prescribeValidationHint — inmatningsgranskning');

test('ps=null → null (ingen förskrivningspanel öppen)', () => {
  setTestState(0, {});
  assertEqual(prescribeValidationHint(0, null), null);
});

test('packageSize="" → info-hint (fältet inte ifyllt än)', () => {
  setTestState(0, {});
  const h = prescribeValidationHint(0, { packageSize: '', mode: 'months', months: 3 });
  assertEqual(h.type,  'info', 'tom sträng ska ge info, ej warn');
  assertEqual(h.field, 'pkg');
});

test('packageSize="0" → warn-hint (explicit ogiltigt värde)', () => {
  setTestState(0, {});
  const h = prescribeValidationHint(0, { packageSize: '0', mode: 'months', months: 3 });
  assertEqual(h.type,  'warn', 'noll ska ge warn, inte info');
  assertEqual(h.field, 'pkg');
});

test('giltig packageSize, månadsläge → null (ingen datumgranskning i månadsläge)', () => {
  setTestState(0, {});
  const h = prescribeValidationHint(0, { packageSize: '30', mode: 'months', months: 3, endDate: '' });
  assertEqual(h, null);
});

test('datumläge, ogiltigt slutdatum → warn med field:"date"', () => {
  setTestState(0, { prescribedEndDateStr: '2025-06-01' }); // passerat → start = idag
  const h = prescribeValidationHint(0, { packageSize: '30', mode: 'date', endDate: 'fel-datum' });
  assertEqual(h.type,  'warn');
  assertEqual(h.field, 'date');
  assertContains(h.msg, 'giltigt datum');
});

test('datumläge, slutdatum före startdatum → warn', () => {
  // prescribedEnd passerat → startDate = idag (2025-06-15); endDate 5 dagar sedan < idag
  setTestState(0, { prescribedEndDateStr: '2025-06-01' });
  const h = prescribeValidationHint(0, { packageSize: '30', mode: 'date', endDate: daysAgo(5) });
  assertEqual(h.type,  'warn');
  assertEqual(h.field, 'date');
  assertContains(h.msg, 'efter');
});

test('datumläge, giltigt framtida slutdatum → null', () => {
  setTestState(0, { prescribedEndDateStr: '2025-06-01' });
  const h = prescribeValidationHint(0, { packageSize: '30', mode: 'date', endDate: '2025-12-31' });
  assertEqual(h, null);
});


// ═══════════════════════════════════════════════════════════
// calcPrescribeResult — TESTER
// ═══════════════════════════════════════════════════════════

group('calcPrescribeResult — förpackningsberäkning');

test('prescribeState saknas → null', () => {
  setTestState(0, { dose: 1, prescribedEndDateStr: '2025-06-01' });
  setTestPS(0, null);
  assertEqual(calcPrescribeResult(0), null);
});

test('recept utgånget → startDate=idag, daysAlreadyCovered=0', () => {
  // prescribedEnd = 14 dagar sedan → startDate = idag = 2025-06-15
  // 3 månader: 2025-06-15 → 2025-09-15 = 92 dagar; 92 ÷ 100 = 1 förp
  setTestState(0, { dose: 1, prescribedEndDateStr: '2025-06-01' });
  setTestPS(0, { mode: 'months', months: 3, packageSize: '100', endDate: '' });
  const r = calcPrescribeResult(0);
  assertEqual(r.startDateStr,       '2025-06-15', 'startDate ska vara idag');
  assertEqual(r.daysAlreadyCovered, 0,            'inget befintligt överskott');
  assertEqual(r.totalDays,          92,           '15 jun → 15 sep = 92 dagar');
  assertEqual(r.packages,           1,            'ceil(92 ÷ 100) = 1 förp');
});

test('recept fortfarande giltigt → startDate=receptslut, daysAlreadyCovered>0', () => {
  // prescribedEnd om 30 dagar (2025-07-15) → startDate = 2025-07-15
  // 3 månader from idag = 2025-09-15; 2025-09-15 − 2025-07-15 = 62 dagar
  setTestState(0, { dose: 1, prescribedEndDateStr: daysFromNow(30) });
  setTestPS(0, { mode: 'months', months: 3, packageSize: '100', endDate: '' });
  const r = calcPrescribeResult(0);
  assertEqual(r.daysAlreadyCovered, 30, 'befintlig täckning ska räknas bort');
  assertEqual(r.startDateStr,       daysFromNow(30));
  assertEqual(r.totalDays,          62, '15 sep − 15 jul = 62 dagar');
  assertEqual(r.packages,           1,  'ceil(62 ÷ 100) = 1 förp');
});

test('befintligt recept täcker hela perioden → packages=0, totalDays=0', () => {
  // prescribedEnd om 120 dagar (in i okt); begärd period 3 mån (t.o.m. 15 sep) → överlapp
  setTestState(0, { dose: 1, prescribedEndDateStr: daysFromNow(120) });
  setTestPS(0, { mode: 'months', months: 3, packageSize: '100', endDate: '' });
  const r = calcPrescribeResult(0);
  assertEqual(r.packages,           0,    'befintligt recept täcker allt');
  assertEqual(r.totalDays,          0);
  assert(r.daysAlreadyCovered > 0,        'daysAlreadyCovered ska vara positiv');
});

test('månadsläge: 31 jan + 1 månad → 28 feb, ej 3 mars (månadsklämning)', () => {
  // Frys "idag" till 2025-01-31 för detta test och återställ i finally-blocket
  const MOCK_JAN31 = new Date('2025-01-31T00:00:00.000Z').getTime();
  ctx._mockToday = MOCK_JAN31;
  try {
    setTestState(0, { dose: 1, prescribedEndDateStr: '2025-01-30' });
    setTestPS(0, { mode: 'months', months: 1, packageSize: '28', endDate: '' });
    const r = calcPrescribeResult(0);
    assertEqual(r.endDateStr, '2025-02-28', 'klämning ska ge 28 feb, inte 3 mars');
    assertEqual(r.totalDays,  28,           '31 jan → 28 feb = 28 dagar');
    assertEqual(r.packages,   1,            'ceil(28 ÷ 28) = 1 förp');
  } finally {
    ctx._mockToday = MOCK_TODAY_MS;
  }
});

test('datumläge: korrekt beräkning med avrundning uppåt (Math.ceil)', () => {
  // 91 dagar × 1 st/dag = 91 tabletter; 91 ÷ 90 st/förp = 1.011 → ceil = 2 förp
  setTestState(0, { dose: 1, prescribedEndDateStr: '2025-06-01' });
  setTestPS(0, { mode: 'date', endDate: '2025-09-14', packageSize: '90', months: 1 });
  const r = calcPrescribeResult(0);
  assertEqual(r.totalDays,    91, '15 jun → 14 sep = 91 dagar');
  assertEqual(r.totalTablets, 91);
  assertEqual(r.packages,      2, 'Math.ceil(91 ÷ 90) = 2');
});

test('datumläge: slutdatum < startdatum → packages=0', () => {
  // prescribedEnd passerat → startDate = idag; endDate 5 dagar sedan < idag
  setTestState(0, { dose: 1, prescribedEndDateStr: '2025-06-01' });
  setTestPS(0, { mode: 'date', endDate: daysAgo(5), packageSize: '30', months: 1 });
  const r = calcPrescribeResult(0);
  assertEqual(r.packages, 0, 'slutdatum före startdatum → 0 förpackningar');
});

test('datumläge: fraktionell dos (0,5 st/dag) → korrekt tabletträkning', () => {
  // 60 dagar × 0,5 st/dag = 30 tabletter; 30 ÷ 30 st/förp = 1 förp (exakt)
  setTestState(0, { dose: 0.5, prescribedEndDateStr: '2025-06-01' });
  setTestPS(0, { mode: 'date', endDate: '2025-08-14', packageSize: '30', months: 1 });
  const r = calcPrescribeResult(0);
  assertEqual(r.totalDays,    60, '15 jun → 14 aug = 60 dagar');
  assertEqual(r.totalTablets, 30, 'ceil(60 × 0,5) = 30');
  assertEqual(r.packages,      1);
});

test('packageSize=0 → packages=0', () => {
  setTestState(0, { dose: 1, prescribedEndDateStr: '2025-06-01' });
  setTestPS(0, { mode: 'months', months: 3, packageSize: '0', endDate: '' });
  const r = calcPrescribeResult(0);
  assertEqual(r.packages, 0, 'förpackningsstorlek 0 ska ge 0 förpackningar');
});

test('dos=0 → packages=0', () => {
  setTestState(0, { dose: 0, prescribedEndDateStr: '2025-06-01' });
  setTestPS(0, { mode: 'months', months: 3, packageSize: '100', endDate: '' });
  const r = calcPrescribeResult(0);
  assertEqual(r.packages, 0, 'dos 0 ska ge 0 förpackningar');
});


// ═══════════════════════════════════════════════════════════
// validateValues — TESTER
// ═══════════════════════════════════════════════════════════

group('validateValues — inmatningsvalidering');

const validateValues = ctx.validateValues;

test('komplett giltig indata → valid:true med parsade värden', () => {
  const r = validateValues('Elvanse 50 mg', '2025-01-01', '1', '100', '3', '');
  assertEqual(r.valid, true);
  assertEqual(r.amt,  100, 'amt');
  assertEqual(r.dose, 1,   'dose');
  assertEqual(r.ref,  3,   'ref');
  assertEqual(r.remaining, null, 'remaining ska vara null när leftRaw är tom');
});

test('remaining ifyllt → remaining parsas korrekt', () => {
  const r = validateValues('Elvanse 50 mg', '2025-01-01', '1', '100', '3', '40');
  assertEqual(r.valid, true);
  assertEqual(r.remaining, 40);
});

test('dateVal.length > 10 → invalid_date med fieldErrors.dateInput satt (fix: bugg 2)', () => {
  // Tidigare returnerade funktionen med fieldErrors.dateInput='' → fältet markerades aldrig rött
  const r = validateValues('Elvanse 50 mg', '2025-01-01-extra', '1', '100', '3', '');
  assertEqual(r.valid, false);
  assertEqual(r.reason, 'invalid_date');
  assert(r.fieldErrors.dateInput !== '', 'fieldErrors.dateInput ska innehålla feltext');
});

test('framtida datum → invalid_date med fieldErrors.dateInput', () => {
  const r = validateValues('Elvanse 50 mg', '2030-06-15', '1', '100', '3', '');
  assertEqual(r.valid, false);
  assertEqual(r.reason, 'invalid_date');
  assert(r.fieldErrors.dateInput !== '', 'fieldErrors.dateInput ska vara satt för framtida datum');
});

test('dos > 50 → incomplete med fieldErrors.doseInput', () => {
  const r = validateValues('Elvanse 50 mg', '2025-01-01', '99', '100', '3', '');
  assertEqual(r.valid, false);
  assert(r.fieldErrors.doseInput !== '', 'fieldErrors.doseInput ska vara satt');
});

test('ref = 12 → valid (max tillåtet)', () => {
  const r = validateValues('Elvanse 50 mg', '2025-01-01', '1', '100', '12', '');
  assertEqual(r.valid, true);
  assertEqual(r.ref, 12);
});

test('ref = 13 → too_many_refs med fieldErrors.refInput', () => {
  const r = validateValues('Elvanse 50 mg', '2025-01-01', '1', '100', '13', '');
  assertEqual(r.valid, false);
  assertEqual(r.reason, 'too_many_refs');
  assert(r.fieldErrors.refInput !== '', 'fieldErrors.refInput ska vara satt');
});

test('remaining negativt → incomplete med fieldErrors.leftInput', () => {
  const r = validateValues('Elvanse 50 mg', '2025-01-01', '1', '100', '3', '-1');
  assertEqual(r.valid, false);
  assert(r.fieldErrors.leftInput !== '', 'fieldErrors.leftInput ska vara satt');
});

test('läkemedelsnamn > 100 tecken → incomplete med fieldErrors.medInput', () => {
  const r = validateValues('A'.repeat(101), '2025-01-01', '1', '100', '3', '');
  assertEqual(r.valid, false);
  assert(r.fieldErrors.medInput !== '', 'fieldErrors.medInput ska vara satt');
});


// ═══════════════════════════════════════════════════════════
// calcLongtermCore — spanError (ny fix)
// ═══════════════════════════════════════════════════════════

group('calcLongtermCore — spanError (>50 år, ny fix)');

test('period >50 år → spanError:true, exkluderas utan att start/slut-fel markeras', () => {
  // 1970-06-15 → 2025-06-15 = ~55 år = ~20 075 dagar > 18 250 (365×50).
  // Båda datumen är giltiga (1950–2100) och start < slut — fälten ska inte
  // flaggas som startError/endError, utan enbart som spanError.
  const r = calcLongtermCore('Test 10 mg', 1, [{ start: '1970-06-15', end: '2025-06-15', total: '100' }]);
  assertEqual(r.periodErrors[0].spanError,    true,  'spanError ska vara true');
  assertEqual(r.periodErrors[0].startError,   false, 'startError ska vara false (datumet är giltigt)');
  assertEqual(r.periodErrors[0].endError,     false, 'endError ska vara false (datumet är giltigt)');
  assertEqual(r.valid, false, 'ingen giltig period kvar → valid:false');
});

test('normal period → spanError:false', () => {
  const r = calcLongtermCore('Test 10 mg', 1, [makePeriod(90, 0, 90)]);
  assertEqual(r.periodErrors[0].spanError, false, 'spanError ska vara false för normal period');
});

test('en giltig + en >50-årsperiod → den giltiga beräknas, den långa exkluderas', () => {
  // Säkerställer att spanError inte smittar av sig på korrekta perioder
  // och att kalkylresultatet enbart baseras på den giltiga perioden.
  const r = calcLongtermCore('Test 10 mg', 1, [
    { start: '1970-06-15', end: '2025-06-15', total: '100' },
    makePeriod(90, 0, 90),
  ]);
  assertEqual(r.periodErrors[0].spanError, true,  'första perioden ska ha spanError');
  assertEqual(r.periodErrors[1].spanError, false, 'andra perioden ska sakna spanError');
  assertEqual(r.valid, true, 'en giltig period finns → valid:true');
  assertEqual(r.periods.length, 1, 'bara den korta perioden ska inkluderas i beräkning');
  assertEqual(r.totalTablets, 90, 'totalTablets ska vara från den giltiga perioden');
});


// ═══════════════════════════════════════════════════════════
// HJÄLPARE FÖR TEXTGENERERINGSTESTER
// ═══════════════════════════════════════════════════════════

const buildPatientText = ctx.buildPatientText;
const buildJournalText = ctx.buildJournalText;

// Minimal state för ett läkemedel i normalfall (OK att förnya).
// MOCK_TODAY = 2025-06-15; prescribedEnd 2025-06-25 = 10 dagar kvar.
// earlyThreshold = round(300 × 0.20) = 60 → 10 < 60 → ej isTooEarly.
function makeRenewState(overrides = {}) {
  return {
    medRaw:               'Elvanse 50 mg',
    pDateStr:             '2024-09-28',
    total:                300,
    dose:                 1,
    prescribedEndDateStr: '2025-06-25',
    displayAvgStr:        '1.00 st/dag',
    avgNote:              '(beräknat under antagandet att alla tillgängliga doser är förbrukade)',
    remainingDoses:       null,
    daysRemaining:        10,
    daysToPrescribedEnd:  10,
    earlyRenewalDecision: null,
    ...overrides,
  };
}


// ═══════════════════════════════════════════════════════════
// buildPatientText — TESTER
// ═══════════════════════════════════════════════════════════

group('buildPatientText — patientbrev (sv)');

test('single toRenew → brev innehåller läkemedelsnamn, handläggningstid och kontaktinfo', () => {
  setTestState(0, makeRenewState());
  const text = buildPatientText('sv', [{ name: 'Elvanse 50 mg', i: 0 }], [], [], 1);
  assertContains(text, 'Elvanse 50 mg', 'brevet ska innehålla läkemedelsnamnet');
  assertContains(text, '2–3 arbetsdagar', 'brevet ska ange handläggningstid');
  assertContains(text, '1177', 'brevet ska innehålla kontaktinformation');
});

test('single tooEarly → brev innehåller beräknat slutdatum och förnyelsedatum', () => {
  setTestState(0, makeRenewState({
    prescribedEndDateStr: '2025-12-31',
    renewDateStr:         '2025-10-12',
    daysToPrescribedEnd:  199,
  }));
  const text = buildPatientText('sv', [], [{ name: 'Elvanse 50 mg', i: 0 }], [], 1);
  assertContains(text, '2025-12-31', 'brevet ska innehålla beräknat slutdatum');
  assertContains(text, '2025-10-12', 'brevet ska innehålla förnyelsedatum');
});

test('single overuse, prescribedEnd passerat → brev anger att receptet kan förnyas nu', () => {
  // parseDateUTC('2025-01-01') < MOCK_TODAY(2025-06-15) → prescribedEndPast=true → closingEndPast
  setTestState(0, makeRenewState({
    prescribedEndDateStr:      '2025-01-01',
    prescribedContactIsPast:   true,
    prescribedContactDateStr:  '2025-06-15',
  }));
  const text = buildPatientText('sv', [], [], [{ name: 'Elvanse 50 mg', i: 0 }], 1);
  assertContains(text, 'förnyas', 'brevet ska indikera att receptet nu kan förnyas');
});

test('single overuse, prescribedEnd i framtiden → brev innehåller kontaktdatum', () => {
  // parseDateUTC('2025-09-01') > MOCK_TODAY → prescribedEndPast=false → closingFuture
  setTestState(0, makeRenewState({
    prescribedEndDateStr:      '2025-09-01',
    prescribedContactIsPast:   false,
    prescribedContactDateStr:  '2025-08-25',
  }));
  const text = buildPatientText('sv', [], [], [{ name: 'Elvanse 50 mg', i: 0 }], 1);
  assertContains(text, '2025-08-25', 'brevet ska innehålla datum för när patienten ska höra av sig');
});

test('multi: två läkemedel att förnya → multiIntro + båda namnen', () => {
  setTestState(0, makeRenewState({ medRaw: 'Elvanse 50 mg' }));
  setTestState(1, makeRenewState({ medRaw: 'Melatonin 3 mg' }));
  const text = buildPatientText(
    'sv',
    [{ name: 'Elvanse 50 mg', i: 0 }, { name: 'Melatonin 3 mg', i: 1 }],
    [], [], 2
  );
  assertContains(text, 'Elvanse 50 mg',  'brevet ska innehålla första läkemedlet');
  assertContains(text, 'Melatonin 3 mg', 'brevet ska innehålla andra läkemedlet');
});

test('multi: ett att förnya, ett för tidigt → båda hanteras med rätt text', () => {
  setTestState(0, makeRenewState({ medRaw: 'Elvanse 50 mg' }));
  setTestState(1, makeRenewState({
    medRaw:               'Melatonin 3 mg',
    prescribedEndDateStr: '2025-12-31',
    renewDateStr:         '2025-10-12',
    daysToPrescribedEnd:  199,
  }));
  const text = buildPatientText(
    'sv',
    [{ name: 'Elvanse 50 mg',  i: 0 }],
    [{ name: 'Melatonin 3 mg', i: 1 }],
    [], 2
  );
  assertContains(text, '2–3 arbetsdagar', 'Elvanse ska förnyas med normal handläggningstid');
  assertContains(text, '2025-10-12',      'Melatonin ska ha förnyelsedatum');
});

test('engelsk version → brev på engelska med rätt terminologi', () => {
  setTestState(0, makeRenewState());
  const text = buildPatientText('en', [{ name: 'Elvanse 50 mg', i: 0 }], [], [], 1);
  assertContains(text, 'working days', 'engelskt brev ska använda "working days"');
  assertContains(text, '1177',         'kontaktinfo ska finnas även på engelska');
});

test('okänt språk faller tillbaka på svenska', () => {
  setTestState(0, makeRenewState());
  const textSv = buildPatientText('sv', [{ name: 'Elvanse 50 mg', i: 0 }], [], [], 1);
  const textXx = buildPatientText('xx', [{ name: 'Elvanse 50 mg', i: 0 }], [], [], 1);
  assertEqual(textSv, textXx, 'okänt språk ska ge samma text som svenska');
});


// ═══════════════════════════════════════════════════════════
// buildJournalText — TESTER
// ═══════════════════════════════════════════════════════════

group('buildJournalText — journalanteckning');

test('single toRenew → journaltext innehåller kontaktorsak, dosuppgifter och åtgärd', () => {
  setTestState(0, makeRenewState());
  const text = buildJournalText([{ name: 'Elvanse 50 mg', i: 0 }], [], [], 1);
  assertContains(text, 'Receptförnyelse via 1177', 'ska innehålla kontaktorsak');
  assertContains(text, 'Nytt recept utfärdat',     'ska innehålla åtgärd');
  assertContains(text, 'Elvanse 50 mg',            'ska innehålla läkemedelsnamn');
  assertContains(text, '1 st/dag',                 'ska innehålla ordinerad dos');
  assertContains(text, '300',                      'ska innehålla totalt antal doser');
});

test('single toRenew (earlyRenewal=overuse) → journaltext dokumenterar klinisk bedömning', () => {
  setTestState(0, makeRenewState({ displayAvgStr: '1.50 st/dag' }));
  const text = buildJournalText(
    [{ name: 'Elvanse 50 mg', i: 0, earlyRenewal: 'overuse' }],
    [], [], 1
  );
  assertContains(text, 'klinisk indikation', 'klinisk bedömning ska dokumenteras i journalen');
  assertContains(text, '1.50 st/dag',        'snittförbrukning ska finnas med');
});

test('single toRenew (earlyRenewal=tooEarly) → journaltext nämner kvarvarande dagar', () => {
  setTestState(0, makeRenewState({
    prescribedEndDateStr: '2025-09-01',
    daysToPrescribedEnd:  78,
  }));
  const text = buildJournalText(
    [{ name: 'Elvanse 50 mg', i: 0, earlyRenewal: 'tooEarly' }],
    [], [], 1
  );
  assertContains(text, '78',              'ska nämna antal kvarvarande dagar');
  assertContains(text, 'klinisk indikation', 'ska dokumentera klinisk bedömning');
});

test('single tooEarly → journaltext innehåller "Ej förnyat" och beräknat slutdatum', () => {
  setTestState(0, makeRenewState({
    prescribedEndDateStr: '2025-12-31',
    daysToPrescribedEnd:  199,
  }));
  const text = buildJournalText([], [{ name: 'Elvanse 50 mg', i: 0 }], [], 1);
  assertContains(text, 'Ej förnyat',  'ska markera att receptet ej förnyades');
  assertContains(text, '199',         'ska innehålla antal dagar kvar');
  assertContains(text, '2025-12-31', 'ska innehålla beräknat slutdatum');
});

test('single overuse utan beslut → platshållare för åtgärd i journalen', () => {
  setTestState(0, makeRenewState({
    prescribedEndDateStr: '2025-09-01',
    daysRemaining:        78,
    earlyRenewalDecision: null,
  }));
  const text = buildJournalText([], [], [{ name: 'Elvanse 50 mg', i: 0 }], 1);
  assertContains(text, '[Nytt recept utfärdat', 'platshållare ska finnas för läkarens val');
});

test('single overuse med beslut "no" → "Ej förnyat" i åtgärdsraden', () => {
  setTestState(0, makeRenewState({
    prescribedEndDateStr: '2025-09-01',
    daysRemaining:        78,
    earlyRenewalDecision: 'no',
  }));
  const text = buildJournalText([], [], [{ name: 'Elvanse 50 mg', i: 0 }], 1);
  assertContains(text, 'Ej förnyat efter klinisk', 'ska dokumentera att receptet nekades');
});

test('single overuse med kvarvarande doser → dagar kvar framgår av journalen', () => {
  setTestState(0, makeRenewState({
    prescribedEndDateStr: '2025-09-01',
    daysRemaining:        30,
    remainingDoses:       30,
    earlyRenewalDecision: null,
  }));
  const text = buildJournalText([], [], [{ name: 'Elvanse 50 mg', i: 0 }], 1);
  assertContains(text, '30 doser', 'kvarvarande doser ska anges i journalen');
});

test('multi: toRenew + tooEarly → summering listar rätt läkemedel', () => {
  setTestState(0, makeRenewState({ medRaw: 'Elvanse 50 mg' }));
  setTestState(1, makeRenewState({
    medRaw:               'Melatonin 3 mg',
    prescribedEndDateStr: '2025-12-31',
    daysToPrescribedEnd:  199,
  }));
  const text = buildJournalText(
    [{ name: 'Elvanse 50 mg',  i: 0 }],
    [{ name: 'Melatonin 3 mg', i: 1 }],
    [], 2
  );
  assertContains(text, 'Recept utfärdat för: Elvanse 50 mg', 'summering ska lista förnyade läkemedel');
  assertContains(text, 'Melatonin 3 mg', 'ej förnyat läkemedel ska nämnas i journalen');
  assertContains(text, 'Ej förnyat — för tidigt', 'orsak till avslag ska framgå');
});

test('multi: enbart overuse → "Inga recept utfärdade" i summering', () => {
  setTestState(0, makeRenewState({
    prescribedEndDateStr: '2025-09-01',
    daysRemaining:        78,
    earlyRenewalDecision: null,
  }));
  setTestState(1, makeRenewState({
    medRaw:               'Melatonin 3 mg',
    prescribedEndDateStr: '2025-10-01',
    daysRemaining:        108,
    earlyRenewalDecision: null,
  }));
  const text = buildJournalText(
    [],
    [],
    [{ name: 'Elvanse 50 mg', i: 0 }, { name: 'Melatonin 3 mg', i: 1 }],
    2
  );
  assertContains(text, 'Inga recept utfärdade', 'ska ange att inga recept förnyades');
});


// ═══════════════════════════════════════════════════════════
// calcCore — statusText-grenar (saknade)
// ═══════════════════════════════════════════════════════════

group('calcCore — statusText-grenar');

test('isOveruse + decision yes → statusText "OK – förnyas (klinisk bed.)"', () => {
  const r = calcCore(
    makeInput({ amt: 100, dose: 1, ref: 1, daysSince: 50 }),
    { isOveruse: true, isTooEarly: false, earlyRenewalDecision: 'yes' }
  );
  assertEqual(r.statusText, 'OK – förnyas (klinisk bed.)');
});

test('isTooEarly + decision yes → statusText "OK – förnyas tidigt"', () => {
  const r = calcCore(
    makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 30, remaining: 80 }),
    { isOveruse: false, isTooEarly: true, earlyRenewalDecision: 'yes' }
  );
  assertEqual(r.statusText, 'OK – förnyas tidigt');
});

test('isTooEarly utan beslut → statusText innehåller "För tidigt" och dagar kvar', () => {
  const r = calcCore(
    makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 30, remaining: 80 }),
    NO_PREV
  );
  assertEqual(r.isTooEarly, true);
  assertContains(r.statusText, 'För tidigt');
  assertContains(r.statusText, 'd kvar');
});


// ═══════════════════════════════════════════════════════════
// calcCore — alerts (saknade grenar)
// ═══════════════════════════════════════════════════════════

group('calcCore — alerts (saknade grenar)');

test('avgNum = 0 (consumed = 0) → danger-alert "Ingen förbrukning"', () => {
  // remaining = accessibleTotal → consumed = 0 → avgNum = 0
  // amt=100, dose=1, ref=1, daysSince=50 → batchesDispensed=1, accessibleTotal=100, remaining=100
  const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 1, daysSince: 50, remaining: 100 }), NO_PREV);
  assert(
    r.alerts.some(a => a.type === 'danger' && a.title.includes('förbrukning')),
    'danger-alert "Ingen förbrukning" saknas'
  );
});

test('avgNum > 2,5× dos → warn-alert "Datakontroll"', () => {
  // consumed=100, daysSince=10 → avgNum=10 > dose×2.5=2.5
  const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 1, daysSince: 10, remaining: 0 }), NO_PREV);
  assert(
    r.alerts.some(a => a.type === 'warn' && a.title === 'Datakontroll'),
    'warn-alert "Datakontroll" saknas vid avgNum > 2,5× dos'
  );
});

test('låg förbrukning + isTooEarly → warn (Låg förbrukning) och info (För tidigt) genereras båda', () => {
  // daysSince=30, remaining=80: consumed=20, avg≈0.67 (<80%) → låg förbrukning
  // daysToPrescribedEnd=270 > earlyThreshold=60 → isTooEarly
  const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 30, remaining: 80 }), NO_PREV);
  assertEqual(r.isTooEarly, true);
  assert(r.alerts.some(a => a.type === 'warn' && a.title.includes('Låg förbrukning')),
    'warn "Låg förbrukning" saknas');
  assert(r.alerts.some(a => a.type === 'info' && a.title.includes('För tidigt')),
    'info "För tidigt" saknas');
});


// ═══════════════════════════════════════════════════════════
// calcCore — output-fält (saknade)
// ═══════════════════════════════════════════════════════════

group('calcCore — output-fält');

test('metrics[1].cls = danger när receptet löpt ut (daysToPrescribedEnd < 0)', () => {
  // daysSince=400, totalDays=300 → prescribedEnd passerat med 100 dagar
  const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 400 }), NO_PREV);
  assertEqual(r.metrics[1].cls, 'danger', 'endCls ska vara danger');
});

test('metrics[1].cls = warn inom 20%-tröskeln (daysToPrescribedEnd ≤ earlyThreshold)', () => {
  // totalDays=300, earlyThreshold=60; daysSince=255 → daysToPrescribedEnd=45 ≤ 60
  const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 255 }), NO_PREV);
  assertEqual(r.metrics[1].cls, 'warn', 'endCls ska vara warn nära slutdatum');
});

test('metrics[1].cls = ok med lång tid kvar (daysToPrescribedEnd > earlyThreshold)', () => {
  // daysSince=30, remaining=80 → daysToPrescribedEnd=270 > earlyThreshold=60
  const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 30, remaining: 80 }), NO_PREV);
  assertEqual(r.metrics[1].cls, 'ok', 'endCls ska vara ok med lång tid kvar');
});

test('isOveruse → prescribedContactDateStr och prescribedContactIsPast finns i utdata', () => {
  const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 1, daysSince: 50 }), NO_PREV);
  assertEqual(r.isOveruse, true);
  assert(r.prescribedContactDateStr !== undefined, 'prescribedContactDateStr saknas');
  assert(typeof r.prescribedContactIsPast === 'boolean', 'prescribedContactIsPast ska vara boolean');
});

test('isTooEarly → renewDateStr finns och matchar ÅÅÅÅ-MM-DD', () => {
  const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 30, remaining: 80 }), NO_PREV);
  assertEqual(r.isTooEarly, true);
  assert(r.renewDateStr !== undefined, 'renewDateStr saknas');
  assert(/^\d{4}-\d{2}-\d{2}$/.test(r.renewDateStr), 'renewDateStr ska matcha ÅÅÅÅ-MM-DD');
});

test('hasRemaining → endDateStr baseras på kvarvarande doser, skiljer sig från prescribedEndDateStr', () => {
  // remaining=50, dose=1 → daysRemaining=50 → endDate = today+50
  // prescribedEnd = (today-1) + 100 = today+99 — dessa ska skilja sig
  const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 1, daysSince: 1, remaining: 50 }), NO_PREV);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(r.endDateStr), 'endDateStr ska vara ett datum');
  assert(r.endDateStr !== r.prescribedEndDateStr, 'endDateStr och prescribedEndDateStr ska skilja sig');
});

test('daysRemaining och daysToPrescribedEnd finns i utdata och är tal', () => {
  const r = calcCore(makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 150 }), NO_PREV);
  assert(typeof r.daysRemaining       === 'number', 'daysRemaining saknas eller är inte ett tal');
  assert(typeof r.daysToPrescribedEnd === 'number', 'daysToPrescribedEnd saknas eller är inte ett tal');
});


// ═══════════════════════════════════════════════════════════
// validateValues — kantfall (saknade)
// ═══════════════════════════════════════════════════════════

group('validateValues — kantfall (saknade)');

test('dos med kommatecken ("1,5") → parsas korrekt till 1.5', () => {
  const r = validateValues('Test 10 mg', '2025-01-01', '1,5', '100', '3', '');
  assertEqual(r.valid, true);
  assertEqual(r.dose, 1.5, 'komma ska tolkas som decimalavskiljare');
});

test('amt = 1 (minimum) → valid', () => {
  const r = validateValues('Test 10 mg', '2025-01-01', '1', '1', '1', '');
  assertEqual(r.valid, true);
  assertEqual(r.amt, 1);
});

test('amt = 10 000 (maximum) → valid', () => {
  const r = validateValues('Test 10 mg', '2025-01-01', '1', '10000', '1', '');
  assertEqual(r.valid, true);
  assertEqual(r.amt, 10000);
});

test('amt = 10 001 (överstiger maximum) → fieldErrors.amtInput satt', () => {
  const r = validateValues('Test 10 mg', '2025-01-01', '1', '10001', '1', '');
  assertEqual(r.valid, false);
  assert(r.fieldErrors.amtInput !== '', 'fieldErrors.amtInput ska vara satt');
});

test('leftRaw = "0" (exakt noll) → valid, remaining = 0', () => {
  const r = validateValues('Test 10 mg', '2025-01-01', '1', '100', '3', '0');
  assertEqual(r.valid, true);
  assertEqual(r.remaining, 0, 'noll kvarvarande doser ska vara ett giltigt värde');
});

test('tom medRaw → incomplete', () => {
  const r = validateValues('', '2025-01-01', '1', '100', '3', '');
  assertEqual(r.valid, false);
  assertEqual(r.reason, 'incomplete');
});

test('ref = 1 (minimum) → valid', () => {
  const r = validateValues('Test 10 mg', '2025-01-01', '1', '100', '1', '');
  assertEqual(r.valid, true);
  assertEqual(r.ref, 1);
});


// ═══════════════════════════════════════════════════════════
// remainingDosesNote
// ═══════════════════════════════════════════════════════════

group('remainingDosesNote');

const remainingDosesNote = ctx.remainingDosesNote;

test('remainingDoses = null → tom sträng', () => {
  assertEqual(remainingDosesNote({ remainingDoses: null }), '');
});

test('remainingDoses = 30, daysRemaining = 30 → nämner antal doser och dagar', () => {
  const note = remainingDosesNote({ remainingDoses: 30, daysRemaining: 30 });
  assertContains(note, '30 doser');
  assertContains(note, '30 dagar');
});

test('remainingDoses = 0, daysRemaining = 0 → anger att medicinen är slut', () => {
  const note = remainingDosesNote({ remainingDoses: 0, daysRemaining: 0 });
  assertContains(note, 'slut');
});


// ═══════════════════════════════════════════════════════════
// buildPatientText — ytterligare fall
// ═══════════════════════════════════════════════════════════

group('buildPatientText — ytterligare fall');

test('single overuse, prescribedEnd i framtiden och kontaktdatum passerat → closingContactPast', () => {
  setTestState(0, makeRenewState({
    prescribedEndDateStr:     '2025-09-01',
    prescribedContactIsPast:  true,
    prescribedContactDateStr: '2025-06-10',
  }));
  const text = buildPatientText('sv', [], [], [{ name: 'Elvanse 50 mg', i: 0 }], 1);
  assertContains(text, 'ta slut inom kort', 'closingContactPast-grenen ska nämna att medicinen snart tar slut');
});

test('multi: ett att förnya, ett overuse med prescribedEnd passerat → "kan nu förnyas"', () => {
  setTestState(0, makeRenewState({ medRaw: 'Elvanse 50 mg' }));
  setTestState(1, makeRenewState({
    medRaw:               'Melatonin 3 mg',
    prescribedEndDateStr: '2025-01-01',  // passerat → multiOverusePast
  }));
  const text = buildPatientText(
    'sv',
    [{ name: 'Elvanse 50 mg',  i: 0 }],
    [],
    [{ name: 'Melatonin 3 mg', i: 1 }],
    2
  );
  assertContains(text, 'kan nu förnyas', 'multiOverusePast ska ange att receptet kan förnyas');
});

test('multi: overuse med kontaktdatum passerat → "ta slut inom kort"', () => {
  setTestState(0, makeRenewState({ medRaw: 'Elvanse 50 mg' }));
  setTestState(1, makeRenewState({
    medRaw:                   'Melatonin 3 mg',
    prescribedEndDateStr:     '2025-09-01',
    prescribedContactIsPast:  true,
    prescribedContactDateStr: '2025-06-10',
  }));
  const text = buildPatientText(
    'sv',
    [{ name: 'Elvanse 50 mg',  i: 0 }],
    [],
    [{ name: 'Melatonin 3 mg', i: 1 }],
    2
  );
  assertContains(text, 'ta slut inom kort', 'multiContactPast ska nämnas');
});

test('multi: overuse med kontaktdatum i framtiden → kontaktdatum nämns', () => {
  setTestState(0, makeRenewState({ medRaw: 'Elvanse 50 mg' }));
  setTestState(1, makeRenewState({
    medRaw:                   'Melatonin 3 mg',
    prescribedEndDateStr:     '2025-10-01',
    prescribedContactIsPast:  false,
    prescribedContactDateStr: '2025-09-24',
  }));
  const text = buildPatientText(
    'sv',
    [{ name: 'Elvanse 50 mg',  i: 0 }],
    [],
    [{ name: 'Melatonin 3 mg', i: 1 }],
    2
  );
  assertContains(text, '2025-09-24', 'multiFuture ska innehålla kontaktdatum');
});


// ═══════════════════════════════════════════════════════════
// buildJournalText — ytterligare fall
// ═══════════════════════════════════════════════════════════

group('buildJournalText — ytterligare fall');

test('multi: overuse med earlyRenewalDecision "no" → "Ej förnyat efter klinisk"', () => {
  setTestState(0, makeRenewState({ medRaw: 'Elvanse 50 mg' }));
  setTestState(1, makeRenewState({
    medRaw:               'Melatonin 3 mg',
    prescribedEndDateStr: '2025-09-01',
    daysRemaining:        78,
    earlyRenewalDecision: 'no',
  }));
  const text = buildJournalText(
    [{ name: 'Elvanse 50 mg',  i: 0 }],
    [],
    [{ name: 'Melatonin 3 mg', i: 1 }],
    2
  );
  assertContains(text, 'Ej förnyat efter klinisk', '"Ej förnyat" med klinisk bedömning ska framgå');
});

test('multi: earlyRenewal="overuse" i toRenew → "överstiger ordination" och klinisk bedömning', () => {
  setTestState(0, makeRenewState({
    medRaw:        'Elvanse 50 mg',
    displayAvgStr: '1.80 st/dag',
  }));
  const text = buildJournalText(
    [{ name: 'Elvanse 50 mg', i: 0, earlyRenewal: 'overuse' }],
    [], [], 2
  );
  assertContains(text, 'överstiger ordination', 'snittförbrukning ska flaggas');
  assertContains(text, 'klinisk, individuell bedömning', 'klinisk bedömning ska dokumenteras');
});

test('multi: earlyRenewal="tooEarly" i toRenew → klinisk bedömning och dagar kvar i åtgärdsraden', () => {
  setTestState(0, makeRenewState({
    medRaw:               'Elvanse 50 mg',
    prescribedEndDateStr: '2025-09-01',
    daysToPrescribedEnd:  78,
  }));
  const text = buildJournalText(
    [{ name: 'Elvanse 50 mg', i: 0, earlyRenewal: 'tooEarly' }],
    [], [], 2
  );
  assertContains(text, 'klinisk, individuell bedömning', 'tooEarly ska dokumentera klinisk bedömning');
  assertContains(text, '78d kvar', 'kvarvarande dagar ska nämnas i åtgärdsraden');
});

test('multi: overuse med remainingDoses → doser kvar nämns i journalen', () => {
  setTestState(0, makeRenewState({
    medRaw:               'Elvanse 50 mg',
    prescribedEndDateStr: '2025-09-01',
    daysRemaining:        30,
    remainingDoses:       30,
    earlyRenewalDecision: null,
  }));
  const text = buildJournalText([], [], [{ name: 'Elvanse 50 mg', i: 0 }], 2);
  assertContains(text, '30 doser', 'kvarvarande doser ska nämnas i journalen');
});


// ═══════════════════════════════════════════════════════════
// SAMMANFATTNING
// ═══════════════════════════════════════════════════════════

console.log(`\n${'─'.repeat(48)}`);
console.log(`${passed} klarade  |  ${failed} misslyckades`);

if (failed > 0) process.exit(1);
