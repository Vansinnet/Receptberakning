/**
 * property.spec.ts — Property-based E2E-tester med fast-check.
 * Genererar slumpmässiga formulär och verifierar invarianter.
 *
 * Körning: npx playwright test tests/e2e/property.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';
import fc from 'fast-check';

const BASE = 'http://localhost:5173';
const MOCK_DATE = new Date('2025-06-15T10:00:00Z');

async function fillFormDirect(p: Page, input: { med: string; date: string; dose: string; amt: string; ref: string; left: string }) {
  return p.evaluate(async (vals) => {
    const mod = await import('/src/lib/state.svelte.ts');
    const f = mod.medCards[mod.appState.activeMedIdx].form;
    f.medRaw = vals.med;
    f.dateVal = vals.date;
    f.doseRaw = vals.dose;
    f.amtRaw = vals.amt;
    f.refRaw = vals.ref;
    f.leftRaw = vals.left || '';
  }, input);
}

async function getResultState(p: Page) {
  return p.evaluate(async () => {
    const mod = await import('/src/lib/state.svelte.ts');
    const result = mod.getActiveResult();
    const texts = mod.getActiveTexts();
    return {
      valid: result.valid,
      calculable: result.calculable,
      hasMetrics: !!(result.metrics && result.metrics.length),
      hasAlerts: !!(result.alerts && result.alerts.length),
      patientTextLen: texts.patientText.length,
      journalTextLen: texts.journalText.length,
      statusText: result.statusText || '',
    };
  });
}

async function getResultText(p: Page) {
  return p.evaluate(async () => {
    const mod = await import('/src/lib/state.svelte.ts');
    return mod.getActiveTexts().patientText;
  });
}

const dateGen = fc.date({ min: new Date('2020-01-01'), max: new Date('2025-06-01') })
  .map(d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);

const medGen = fc.constantFrom(
  'Metformin 500 mg', 'Losartan 50 mg', 'Sertralin 50 mg', 'Omeprazol 20 mg',
  'Atorvastatin 20 mg', 'Alvedon 500 mg', 'Waran 2.5 mg', 'Amlodipin 5 mg',
  'Ramipril 5 mg', 'Elvanse 50 mg', 'Paracetamol 500 mg', 'Metformin 850 mg',
);

const formGen = fc.record({
  med: medGen,
  date: dateGen,
  dose: fc.constantFrom('0.5', '1', '1.5', '2', '2.5', '3', '4'),
  amt: fc.constantFrom('30', '50', '98', '100', '200', '250'),
  ref: fc.constantFrom('1', '2', '3', '4'),
  left: fc.constantFrom('', '0', '10', '20', '50'),
});

const interactingPairs = [
  { a: 'Waran 2.5 mg', a_atc: 'B01AA03', b: 'Ipren 400 mg', b_atc: 'M01AE01' },
  { a: 'Sertralin 50 mg', a_atc: 'N06AB04', b: 'Tramadol 50 mg', b_atc: 'N02AX02' },
  { a: 'Enalapril 10 mg', a_atc: 'C09AA02', b: 'Spironolakton 25 mg', b_atc: 'C03DA01' },
  { a: 'Simvastatin 20 mg', a_atc: 'C10AA01', b: 'Amlodipin 5 mg', b_atc: 'C08CA01' },
];

test.describe('Property — E2E-invarianter', () => {
  let consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    await page.clock.setFixedTime(MOCK_DATE);
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
  });

  test('Property: form ↔ result — inga kraschar vid 500 form', async ({ page }) => {
    test.setTimeout(300_000);
    const p = page;
    const ce = () => consoleErrors;
    await fc.assert(
      fc.asyncProperty(formGen, async (input) => {
        await fillFormDirect(p, input);
        await p.waitForTimeout(50);
        const state = await getResultState(p);
        expect(state.statusText).toBeDefined();
        expect(state.statusText).not.toContain('NaN');
        expect(state.statusText).not.toContain('undefined');
        expect(ce().length).toBe(0);
      }),
      { numRuns: 500, timeout: 250_000 },
    );
  });

  test('Property: form ↔ result — idempotens', async ({ page }) => {
    test.setTimeout(120_000);
    const p = page;
    const ce = () => consoleErrors;
    await fc.assert(
      fc.asyncProperty(formGen, async (input) => {
        await fillFormDirect(p, input);
        await p.waitForTimeout(100);
        const r1 = await getResultText(p);
        await p.evaluate(async () => {
          const mod = await import('/src/lib/state.svelte.ts');
          mod.medCards[mod.appState.activeMedIdx].form.medRaw = '';
        });
        await p.waitForTimeout(50);
        await fillFormDirect(p, input);
        await p.waitForTimeout(100);
        const r2 = await getResultText(p);
        expect(r1).toBe(r2);
        expect(ce().length).toBe(0);
      }),
      { numRuns: 50, timeout: 60_000 },
    );
  });

  test('Property: interaction symmetry — ordning ovidkommande', async ({ page }) => {
    test.setTimeout(120_000);
    const p = page;
    const ce = () => consoleErrors;
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...interactingPairs),
        fc.boolean(),
        async (pair, reversed) => {
          await p.evaluate(async () => {
            const mod = await import('/src/lib/state.svelte.ts');
            mod.clearAllMedState();
          });
          await p.waitForTimeout(50);

          const first = reversed ? pair.b : pair.a;
          const firstAtc = reversed ? pair.b_atc : pair.a_atc;
          const second = reversed ? pair.a : pair.b;
          const secondAtc = reversed ? pair.a_atc : pair.b_atc;

          await p.evaluate(async (d: { med: string; atc: string }) => {
            const mod = await import('/src/lib/state.svelte.ts');
            const f = mod.medCards[0].form;
            f.medRaw = d.med;
            f.dateVal = '2025-01-01';
            f.doseRaw = '1';
            f.amtRaw = '100';
            f.refRaw = '3';
            f.atcCode = d.atc;
          }, { med: first, atc: firstAtc });

          await p.evaluate(async () => {
            const mod = await import('/src/lib/state.svelte.ts');
            mod.pushMedCard();
            mod.appState.activeMedIdx = mod.medCards.length - 1;
          });

          await p.evaluate(async (d: { med: string; atc: string }) => {
            const mod = await import('/src/lib/state.svelte.ts');
            const f = mod.medCards[mod.appState.activeMedIdx].form;
            f.medRaw = d.med;
            f.dateVal = '2025-01-01';
            f.doseRaw = '1';
            f.amtRaw = '100';
            f.refRaw = '3';
            f.atcCode = d.atc;
          }, { med: second, atc: secondAtc });

          await p.waitForTimeout(300);
          const alertCount = await p.locator('#interactionAlerts .interaction-alert').count();
          expect(alertCount).toBeGreaterThanOrEqual(1);
          expect(ce().length).toBe(0);
        },
      ),
      { numRuns: 20, timeout: 60_000 },
    );
  });

  test('Property: text roundtrip — patienttext innehåller meds', async ({ page }) => {
    test.setTimeout(120_000);
    const p = page;
    const ce = () => consoleErrors;
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          med: fc.constantFrom('Metformin 500 mg', 'Sertralin 50 mg', 'Losartan 50 mg', 'Atorvastatin 20 mg', 'Omeprazol 20 mg'),
          dose: fc.constantFrom('1', '2'),
          date: fc.constantFrom('2025-01-01', '2024-07-01', '2024-09-01'),
          amt: fc.constantFrom('100', '200'),
          ref: fc.constantFrom('2', '3'),
          left: fc.constantFrom('', '0', '10', '50'),
          decision: fc.constantFrom('yes', 'no', null),
        }),
        async (input) => {
          await p.evaluate(async () => {
            const mod = await import('/src/lib/state.svelte.ts');
            mod.clearAllMedState();
          });
          await p.waitForTimeout(50);

          await p.evaluate(async (inp: typeof input) => {
            const mod = await import('/src/lib/state.svelte.ts');
            const f = mod.medCards[0].form;
            f.medRaw = inp.med;
            f.dateVal = inp.date;
            f.doseRaw = inp.dose;
            f.amtRaw = inp.amt;
            f.refRaw = inp.ref;
            f.leftRaw = inp.left;
            mod.medCards[0].decision = inp.decision;
          }, input);

          await p.waitForTimeout(100);
          const text = await getResultText(p);

          if (text.length > 0) {
            const strippedName = input.med.replace(/\s+\d+.*$/, '');
            expect(text).toContain(strippedName);
          }
          expect(text).not.toContain('undefined');
          expect(text).not.toContain('NaN');
          expect(text).not.toContain('[fyll i här]');
          expect(ce().length).toBe(0);
        },
      ),
      { numRuns: 50, timeout: 60_000 },
    );
  });

  test('Property: no console errors — 1000 interaktioner', async ({ page }) => {
    test.setTimeout(300_000);
    const p = page;
    const ce = () => consoleErrors;
    await fc.assert(
      fc.asyncProperty(formGen, async (input) => {
        await fillFormDirect(p, input);
        await p.waitForTimeout(30);
        const addCard = Math.random() > 0.7;
        if (addCard) {
          await p.evaluate(async () => {
            const mod = await import('/src/lib/state.svelte.ts');
            if (mod.medCards.length < 8) {
              mod.pushMedCard();
              mod.appState.activeMedIdx = mod.medCards.length - 1;
            }
          });
        }
        await p.waitForTimeout(10);
      }),
      { numRuns: 1000, timeout: 250_000 },
    );
    expect(ce().length).toBe(0);
  });
});
