'use strict';

var fs   = require('fs');
var vm   = require('vm');
var path = require('path');

// ── SETUP: VM-kontext med minimal DOM-stub ──
var domStub = {
  getElementById: function() { return null; },
  createElement:  function() { return { style: {}, className: '', textContent: '', appendChild: function() {} }; },
  createTextNode: function() { return {}; },
};

var ctx = vm.createContext({ console: console, document: domStub });

// Ladda beroenden (samma ordning som index.html)
vm.runInContext(fs.readFileSync(path.join(__dirname, 'utils.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'state.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'interactions.js'), 'utf8'), ctx);

// Verifiera att CHECK_INTERACTIONS laddades
if (typeof ctx.CHECK_INTERACTIONS !== 'function') {
  console.error('FEL: CHECK_INTERACTIONS kunde inte laddas.');
  process.exit(1);
}

var CHECK_INTERACTIONS = ctx.CHECK_INTERACTIONS;
var atcMatches         = ctx.atcMatches;

// ── TESTVERKTYG ──
var passed = 0, failed = 0;

function group(name) {
  console.log('\n' + name);
}

function test(name, fn) {
  try {
    fn();
    console.log('  \u2713 ' + name);
    passed++;
  } catch (e) {
    console.error('  \u2717 ' + name);
    console.error('    \u2192 ' + e.message);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Villkor uppfylls inte');
}

function assertEqual(actual, expected, label) {
  if (actual !== expected)
    throw new Error((label ? label + ': ' : '') + 'f\u00f6rv\u00e4ntade ' + JSON.stringify(expected) + ', fick ' + JSON.stringify(actual));
}

// ── TESTER ──

// ===== atcMatches =====
group('atcMatches');

test('exakt prefix-match (N06AB04 startswith N06AB)', function() {
  assert(atcMatches('N06AB04', 'N06AB'), 'N06AB04 b\u00f6r matcha N06AB som prefix');
});

test('ingen match (N06AX b\u00f6rjar inte med N06AB)', function() {
  assert(!atcMatches('N06AX16', 'N06AB'), 'N06AX ska inte matcha N06AB');
});

test('null ATC returnerar false', function() {
  assert(!atcMatches(null, 'N06AB'), 'null ATC ska returnera false');
});

test('undefined ATC returnerar false', function() {
  assert(!atcMatches(undefined, 'N06AB'), 'undefined ATC ska returnera false');
});

test('hela ATC-koden matchar sig sj\u00e4lv', function() {
  assert(atcMatches('B01AA03', 'B01AA03'), 'hel kod matchar sig sj\u00e4lv som prefix');
});

// ===== CHECK_INTERACTIONS \u2014 tomma indata =====
group('CHECK_INTERACTIONS \u2014 tomma indata');

test('tom array \u2192 tomt resultat', function() {
  var result = CHECK_INTERACTIONS([]);
  assert(Array.isArray(result), 'ska returnera en array');
  assertEqual(result.length, 0, 'l\u00e4ngd');
});

test('ett l\u00e4kemedel \u2192 tomt (inget par att kontrollera)', function() {
  var result = CHECK_INTERACTIONS([{ i: 0, a: 'N06AB04' }]);
  assertEqual(result.length, 0, 'l\u00e4ngd');
});

test('tv\u00e5 l\u00e4kemedel utan ATC \u2192 tomt', function() {
  var result = CHECK_INTERACTIONS([{ i: 0, a: null }, { i: 1, a: null }]);
  assertEqual(result.length, 0, 'l\u00e4ngd');
});

test('ett med ATC, ett utan \u2192 tomt', function() {
  var result = CHECK_INTERACTIONS([{ i: 0, a: 'N06AB04' }, { i: 1, a: null }]);
  assertEqual(result.length, 0, 'l\u00e4ngd');
});

// ===== CHECK_INTERACTIONS \u2014 k\u00e4nda interaktioner =====
group('CHECK_INTERACTIONS \u2014 k\u00e4nda interaktioner');

test('SSRI + MAO-h\u00e4mmare \u2192 danger', function() {
  var result = CHECK_INTERACTIONS([
    { i: 0, a: 'N06AB04' },  // citalopram
    { i: 1, a: 'N06AF05' },  // fenelzin
  ]);
  assert(result.length >= 1, 'ska ge minst en varning');
  assert(result[0].s === 'danger', 'severity ska vara danger');
  assert(result[0].drugs[0] === 0 && result[0].drugs[1] === 1, 'drugs ska referera till r\u00e4tt index');
});

test('warfarin + NSAID \u2192 danger', function() {
  var result = CHECK_INTERACTIONS([
    { i: 0, a: 'B01AA03' },  // warfarin
    { i: 1, a: 'M01AE01' },  // ibuprofen
  ]);
  assert(result.length >= 1);
  assert(result[0].s === 'danger');
});

test('ACE-h\u00e4mmare + kaliumsparande diuretika \u2192 danger', function() {
  var result = CHECK_INTERACTIONS([
    { i: 0, a: 'C09AA02' },  // enalapril
    { i: 1, a: 'C03DA01' },  // spironolakton
  ]);
  assert(result.length >= 1);
  assert(result[0].s === 'danger');
});

test('paracetamol + kalcium \u2192 ingen varning', function() {
  var result = CHECK_INTERACTIONS([
    { i: 0, a: 'N02BE01' },  // paracetamol
    { i: 1, a: 'A12AA04' },  // kalcium
  ]);
  assertEqual(result.length, 0, 'l\u00e4ngd');
});

test('dubbelriktad matchning (ordning spelar ingen roll)', function() {
  var r1 = CHECK_INTERACTIONS([
    { i: 0, a: 'N06AB04' },  // SSRI
    { i: 1, a: 'N02AX02' },  // tramadol
  ]);
  var r2 = CHECK_INTERACTIONS([
    { i: 0, a: 'N02AX02' },  // tramadol f\u00f6rst
    { i: 1, a: 'N06AB04' },  // SSRI andra
  ]);
  assert(r1.length >= 1 && r2.length >= 1, 'b\u00e5da ska ge varning');
  assertEqual(r1[0].t, r2[0].t, 'samma titel');
});

test('prefix-matchning (ATC-kod startswith m\u00f6nster)', function() {
  var result = CHECK_INTERACTIONS([
    { i: 0, a: 'N06AB10' },  // escitalopram (N06AB* matchar SSRI)
    { i: 1, a: 'N02AX02' },  // tramadol
  ]);
  assert(result.length >= 1, 'escitalopram + tramadol ska flaggas');
});

// ===== Tier 1 \u2014 nya interaktioner =====
group('Tier 1 \u2014 nya interaktioner');

test('NSAID + SSRI \u2192 \u00f6kad bl\u00f6dningsrisk', function() {
  var result = CHECK_INTERACTIONS([
    { i: 0, a: 'M01AE01' },  // ibuprofen
    { i: 1, a: 'N06AB04' },  // citalopram
  ]);
  var found = result.some(function(w) { return w.t === '\u00d6kad bl\u00f6dningsrisk' && w.s === 'warn'; });
  assert(found, 'NSAID + SSRI ska ge warn f\u00f6r bl\u00f6dningsrisk');
});

test('warfarin + metronidazol \u2192 danger', function() {
  var result = CHECK_INTERACTIONS([
    { i: 0, a: 'B01AA03' },
    { i: 1, a: 'J01XD01' },
  ]);
  assert(result.length >= 1);
  assert(result[0].s === 'danger');
});

test('warfarin + flukonazol \u2192 danger', function() {
  var result = CHECK_INTERACTIONS([
    { i: 0, a: 'B01AA03' },
    { i: 1, a: 'J02AC01' },
  ]);
  assert(result.length >= 1);
  assert(result[0].s === 'danger');
});

test('warfarin + ciprofloxacin \u2192 danger', function() {
  var result = CHECK_INTERACTIONS([
    { i: 0, a: 'B01AA03' },
    { i: 1, a: 'J01MA02' },
  ]);
  assert(result.length >= 1);
  assert(result[0].s === 'danger');
});

test('metotrexat + penicillin \u2192 danger', function() {
  var result = CHECK_INTERACTIONS([
    { i: 0, a: 'L04AX03' },
    { i: 1, a: 'J01CE02' },  // penicillin V
  ]);
  assert(result.length >= 1);
  assert(result[0].s === 'danger');
  assert(result[0].t === '\u00d6kad metotrexattoxicitet');
});

test('simvastatin + amlodipin \u2192 warn', function() {
  var result = CHECK_INTERACTIONS([
    { i: 0, a: 'C10AA01' },
    { i: 1, a: 'C08CA01' },
  ]);
  assert(result.length >= 1);
  assert(result[0].s === 'warn');
  assert(result[0].t.indexOf('statinkoncentration') >= 0, 'titeln ska n\u00e4mna statinkoncentration');
});

test('NSAID + ACE-h\u00e4mmare \u2192 warn', function() {
  var result = CHECK_INTERACTIONS([
    { i: 0, a: 'M01AE01' },
    { i: 1, a: 'C09AA02' },  // enalapril
  ]);
  var found = result.some(function(w) { return w.t === 'Minskad antihypertensiv effekt och njurp\u00e5verkan' && w.drugs[0] === 0 && w.drugs[1] === 1; });
  assert(found, 'NSAID + ACE ska ge warn');
});

test('NSAID + ARB \u2192 warn', function() {
  var result = CHECK_INTERACTIONS([
    { i: 0, a: 'M01AE01' },
    { i: 1, a: 'C09CA01' },  // losartan
  ]);
  assert(result.length >= 1);
  assert(result[0].s === 'warn');
});

test('NSAID + tiazid \u2192 warn', function() {
  var result = CHECK_INTERACTIONS([
    { i: 0, a: 'M01AE01' },
    { i: 1, a: 'C03AA03' },  // HCT
  ]);
  assert(result.length >= 1);
  assert(result[0].s === 'warn');
});

test('NSAID + loopdiuretika \u2192 warn', function() {
  var result = CHECK_INTERACTIONS([
    { i: 0, a: 'M01AE01' },
    { i: 1, a: 'C03CA01' },  // furosemid
  ]);
  assert(result.length >= 1);
  assert(result[0].s === 'warn');
});

test('fluorokinoloner + NSAID \u2192 warn (kramptr\u00f6skel)', function() {
  var result = CHECK_INTERACTIONS([
    { i: 0, a: 'J01MA12' },  // moxifloxacin
    { i: 1, a: 'M01AE01' },
  ]);
  assert(result.length >= 1);
  assert(result[0].s === 'warn');
  assert(result[0].t.indexOf('kramptr\u00f6skel') >= 0, 'titeln ska n\u00e4mna kramptr\u00f6skel');
});

// ===== Dedup =====
group('Deduplicering');

test('samma titel + samma l\u00e4kemedelspar \u2192 endast en varning', function() {
  // Warfarin + NSAID och Warfarin + ASA har b\u00e5da "Ökad blödningsrisk"
  // men olika ATC-par. Testa med ett par som bara har EN regel.
  var result = CHECK_INTERACTIONS([
    { i: 0, a: 'B01AA03' },  // warfarin
    { i: 1, a: 'M01AE01' },  // NSAID
  ]);
  // Warfarin + NSAID matchar en regel, ska ge exakt 1 varning
  // (inte 2: en via a=M01A/b=B01AA03 och en via a=B01AA03/b=M01A)
  assertEqual(result.length, 1, 'exakt en varning');
});

test('samma titel + olika l\u00e4kemedelspar \u2192 tv\u00e5 separata varningar', function() {
  // enalapril (ACE) + ibuprofen (NSAID) och enalapril + ASA
  // b\u00e5da genererar "Minskad antihypertensiv effekt och njurp\u00e5verkan" men olika par
  var result = CHECK_INTERACTIONS([
    { i: 0, a: 'C09AA02' },  // enalapril
    { i: 1, a: 'M01AE01' },  // ibuprofen
    { i: 2, a: 'N02BA01' },  // ASA
  ]);
  // ACE + NSAID -> warn (new Tier 1)
  // ACE + ASA   -> warn (existing #56)
  // B\u00e5da ska synas eftersom det \u00e4r olika l\u00e4kemedelspar
  assert(result.length >= 2, 'ska ge minst 2 varningar');
});

test('ingen duplicering n\u00e4r ATC-koder byter plats', function() {
  var result = CHECK_INTERACTIONS([
    { i: 0, a: 'N06AB04' },  // SSRI
    { i: 1, a: 'N06AF05' },  // MAO
  ]);
  assertEqual(result.length, 1, 'en kombination per regel');
});

// ===== Output-struktur =====
group('Output-struktur');

test('varningsobjekt inneh\u00e5ller alla f\u00e4lt (s, t, d, r, drugs)', function() {
  var result = CHECK_INTERACTIONS([
    { i: 0, a: 'N06AB04' },
    { i: 1, a: 'N06AF05' },
  ]);
  var w = result[0];
  assert(typeof w.s === 'string', 's ska vara str\u00e4ng');
  assert(typeof w.t === 'string', 't ska vara str\u00e4ng');
  assert(typeof w.d === 'string', 'd ska vara str\u00e4ng');
  assert(typeof w.r === 'string', 'r ska vara str\u00e4ng');
  assert(Array.isArray(w.drugs) && w.drugs.length === 2, 'drugs ska vara array med 2 element');
  assert(typeof w.drugs[0] === 'number' && typeof w.drugs[1] === 'number', 'drug-indices ska vara nummer');
});

test('tre l\u00e4kemedel med flera interaktioner \u2192 flera varningar', function() {
  // warfarin + NSAID + SSRI -> warfarin+NSAID (danger), SSRI+NSAID (warn), warfarin+SSRI (warn)
  var result = CHECK_INTERACTIONS([
    { i: 0, a: 'B01AA03' },  // warfarin
    { i: 1, a: 'M01AE01' },  // NSAID
    { i: 2, a: 'N06AB04' },  // SSRI
  ]);
  assert(result.length >= 3, 'ska ge minst 3 varningar');
});

test('f\u00f6rsta l\u00e4kemedlet saknar ATC \u2192 hoppar \u00f6ver det paret', function() {
  var result = CHECK_INTERACTIONS([
    { i: 0, a: null },
    { i: 1, a: 'N06AB04' },
    { i: 2, a: 'N06AF05' },  // ssri (index 1) + mao (index 2) -> danger
  ]);
  assert(result.length >= 1, 'paret utan ATC-block ska ignoreras, de andra kontrolleras');
});

// ── SAMMANFATTNING ──

console.log('\n' + '\u2500'.repeat(48));
console.log(passed + ' klarade  |  ' + failed + ' misslyckades');

if (failed > 0) process.exit(1);
