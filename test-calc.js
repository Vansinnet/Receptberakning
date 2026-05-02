/**
 * Enhetstester för calcCore (calc-renew.js)
 *
 * Kör: node test-calc.js
 *
 * Täcker: ofullständiga indata, daysSince=0, remaining>total,
 * totalDays>3650, ref=12, fraktionell dos, 7-dagars-suppression,
 * klinisk override och output-struktur.
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

vm.runInContext(fs.readFileSync(path.join(__dirname, 'calc-renew.js'), 'utf8'), ctx);

if (typeof ctx.calcCore !== 'function') {
  console.error('FEL: calcCore kunde inte laddas — kontrollera sökväg och filnamn.');
  process.exit(1);
}

const calcCore = ctx.calcCore;

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
  // total=300, totalDays=300; daysSince=30
  // avg=300/30=10 — men batchesDispensed=1, accessibleTotal=100, avg=100/30≈3.3
  // daysToPrescribedEnd=270 > earlyThreshold=60 → isTooEarly=true
  // Obs: isOveruse kräver daysRemaining>7 OR daysToPrescribedEnd>14 — men
  //   isTooEarly=!isOveruse, så isOveruse kontrolleras först
  // avg(3.3)>1.10 AND (daysRemaining>7 OR 270>14) → isOveruse=true (ej isTooEarly)
  // — detta är ett overuse-fall, inte ett tooEarly-fall för dessa params.
  //
  // Välj istället daysSince=30 med remaining=80 (consummed=100-80=20, avg=20/30≈0.67 → OK)
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
  // daysSince=30, daysToPrescribedEnd=1170 > earlyThreshold=240 → isTooEarly
  // avg=1200/30=40 → isOveruse: 40>1.10 AND (daysRemaining>7 OR 1170>14) → true
  // men isTooEarly = !isOveruse → false...
  // Korrigering: behöver låg avg för isTooEarly. remaining=1170 (precis hämtat)
  // earlyPickup: 1170 > accessibleTotal=100? Ja → calcBase=min(12,12)*100=1200
  // consumed=1200-1170=30; avg=30/30=1.0 → ej overuse; daysToPrescribedEnd=1170>240 → isTooEarly
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
// SAMMANFATTNING
// ═══════════════════════════════════════════════════════════

console.log(`\n${'─'.repeat(48)}`);
console.log(`${passed} klarade  |  ${failed} misslyckades`);

if (failed > 0) process.exit(1);
