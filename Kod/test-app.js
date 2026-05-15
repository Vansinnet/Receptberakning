'use strict';

const fs   = require('fs');
const vm   = require('vm');
const path = require('path');
const { JSDOM } = require('jsdom');

// ═══════════════════════════════════════════════════════════
// SETUP: ladda HTML och skapa VM-kontext med jsdom som DOM
// ═══════════════════════════════════════════════════════════

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const dom  = new JSDOM(html, { url: 'http://localhost' });
const { window } = dom;

const ctx = vm.createContext({
  document:             window.document,
  window,
  console,
  setTimeout, clearTimeout, setInterval, clearInterval,
  localStorage:         window.localStorage,
  navigator:            { clipboard: { writeText: () => Promise.resolve() } },
  requestAnimationFrame: (cb) => setTimeout(cb, 0),
  _mockToday: null,
});

// Ladda källfiler i rätt beroenderordning
['constants.js', 'utils.js', 'state.js', 'text-gen.js', 'drug-loader.js', 'interactions.js',
 'calc-renew.js', 'longterm.js', 'prescribe.js', 'ui-renew.js', 'app.js'].forEach(file => {
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, file), 'utf8'),
    ctx
  );
});

// Patcha getToday för deterministiska tester
vm.runInContext(`
  const _realGetToday = getToday;
  getToday = function() {
    if (_mockToday !== null) return new Date(_mockToday);
    return _realGetToday();
  };

  // Mockad läkemedelsdata (samma som test-ui.js)
  loadDrugs = async function() {
    if (_drugList) return;
    _drugList = [
      { n: "Elvanse 50 mg", p: 30, f: "Kapsel", i: "20040607001067", a: "N06BA12" },
      { n: "Sertralin 50 mg", p: 100, f: "Tablett", i: "19951006000014", a: "N06AB06" },
      { n: "Alvedon 500 mg", p: 20, f: "Tablett", i: "19951006000013", a: "N02BE01" },
      { n: "Metformin 500 mg", p: 100, f: "Tablett", i: "19951006000015", a: "A10BA02", c: true },
    ];
    _drugMap = new Map();
    for (var d = 0; d < _drugList.length; d++) {
      _drugMap.set(_drugList[d].n.toLowerCase().trim(), _drugList[d]);
    }
  };
`, ctx);

// Hjälpfunktioner för state-hantering i test
vm.runInContext(`
  function __setState(i, data) {
    while (states.length <= i) states.push({});
    states[i] = data || {};
  }
  function __setActive(i) { activeMedIdx = i; }
  function __setPrescribeGlobals(mode, months, endDate) {
    _prescribeMode = mode;
    _prescribeMonths = months;
    _prescribeEndDate = endDate;
  }
  function __resetState() {
    states = [{}];
    activeMedIdx = 0;
    prescribeState = {};
    _addMedLocked = false;
    _clearCardLocked = false;
  }
  // Accessorer för vm-kontext-variabler som är deklarerade med let/const
  function __getStatesLen() { return states.length; }
  function __getActiveIdx() { return activeMedIdx; }
  function __getNurseViewActive() { return nurseViewActive; }
  function __getNurseVitalNormal() { return nurseVitalNormal; }
  function __getNurseFollowUpAdequate() { return nurseFollowUpAdequate; }
  function __getPrescribeStateKeys() { return Object.keys(prescribeState); }
  function __getCalcDebLen() { return calcDebounced.length; }
  function __setCalcDeb(mockArr) { calcDebounced.length = 0; if (mockArr) mockArr.forEach(function(x) { calcDebounced.push(x); }); }
`, ctx);

const MOCK_TODAY = new Date('2025-06-15T00:00:00.000Z').getTime();
ctx._mockToday = MOCK_TODAY;

const setState  = ctx.__setState;
const setActive = ctx.__setActive;
const doc       = window.document;
function getEl(id) { return doc.getElementById(id); }

// ═══════════════════════════════════════════════════════════
// TESTVERKTYG
// ═══════════════════════════════════════════════════════════

let passed = 0, failed = 0;

function group(name) { console.log(`\n${name}`); }

function test(name, fn) {
  ctx.__resetState();
  setActive(0);
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

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'villkor ej uppfyllt');
}

function assertEqual(a, b, lbl) {
  if (a !== b)
    throw new Error(
      `${lbl ? lbl + ': ' : ''}f\u00f6rv\u00e4ntade ${JSON.stringify(b)}, fick ${JSON.stringify(a)}`
    );
}

function assertContains(str, substr, label) {
  if (!String(str).includes(substr))
    throw new Error(
      `${label ? label + ': ' : ''}"${str}" inneh\u00e5ller inte "${substr}"`
    );
}

// ═══════════════════════════════════════════════════════════
// NIVÅ 1: shouldClearDrugMatch — ren ATC-valideringslogik
// ═══════════════════════════════════════════════════════════

const shouldClearDrugMatch = ctx.shouldClearDrugMatch;

group('shouldClearDrugMatch — ATC-validering vid manuell inmatning');
test('tom inmatning → true (rensa)', () => {
  assertEqual(shouldClearDrugMatch('', 'Sertralin'), true);
});
test('prefix-match → false (behåll)', () => {
  assertEqual(shouldClearDrugMatch('Ser', 'Sertralin'), false);
});
test('exakt match → false (behåll)', () => {
  assertEqual(shouldClearDrugMatch('Sertralin', 'Sertralin'), false);
});
test('prefix mismatch → true (rensa)', () => {
  // "Sertalin" (felstavat) är inte ett prefix av "Sertralin"
  assertEqual(shouldClearDrugMatch('Sertalin', 'Sertralin'), true);
});
test('användaren byggt ut text efter autocomplete → true (rensa)', () => {
  // "Sertralin 50 mg" har fler tecken än "Sertralin" —
  // prefix-jämförelsen misslyckas eftersom acPrefix är "Sertralin" (9 tecken)
  // medan inputVal är "Sertralin 50 mg" (16 tecken). Detta är korrekt —
  // användaren har lagt till " 50 mg" som fritext, autocomplete-anchor gäller ej.
  assertEqual(shouldClearDrugMatch('Sertralin 50 mg', 'Sertralin'), true);
});
test('acDrugName null → false (fritext, ingen autocomplete)', () => {
  assertEqual(shouldClearDrugMatch('Ser', null), false);
});

// ═══════════════════════════════════════════════════════════
// NIVÅ 2: recalcOnDateChange — datumomslagsomräkning
// ═══════════════════════════════════════════════════════════

group('recalcOnDateChange — datumomslag');

// Hjälpare som fångar anrop från recalcOnDateChange
function mockRecalcDeps() {
  var r = { calcCalled: -1, calcSkip: null, gdCalled: false, calcCoreCalls: 0, inputData: null };
  ctx.calc = function(i, skip) { r.calcCalled = i; r.calcSkip = skip; };
  ctx.generateAndDistribute = function() { r.gdCalled = true; };
  ctx.calcCore = function(id) { r.calcCoreCalls++; r.inputData = id; return {}; };
  return r;
}

test('rensar _todayCache', () => {
  // Sätt cache via vm.runInContext så att variablerna inne i vm-kontexten nås
  vm.runInContext('_todayCache = { fake: true }; _todayCacheKey = "foo";', ctx);
  mockRecalcDeps();
  setState(0, { valid: true, calculable: true, medRaw: 'Elvanse 50 mg', dateVal: '2025-01-15',
    dose: 1, doseRaw: '1', amt: 30, amtRaw: '30', refRaw: '3', total: 90,
    doseInterval: 1, doseUnit: 'st', notCalculable: false });
  setState(1, { valid: false });
  ctx.recalcOnDateChange();
  var cacheNull = vm.runInContext('_todayCache', ctx);
  var cacheKeyEmpty = vm.runInContext('_todayCacheKey', ctx);
  assert(cacheNull === null, '_todayCache ska vara null');
  assert(cacheKeyEmpty === '', '_todayCacheKey ska vara tom');
});

test('aktivt kort räknas om via calc(activeMedIdx, true)', () => {
  var r = mockRecalcDeps();
  setState(0, { valid: true, calculable: true, medRaw: 'Elvanse 50 mg', dateVal: '2025-01-15',
    dose: 1, doseRaw: '1', amt: 30, amtRaw: '30', refRaw: '3', total: 90,
    doseInterval: 1, doseUnit: 'st', notCalculable: false });
  ctx.recalcOnDateChange();
  assertEqual(r.calcCalled, 0, 'calc(0) anropades');
  assertEqual(r.calcSkip, true, 'skipGenerate = true');
});

test('valid:false-kort hoppas över', () => {
  var r = mockRecalcDeps();
  setState(0, { valid: false });
  setState(1, { valid: false, calculable: undefined });
  ctx.recalcOnDateChange();
  assertEqual(r.calcCoreCalls, 0, 'inga calcCore-anrop för ogiltiga kort');
});

test('calculable:true-kort får indata från state', () => {
  var r = mockRecalcDeps();
  // Aktivt kort (idx 0) räknas om via calc(). Icke-aktiva kort räknas via calcCore().
  // Skapa ett icke-aktivt kort (idx 1) med calculable:true så att recalcOnDateChange
  // anropar calcCore för det.
  setState(0, { valid: true, calculable: true, medRaw: 'Elvanse 50 mg', dateVal: '2025-01-15',
    dose: 1, doseRaw: '1', amt: 30, amtRaw: '30', refRaw: '3', total: 90,
    doseInterval: 1, doseUnit: 'st', notCalculable: false });
  setState(1, { valid: true, calculable: true, medRaw: 'Sertralin 50 mg', dateVal: '2025-02-01',
    dose: 2, doseRaw: '2', amt: 30, amtRaw: '30', refRaw: '4', total: 120,
    doseInterval: 7, doseUnit: 'ml', notCalculable: false, remainingDoses: 5,
    leftRaw: '5' });
  setActive(0);

  ctx.recalcOnDateChange();
  var d = r.inputData;
  assert(d !== null, 'calcCore anropades för icke-aktivt kort');
  assertEqual(d.medRaw, 'Sertralin 50 mg');
  assertEqual(d.amt, 30);
  assertEqual(d.dose, 2);
  assertEqual(d.doseInterval, 7);
  assertEqual(d.doseUnit, 'ml');
  assertEqual(d.notCalculable, false);
  assertEqual(d.remaining, 5);
});

test('generateAndDistribute anropas i slutet', () => {
  var r = mockRecalcDeps();
  setState(0, { valid: true, calculable: true, medRaw: 'Elvanse 50 mg', dateVal: '2025-01-15',
    dose: 1, doseRaw: '1', amt: 30, amtRaw: '30', refRaw: '3', total: 90,
    doseInterval: 1, doseUnit: 'st', notCalculable: false });
  setState(1, { valid: false });
  ctx.recalcOnDateChange();
  assert(r.gdCalled, 'generateAndDistribute anropades');
});

// Återställ överstyrda funktioner efter recalcOnDateChange-testerna
vm.runInContext(`
  delete calc;
  delete generateAndDistribute;
  delete calcCore;
`, ctx);

// ═══════════════════════════════════════════════════════════
// NIVÅ 3: executeClearAll — nollställning för ny patient
// ═══════════════════════════════════════════════════════════

group('executeClearAll — nollställning');

test('states sätts till [{}]', () => {
  setState(0, { medRaw: 'A', valid: true });
  setState(1, { medRaw: 'B', valid: true });
  setState(2, { medRaw: 'C', valid: true });
  setActive(1);
  ctx.executeClearAll();
  assertEqual(ctx.__getStatesLen(), 1, 'ett kort kvar');
});

test('calcDebounced töms', () => {
  setState(0, { medRaw: 'A', valid: true });
  setState(1, { medRaw: 'B', valid: true });
  ctx.__setCalcDeb([{ cancel: function() {} }, { cancel: function() {} }]);
  ctx.executeClearAll();
  assertEqual(ctx.__getCalcDebLen(), 0, 'calcDebounced är tom');
});

test('prescribeState återställs', () => {
  setState(0, { medRaw: 'A', valid: true });
  var ps = vm.runInContext('prescribeState', ctx);
  ps[0] = { packageSize: '30' };
  ctx.executeClearAll();
  // executeClearAll → resetAllMedState → prescribeState = {}.
  // renderPrescribePanel kan återinitiera prescribeState[0] under rendering,
  // men den gamla datan (packageSize) ska vara borta.
  var newPs = vm.runInContext('prescribeState[0]', ctx);
  assert(!newPs || newPs.packageSize !== '30', 'gammal packageSize rensad');
});

test('activeMedIdx är 0', () => {
  setState(0, { medRaw: 'A' });
  setState(1, { medRaw: 'B' });
  setActive(1);
  ctx.executeClearAll();
  assertEqual(ctx.__getActiveIdx(), 0, 'activeMedIdx återställs');
});

test('nurse view-flaggor återställs', () => {
  vm.runInContext('nurseViewActive = true; nurseVitalNormal = true; nurseFollowUpAdequate = true;', ctx);
  ctx.executeClearAll();
  assertEqual(ctx.__getNurseViewActive(), false, 'nurseViewActive');
  assertEqual(ctx.__getNurseVitalNormal(), false, 'nurseVitalNormal');
  assertEqual(ctx.__getNurseFollowUpAdequate(), false, 'nurseFollowUpAdequate');
});

test('medList byggs om med 1 element', () => {
  setState(0, { medRaw: 'A', valid: true });
  ctx.executeClearAll();
  var list = getEl('medList');
  assert(list !== null, 'medList finns');
  var items = list.querySelectorAll('.med-item');
  assertEqual(items.length, 1, 'medList har 1 kort');
});

// ═══════════════════════════════════════════════════════════
// NIVÅ 4: addMedCard / clearCurrentCard — state-integritet
// ═══════════════════════════════════════════════════════════

group('addMedCard — lägg till kort');

test('ökar states.length och sätter activeMedIdx', () => {
  setState(0, { medRaw: 'A' });
  var prevLen = ctx.__getStatesLen();
  ctx.addMedCard();
  assert(ctx.__getStatesLen() === prevLen + 1, 'states växte');
  assertEqual(ctx.__getActiveIdx(), ctx.__getStatesLen() - 1, 'activeMedIdx pekar på nya');
});

test('spärr vid MAX_MED_CARDS', () => {
  ctx.__resetState();
  for (var i = 0; i < 8; i++) {
    setState(i, { medRaw: 'L\u00e4kemedel ' + (i + 1), valid: true });
  }
  setActive(0);
  var lenBefore = ctx.__getStatesLen();
  ctx.addMedCard();
  assertEqual(ctx.__getStatesLen(), lenBefore, 'inget kort lades till');
});

test('lock-guard avvisar dubbelanrop', () => {
  setState(0, { medRaw: 'A' });
  vm.runInContext('_addMedLocked = true;', ctx);
  var lenBefore = ctx.__getStatesLen();
  ctx.addMedCard();
  assertEqual(ctx.__getStatesLen(), lenBefore, 'dubbelanrop avvisades');
  vm.runInContext('_addMedLocked = false;', ctx);
});

group('clearCurrentCard — ta bort/nollställ');

test('≥2 kort: kort tas bort och calcDebounced omindexeras', () => {
  setState(0, { medRaw: 'A', valid: true });
  setState(1, { medRaw: 'B', valid: true });
  setState(2, { medRaw: 'C', valid: true });
  setActive(1);
  ctx.__setCalcDeb([{ cancel: function() {} }, { cancel: function() {} }, { cancel: function() {} }]);
  ctx.clearCurrentCard();
  assertEqual(ctx.__getStatesLen(), 2, 'states minskade');
  assertEqual(ctx.__getCalcDebLen(), 2, 'calcDebounced kompakterad');
  assertEqual(ctx.__getActiveIdx(), 1, 'activeMedIdx clampad');
});

test('1 kort kvar: nollställs, inte borttaget', () => {
  setState(0, { medRaw: 'A', valid: true, isOveruse: true, earlyRenewalDecision: 'yes' });
  setActive(0);
  ctx.__setCalcDeb([{ cancel: function() {} }]);
  ctx.clearCurrentCard();
  assertEqual(ctx.__getStatesLen(), 1, 'states.length oförändrat');
  var s = vm.runInContext('states[0]', ctx);
  assert(!s.isOveruse, 'isOveruse nollställd');
  assert(!s.earlyRenewalDecision, 'earlyRenewalDecision nollställd');
  assertEqual(s.activeTab, 'patient', 'activeTab återställd');
});

// ═══════════════════════════════════════════════════════════
// RAPPORTERING
// ═══════════════════════════════════════════════════════════

console.log(`\n────────────────────────────────────────────────`);
console.log(`${passed} klarade  |  ${failed} misslyckades`);
process.exit(failed > 0 ? 1 : 0);
