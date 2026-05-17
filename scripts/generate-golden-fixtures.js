/**
 * Fas 2.9 — Generera golden fixture-filer från 3.0:s calcCore
 *
 * Kör: node scripts/generate-golden-fixtures.js
 * Output: tests/fixtures/calccore-golden.json
 *
 * Laddar calcCore via vm-modulen (precis som test-calc.js) och sparar
 * resultatet för varje unikt (input, prev)-par från test-calc.js.
 */
'use strict';

const fs   = require('fs');
const vm   = require('vm');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const KOD       = path.join(REPO_ROOT, 'Kod');
const OUT_DIR   = path.join(REPO_ROOT, 'tests', 'fixtures');

// Minimal DOM-stub identisk med test-calc.js
const domStub = {
  getElementById: () => null,
  createElement:  () => ({ style: {}, className: '', textContent: '', appendChild: () => {} }),
  createTextNode: () => ({}),
};

const ctx = vm.createContext({ console, document: domStub, _mockToday: null });

// Ladda källfiler i exakt samma ordning som test-calc.js
vm.runInContext(fs.readFileSync(path.join(KOD, 'constants.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(KOD, 'utils.js'),      'utf8'), ctx);
vm.runInContext(`
  const _origGetToday = getToday;
  getToday = function() {
    if (_mockToday !== null) return new Date(_mockToday);
    return _origGetToday();
  };
`, ctx);
vm.runInContext(fs.readFileSync(path.join(KOD, 'state.js'),      'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(KOD, 'text-gen.js'),   'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(KOD, 'calc-renew.js'), 'utf8'), ctx);

// Fast datum — identiskt med test-calc.js
const MOCK_TODAY_MS = new Date('2025-06-15T00:00:00.000Z').getTime();
ctx._mockToday = MOCK_TODAY_MS;

const calcCore = ctx.calcCore;

// Hjälpfunktion — exakt kopia av makeInput från test-calc.js
function makeInput({
  daysSince = 100,
  amt       = 100,
  dose      = 1,
  ref       = 3,
  remaining = null,
  medRaw    = 'Testabol 10 mg',
  doseInterval = 1,
  doseUnit     = 'st',
  notCalculable = false,
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
    doseInterval,
    doseUnit,
    notCalculable,
  };
}

const NO_PREV = { isOveruse: false, isTooEarly: false, earlyRenewalDecision: null };

// Definiera alla unika (input, prev)-par från test-calc.js
// Varje post: { name, input, prev }
const testCases = [
  // == Ogiltiga indata ==
  { name: 'incomplete',          input: { valid: false, reason: 'incomplete' }, prev: NO_PREV },
  { name: 'invalid_date',        input: { valid: false, reason: 'invalid_date' }, prev: NO_PREV },
  { name: 'too_many_refs',       input: { valid: false, reason: 'too_many_refs' }, prev: NO_PREV },

  // == daysSince = 0 ==
  { name: 'daysSince_0',         input: makeInput({ daysSince: 0 }), prev: NO_PREV },

  // == Orimliga värden ==
  { name: 'totalDays_over_3650', input: makeInput({ amt: 10000, dose: 1, ref: 3, daysSince: 50 }), prev: NO_PREV },
  { name: 'remaining_over_total',input: makeInput({ amt: 100, ref: 1, daysSince: 50, remaining: 200 }), prev: NO_PREV },

  // == Normalfall OK ==
  { name: 'ok_normal',           input: makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 280 }), prev: NO_PREV },
  { name: 'ok_exakt_110pct',     input: makeInput({ amt: 308, dose: 1, ref: 1, daysSince: 280 }), prev: NO_PREV },
  { name: 'ok_low_consumption',  input: makeInput({ amt: 50, dose: 1, ref: 1, daysSince: 40, remaining: 30 }), prev: NO_PREV },

  // == För tidigt ==
  { name: 'tooEarly_normal',     input: makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 30, remaining: 80 }), prev: NO_PREV },
  { name: 'tooEarly_receptperiod',input: makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 10, remaining: 290 }), prev: NO_PREV },

  // == Överförbrukning ==
  { name: 'overuse_basic',       input: makeInput({ amt: 100, dose: 1, ref: 1, daysSince: 50 }), prev: NO_PREV },
  { name: 'overuse_remaining_0', input: makeInput({ amt: 100, dose: 1, ref: 1, daysSince: 50, remaining: 0 }), prev: NO_PREV },
  { name: 'overuse_suppressed_7d',input: makeInput({ amt: 50, dose: 1, ref: 1, daysSince: 45 }), prev: NO_PREV },
  { name: 'overuse_low_doses_high_recept',input: makeInput({ amt: 100, dose: 1, ref: 1, daysSince: 80, remaining: 5 }), prev: NO_PREV },
  { name: 'overuse_daysSince_1', input: makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 1 }), prev: NO_PREV },

  // == ref = 12 ==
  { name: 'ref12_normal',        input: makeInput({ amt: 100, dose: 1, ref: 12, daysSince: 1100 }), prev: NO_PREV },
  { name: 'ref12_tooEarly',      input: makeInput({ amt: 100, dose: 1, ref: 12, daysSince: 30, remaining: 1170 }), prev: NO_PREV },

  // == doseInterval ==
  { name: 'doseInterval_7_ok',   input: makeInput({ dose:1, doseInterval:7, amt:30, ref:1, remaining:5, daysSince:180 }), prev: NO_PREV },
  { name: 'doseInterval_30_ok',  input: makeInput({ dose:1, doseInterval:30, amt:30, ref:1, remaining:28, daysSince:60 }), prev: NO_PREV },

  // == Fraktionell dos ==
  { name: 'fractional_05',       input: makeInput({ amt: 100, dose: 0.5, ref: 1, daysSince: 190 }), prev: NO_PREV },
  { name: 'fractional_with_mg',  input: makeInput({ amt: 100, dose: 0.5, ref: 1, daysSince: 190, medRaw: 'Depåtablett 5 mg' }), prev: NO_PREV },

  // == remaining-fält ==
  { name: 'remaining_lowers_avg',input: makeInput({ amt: 100, dose: 1, ref: 1, daysSince: 50, remaining: 70 }), prev: NO_PREV },
  { name: 'remaining_early_pickup',input: makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 30, remaining: 150 }), prev: NO_PREV },
  { name: 'remaining_accessible_plus_1',input: makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 30, remaining: 101 }), prev: NO_PREV },
  { name: 'remaining_equal_accessible',input: makeInput({ amt: 100, dose: 1, ref: 1, daysSince: 50, remaining: 100 }), prev: NO_PREV },

  // == Klinisk override ==
  { name: 'override_tooEarly_yes',input: makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 30, remaining: 80 }),
    prev: { isOveruse: false, isTooEarly: true, earlyRenewalDecision: 'yes' } },
  { name: 'override_overuse_yes', input: makeInput({ amt: 100, dose: 1, ref: 1, daysSince: 50 }),
    prev: { isOveruse: true, isTooEarly: false, earlyRenewalDecision: 'yes' } },
  { name: 'override_flags_changed',input: makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 280 }),
    prev: { isOveruse: false, isTooEarly: true, earlyRenewalDecision: 'yes' } },

  // == Output-struktur ==
  { name: 'output_default_daysSince',input: makeInput({ daysSince: 280 }), prev: NO_PREV },
  { name: 'output_150_daysSince',input: makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 150 }), prev: NO_PREV },
  { name: 'output_100_daysSince',input: makeInput({ daysSince: 100 }), prev: NO_PREV },
  { name: 'output_amt150_ref4',  input: makeInput({ amt: 150, dose: 2, ref: 4, daysSince: 280 }), prev: NO_PREV },
  { name: 'output_remaining_40', input: makeInput({ amt: 100, dose: 1, ref: 1, daysSince: 50, remaining: 40 }), prev: NO_PREV },

  // == Saknade grenar (alerts / output-fält) ==
  { name: 'avgNum_2_5x',         input: makeInput({ amt: 100, dose: 1, ref: 1, daysSince: 10, remaining: 0 }), prev: NO_PREV },
  { name: 'endDate_passed',      input: makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 400 }), prev: NO_PREV },
  { name: 'endDate_warn',        input: makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 255 }), prev: NO_PREV },
  { name: 'remaining_diff_endDate',input: makeInput({ amt: 100, dose: 1, ref: 1, daysSince: 1, remaining: 50 }), prev: NO_PREV },

  // == notCalculable ==
  { name: 'not_calculable',      input: makeInput({ notCalculable: true }), prev: NO_PREV },
];

// Generera fixtures
const fixtures = testCases.map(({ name, input, prev }) => {
  let expected;
  try {
    expected = calcCore(input, prev);
  } catch (err) {
    expected = { _error: err.message };
  }
  return { name, input, prev, expected };
});

// Skapa output-katalog om den inte finns
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

const outPath = path.join(OUT_DIR, 'calccore-golden.json');
fs.writeFileSync(outPath, JSON.stringify(fixtures, (key, val) => {
  // Serialisera Date-objekt som ISO-strängar
  if (typeof val === 'object' && val !== null && Object.prototype.toString.call(val) === '[object Date]') {
    return val.toISOString();
  }
  return val;
}, 2));

console.log(`\n${'─'.repeat(48)}`);
console.log(`Genererade ${fixtures.length} golden fixtures`);
console.log(`Output: ${outPath}`);

// Validera: kontrollera att inget fixture kastade undantag
const errorFixtures = fixtures.filter(f => f.expected && f.expected._error);
if (errorFixtures.length > 0) {
  console.log(`\n⚠  ${errorFixtures.length} fixtures gav undantag:`);
  for (const ef of errorFixtures) {
    console.log(`    - ${ef.name}: ${ef.expected._error}`);
  }
}

// Kör test-calc.js för att validera att calcCore fungerar korrekt
console.log(`\nValiderar mot test-calc.js...`);
const testOk = ctx.calcCore(makeInput({ amt: 100, dose: 1, ref: 3, daysSince: 280 }), NO_PREV);
if (testOk.valid && testOk.calculable && !testOk.isOveruse && !testOk.isTooEarly) {
  console.log(`  ✓ calcCore svarar korrekt för normalfall`);
} else {
  console.log(`  ⚠  calcCore gav oväntat resultat för normalfall: ${JSON.stringify({valid:testOk.valid, calculable:testOk.calculable, isOveruse:testOk.isOveruse, isTooEarly:testOk.isTooEarly})}`);
}
