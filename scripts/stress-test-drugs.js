/**
 * Stresstest för drugs.js + calc + stripManufacturer
 * Simulerar 50 läkare med upp till 8 läkemedel var.
 *
 * Kör: node scripts/stress-test-drugs.js
 */
'use strict';

const fs   = require('fs');
const vm   = require('vm');
const path = require('path');

const domStub = {
  getElementById: () => null,
  createElement:  () => ({ style: {}, className: '', textContent: '', appendChild: () => {} }),
  createTextNode: () => ({}),
  createDocumentFragment: () => ({ appendChild: () => {} }),
};

const ctx = vm.createContext({ console, document: domStub, _mockToday: null });
const kodDir = path.join(__dirname, '..', 'Kod');

vm.runInContext(`var resetTimer = function() {};`, ctx);
vm.runInContext(`var debounce = function(fn, ms) { return fn; };`, ctx);
vm.runInContext(`var setMedUIPreference = function() {};`, ctx);

const files = ['utils.js', 'state.js', 'calc-renew.js', 'longterm.js', 'prescribe.js', 'ui-renew.js', 'drugs.js'];
for (const f of files) {
  vm.runInContext(fs.readFileSync(path.join(kodDir, f), 'utf8'), ctx);
}

vm.runInContext(`
  const _origGetToday = getToday;
  getToday = function() { if (_mockToday !== null) return new Date(_mockToday); return _origGetToday(); };
  var _statesRef = function() { return states; };
`, ctx);

function fmtMs(ms) { return ms.toFixed(2) + ' ms'; }
function fmtMB(bytes) { return (bytes / 1024 / 1024).toFixed(1) + ' MB'; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randChoice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

ctx._mockToday = Date.UTC(2025, 5, 15);

let ok = 0, fail = 0;
function check(c, msg) {
  ok++;
  if (!c) { console.error(`  ✗ ${msg}`); fail++; }
  else { process.stdout.write('.'); if (ok % 80 === 0) process.stdout.write('\n'); }
}

const S = () => ctx._statesRef();
const searchDrugs = ctx.searchDrugs;
const stripMfr = ctx.stripManufacturer;
const DRUG_LIST = ctx.DRUG_LIST;
const names = DRUG_LIST.map(d => d.name);

console.log('══════════════════════════════════════');
console.log('  STRESS TEST — drugs.js + calc + stripMfr');
console.log('══════════════════════════════════════\n');

// 1. SÖK — 10 000 anrop
console.log('1. SÖKPRESTANDA — 10 000 slumpmässiga sökningar');
const qs = [];
for (let i = 0; i < 10000; i++) {
  const n = randChoice(names);
  qs.push(n.substring(0, randInt(2, Math.min(n.length, 15))));
}
let maxMs = 0, hits = 0;
const times = [];
for (const q of qs) {
  const s = process.hrtime.bigint();
  const r = searchDrugs(q);
  const t = Number(process.hrtime.bigint() - s) / 1e6;
  times.push(t); if (t > maxMs) maxMs = t;
  if (r.length > 0) hits++;
}
times.sort((a,b)=>a-b);
console.log(`  ${qs.length} sökningar, ${hits} träffar (${((hits/qs.length)*100).toFixed(0)}%)`);
console.log(`  P50: ${fmtMs(times[5000])}  P99: ${fmtMs(times[9900])}  Max: ${fmtMs(maxMs)}`);
check(maxMs < 50, 'Max sök < 50 ms');

// 2. STRIP — alla 4 352 namn
console.log('\n2. TILLVERKARSTRIPPING — alla ' + names.length + ' namn');
let changed = 0; maxMs = 0;
for (const n of names) {
  const s = process.hrtime.bigint();
  const stripped = stripMfr(n);
  const t = Number(process.hrtime.bigint() - s) / 1e6;
  if (t > maxMs) maxMs = t;
  if (stripped !== n) changed++;
  check(!stripped.includes('  ') && stripped === stripped.trim(), 'clean: ' + stripped.substring(0,40));
}
console.log(`  ${changed} strippade (${((changed/names.length)*100).toFixed(0)}%)  Max: ${fmtMs(maxMs)}`);
check(maxMs < 5, 'Max strip < 5 ms');

// 3. BERÄKNING — 50 × 1–8
console.log('\n3. BERÄKNINGAR — 50 läkare');
const ct = []; let cTotal = 0, cErr = 0;
for (let doc = 0; doc < 50; doc++) {
  ctx.resetAllMedState();
  const mc = randInt(1, 8);
  for (let m = 0; m < mc; m++) {
    ctx.pushMedCard();
    const d = randChoice(DRUG_LIST);
    ctx.applyMedStatePatch(m, {
      medRaw: d.name, doseRaw: String(randChoice([0.5,1,1,1,1.5,2,2,3,4,6])).replace('.',','),
      refRaw: String(randInt(1,12)), amtRaw: String(randChoice([20,28,30,50,56,60,84,90,98,100])),
      dateVal: ctx.fmtDate(new Date(Date.UTC(2025,randInt(0,4),randInt(1,28)))),
      leftRaw: Math.random()<0.3?String(randInt(0,300)):'',
    });
  }
  for (let m = 0; m < mc; m++) {
    const s = process.hrtime.bigint();
    try { ctx.calc(m); } catch(e) { cErr++; }
    ct.push(Number(process.hrtime.bigint()-s)/1e6);
    cTotal++;
  }
}
ct.sort((a,b)=>a-b);
console.log(`  ${cTotal} calc(), ${cErr} fel`);
console.log(`  P50: ${fmtMs(ct[Math.floor(ct.length*0.5)])}  P99: ${fmtMs(ct[Math.floor(ct.length*0.99)])}`);
check(cErr === 0, 'Inga calc()-fel');

// 4. MINNE — 100 cykler
console.log('\n4. MINNE — 100 cykler');
const mb = process.memoryUsage().heapUsed;
for (let i = 0; i < 100; i++) {
  ctx.resetAllMedState(); ctx.pushMedCard();
  const d = randChoice(DRUG_LIST);
  ctx.applyMedStatePatch(0, {
    medRaw: d.name, doseRaw: '1', refRaw: '3', amtRaw: '100',
    dateVal: '2025-01-15', leftRaw: '',
  });
  try { ctx.calc(0); } catch(e) {}
  ctx.resetAllMedState();
}
const ma = process.memoryUsage().heapUsed;
console.log(`  Heap: ${fmtMB(mb)} → ${fmtMB(ma)} (Δ ${((ma-mb)/1024/1024).toFixed(1)} MB)`);
check((ma-mb)/1024/1024 < 50, 'Minnesökning < 50 MB');

// 5. EDGE
console.log('\n5. EDGE CASES');
ctx.resetAllMedState(); ctx.pushMedCard();
ctx.applyMedStatePatch(0, { medRaw:'A'.repeat(101), doseRaw:'1', refRaw:'3', amtRaw:'100', dateVal:'2025-01-15' });
ctx.calc(0);
check(S()[0] && S()[0].valid === false, '100+ tecken → valid:false');
check(searchDrugs('').length === 0, 'Tom sökning → []');
check(searchDrugs('a').length === 0, 'Enkel tecken "a" → []');
ctx.resetAllMedState(); ctx.pushMedCard();
ctx.applyMedStatePatch(0, { medRaw:'<script>alert(1)</script>', doseRaw:'1', refRaw:'3', amtRaw:'100', dateVal:'2025-01-15' });
try { ctx.calc(0); check(true, 'XSS i medRaw → OK'); } catch(e) { check(false, 'XSS kraschade'); }

console.log(`\n══════════════════════════════════════`);
console.log(`  RESULTAT: ${ok-fail}/${ok} klarade`);
console.log(`══════════════════════════════════════`);
if (fail > 0) process.exit(1);
