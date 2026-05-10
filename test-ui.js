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

// Sandbox: standard-ECMAScript-builtins (Math, Date, parseInt …) finns alltid
// i alla VM-kontext — bara webbläsar-/Node-specifika globaler behöver anges.
const ctx = vm.createContext({
  document:             window.document,
  window,
  console,
  // Timers — behövs av resetTimer() i app.js vid laddning
  setTimeout, clearTimeout, setInterval, clearInterval,
  // localStorage — app.js omsluter anropen i try/catch men det är renare att ge den
  localStorage:         window.localStorage,
  // Clipboard — används bara i kopieringsknapparna, inte vid laddning
  navigator:            { clipboard: { writeText: () => Promise.resolve() } },
  // Toast-animation — showToast() anropas inte vid laddning
  requestAnimationFrame: (cb) => setTimeout(cb, 0),
  _mockToday: null,
});

// Ladda källfiler i rätt beroenderordning
['utils.js', 'state.js', 'calc-renew.js', 'longterm.js',
 'prescribe.js', 'drugs.js', 'ui-renew.js', 'app.js'].forEach(file => {
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, file), 'utf8'),
    ctx
  );
});

// Patcha getToday för deterministiska tester — samma mönster som test-calc.js
vm.runInContext(`
  const _realGetToday = getToday;
  getToday = function() {
    if (_mockToday !== null) return new Date(_mockToday);
    return _realGetToday();
  };
`, ctx);

// let-variablerna i state.js är inte åtkomliga som ctx-egenskaper —
// exponera hjälpfunktioner inifrån VM-kontexten (samma lösning som test-calc.js).
vm.runInContext(`
  function __setState(i, data) {
    while (states.length <= i) states.push({});
    states[i] = data || {};
  }
  function __setActive(i) { activeMedIdx = i; }
  function __setPrescribeGlobals(mode, months, endDate) {
    _prescribeMode = mode;
    _prescribeMonths = months;
    _prescribeEndDate = endDate || '';
  }
  function __resetState() {
    states         = [{}];
    activeMedIdx   = 0;
    prescribeState = {};
  }
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
  // Återställ till ett rent grundläge inför varje test
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
      `${lbl ? lbl + ': ' : ''}förväntade ${JSON.stringify(b)}, fick ${JSON.stringify(a)}`
    );
}

function assertNotEqual(a, b, lbl) {
  if (a === b)
    throw new Error(
      `${lbl ? lbl + ': ' : ''}förväntade ett värde skilt från ${JSON.stringify(b)}`
    );
}

function assertContains(str, substr, label) {
  if (!String(str).includes(substr))
    throw new Error(
      `${label ? label + ': ' : ''}"${str}" innehåller inte "${substr}"`
    );
}

// Minimalstate för ett fullständigt giltigt, beräknat läkemedel.
// Alla fält som render-funktionerna läser finns med.
function makeValidState(overrides = {}) {
  return {
    valid: true, calculable: true,
    isOveruse: false, isTooEarly: false,
    earlyRenewalDecision: null,
    verdictTitle: 'OK – Förnya recept',
    verdictSub:   'Snittförbrukning OK.',
    statusText:   'OK – t.o.m 2025-09-01',
    medRaw: 'Elvanse 50 mg', medName: 'Elvanse 50 mg',
    metrics: [
      { label: 'Totalt förskrivet', value: '300 st',                    cls: '',   tooltip: '' },
      { label: 'Räcker t.o.m.',     value: '2025-09-01 (78 dagar kvar)', cls: 'ok', tooltip: '' },
      { label: 'Snittförbrukning',  value: '1.00 st/dag',               cls: '',   tooltip: '' },
    ],
    alerts:        [],
    tlPct: 80, tlStart: '2024-09-28', tlEnd: '2025-09-01',
    patientText:   'Hej,\n\nVi förnyar.',
    patientTextEn: 'Hello,\n\nWe renew.',
    journalText:   'Kontaktorsak: Receptförnyelse.',
    patientLang:   'sv',
    activeTab:     'patient',
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════
// renderResultForMed — verdict-klass
// ═══════════════════════════════════════════════════════════

group('renderResultForMed — verdict-klass');

test('isOveruse → verdictBox har klassen verdict-danger', () => {
  setState(0, makeValidState({ isOveruse: true, verdictTitle: 'För tidig förnyelse – bedömning krävs' }));
  ctx.renderResultForMed(0);
  assert(getEl('verdictBox').className.includes('verdict-danger'), 'verdict-danger saknas');
});

test('isTooEarly → verdictBox har klassen verdict-warn', () => {
  setState(0, makeValidState({ isTooEarly: true, verdictTitle: 'För tidigt – 78 dagar kvar' }));
  ctx.renderResultForMed(0);
  assert(getEl('verdictBox').className.includes('verdict-warn'), 'verdict-warn saknas');
});

test('OK-state → verdictBox har klassen verdict-ok', () => {
  setState(0, makeValidState());
  ctx.renderResultForMed(0);
  assert(getEl('verdictBox').className.includes('verdict-ok'), 'verdict-ok saknas');
});

test('isOveruse + earlyRenewalDecision yes → verdict-ok (override)', () => {
  setState(0, makeValidState({ isOveruse: true, earlyRenewalDecision: 'yes' }));
  ctx.renderResultForMed(0);
  assert(getEl('verdictBox').className.includes('verdict-ok'), 'override yes ska ge verdict-ok trots isOveruse');
});

test('isTooEarly + earlyRenewalDecision yes → verdict-ok (override)', () => {
  setState(0, makeValidState({ isTooEarly: true, earlyRenewalDecision: 'yes' }));
  ctx.renderResultForMed(0);
  assert(getEl('verdictBox').className.includes('verdict-ok'), 'override yes ska ge verdict-ok trots isTooEarly');
});

test('verdictTitle och verdictSub skrivs in i DOM', () => {
  setState(0, makeValidState({ verdictTitle: 'Testtitel', verdictSub: 'Testsub' }));
  ctx.renderResultForMed(0);
  assertEqual(getEl('verdictTitle').textContent, 'Testtitel', 'verdictTitle');
  assertEqual(getEl('verdictSub').textContent,   'Testsub',   'verdictSub');
});

test('valid:false → resultContent dolt, emptyState synligt', () => {
  setState(0, { valid: false });
  ctx.renderResultForMed(0);
  assert(getEl('resultContent').classList.contains('is-hidden'),     'resultContent ska vara dolt');
  assert(!getEl('resultEmptyState').classList.contains('is-hidden'), 'emptyState ska vara synligt');
});

test('calculable:false med valid:true → resultContent synligt (orimliga värden visas)', () => {
  setState(0, makeValidState({ calculable: false, verdictTitle: 'Orimliga värden', metrics: [], alerts: [] }));
  ctx.renderResultForMed(0);
  assert(!getEl('resultContent').classList.contains('is-hidden'), 'resultContent ska vara synligt vid orimliga värden');
});

// ═══════════════════════════════════════════════════════════
// renderResultForMed — tidslinje
// ═══════════════════════════════════════════════════════════

group('renderResultForMed — tidslinje');

test('tlPct = 75 → tlFill.width = "75%"', () => {
  setState(0, makeValidState({ tlPct: 75 }));
  ctx.renderResultForMed(0);
  assertEqual(getEl('tlFill').style.width, '75%', 'tlFill.width');
});

test('tlPct = 0 → tlFill.width = "0%"', () => {
  setState(0, makeValidState({ tlPct: 0 }));
  ctx.renderResultForMed(0);
  assertEqual(getEl('tlFill').style.width, '0%', 'tlFill.width vid tlPct=0');
});

test('tlPct > 100 → clampad till "100%"', () => {
  setState(0, makeValidState({ tlPct: 130 }));
  ctx.renderResultForMed(0);
  assertEqual(getEl('tlFill').style.width, '100%', 'tlFill ska clampa vid 100%');
});

test('calculable:false → tidslinje nollställs (0% och —)', () => {
  setState(0, makeValidState({ calculable: false, metrics: [], alerts: [] }));
  ctx.renderResultForMed(0);
  assertEqual(getEl('tlFill').style.width,  '0%', 'tlFill ska vara 0%');
  assertEqual(getEl('tlStart').textContent, '—',  'tlStart ska vara —');
  assertEqual(getEl('tlEnd').textContent,   '—',  'tlEnd ska vara —');
});

test('isOveruse → tlFill får klassen tl-fill-danger', () => {
  setState(0, makeValidState({ isOveruse: true, tlPct: 60 }));
  ctx.renderResultForMed(0);
  assert(getEl('tlFill').className.includes('tl-fill-danger'), 'tl-fill-danger saknas');
});

test('isTooEarly → tlFill får klassen tl-fill-warn', () => {
  setState(0, makeValidState({ isTooEarly: true, tlPct: 40 }));
  ctx.renderResultForMed(0);
  assert(getEl('tlFill').className.includes('tl-fill-warn'), 'tl-fill-warn saknas');
});

test('OK → tlFill får klassen tl-fill-ok', () => {
  setState(0, makeValidState({ tlPct: 90 }));
  ctx.renderResultForMed(0);
  assert(getEl('tlFill').className.includes('tl-fill-ok'), 'tl-fill-ok saknas');
});

test('tlStart och tlEnd skrivs in från state', () => {
  setState(0, makeValidState({ tlStart: '2024-01-01', tlEnd: '2025-01-01', tlPct: 50 }));
  ctx.renderResultForMed(0);
  assertEqual(getEl('tlStart').textContent, '2024-01-01', 'tlStart');
  assertEqual(getEl('tlEnd').textContent,   '2025-01-01', 'tlEnd');
});

// ═══════════════════════════════════════════════════════════
// renderResultForMed — earlyDecisionBox
// ═══════════════════════════════════════════════════════════

group('renderResultForMed — earlyDecisionBox');

test('isOveruse → earlyDecisionBox synlig', () => {
  setState(0, makeValidState({ isOveruse: true }));
  ctx.renderResultForMed(0);
  assert(!getEl('earlyDecisionBox').classList.contains('is-hidden'), 'earlyDecisionBox ska vara synlig vid isOveruse');
});

test('isTooEarly → earlyDecisionBox synlig', () => {
  setState(0, makeValidState({ isTooEarly: true }));
  ctx.renderResultForMed(0);
  assert(!getEl('earlyDecisionBox').classList.contains('is-hidden'), 'earlyDecisionBox ska vara synlig vid isTooEarly');
});

test('OK-state → earlyDecisionBox dold', () => {
  setState(0, makeValidState());
  ctx.renderResultForMed(0);
  assert(getEl('earlyDecisionBox').classList.contains('is-hidden'), 'earlyDecisionBox ska vara dold vid OK');
});

test('earlyRenewalDecision yes → Ja-knappen selected, Nej-knappen inte', () => {
  setState(0, makeValidState({ isOveruse: true, earlyRenewalDecision: 'yes' }));
  ctx.renderResultForMed(0);
  assert(getEl('earlyDecisionYes').classList.contains('selected'),  'Ja-knappen ska ha selected');
  assert(!getEl('earlyDecisionNo').classList.contains('selected'),  'Nej-knappen ska inte ha selected');
});

test('earlyRenewalDecision no → Nej-knappen selected, Ja-knappen inte', () => {
  setState(0, makeValidState({ isOveruse: true, earlyRenewalDecision: 'no' }));
  ctx.renderResultForMed(0);
  assert(!getEl('earlyDecisionYes').classList.contains('selected'), 'Ja-knappen ska inte ha selected');
  assert(getEl('earlyDecisionNo').classList.contains('selected'),   'Nej-knappen ska ha selected');
});

test('earlyRenewalDecision null → varken Ja eller Nej är selected', () => {
  setState(0, makeValidState({ isOveruse: true, earlyRenewalDecision: null }));
  ctx.renderResultForMed(0);
  assert(!getEl('earlyDecisionYes').classList.contains('selected'), 'Ja-knappen ska inte ha selected utan beslut');
  assert(!getEl('earlyDecisionNo').classList.contains('selected'),  'Nej-knappen ska inte ha selected utan beslut');
});

// ═══════════════════════════════════════════════════════════
// renderResultForMed — copy-sektion
// ═══════════════════════════════════════════════════════════

group('renderResultForMed — copy-sektion');

test('patientText finns → copySection visas (display:flex)', () => {
  setState(0, makeValidState({ patientText: 'Hej,\n\ntest.' }));
  ctx.renderResultForMed(0);
  assertEqual(getEl('copySection').style.display, 'flex', 'copySection.display');
});

test('varken patientText eller journalText → copySection dold', () => {
  setState(0, makeValidState({ patientText: '', journalText: '' }));
  ctx.renderResultForMed(0);
  assertEqual(getEl('copySection').style.display, 'none', 'copySection ska vara dold');
});

test('journalText finns men inte patientText → copySection visas', () => {
  setState(0, makeValidState({ patientText: '', journalText: 'Journal.' }));
  ctx.renderResultForMed(0);
  assertEqual(getEl('copySection').style.display, 'flex', 'journalText räcker för att visa copySection');
});

// ═══════════════════════════════════════════════════════════
// buildMedList — sidopanel
// ═══════════════════════════════════════════════════════════

group('buildMedList — sidopanel');

test('ett läkemedel → ett list-item', () => {
  setState(0, { valid: false });
  ctx.buildMedList();
  assertEqual(doc.querySelectorAll('#medList .med-item').length, 1, 'antal med-item');
});

test('tre läkemedel → tre list-items', () => {
  setState(0, { valid: false }); setState(1, { valid: false }); setState(2, { valid: false });
  ctx.buildMedList();
  assertEqual(doc.querySelectorAll('#medList .med-item').length, 3, 'antal med-item');
});

test('aktivt läkemedel (index 1 av 2) har klassen active', () => {
  setState(0, { valid: false }); setState(1, { valid: false });
  setActive(1);
  ctx.buildMedList();
  const items = doc.querySelectorAll('#medList .med-item');
  assert(!items[0].classList.contains('active'), 'index 0 ska inte vara active');
  assert(items[1].classList.contains('active'),  'index 1 ska vara active');
});

test('statusText renderas i sidopanelen', () => {
  setState(0, makeValidState({ statusText: 'OK – t.o.m 2025-09-01' }));
  ctx.buildMedList();
  assertEqual(
    doc.querySelector('#medList .med-item-status').textContent,
    'OK – t.o.m 2025-09-01',
    'statusText'
  );
});

test('statusText saknas → fallback "Ej ifyllt"', () => {
  setState(0, { valid: false });
  ctx.buildMedList();
  assertEqual(doc.querySelector('#medList .med-item-status').textContent, 'Ej ifyllt', 'fallback-text');
});

test('valid + isOveruse utan override → status-dot har warn', () => {
  setState(0, makeValidState({ isOveruse: true, earlyRenewalDecision: null }));
  ctx.buildMedList();
  assert(doc.querySelector('#medList .status-dot').classList.contains('warn'), 'warn saknas på status-dot');
});

test('valid + isOveruse med override yes → status-dot har ok, inte warn', () => {
  setState(0, makeValidState({ isOveruse: true, earlyRenewalDecision: 'yes' }));
  ctx.buildMedList();
  const dot = doc.querySelector('#medList .status-dot');
  assert(dot.classList.contains('ok'),    'ok saknas på status-dot');
  assert(!dot.classList.contains('warn'), 'warn ska inte finnas när override=yes');
});

test('valid + OK → status-dot har ok, inte warn', () => {
  setState(0, makeValidState());
  ctx.buildMedList();
  const dot = doc.querySelector('#medList .status-dot');
  assert(dot.classList.contains('ok'),    'ok saknas på status-dot');
  assert(!dot.classList.contains('warn'), 'warn ska inte finnas vid OK');
});

test('åtta läkemedel → addMedBtn är disabled', () => {
  for (let i = 0; i < 8; i++) setState(i, { valid: false });
  ctx.buildMedList();
  assert(getEl('addMedBtn').disabled, 'addMedBtn ska vara disabled vid max (8)');
});

test('sju läkemedel → addMedBtn är inte disabled', () => {
  for (let i = 0; i < 7; i++) setState(i, { valid: false });
  ctx.buildMedList();
  assert(!getEl('addMedBtn').disabled, 'addMedBtn ska inte vara disabled under max');
});

// ═══════════════════════════════════════════════════════════
// renderFormForMed — formulärfält
// ═══════════════════════════════════════════════════════════

group('renderFormForMed — formulärfält');

test('state.medRaw fylls in i medInput', () => {
  setState(0, { medRaw: 'Ritalin 10 mg' });
  ctx.renderFormForMed(0);
  assertEqual(getEl('medInput').value, 'Ritalin 10 mg', 'medInput.value');
});

test('state.doseRaw och refRaw fylls in korrekt', () => {
  setState(0, { doseRaw: '2', refRaw: '6' });
  ctx.renderFormForMed(0);
  assertEqual(getEl('doseInput').value, '2', 'doseInput.value');
  assertEqual(getEl('refInput').value,  '6', 'refInput.value');
});

test('state.amtRaw och leftRaw fylls in korrekt', () => {
  setState(0, { amtRaw: '100', leftRaw: '40' });
  ctx.renderFormForMed(0);
  assertEqual(getEl('amtInput').value,  '100', 'amtInput.value');
  assertEqual(getEl('leftInput').value, '40',  'leftInput.value');
});

test('tomt state → alla fält är tomma strängar', () => {
  setState(0, {});
  ctx.renderFormForMed(0);
  assertEqual(getEl('medInput').value,  '', 'medInput ska vara tom');
  assertEqual(getEl('doseInput').value, '', 'doseInput ska vara tom');
  assertEqual(getEl('amtInput').value,  '', 'amtInput ska vara tom');
  assertEqual(getEl('refInput').value,  '', 'refInput ska vara tom');
});

test('renderFormForMed rensar befintliga fältfel', () => {
  ctx.setFieldError('medInput', 'Gammalt fel');
  setState(0, { medRaw: 'Nytt läkemedel' });
  ctx.renderFormForMed(0);
  const errEl = getEl('medInput-err');
  if (errEl) assert(!errEl.classList.contains('visible'), 'fältfel ska rensas vid renderFormForMed');
});

test('medRaw finns → FASS-länk visas', () => {
  setState(0, { medRaw: 'Elvanse 50 mg' });
  ctx.renderFormForMed(0);
  assert(!getEl('fassBtnForm').classList.contains('is-hidden'), 'FASS-länk ska vara synlig');
});

test('medRaw saknas → FASS-länk döljs', () => {
  setState(0, {});
  ctx.renderFormForMed(0);
  assert(getEl('fassBtnForm').classList.contains('is-hidden'), 'FASS-länk ska vara dold utan medRaw');
});

// ═══════════════════════════════════════════════════════════
// switchResultTab — flikar
// ═══════════════════════════════════════════════════════════

group('switchResultTab — flikar');

test('patient-flik → copyBodyResult innehåller patientText (sv)', () => {
  setState(0, makeValidState({ patientText: 'sv-patienttext', patientLang: 'sv' }));
  ctx.switchResultTab('patient');
  assertEqual(getEl('copyBodyResult').textContent, 'sv-patienttext', 'patientText ska visas');
});

test('patient-flik + patientLang en → patientTextEn visas', () => {
  setState(0, makeValidState({ patientText: 'sv-text', patientTextEn: 'en-text', patientLang: 'en' }));
  ctx.switchResultTab('patient');
  assertEqual(getEl('copyBodyResult').textContent, 'en-text', 'engelsk text ska visas');
});

test('journal-flik → copyBodyResult innehåller journalText', () => {
  setState(0, makeValidState({ journalText: 'Journaltext här.' }));
  ctx.switchResultTab('journal');
  assertEqual(getEl('copyBodyResult').textContent, 'Journaltext här.', 'journalText ska visas');
});

test('journal-flik → språkknappen döljs', () => {
  setState(0, makeValidState());
  ctx.switchResultTab('journal');
  assert(getEl('langBtnResult').classList.contains('is-hidden'), 'langBtnResult ska döljas på journal-fliken');
});

test('patient-flik → språkknappen visas', () => {
  setState(0, makeValidState({ patientTextEn: 'en-text' }));
  ctx.switchResultTab('patient');
  assert(!getEl('langBtnResult').classList.contains('is-hidden'), 'langBtnResult ska visas på patient-fliken');
});

// ═══════════════════════════════════════════════════════════
// saveFormValues — nullskydd
// ═══════════════════════════════════════════════════════════

group('saveFormValues — nullskydd');

test('alla obligatoriska fält finns → state uppdateras', () => {
  getEl('medInput').value  = 'Ritalin 10 mg';
  getEl('dateInput').value = '2025-01-01';
  getEl('doseInput').value = '1';
  getEl('amtInput').value  = '100';
  getEl('refInput').value  = '3';
  ctx.saveFormValues(0);
  // Hämta states[0] via renderFormForMed (som läser från state) istället för direkt access
  getEl('medInput').value = '';
  ctx.renderFormForMed(0);
  assertEqual(getEl('medInput').value, 'Ritalin 10 mg', 'state.medRaw ska ha sparats');
});

test('saveFormValues kastar inte när alla fält finns', () => {
  // Felfrihetstest: om funktionen kastar hamnar vi i failed-räknaren
  getEl('medInput').value  = 'Morfin 10 mg';
  getEl('dateInput').value = '2025-03-01';
  getEl('doseInput').value = '2';
  getEl('amtInput').value  = '50';
  getEl('refInput').value  = '1';
  ctx.saveFormValues(0); // ska inte kasta
});

// ═══════════════════════════════════════════════════════════
// renderResultForMed — metricsGrid
// ═══════════════════════════════════════════════════════════

group('renderResultForMed — metricsGrid');

test('tre metrics → tre .metric-element renderas', () => {
  setState(0, makeValidState());
  ctx.renderResultForMed(0);
  assertEqual(doc.querySelectorAll('#metricsGrid .metric').length, 3, 'antal metric-element');
});

test('metric med cls danger → metric-val har klassen danger', () => {
  setState(0, makeValidState({
    metrics: [
      { label: 'L1', value: 'V1', cls: 'danger', tooltip: '' },
      { label: 'L2', value: 'V2', cls: '',       tooltip: '' },
      { label: 'L3', value: 'V3', cls: '',       tooltip: '' },
    ],
  }));
  ctx.renderResultForMed(0);
  const firstVal = doc.querySelector('#metricsGrid .metric-val');
  assert(firstVal.classList.contains('danger'), 'metric-val ska ha klassen danger');
});

test('metric med tooltip → dataset.tooltip satt på .metric-elementet', () => {
  setState(0, makeValidState({
    metrics: [
      { label: 'L1', value: 'V1', cls: '', tooltip: 'Min tooltip' },
      { label: 'L2', value: 'V2', cls: '', tooltip: '' },
      { label: 'L3', value: 'V3', cls: '', tooltip: '' },
    ],
  }));
  ctx.renderResultForMed(0);
  const firstMetric = doc.querySelector('#metricsGrid .metric');
  assertEqual(firstMetric.dataset.tooltip, 'Min tooltip', 'dataset.tooltip ska sättas');
});

test('inga metrics → metricsGrid är tom', () => {
  setState(0, makeValidState({ metrics: [] }));
  ctx.renderResultForMed(0);
  assertEqual(doc.querySelectorAll('#metricsGrid .metric').length, 0, 'metricsGrid ska vara tom');
});


// ═══════════════════════════════════════════════════════════
// renderResultForMed — alerts
// ═══════════════════════════════════════════════════════════

group('renderResultForMed — alerts');

test('inga alerts → resultAlerts är tom', () => {
  setState(0, makeValidState({ alerts: [] }));
  ctx.renderResultForMed(0);
  assertEqual(getEl('resultAlerts').childElementCount, 0, 'resultAlerts ska vara tom');
});

test('en alert → resultAlerts innehåller ett barn-element', () => {
  setState(0, makeValidState({
    alerts: [{ type: 'warn', title: 'Testtitel', message: 'Testmeddelande.' }],
  }));
  ctx.renderResultForMed(0);
  assert(getEl('resultAlerts').childElementCount > 0, 'resultAlerts ska innehålla ett element');
});


// ═══════════════════════════════════════════════════════════
// renderResultForMed — verdictIcon
// ═══════════════════════════════════════════════════════════

group('renderResultForMed — verdictIcon');

test('OK-state → verdictIcon visar ✓', () => {
  setState(0, makeValidState());
  ctx.renderResultForMed(0);
  assertEqual(getEl('verdictIcon').textContent, '✓', 'verdictIcon ska vara ✓ vid OK');
});

test('isOveruse → verdictIcon visar ⚠', () => {
  setState(0, makeValidState({ isOveruse: true }));
  ctx.renderResultForMed(0);
  assertEqual(getEl('verdictIcon').textContent, '⚠', 'verdictIcon ska vara ⚠ vid overuse');
});

test('isTooEarly → verdictIcon visar !', () => {
  setState(0, makeValidState({ isTooEarly: true }));
  ctx.renderResultForMed(0);
  assertEqual(getEl('verdictIcon').textContent, '!', 'verdictIcon ska vara ! vid isTooEarly');
});


// ═══════════════════════════════════════════════════════════
// togglePatientLangResult
// ═══════════════════════════════════════════════════════════

group('togglePatientLangResult');

test('sv → en: patientTextEn visas i copyBodyResult efter toggle', () => {
  setState(0, makeValidState({
    patientText: 'sv-text', patientTextEn: 'en-text',
    patientLang: 'sv', activeTab: 'patient',
  }));
  ctx.togglePatientLangResult();
  assertEqual(getEl('copyBodyResult').textContent, 'en-text', 'patientTextEn ska visas efter toggle till engelska');
});

test('en → sv: patientText visas i copyBodyResult efter toggle', () => {
  setState(0, makeValidState({
    patientText: 'sv-text', patientTextEn: 'en-text',
    patientLang: 'en', activeTab: 'patient',
  }));
  ctx.togglePatientLangResult();
  assertEqual(getEl('copyBodyResult').textContent, 'sv-text', 'patientText ska visas efter toggle till svenska');
});

test('saknas patientTextEn → toggle är no-op, text förblir oförändrad', () => {
  setState(0, makeValidState({
    patientText: 'sv-text', patientTextEn: '',
    patientLang: 'sv', activeTab: 'patient',
  }));
  ctx.switchResultTab('patient');
  const before = getEl('copyBodyResult').textContent;
  ctx.togglePatientLangResult();
  assertEqual(getEl('copyBodyResult').textContent, before, 'text ska inte ändras när patientTextEn saknas');
});


// ═══════════════════════════════════════════════════════════
// renderPrescribePanel
// ═══════════════════════════════════════════════════════════

group('renderPrescribePanel');

test('valid:false → prescribePanel är dold', () => {
  setState(0, { valid: false });
  ctx.renderPrescribePanel(0);
  assert(getEl('prescribePanel').classList.contains('is-hidden'), 'prescribePanel ska vara dold');
});

test('isTooEarly utan beslut → prescribePanel är dold (canRenewMed = false)', () => {
  setState(0, makeValidState({ isTooEarly: true, earlyRenewalDecision: null }));
  ctx.renderPrescribePanel(0);
  assert(getEl('prescribePanel').classList.contains('is-hidden'), 'prescribePanel ska vara dold vid isTooEarly utan beslut');
});

test('valid, inga flaggor → prescribePanel är synlig', () => {
  setState(0, makeValidState());
  ctx.renderPrescribePanel(0);
  assert(!getEl('prescribePanel').classList.contains('is-hidden'), 'prescribePanel ska vara synlig vid OK-state');
});


// ═══════════════════════════════════════════════════════════
// buildMedList — isTooEarly
// ═══════════════════════════════════════════════════════════

group('buildMedList — isTooEarly');

test('isTooEarly utan override → status-dot har warn', () => {
  setState(0, makeValidState({ isTooEarly: true, earlyRenewalDecision: null }));
  ctx.buildMedList();
  assert(doc.querySelector('#medList .status-dot').classList.contains('warn'), 'warn saknas för isTooEarly');
});

test('isTooEarly med override yes → status-dot har ok, inte warn', () => {
  setState(0, makeValidState({ isTooEarly: true, earlyRenewalDecision: 'yes' }));
  ctx.buildMedList();
  const dot = doc.querySelector('#medList .status-dot');
  assert(dot.classList.contains('ok'),    'ok saknas när isTooEarly + override=yes');
  assert(!dot.classList.contains('warn'), 'warn ska inte finnas när override=yes');
});


// ═══════════════════════════════════════════════════════════
// switchResultTab — flik-aktiv-klass
// ═══════════════════════════════════════════════════════════

group('switchResultTab — flik-aktiv-klass');

test('journal-flik → journal-knappen har active, patient-knappen inte', () => {
  setState(0, makeValidState());
  ctx.switchResultTab('journal');
  const tabs       = doc.querySelectorAll('#copySection .copy-tab');
  const journalTab = Array.from(tabs).find(b => b.dataset.tab === 'journal');
  const patientTab = Array.from(tabs).find(b => b.dataset.tab === 'patient');
  assert(journalTab != null, 'journal-flik hittades inte i DOM');
  assert(patientTab != null, 'patient-flik hittades inte i DOM');
  assert(journalTab.classList.contains('active'),  'journal-flik ska ha active');
  assert(!patientTab.classList.contains('active'), 'patient-flik ska inte ha active');
});

test('patient-flik → patient-knappen har active, journal-knappen inte', () => {
  setState(0, makeValidState());
  ctx.switchResultTab('patient');
  const tabs       = doc.querySelectorAll('#copySection .copy-tab');
  const journalTab = Array.from(tabs).find(b => b.dataset.tab === 'journal');
  const patientTab = Array.from(tabs).find(b => b.dataset.tab === 'patient');
  assert(journalTab != null, 'journal-flik hittades inte i DOM');
  assert(patientTab != null, 'patient-flik hittades inte i DOM');
  assert(patientTab.classList.contains('active'),  'patient-flik ska ha active');
  assert(!journalTab.classList.contains('active'), 'journal-flik ska inte ha active');
});


// ═══════════════════════════════════════════════════════════
// buildPrescribeInner — paneluppbyggnad
// ═══════════════════════════════════════════════════════════

group('buildPrescribeInner — paneluppbyggnad');

test('läkemedelsnamn visas i panelen', () => {
  setState(0, makeValidState({ medRaw: 'Elvanse 50 mg', dose: 1, prescribedEndDateStr: '2025-06-01' }));
  ctx.__setPrescribeGlobals('months', 3, '');
  ctx.initPrescribeState(0, { packageSize: '30' });
  ctx.buildPrescribeInner(0);
  const nameEl = doc.querySelector('.prescribe-med-name');
  assert(nameEl !== null, '.prescribe-med-name ska finnas');
  assertEqual(nameEl.textContent, 'Elvanse 50 mg', 'läkemedelsnamn');
});

test('förpackningsstorlek fylls i från prescribeState', () => {
  setState(0, makeValidState({ dose: 1, prescribedEndDateStr: '2025-06-01' }));
  ctx.__setPrescribeGlobals('months', 3, '');
  ctx.initPrescribeState(0, { packageSize: '100' });
  ctx.buildPrescribeInner(0);
  assertEqual(getEl('ps-pkg-0').value, '100', 'packageSize');
});

test('månadsläge → select har 12 optioner och rätt månad vald', () => {
  setState(0, makeValidState({ dose: 1, prescribedEndDateStr: '2025-06-01' }));
  ctx.__setPrescribeGlobals('months', 5, '');
  ctx.initPrescribeState(0, { packageSize: '30' });
  ctx.buildPrescribeInner(0);
  ctx.buildPrescribeDuration();
  const sel = getEl('ps-global-months');
  assert(sel !== null, 'ps-global-months ska finnas');
  assertEqual(sel.options.length, 12, '12 optioner');
  assertEqual(sel.value, '5', 'månad 5 vald');
});

test('datumläge → datuminmatning visas med rätt värde', () => {
  setState(0, makeValidState({ dose: 1, prescribedEndDateStr: '2025-06-01' }));
  ctx.__setPrescribeGlobals('date', 1, '2025-09-15');
  ctx.initPrescribeState(0, { packageSize: '30' });
  ctx.buildPrescribeInner(0);
  ctx.buildPrescribeDuration();
  assert(getEl('ps-global-enddate') !== null, 'ps-global-enddate ska finnas');
  assertEqual(getEl('ps-global-enddate').value, '2025-09-15', 'endDate');
});

test('mode-toggle: rätt knapp är active', () => {
  setState(0, makeValidState({ dose: 1, prescribedEndDateStr: '2025-06-01' }));
  ctx.__setPrescribeGlobals('date', 1, '');
  ctx.initPrescribeState(0, { packageSize: '30' });
  ctx.buildPrescribeInner(0);
  ctx.buildPrescribeDuration();
  const btns = doc.querySelectorAll('.prescribe-mode-btn');
  const dateBtn = Array.from(btns).find(b => b.textContent === 'Datum');
  const monthBtn = Array.from(btns).find(b => b.textContent === 'Månader');
  assert(dateBtn && dateBtn.classList.contains('active'), 'Datum-knapp ska vara active');
  assert(monthBtn && !monthBtn.classList.contains('active'), 'Månader-knapp ska inte vara active');
});


// ═══════════════════════════════════════════════════════════
// updatePrescribeResult — resultatvisning
// ═══════════════════════════════════════════════════════════

group('updatePrescribeResult — resultatvisning');

test('giltig indata → förpackningsantal visas', () => {
  // prescribedEnd passerat (2025-06-01) → startDate = idag (2025-06-15)
  // 3 månader: 2025-06-15 → 2025-09-15 = 92 dagar; 92 tabletter ÷ 30 st/förp = 4 förp
  setState(0, makeValidState({ dose: 1, prescribedEndDateStr: '2025-06-01' }));
  ctx.__setPrescribeGlobals('months', 3, '');
  ctx.initPrescribeState(0, { packageSize: '30' });
  ctx.buildPrescribeInner(0);
  const pkgEl = doc.querySelector('.prescribe-result-packages');
  assert(pkgEl !== null, '.prescribe-result-packages ska finnas');
  assertEqual(pkgEl.textContent, '4', '92 dagar ÷ 30 st/förp = 4 förp');
});

test('befintligt recept täcker hela perioden → "täcker redan" visas', () => {
  // prescribedEnd 120 dagar fram (2025-10-13) > 3-månadersmål (2025-09-15)
  // → befintligt recept täcker hela den begärda perioden
  setState(0, makeValidState({ dose: 1, prescribedEndDateStr: '2025-10-13' }));
  ctx.__setPrescribeGlobals('months', 3, '');
  ctx.initPrescribeState(0, { packageSize: '30' });
  ctx.buildPrescribeInner(0);
  const coveredEl = doc.querySelector('.prescribe-result-covered');
  assert(coveredEl !== null, '.prescribe-result-covered ska finnas');
  assertContains(coveredEl.textContent, 'täcker redan', 'meddelande om befintlig täckning');
});

test('tom packageSize → hint visas i resultatrutan', () => {
  setState(0, makeValidState({ dose: 1, prescribedEndDateStr: '2025-06-01' }));
  ctx.__setPrescribeGlobals('months', 3, '');
  ctx.initPrescribeState(0, { packageSize: '' });
  ctx.buildPrescribeInner(0);
  const box = getEl('ps-result-0');
  assert(box.children.length > 0, 'resultatrutan ska ha innehåll');
  assertContains(box.textContent, 'förpackningsstorlek', 'hint om förpackningsstorlek');
});


// ═══════════════════════════════════════════════════════════
// setEarlyDecision — kliniskt beslut
// ═══════════════════════════════════════════════════════════

group('setEarlyDecision — kliniskt beslut');

// Hjälpfunktion: state med alla fält som buildJournalText behöver vid overuse
function makeOveruseState(overrides = {}) {
  return makeValidState({
    isOveruse: true, isTooEarly: false, earlyRenewalDecision: null,
    verdictTitle: 'För tidig förnyelse – bedömning krävs',
    verdictSub: 'Snitt 1.50 st/dag överstiger ordination med >10%.',
    statusText: 'För tidig förnyelse',
    dose: 1, pDateStr: '2024-09-28', total: 300,
    prescribedEndDateStr: '2025-09-01',
    displayAvgStr: '1.50 st/dag',
    avgNote: '(beräknat under antagandet att alla tillgängliga doser är förbrukade)',
    remainingDoses: null, daysRemaining: 78, daysToPrescribedEnd: 78,
    tlPct: 80, tlStart: '2024-09-28', tlEnd: '2025-09-01',
    ...overrides,
  });
}

function makeTooEarlyState(overrides = {}) {
  return makeValidState({
    isOveruse: false, isTooEarly: true, earlyRenewalDecision: null,
    verdictTitle: 'För tidigt – 78 dagar kvar',
    verdictSub: 'Förbrukning OK. Kontakta vården närmre slutdatumet.',
    statusText: 'För tidigt — 78d kvar',
    dose: 1, pDateStr: '2024-09-28', total: 300,
    prescribedEndDateStr: '2025-09-01',
    displayAvgStr: '1.00 st/dag',
    avgNote: '(beräknat under antagandet att alla tillgängliga doser är förbrukade)',
    remainingDoses: null, daysRemaining: 78, daysToPrescribedEnd: 78,
    tlPct: 80, tlStart: '2024-09-28', tlEnd: '2025-09-01',
    ...overrides,
  });
}

test('"yes" på isOveruse → verdictBox får verdict-ok', () => {
  setState(0, makeOveruseState());
  ctx.setEarlyDecision('yes');
  assert(!getEl('verdictBox').classList.contains('verdict-danger'), 'verdict-danger ska vara borta');
  assert(getEl('verdictBox').classList.contains('verdict-ok'), 'verdict-ok ska finnas efter yes');
});

test('"no" på isOveruse → verdictBox behåller verdict-danger', () => {
  setState(0, makeOveruseState());
  ctx.setEarlyDecision('no');
  assert(getEl('verdictBox').classList.contains('verdict-danger'), 'verdict-danger ska bestå efter no');
  assert(!getEl('verdictBox').classList.contains('verdict-ok'), 'verdict-ok ska inte finnas efter no');
});

test('"yes" på isTooEarly → verdictBox får verdict-ok', () => {
  setState(0, makeTooEarlyState());
  ctx.setEarlyDecision('yes');
  assert(!getEl('verdictBox').classList.contains('verdict-warn'), 'verdict-warn ska vara borta');
  assert(getEl('verdictBox').classList.contains('verdict-ok'), 'verdict-ok ska finnas efter yes');
});

test('"no" på isTooEarly → verdictBox behåller verdict-warn', () => {
  setState(0, makeTooEarlyState());
  ctx.setEarlyDecision('no');
  assert(getEl('verdictBox').classList.contains('verdict-warn'), 'verdict-warn ska bestå efter no');
  assert(!getEl('verdictBox').classList.contains('verdict-ok'), 'verdict-ok ska inte finnas efter no');
});

test('OK-state → setEarlyDecision är no-op, verdict förblir OK', () => {
  setState(0, makeValidState({ isOveruse: false, isTooEarly: false }));
  ctx.renderResultForMed(0);
  ctx.setEarlyDecision('yes');
  assert(getEl('verdictBox').classList.contains('verdict-ok'), 'verdict-ok ska bestå vid OK-state');
});


// ═══════════════════════════════════════════════════════════
// generateAndDistribute — textdistribution
// ═══════════════════════════════════════════════════════════

group('generateAndDistribute — textdistribution');

test('inga giltiga states → patientText töms', () => {
  setState(0, { valid: false });
  ctx.generateAndDistribute();
  // renderResultForMed anropas med activeMedIdx=0; valid=false → emptyState syns
  assert(getEl('resultContent').classList.contains('is-hidden'), 'resultContent ska vara dolt');
  assert(!getEl('resultEmptyState').classList.contains('is-hidden'), 'emptyState ska synas');
});

test('två OK-states → patientText innehåller båda läkemedelsnamnen', () => {
  setState(0, makeValidState({
    medRaw: 'Elvanse 50 mg', dose: 1, pDateStr: '2024-09-28', total: 300,
    prescribedEndDateStr: '2025-09-01', displayAvgStr: '1.00 st/dag',
    avgNote: '(test)', remainingDoses: null, daysToPrescribedEnd: 78,
    tlPct: 80, tlStart: '2024-09-28', tlEnd: '2025-09-01',
  }));
  setState(1, makeValidState({
    medRaw: 'Melatonin 3 mg', dose: 1, pDateStr: '2024-10-01', total: 200,
    prescribedEndDateStr: '2025-09-15', displayAvgStr: '1.00 st/dag',
    avgNote: '(test)', remainingDoses: null, daysToPrescribedEnd: 92,
    tlPct: 70, tlStart: '2024-10-01', tlEnd: '2025-09-15',
  }));
  ctx.generateAndDistribute();
  ctx.switchResultTab('patient');
  const bodyText = getEl('copyBodyResult').textContent;
  assertContains(bodyText, 'Elvanse 50 mg', 'första läkemedlet');
  assertContains(bodyText, 'Melatonin 3 mg', 'andra läkemedlet');
});

test('ett OK + ett isTooEarly → patientText innehåller förnyelsebesked och avslag', () => {
  setState(0, makeValidState({
    medRaw: 'Elvanse 50 mg', dose: 1, pDateStr: '2024-09-28', total: 300,
    prescribedEndDateStr: '2025-09-01', displayAvgStr: '1.00 st/dag',
    avgNote: '(test)', remainingDoses: null, daysToPrescribedEnd: 78,
    tlPct: 80, tlStart: '2024-09-28', tlEnd: '2025-09-01',
  }));
  setState(1, makeTooEarlyState({ medRaw: 'Melatonin 3 mg' }));
  ctx.generateAndDistribute();
  ctx.switchResultTab('patient');
  const bodyText = getEl('copyBodyResult').textContent;
  assertContains(bodyText, '2–3 arbetsdagar', 'Elvanse ska förnyas');
  assertContains(bodyText, 'Melatonin 3 mg', 'Melatonin ska nämnas');
});


// ═══════════════════════════════════════════════════════════
// buildPeriodContainer — långvarig flik
// ═══════════════════════════════════════════════════════════

group('buildPeriodContainer — långvarig flik');

test('en period → tre inputfält renderas (start, total, end)', () => {
  ctx.resetLtPeriods();
  ctx.buildPeriodContainer();
  assert(getEl('lt-start-0') !== null, 'lt-start-0 ska finnas');
  assert(getEl('lt-total-0') !== null, 'lt-total-0 ska finnas');
  assert(getEl('lt-end-0') !== null, 'lt-end-0 ska finnas');
});

test('första perioden saknar ta-bort-knapp', () => {
  ctx.resetLtPeriods();
  ctx.buildPeriodContainer();
  const container = getEl('lt-periods-container');
  const removeBtns = container.querySelectorAll('[data-action="remove-period"]');
  assertEqual(removeBtns.length, 0, 'period 0 ska inte ha ta-bort-knapp');
});

test('två perioder → andra perioden har ta-bort-knapp', () => {
  ctx.resetLtPeriods();
  ctx.pushLtPeriod();
  ctx.buildPeriodContainer();
  const container = getEl('lt-periods-container');
  const removeBtns = container.querySelectorAll('[data-action="remove-period"]');
  assert(removeBtns.length >= 1, 'period 1 ska ha ta-bort-knapp');
});


// ═══════════════════════════════════════════════════════════
// calcLongterm — DOM-skal
// ═══════════════════════════════════════════════════════════

group('calcLongterm — DOM-skal');

// Hjälpare: ställ in ltPeriods med giltiga datum relativt mockat idag (2025-06-15)
function setupLtPeriods(periods) {
  ctx.resetLtPeriods();
  periods.forEach((p, i) => {
    if (i > 0) ctx.pushLtPeriod();
    ctx.setLtPeriodField(i, 'start', p.start);
    ctx.setLtPeriodField(i, 'total', p.total);
    ctx.setLtPeriodField(i, 'end', p.end);
  });
}

test('giltig indata → resultat visas', () => {
  getEl('lt-med').value = 'Elvanse 50 mg';
  getEl('lt-dose').value = '1';
  setupLtPeriods([{ start: '2025-03-15', total: '90', end: '2025-06-15' }]);
  ctx.calcLongterm();
  assertEqual(getEl('lt-result').style.display, 'flex', 'lt-result ska vara synlig');
});

test('saknat läkemedelsnamn → resultat döljs', () => {
  getEl('lt-med').value = '';
  getEl('lt-dose').value = '1';
  setupLtPeriods([{ start: '2025-03-15', total: '90', end: '2025-06-15' }]);
  ctx.calcLongterm();
  assertNotEqual(getEl('lt-result').style.display, 'flex', 'lt-result ska vara dold');
});

test('giltig indata → resultGrid innehåller analyslängd', () => {
  getEl('lt-med').value = 'Ritalin 10 mg';
  getEl('lt-dose').value = '1';
  // 2025-03-15 → 2025-06-15 = 92 dagar (16+30+31+15)
  setupLtPeriods([{ start: '2025-03-15', total: '90', end: '2025-06-15' }]);
  ctx.calcLongterm();
  const gridText = getEl('lt-resGrid').textContent;
  assertContains(gridText, '92 dagar', 'analyslängd ska visas');
  assertContains(gridText, '90 st', 'total tabletter ska visas');
});

test('giltig indata → FASS-länk visas', () => {
  getEl('lt-med').value = 'Elvanse 50 mg';
  getEl('lt-dose').value = '1';
  setupLtPeriods([{ start: '2025-03-15', total: '90', end: '2025-06-15' }]);
  ctx.calcLongterm();
  assert(!getEl('lt-fassBtn').classList.contains('is-hidden'), 'FASS-länk ska vara synlig (is-hidden borttagen)');
});

test('giltig indata → copySection visas med journalText', () => {
  getEl('lt-med').value = 'Elvanse 50 mg';
  getEl('lt-dose').value = '1';
  setupLtPeriods([{ start: '2025-03-15', total: '90', end: '2025-06-15' }]);
  ctx.calcLongterm();
  assertNotEqual(getEl('lt-copySection').style.display, 'none', 'lt-copySection ska vara synlig');
  assertContains(getEl('lt-copyBody').textContent, 'Elvanse 50 mg', 'journalText ska innehålla läkemedelsnamn');
});


// ═══════════════════════════════════════════════════════════
// SAMMANFATTNING
// ═══════════════════════════════════════════════════════════

console.log(`\n${'─'.repeat(48)}`);
console.log(`${passed} klarade  |  ${failed} misslyckades`);
process.exit(failed > 0 ? 1 : 0);
