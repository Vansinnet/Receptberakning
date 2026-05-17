/**
 * GENERATE golden fixtures — fångar ALLA funktionsanrop från test-calc.js.
 *
 * Interceptar vm.createContext och vm.runInContext för att injicera
 * recording wrappers runt alla testade funktioner. Kör sedan
 * test-calc.js oförändrat.
 *
 * Kör: node scripts/generate-golden-fixtures.cjs
 * Output: tests/fixtures/calccore-golden.json
 */
'use strict';

const fs   = require('fs');
const vm   = require('vm');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const KOD       = path.join(REPO_ROOT, 'Kod');
const OUT_DIR   = path.join(REPO_ROOT, 'tests', 'fixtures');

// Global recording state
let recorded = [];
let callIdx = 0;
let _savedCtx = null;

// ============================================================
// INTERCEPT: monkey-patch vm.createContext + vm.runInContext
// ============================================================

const _origCreateContext = vm.createContext;
vm.createContext = function(sandbox, ...args) {
  const ctx = _origCreateContext.call(vm, sandbox, ...args);
  _savedCtx = ctx;

  const _origRunInContext = vm.runInContext;
  vm.runInContext = function(code, context, options) {
    const result = _origRunInContext.call(vm, code, context, options);

    // Wrappa funktioner successivt när deras filer laddas
    if (typeof context.calcCore === 'function' && !context.calcCore.__wrapped) {
      wrapCalcCore(context);
    }
    if (typeof context.calcLongtermCore === 'function' && !context.calcLongtermCore.__wrapped) {
      wrapCalcLongtermCore(context);
    }
    if (typeof context.canRenewMed === 'function' && !context.canRenewMed.__wrapped) {
      wrapPrescribe(context);
    }
    return result;
  };

  return ctx;
};

// ============================================================
// WRAPPER-FUNKTIONER
// ============================================================

function wrapCalcCore(ctx) {
  const _calcCore = ctx.calcCore;
  ctx.calcCore = function(inputData, prev) {
    callIdx++;
    const result = _calcCore(inputData, prev);
    recorded.push({ name: `calcCore_${callIdx}`, fn: 'calcCore', input: inputData, prev: prev, expected: result });
    return result;
  };
  ctx.calcCore.__wrapped = true;

  const _validateValues = ctx.validateValues;
  ctx.validateValues = function(medRaw, dateVal, doseRaw, amtRaw, refRaw, leftRaw, doseIntervalRaw, doseUnitRaw, notCalculable) {
    callIdx++;
    const result = _validateValues(medRaw, dateVal, doseRaw, amtRaw, refRaw, leftRaw, doseIntervalRaw, doseUnitRaw, notCalculable);
    recorded.push({ name: `validateValues_${callIdx}`, fn: 'validateValues', args: { medRaw, dateVal, doseRaw, amtRaw, refRaw, leftRaw, doseIntervalRaw, doseUnitRaw, notCalculable }, expected: result });
    return result;
  };
  ctx.validateValues.__wrapped = true;

  // Text-gen laddas före calc-renew.js — wrappa samtidigt
  wrapTextGen(ctx);
}

function wrapCalcLongtermCore(ctx) {
  const _orig = ctx.calcLongtermCore;
  ctx.calcLongtermCore = function(medRaw, ordDose, rawPeriods, nplId) {
    callIdx++;
    const result = _orig(medRaw, ordDose, rawPeriods, nplId);
    recorded.push({ name: `calcLongtermCore_${callIdx}`, fn: 'calcLongtermCore', args: { medRaw, ordDose, rawPeriods, nplId }, expected: result });
    return result;
  };
  ctx.calcLongtermCore.__wrapped = true;
}

function wrapTextGen(ctx) {
  const fns = ['buildPatientText', 'buildJournalText', 'buildNurseJournalText', 'remainingDosesNote'];
  fns.forEach(fnName => {
    if (typeof ctx[fnName] === 'function' && !ctx[fnName].__wrapped) {
      const _orig = ctx[fnName];
      ctx[fnName] = function(...args) {
        callIdx++;
        const result = _orig(...args);
        recorded.push({ name: `${fnName}_${callIdx}`, fn: fnName, args: args, expected: result });
        return result;
      };
      ctx[fnName].__wrapped = true;
    }
  });
}

function wrapPrescribe(ctx) {
  const fns = ['canRenewMed', 'calcPrescribeResult', 'prescribeValidationHint'];
  fns.forEach(fnName => {
    if (typeof ctx[fnName] === 'function' && !ctx[fnName].__wrapped) {
      const _orig = ctx[fnName];
      ctx[fnName] = function(...args) {
        callIdx++;
        const result = _orig(...args);
        recorded.push({ name: `${fnName}_${callIdx}`, fn: fnName, args: args, expected: result });
        return result;
      };
      ctx[fnName].__wrapped = true;
    }
  });
}

// ============================================================
// KÖR test-calc.js
// ============================================================

const _origLog = console.log;
const _origErr = console.error;
console.log = function() {};
console.error = function() {};

const _origExit = process.exit;
process.exit = function(code) {
  process.exitCode = code || 0;
  throw new Error('process.exit prevented');
};

const testCalcPath = path.join(KOD, 'test-calc.js');
delete require.cache[require.resolve(testCalcPath)];

try {
  require(testCalcPath);
  process.exitCode = 0;
} catch (e) {
  console.error = _origErr;
  if (!e.message || !e.message.includes('process.exit')) {
    console.error('Fel vid körning av test-calc.js:', e.message);
    process.exitCode = 1;
  }
} finally {
  console.log = _origLog;
  console.error = _origErr;
  process.exit = _origExit;
}

// ============================================================
// SPARA FIXTURES
// ============================================================

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

const outPath = path.join(OUT_DIR, 'calccore-golden.json');
fs.writeFileSync(outPath, JSON.stringify(recorded, (key, val) => {
  if (typeof val === 'object' && val !== null && Object.prototype.toString.call(val) === '[object Date]') {
    return val.toISOString();
  }
  if (typeof val === 'function') return '[Function]';
  return val;
}, 2));

console.log(`\n${'─'.repeat(48)}`);
console.log(`Genererade ${recorded.length} golden fixtures`);
console.log(`Output: ${outPath}`);

const fnCounts = {};
recorded.forEach(r => { fnCounts[r.fn] = (fnCounts[r.fn] || 0) + 1; });
console.log('\nFördelning per funktion:');
for (const [fn, count] of Object.entries(fnCounts)) {
  console.log(`  ${fn}: ${count}`);
}
