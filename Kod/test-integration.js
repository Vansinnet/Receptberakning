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

// Ladda källfiler i rätt beroenderordning — alla 11 (inkl. interactions.js)
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

  // Mockad läkemedelsdata — samma som test-ui.js / test-app.js
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
    while (states.length <= i) states.push({ _cardId: _nextCardId++ });
    states[i] = Object.assign({ _cardId: states[i]._cardId }, data || {});
  }
  function __setActive(i) { activeMedIdx = i; }
  function __setPrescribeGlobals(mode, months, endDate) {
    _prescribeMode = mode;
    _prescribeMonths = months;
    _prescribeEndDate = endDate;
  }
  function __resetState() {
    _nextCardId = 2;
    states = [{ _cardId: 1 }];
    activeMedIdx = 0;
    prescribeState = {};
    _addMedLocked = false;
    _clearCardLocked = false;
  }
  // Accessorer för let/const-variabler i VM-kontexten
  function __getStatesLen() { return states.length; }
  function __getActiveIdx() { return activeMedIdx; }
  function __getState(i) { return states[i] || null; }
  function __getStateField(i, key) { return (states[i] || {})[key]; }
  function __getCalcDebLen() { return calcDebounced.size; }
  function __getCalcDebKeys() { return Array.from(calcDebounced.keys()); }
  function __getCalcDebHas(key) { return calcDebounced.has(key); }
  function __setCalcDeb(mockEntries) {
    calcDebounced.clear();
    if (mockEntries) mockEntries.forEach(function(e) { calcDebounced.set(e[0], e[1]); });
  }
  function __setCalcDebSpy(entries) {
    calcDebounced.clear();
    calcDebounced._spyCalls = {};
    entries.forEach(function(e) {
      var cardId = e[0];
      calcDebounced.set(cardId, {
        cancel: function() { calcDebounced._spyCalls[cardId] = (calcDebounced._spyCalls[cardId] || 0) + 1; },
        _cardId: cardId
      });
    });
  }
  function __getSpyCalls() { return calcDebounced._spyCalls || {}; }
  function __resetSpyCalls() { calcDebounced._spyCalls = {}; }
  function __runFindCardIdx(cardId) { return _findCardIdx(cardId); }
  function __getAddMedLocked() { return _addMedLocked; }
  function __setAddMedLocked(v) { _addMedLocked = v; }
  function __getClearCardLocked() { return _clearCardLocked; }
  function __setClearCardLocked(v) { _clearCardLocked = v; }
`, ctx);

const MOCK_TODAY = new Date('2025-06-15T00:00:00.000Z').getTime();
ctx._mockToday = MOCK_TODAY;

const doc       = window.document;
function getEl(id) { return doc.getElementById(id); }

// ═══════════════════════════════════════════════════════════
// TESTVERKTYG
// ═══════════════════════════════════════════════════════════

let passed = 0, failed = 0;

function group(name) { console.log(`\n${name}`); }

function test(name, fn) {
  ctx.__resetState();
  ctx.__setActive(0);
  ctx._mockToday = MOCK_TODAY;
  if (ctx.__resetSpyCalls) ctx.__resetSpyCalls();
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
// NIVÅ 1: E2E ENKELKORTSFLÖDE — fullt flöde från DOM till state och rendering
// ═══════════════════════════════════════════════════════════

group('E2E enkelkortsflöde — OK-recept');

function setupForm(medRaw, dateVal, dose, amt, ref, left, interval, doseUnit) {
  getEl('medInput').value = medRaw;
  getEl('dateInput').value = dateVal;
  getEl('doseInput').value = String(dose);
  getEl('amtInput').value = String(amt);
  getEl('refInput').value = String(ref);
  if (left !== undefined) getEl('leftInput').value = String(left);
  else getEl('leftInput').value = '';
  const diSel = getEl('doseIntervalSelect');
  if (diSel) diSel.value = String(interval || 1);
  ctx.applyMedStatePatch(0, { doseUnit: doseUnit || 'st' });
}

test('OK-recept → state får valid:true, calculable:true, total', () => {
  setupForm('Elvanse 50 mg', '2025-03-18', 1, 30, 3);
  ctx.calc(0);

  const s = ctx.__getState(0);
  assertEqual(s.valid, true, 'valid');
  assertEqual(s.calculable, true, 'calculable');
  assertEqual(s.total, 90, 'total = 30*3');
  assert(s.amt === 30, 'amt bevaras');
  assert(s.dose === 1, 'dose bevaras');
});

test('OK-recept → verdictTitle renderas i DOM', () => {
  setupForm('Elvanse 50 mg', '2025-03-18', 1, 30, 3);
  ctx.calc(0);

  const title = getEl('verdictTitle');
  assert(title !== null, 'verdictTitle finns');
  assertContains(title.textContent, 'OK', 'verdictTitle');
});

test('OK-recept → metricsGrid renderas med Totalt förskrivet', () => {
  setupForm('Elvanse 50 mg', '2025-03-18', 1, 30, 3);
  ctx.calc(0);

  const grid = getEl('metricsGrid');
  assert(grid !== null, 'metricsGrid finns');
  assertContains(grid.textContent, 'Totalt förskrivet', 'metricsGrid');
  assertContains(grid.textContent, '90', 'metricsGrid total');
});

test('OK-recept → tidslinje renderas', () => {
  setupForm('Elvanse 50 mg', '2025-03-18', 1, 30, 3);
  ctx.calc(0);

  const tlFill = getEl('tlFill');
  const tlStart = getEl('tlStart');
  const tlEnd = getEl('tlEnd');
  assert(tlFill !== null, 'tlFill finns');
  assert(tlStart !== null, 'tlStart finns');
  assert(tlEnd !== null, 'tlEnd finns');
  assert(tlStart.textContent !== '—', 'tlStart ifyllt');
  assert(tlEnd.textContent !== '—', 'tlEnd ifyllt');
});

test('OK-recept → resultContent syns, resultEmptyState döljs', () => {
  setupForm('Elvanse 50 mg', '2025-03-18', 1, 30, 3);
  ctx.calc(0);

  const content = getEl('resultContent');
  const empty = getEl('resultEmptyState');
  assert(content.style.display !== 'none', 'resultContent syns');
  if (empty) assert(empty.classList.contains('is-hidden'), 'resultEmptyState dold');
});

test('Ofullständigt recept → valid:false, statusText sätts', () => {
  getEl('medInput').value = 'Elvanse 50 mg';
  getEl('dateInput').value = '';
  getEl('doseInput').value = '';
  getEl('amtInput').value = '';
  getEl('refInput').value = '';
  ctx.calc(0);

  const s = ctx.__getState(0);
  assertEqual(s.valid, false, 'valid ska vara false');
  assert(s.statusText !== undefined, 'statusText finns');
});

test('Överförbrukning → isOveruse:true, verdictSub visar varning', () => {
  setupForm('Elvanse 50 mg', '2025-04-01', 1, 30, 3);
  ctx.calc(0);

  const s = ctx.__getState(0);
  assertEqual(s.isOveruse, true, 'isOveruse');
  assertEqual(s.isTooEarly, false, 'isTooEarly ska vara false');

  const title = getEl('verdictTitle');
  assertContains(title.textContent, 'För tidig förnyelse', 'verdictTitle överförbrukning');
});

test('För tidigt → isTooEarly:true', () => {
  // Recept utfärdat nyligen (26 dagar), patienten anger 80 kvar av 90.
  // earlyPickup minskar calcBase så consumed = 90-80 = 10, avgNum = 10/26 ≈ 0.38.
  // isOveruse = false, daysToPrescribedEnd = 90-26 = 64 > 18 → isTooEarly.
  setupForm('Elvanse 50 mg', '2025-05-20', 1, 30, 3, 80);
  ctx.calc(0);

  const s = ctx.__getState(0);
  assertEqual(s.isTooEarly, true, 'isTooEarly');
  assertEqual(s.isOveruse, false, 'isOveruse ska vara false');
});

test('Kvarvarande doser → avg beräknas på faktisk förbrukning', () => {
  setupForm('Elvanse 50 mg', '2025-03-15', 1, 30, 3, 15);
  ctx.calc(0);

  const s = ctx.__getState(0);
  assertEqual(s.valid, true, 'valid');
  assertEqual(s.calculable, true, 'calculable');
  assertEqual(s.remainingDoses, 15, 'remainingDoses bevaras');
  assert(s.daysRemaining !== undefined, 'daysRemaining sätts');
  assert(s.displayAvgStr !== undefined, 'displayAvgStr sätts');
  // avgNote (separat fält) nämner faktisk förbrukning vid ifylld kvarvarande mängd
  assert(s.avgNote !== undefined, 'avgNote satt');
  assertContains(String(s.avgNote), 'faktisk', 'avgNote nämner faktisk förbrukning');
});

test('Felaktigt datum (framtiden) → valid:false', () => {
  setupForm('Elvanse 50 mg', '2026-01-01', 1, 30, 3);
  ctx.calc(0);

  const s = ctx.__getState(0);
  assertEqual(s.valid, false, 'valid ska vara false för framtidsdatum');
});

test('Byte av dosintervall → veckovis beräkning korrekt', () => {
  // 7-day interval: dose=7 per week = 1/day. amt=28 per pack, 3 refs = 84 total, 84 days.
  // date: 2025-03-18 = 89 days ago. avgNum = 84/89 ≈ 0.944.
  setupForm('Elvanse 50 mg', '2025-03-18', 7, 28, 3, undefined, 7);
  ctx.calc(0);

  const s = ctx.__getState(0);
  assertEqual(s.valid, true, 'valid');
  assertEqual(s.calculable, true, 'calculable');
  assertEqual(s.doseInterval, 7, 'doseInterval = 7');
  assertEqual(s.total, 84, 'total = 28*3');
  assert(s.displayAvgStr.indexOf('vecka') !== -1, 'displayAvgStr nämner vecka');
});

// ═══════════════════════════════════════════════════════════
// NIVÅ 2: KVARVARANDE DOSER VID SIMULTAN MULTIKORTSUPPDATERING
// ═══════════════════════════════════════════════════════════

group('Kvarvarande doser — recalcOnDateChange med riktig calcCore');

// Hjälpare: sätt upp state (för icke-aktiva kort) + DOM (för aktivt kort).
// Alla fält måste sättas för att calcCore ska producera fullständig output.
function setCardViaState(i, overrides) {
  const base = {
    valid: true, calculable: true, medRaw: 'Elvanse 50 mg', dateVal: '2025-03-15',
    dose: 1, doseRaw: '1', amt: 30, amtRaw: '30', refRaw: '3', total: 90,
    remainingDoses: null, leftRaw: '',
    doseInterval: 1, doseUnit: 'st', notCalculable: false,
    isOveruse: false, isTooEarly: false, earlyRenewalDecision: null,
    medName: 'Elvanse 50 mg', medNameStripped: 'Elvanse 50 mg',
  };
  ctx.__setState(i, Object.assign({}, base, overrides));
}

test('2 kort utan remaining, datum framåt → daysRemaining minskar', () => {
  ctx._mockToday = new Date('2025-06-15T00:00:00.000Z').getTime();

  // Card 0: date 2025-03-15 (92 days ago). total=90, totalDays=90. daysRemaining=90-92=-2
  setCardViaState(0, { medRaw: 'Elvanse 50 mg', dateVal: '2025-03-15', dose: 1, amt: 30, refRaw: '3', total: 90 });
  // Card 1: date 2025-05-01 (45 days ago). total=120, totalDays=60. daysRemaining=60-45=15
  setCardViaState(1, { medRaw: 'Sertralin 50 mg', dateVal: '2025-05-01', dose: 2, amt: 30, refRaw: '4', total: 120 });

  ctx.__setActive(0);

  // Sätt DOM så att calc() kan läsa aktiva kortet
  getEl('medInput').value = 'Elvanse 50 mg';
  getEl('dateInput').value = '2025-03-15';
  getEl('doseInput').value = '1';
  getEl('amtInput').value = '30';
  getEl('refInput').value = '3';
  getEl('leftInput').value = '';
  getEl('doseIntervalSelect').value = '1';
  ctx.applyMedStatePatch(0, { doseUnit: 'st' });

  // Flytta fram datum med 30 dagar
  ctx._mockToday = new Date('2025-07-15T00:00:00.000Z').getTime();
  ctx.recalcOnDateChange();

  // Card 0: daysSince = 122, totalDays = 90, daysRemaining = 90 - 122 = -32
  const s0 = ctx.__getState(0);
  assertEqual(s0.daysRemaining, -32, 'card 0 daysRemaining');

  // Card 1: daysSince = 75, totalDays = 60, daysRemaining = 60 - 75 = -15
  const s1 = ctx.__getState(1);
  assertEqual(s1.daysRemaining, -15, 'card 1 daysRemaining');
});

test('2 kort med remaining → avg förändras när datumet avanceras', () => {
  ctx._mockToday = new Date('2025-06-15T00:00:00.000Z').getTime();

  // Card 0: remaining=10. daysSince=92. consumed = 90-10 = 80.
  setCardViaState(0, { remainingDoses: 10, leftRaw: '10' });
  // Card 1: remaining=30. daysSince=45. consumed = 120-30 = 90.
  setCardViaState(1, { medRaw: 'Sertralin 50 mg', dateVal: '2025-05-01', dose: 2, doseRaw: '2',
    amt: 30, refRaw: '4', total: 120, remainingDoses: 30, leftRaw: '30' });

  ctx.__setActive(0);
  getEl('medInput').value = 'Elvanse 50 mg';
  getEl('dateInput').value = '2025-03-15';
  getEl('doseInput').value = '1';
  getEl('amtInput').value = '30';
  getEl('refInput').value = '3';
  getEl('leftInput').value = '10';
  getEl('doseIntervalSelect').value = '1';
  ctx.applyMedStatePatch(0, { doseUnit: 'st' });

  // Avancera till 2025-08-15 (153 days from March 15, 106 days from May 1)
  ctx._mockToday = new Date('2025-08-15T00:00:00.000Z').getTime();
  ctx.recalcOnDateChange();

  // Card 0: remaining=10 bevaras, daysRemaining = floor(10/1) = 10
  const s0 = ctx.__getState(0);
  assertEqual(s0.remainingDoses, 10, 'card 0 remainingDoses bevaras');
  assertEqual(s0.daysRemaining, 10, 'card 0 daysRemaining');
  assert(s0.displayAvgStr !== undefined, 'card 0 displayAvgStr satt');

  // Card 1: remaining=30 bevaras, daysRemaining = floor(30/2) = 15
  const s1 = ctx.__getState(1);
  assertEqual(s1.remainingDoses, 30, 'card 1 remainingDoses bevaras');
  assertEqual(s1.daysRemaining, 15, 'card 1 daysRemaining');
  assert(s1.displayAvgStr !== undefined, 'card 1 displayAvgStr satt');
});

test('3 kort, alla valid → samtliga får uppdaterade värden', () => {
  ctx._mockToday = new Date('2025-06-15T00:00:00.000Z').getTime();

  setCardViaState(0, { dateVal: '2025-03-15' });
  setCardViaState(1, { medRaw: 'Sertralin 50 mg', dateVal: '2025-04-01', dose: 1, doseRaw: '1', amt: 100, amtRaw: '100', refRaw: '4', total: 400 });
  setCardViaState(2, { medRaw: 'Alvedon 500 mg', dateVal: '2025-05-15', dose: 2, doseRaw: '2', amt: 20, amtRaw: '20', refRaw: '2', total: 40 });

  ctx.__setActive(0);
  getEl('medInput').value = 'Elvanse 50 mg';
  getEl('dateInput').value = '2025-03-15';
  getEl('doseInput').value = '1';
  getEl('amtInput').value = '30';
  getEl('refInput').value = '3';
  getEl('doseIntervalSelect').value = '1';
  ctx.applyMedStatePatch(0, { doseUnit: 'st' });

  ctx._mockToday = new Date('2025-07-15T00:00:00.000Z').getTime();
  ctx.recalcOnDateChange();

  // Alla tre ska ha calculable === true (eller valid + calculable satt)
  for (let i = 0; i < 3; i++) {
    const s = ctx.__getState(i);
    assert(s.valid !== false, `card ${i} valid inte false`);
    assert(s.calculable !== false, `card ${i} calculable inte false`);
    assert(s.daysRemaining !== undefined, `card ${i} daysRemaining satt`);
  }
});

test('valid:false-kort hoppas över av recalcOnDateChange', () => {
  ctx._mockToday = new Date('2025-06-15T00:00:00.000Z').getTime();

  setCardViaState(0, { valid: false, calculable: undefined });
  setCardViaState(1, {});

  ctx.__setActive(0);
  getEl('medInput').value = 'Elvanse 50 mg';
  getEl('dateInput').value = '2025-03-15';
  getEl('doseInput').value = '1';
  getEl('amtInput').value = '30';
  getEl('refInput').value = '3';
  getEl('doseIntervalSelect').value = '1';
  ctx.applyMedStatePatch(0, { doseUnit: 'st' });

  ctx._mockToday = new Date('2025-07-15T00:00:00.000Z').getTime();
  ctx.recalcOnDateChange();

  // Card 0 ska förbi valid=false-guarden i recalcOnDateChange — calc() kör ändå
  // (eftersom calc() är anropad för aktivt kort oavsett valid-status).
  // Men valid=false-kort i for-loopen ska hoppas över.
  // Detta test verifierar att card 1 beräknas men card 0:s calc() går ändå.
  const s1 = ctx.__getState(1);
  assert(s1.daysRemaining !== undefined, 'card 1 uppdaterad');
});

test('calculable===false (daysSince=0) räknas om vid datumomslag', () => {
  // Sätt datum till dagens för att få daysSince=0
  var todayStr = vm.runInContext('fmtDate(getToday())', ctx);
  ctx._mockToday = new Date('2025-06-15T00:00:00.000Z').getTime();

  setCardViaState(0, { calculable: false, dateVal: todayStr });

  ctx.__setActive(0);
  getEl('medInput').value = 'Elvanse 50 mg';
  getEl('dateInput').value = todayStr;
  getEl('doseInput').value = '1';
  getEl('amtInput').value = '30';
  getEl('refInput').value = '3';
  getEl('doseIntervalSelect').value = '1';
  ctx.applyMedStatePatch(0, { doseUnit: 'st' });

  ctx.calc(0);
  var s0 = ctx.__getState(0);
  assertEqual(s0.calculable, false, 'daysSince=0 ger calculable:false');

  // Efter en dag ska det bli calculable:true
  ctx._mockToday = new Date('2025-06-16T00:00:00.000Z').getTime();
  ctx.recalcOnDateChange();

  s0 = ctx.__getState(0);
  assertEqual(s0.calculable, true, 'calculable blir true efter datumomslag');
});

test('generateAndDistribute anropas av recalcOnDateChange', () => {
  ctx._mockToday = new Date('2025-06-15T00:00:00.000Z').getTime();

  var gdCalled = false;
  ctx.generateAndDistribute = function() { gdCalled = true; };

  setCardViaState(0, {});
  ctx.__setActive(0);
  getEl('medInput').value = 'Elvanse 50 mg';
  getEl('dateInput').value = '2025-03-15';
  getEl('doseInput').value = '1';
  getEl('amtInput').value = '30';
  getEl('refInput').value = '3';
  getEl('doseIntervalSelect').value = '1';
  ctx.applyMedStatePatch(0, { doseUnit: 'st' });

  ctx._mockToday = new Date('2025-07-15T00:00:00.000Z').getTime();
  ctx.recalcOnDateChange();

  assert(gdCalled, 'generateAndDistribute anropades');
  // Återställ
  vm.runInContext('delete generateAndDistribute;', ctx);
});

test('_todayCache nollställs vid recalcOnDateChange', () => {
  ctx._mockToday = new Date('2025-06-15T00:00:00.000Z').getTime();

  vm.runInContext('_todayCache = { fake: true }; _todayCacheKey = "foo";', ctx);
  setCardViaState(0, {});
  setCardViaState(1, { valid: false });
  ctx.__setActive(0);
  getEl('medInput').value = 'Elvanse 50 mg';
  getEl('dateInput').value = '2025-03-15';
  getEl('doseInput').value = '1';
  getEl('amtInput').value = '30';
  getEl('refInput').value = '3';
  getEl('doseIntervalSelect').value = '1';
  ctx.applyMedStatePatch(0, { doseUnit: 'st' });

  ctx.recalcOnDateChange();

  var cacheNull = vm.runInContext('_todayCache', ctx);
  var cacheKeyEmpty = vm.runInContext('_todayCacheKey', ctx);
  assert(cacheNull === null, '_todayCache nollställd');
  assert(cacheKeyEmpty === '', '_todayCacheKey tom');
});

// ═══════════════════════════════════════════════════════════
// NIVÅ 3: calcDebounced RENSNING VID KORTBORTTAGNING
// ═══════════════════════════════════════════════════════════

group('calcDebounced rensning — cancel() och Map.delete');

test('clearCurrentCard (≥2 kort): cancel() anropas på borttaget korts debounce', () => {
  ctx.__setState(0, { medRaw: 'A', valid: true, _cardId: 1 });
  ctx.__setState(1, { medRaw: 'B', valid: true, _cardId: 2 });
  ctx.__setState(2, { medRaw: 'C', valid: true, _cardId: 3 });
  ctx.__setActive(1); // Ta bort kort B (index 1)

  ctx.__setCalcDebSpy([[1, {}], [2, {}], [3, {}]]);
  ctx.clearCurrentCard();

  var calls = ctx.__getSpyCalls();
  assertEqual(calls[2], 1, 'cardId 2 (borttaget) cancel() anropades 1 gång');
});

test('clearCurrentCard (≥2 kort): Map entry raderad, size minskar', () => {
  ctx.__setState(0, { medRaw: 'A', valid: true, _cardId: 1 });
  ctx.__setState(1, { medRaw: 'B', valid: true, _cardId: 2 });
  ctx.__setState(2, { medRaw: 'C', valid: true, _cardId: 3 });
  ctx.__setActive(1);

  ctx.__setCalcDeb([
    [1, { cancel: function() {} }],
    [2, { cancel: function() {} }],
    [3, { cancel: function() {} }]
  ]);
  ctx.clearCurrentCard();

  assertEqual(ctx.__getCalcDebLen(), 2, 'calcDebounced.size = 2');
  assertEqual(ctx.__getCalcDebHas(1), true, 'cardId 1 finns kvar');
  assertEqual(ctx.__getCalcDebHas(2), false, 'cardId 2 borttaget');
  assertEqual(ctx.__getCalcDebHas(3), true, 'cardId 3 finns kvar');
});

test('clearCurrentCard (≥2 kort): kvarvarande entries orörda', () => {
  ctx.__setState(0, { medRaw: 'A', valid: true, _cardId: 1 });
  ctx.__setState(1, { medRaw: 'B', valid: true, _cardId: 2 });
  ctx.__setState(2, { medRaw: 'C', valid: true, _cardId: 3 });
  ctx.__setActive(1);

  ctx.__setCalcDebSpy([[1, {}], [2, {}], [3, {}]]);
  ctx.clearCurrentCard();

  var calls = ctx.__getSpyCalls();
  assert(calls[1] === undefined, 'cardId 1 cancel() anropades INTE');
  assert(calls[3] === undefined, 'cardId 3 cancel() anropades INTE');
});

test('executeClearAll: alla cancel() anropas + Map töms', () => {
  ctx.__setState(0, { medRaw: 'A', valid: true, _cardId: 1 });
  ctx.__setState(1, { medRaw: 'B', valid: true, _cardId: 2 });
  ctx.__setState(2, { medRaw: 'C', valid: true, _cardId: 3 });

  ctx.__setCalcDebSpy([[1, {}], [2, {}], [3, {}]]);
  ctx.executeClearAll();

  var calls = ctx.__getSpyCalls();
  assertEqual(calls[1], 1, 'cardId 1 cancel() anropades');
  assertEqual(calls[2], 1, 'cardId 2 cancel() anropades');
  assertEqual(calls[3], 1, 'cardId 3 cancel() anropades');
  assertEqual(ctx.__getCalcDebLen(), 0, 'calcDebounced tömd');
});

test('_findCardIdx returnerar -1 för borttaget kort', () => {
  ctx.__setState(0, { medRaw: 'A', valid: true, _cardId: 1 });
  ctx.__setState(1, { medRaw: 'B', valid: true, _cardId: 2 });
  ctx.__setState(2, { medRaw: 'C', valid: true, _cardId: 3 });
  ctx.__setActive(1);

  // Verifiera att kortet finns
  assertEqual(ctx.__runFindCardIdx(2), 1, 'cardId 2 hittas innan borttagning');

  ctx.clearCurrentCard();

  // cardId 2 ska inte längre finnas
  assertEqual(ctx.__runFindCardIdx(2), -1, '_findCardIdx returnerar -1 för borttaget kort');
  // cardId 1 och 3 finns kvar
  assertEqual(ctx.__runFindCardIdx(1), 0, 'cardId 1 finns på index 0');
  assertEqual(ctx.__runFindCardIdx(3), 1, 'cardId 3 finns på index 1');
});

// ═══════════════════════════════════════════════════════════
// NIVÅ 4: INTERAKTIONSDETEKTION VIA DOM
// ═══════════════════════════════════════════════════════════

group('Interaktionsdetektion — checkAllInteractions() → DOM');

test('2 kort med SSRI+MAO → danger-varning i #interactionAlerts', () => {
  ctx.__setState(0, { valid: true, medRaw: 'Sertralin', medName: 'Sertralin', atcCode: 'N06AB06' });
  ctx.__setState(1, { valid: true, medRaw: 'Fenelzin', medName: 'Fenelzin', atcCode: 'N06AF05' });

  ctx.checkAllInteractions();

  var container = getEl('interactionAlerts');
  assert(container !== null, '#interactionAlerts finns');
  assert(!container.classList.contains('is-hidden'), '#interactionAlerts synlig');

  var alerts = container.querySelectorAll('.interaction-alert');
  assert(alerts.length >= 1, 'minst en interaktionsvarning');

  var dangerAlert = container.querySelector('.interaction-danger');
  assert(dangerAlert !== null, 'danger-klass finns på varningen');

  var text = container.textContent;
  assertContains(text, 'Sertralin', 'varningen nämner Sertralin');
  assertContains(text, 'Fenelzin', 'varningen nämner Fenelzin');

  var s0 = ctx.__getState(0);
  var s1 = ctx.__getState(1);
  assert(s0.interactionWarnings && s0.interactionWarnings.length > 0, 'card 0 har warnings');
  assert(s1.interactionWarnings && s1.interactionWarnings.length > 0, 'card 1 har warnings');
});

test('3 kort, 2 interagerar → rätt mediciner i varning, tredje orört', () => {
  ctx.__setState(0, { valid: true, medRaw: 'Sertralin', medName: 'Sertralin', atcCode: 'N06AB06' });
  ctx.__setState(1, { valid: true, medRaw: 'Fenelzin', medName: 'Fenelzin', atcCode: 'N06AF05' });
  ctx.__setState(2, { valid: true, medRaw: 'Alvedon', medName: 'Alvedon', atcCode: 'N02BE01' });

  ctx.checkAllInteractions();

  var container = getEl('interactionAlerts');
  assert(!container.classList.contains('is-hidden'), '#interactionAlerts synlig');

  var text = container.textContent;
  assertContains(text, 'Sertralin', 'varning nämner Sertralin');
  assertContains(text, 'Fenelzin', 'varning nämner Fenelzin');

  var s2 = ctx.__getState(2);
  assert(!s2.interactionWarnings || s2.interactionWarnings.length === 0,
    'card 2 (Alvedon) inga warnings');
});

test('Radera kort → interaktionsvarning försvinner', () => {
  ctx.__setState(0, { valid: true, medRaw: 'Sertralin', medName: 'Sertralin', atcCode: 'N06AB06' });
  ctx.__setState(1, { valid: true, medRaw: 'Fenelzin', medName: 'Fenelzin', atcCode: 'N06AF05' });
  ctx.__setActive(0);

  ctx.checkAllInteractions();
  var container = getEl('interactionAlerts');
  assert(!container.classList.contains('is-hidden'), 'varning syns före radering');

  ctx.clearCurrentCard();

  container = getEl('interactionAlerts');
  assert(container.classList.contains('is-hidden'), '#interactionAlerts dold efter radering');
});

test('Byte av ATC-kod → pipeline körs om', () => {
  ctx.__setState(0, { valid: true, medRaw: 'Alvedon', medName: 'Alvedon', atcCode: 'N02BE01' });
  ctx.__setState(1, { valid: true, medRaw: 'Metformin', medName: 'Metformin', atcCode: 'A10BA02' });

  ctx.checkAllInteractions();
  var container = getEl('interactionAlerts');
  assert(container.classList.contains('is-hidden'), 'inga varningar med ofarliga ATC');

  // Ändra båda till interagerande ATC-koder
  ctx.applyMedStatePatch(0, { atcCode: 'N06AB06', medName: 'Sertralin' });
  ctx.applyMedStatePatch(1, { atcCode: 'N06AF05', medName: 'Fenelzin' });

  ctx.checkAllInteractions();
  assert(!container.classList.contains('is-hidden'), 'varning syns efter ATC-byte');

  var dangerAlert = container.querySelector('.interaction-danger');
  assert(dangerAlert !== null, 'danger-varning efter ATC-byte');
  var alertText = dangerAlert.textContent;
  assertContains(alertText, 'Sertralin', 'danger-varningen nämner Sertralin');
  assertContains(alertText, 'Fenelzin', 'danger-varningen nämner Fenelzin');
  assert(!dangerAlert.classList.contains('interaction-warn'), 'är danger, inte warn');
});

test('valid=false-kort med atcCode deltar i interaktionskontroll', () => {
  // ATC-kod sätts vid autocomplete-val, innan hela formuläret är ifyllt.
  // checkAllInteractions filtrerar på atcCode (truthy), inte på valid — avsiktligt,
  // för att varna så snart två ATC-koder samexisterar, oavsett formulärstatus.
  ctx.__setState(0, { valid: true, medRaw: 'Sertralin', medName: 'Sertralin', atcCode: 'N06AB06' });
  ctx.__setState(1, { valid: false, medRaw: 'Fenelzin', medName: 'Fenelzin', atcCode: 'N06AF05' });

  ctx.checkAllInteractions();

  var container = getEl('interactionAlerts');
  assert(!container.classList.contains('is-hidden'), 'varning visas trots valid=false på card 1');
  assertContains(container.textContent, 'Sertralin', 'varningen nämner Sertralin');
  assertContains(container.textContent, 'Fenelzin', 'varningen nämner Fenelzin');
});

// ═══════════════════════════════════════════════════════════
// NIVÅ 5: EARLYRENEWALDECISION-PERSISTENS
// ═══════════════════════════════════════════════════════════

group('EarlyRenewalDecision — persistens över omräkning');

test('Beslut överlever omräkning när flaggor är oförändrade', () => {
  // TooEarly-scenario: nyligen utfärdat recept med kvarvarande doser
  setupForm('Elvanse 50 mg', '2025-05-20', 1, 30, 3, 80);
  ctx.applyMedStatePatch(0, { doseUnit: 'st' });
  ctx.calc(0);

  var s = ctx.__getState(0);
  assertEqual(s.isTooEarly, true, 'isTooEarly triggas');
  assertEqual(s.isOveruse, false, 'isOveruse ej triggad');

  // Läkaren gör kliniskt beslut: förnya ändå
  ctx.applyMedStatePatch(0, { earlyRenewalDecision: 'yes' });

  // Omräkning med samma datum — flaggor oförändrade
  ctx.calc(0);

  s = ctx.__getState(0);
  assertEqual(s.earlyRenewalDecision, 'yes', 'beslutet bevarat efter omräkning');
  assertContains(s.statusText, 'OK', 'statusText visar OK efter override');
});

test('Beslut nollställs när flaggor ändras vid datumomslag', () => {
  // TooEarly-scenario med earlyRenewalDecision = 'yes'
  setupForm('Elvanse 50 mg', '2025-05-20', 1, 30, 3, 80);
  ctx.applyMedStatePatch(0, { doseUnit: 'st' });
  ctx.calc(0);

  ctx.applyMedStatePatch(0, { earlyRenewalDecision: 'yes' });
  assertEqual(ctx.__getStateField(0, 'earlyRenewalDecision'), 'yes', 'beslut satt');

  // Flytta fram datum så att isTooEarly slutar gälla
  // 2025-05-20 + 90 dagar → t.o.m. 2025-08-18. Vid 2025-08-15 är daysToPrescribedEnd = 3 < 18.
  ctx._mockToday = new Date('2025-08-15T00:00:00.000Z').getTime();
  ctx.recalcOnDateChange();

  var s = ctx.__getState(0);
  assertEqual(s.isTooEarly, false, 'isTooEarly borta efter datumomslag');
  assertEqual(s.earlyRenewalDecision, null, 'beslut nollställt vid flaggbyte');
});

// ═══════════════════════════════════════════════════════════
// NIVÅ 6: KANTFALL KVARVARANDE DOSER (remaining=0)
// ═══════════════════════════════════════════════════════════

group('Kantfall kvarvarande doser — remaining=0');

test('remaining=0 → daysRemaining=0', () => {
  setupForm('Elvanse 50 mg', '2025-03-15', 1, 30, 3, 0);
  ctx.applyMedStatePatch(0, { doseUnit: 'st' });
  ctx.calc(0);

  var s = ctx.__getState(0);
  assertEqual(s.valid, true, 'valid');
  assertEqual(s.calculable, true, 'calculable');
  assertEqual(s.remainingDoses, 0, 'remainingDoses = 0');
  assertEqual(s.daysRemaining, 0, 'daysRemaining = 0');
});

test('remaining=0, consumed>0 → isOveruse triggas', () => {
  // Recept 2025-04-15 (61 dagar sedan). consumed = 90, avgNum = 90/61 ≈ 1.48 > 1.10.
  setupForm('Elvanse 50 mg', '2025-04-15', 1, 30, 3, 0);
  ctx.applyMedStatePatch(0, { doseUnit: 'st' });
  ctx.calc(0);

  var s = ctx.__getState(0);
  assertEqual(s.remainingDoses, 0, 'remainingDoses = 0');
  assertEqual(s.isOveruse, true, 'isOveruse triggas vid remaining=0');
  assert(s.daysRemaining === 0, 'daysRemaining = 0');

  var title = getEl('verdictTitle');
  assertContains(title.textContent, 'För tidig förnyelse', 'verdict visar överförbrukning');
});

// ═══════════════════════════════════════════════════════════
// RAPPORTERING
// ═══════════════════════════════════════════════════════════

console.log(`\n────────────────────────────────────────────────`);
console.log(`${passed} klarade  |  ${failed} misslyckades`);
process.exit(failed > 0 ? 1 : 0);
