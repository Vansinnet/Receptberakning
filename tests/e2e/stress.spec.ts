/**
 * stress.spec.ts — Chaos monkey-stresstest för Receptberäkning 4.0.
 * Testar robusthet under extrem användning — inga kraschar, inga console-errors.
 *
 * Körning: npx playwright test tests/e2e/stress.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';

const BASE = 'http://localhost:5173';
const MOCK_DATE = new Date('2025-06-15T10:00:00Z');

interface StressError {
  test: string;
  type: 'console_error' | 'page_error';
  msg: string;
}

test.describe('Stress — chaos monkey', () => {
  let allConsoleErrors: string[] = [];
  let allPageErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    allConsoleErrors = [];
    allPageErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') allConsoleErrors.push(msg.text());
    });
    page.on('pageerror', err => {
      allPageErrors.push(err.message);
    });
    await page.clock.setFixedTime(MOCK_DATE);
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await page.evaluate(async () => {
      try {
        const ds = await import('/src/lib/drug-search.ts');
        await ds.loadDrugs();
      } catch {}
    });
  });

  test.afterEach(async () => {
    if (allConsoleErrors.length > 0) {
      console.log(`  ⚠ Console errors (${allConsoleErrors.length}):`);
      for (const e of allConsoleErrors.slice(0, 5)) console.log(`    ${e.substring(0, 100)}`);
    }
    if (allPageErrors.length > 0) {
      console.log(`  ⚠ Page errors (${allPageErrors.length}):`);
      for (const e of allPageErrors.slice(0, 5)) console.log(`    ${e}`);
    }
  });

  test('Rapid card churn — add 8 → clear alla → 50x', async ({ page }) => {
    test.setTimeout(300_000);
    for (let round = 0; round < 50; round++) {
      await page.evaluate(async () => {
        const mod = await import('/src/lib/state.svelte.ts');
        for (let i = 0; i < 7; i++) {
          mod.pushMedCard();
          mod.appState.activeMedIdx = mod.medCards.length - 1;
          mod.medCards[mod.appState.activeMedIdx].form.medRaw = `Test ${i + 2}`;
        }
      });
      await page.waitForTimeout(30);
      await page.evaluate(async () => {
        const mod = await import('/src/lib/state.svelte.ts');
        mod.clearAllMedState();
      });
      await page.waitForTimeout(30);
    }
    expect(allConsoleErrors.length).toBe(0);
    expect(allPageErrors.length).toBe(0);
  });

  test('Tab-flipping — förnyelse ↔ långvarig 100x', async ({ page }) => {
    test.setTimeout(120_000);
    await page.evaluate(async () => {
      const mod = await import('/src/lib/state.svelte.ts');
      mod.medCards[0].form.medRaw = 'Metformin 500 mg';
    });
    for (let i = 0; i < 100; i++) {
      await page.click('[data-tab="longterm"]');
      await page.waitForTimeout(20);
      await page.click('[data-tab="renew"]');
      await page.waitForTimeout(20);
    }
    expect(allConsoleErrors.length).toBe(0);
    expect(allPageErrors.length).toBe(0);
  });

  test('Theme toggle — växla tema 200x under beräkning', async ({ page }) => {
    test.setTimeout(120_000);
    await page.evaluate(async () => {
      const mod = await import('/src/lib/state.svelte.ts');
      const f = mod.medCards[0].form;
      f.medRaw = 'Metformin 500 mg';
      f.dateVal = '2025-01-01';
      f.doseRaw = '2';
      f.amtRaw = '100';
      f.refRaw = '3';
    });
    const themes = ['dark', 'klinisk', 'sakura'];
    for (let i = 0; i < 200; i++) {
      const theme = themes[i % 3];
      await page.selectOption('#themeSelect', theme);
      await page.waitForTimeout(10);
    }
    expect(allConsoleErrors.length).toBe(0);
    expect(allPageErrors.length).toBe(0);
  });

  test('Rapid nurse toggle — ssk-vy on/off 50x', async ({ page }) => {
    test.setTimeout(120_000);
    await page.evaluate(async () => {
      const mod = await import('/src/lib/state.svelte.ts');
      const f = mod.medCards[0].form;
      f.medRaw = 'Metformin 500 mg';
      f.dateVal = '2025-01-01';
      f.doseRaw = '2';
      f.amtRaw = '100';
      f.refRaw = '3';
    });
    for (let i = 0; i < 50; i++) {
      await page.evaluate(async () => {
        const mod = await import('/src/lib/state.svelte.ts');
        mod.appState.nurseViewActive = !mod.appState.nurseViewActive;
      });
      await page.waitForTimeout(30);
    }
    await page.evaluate(async () => {
      const mod = await import('/src/lib/state.svelte.ts');
      mod.appState.nurseViewActive = false;
    });
    expect(allConsoleErrors.length).toBe(0);
    expect(allPageErrors.length).toBe(0);
  });

  test('Max interaction load — 8 läkemedel som alla interagerar', async ({ page }) => {
    test.setTimeout(180_000);
    const drugs = [
      { med: 'Waran 2.5 mg', atc: 'B01AA03', date: '2025-01-01', dose: '1', amt: '100', ref: '3' },
      { med: 'Sertralin 50 mg', atc: 'N06AB04', date: '2025-01-01', dose: '1', amt: '100', ref: '3' },
      { med: 'Ipren 400 mg', atc: 'M01AE01', date: '2025-01-01', dose: '1', amt: '100', ref: '3' },
      { med: 'Enalapril 10 mg', atc: 'C09AA02', date: '2025-01-01', dose: '1', amt: '100', ref: '3' },
      { med: 'Litium 300 mg', atc: 'N05AN01', date: '2025-01-01', dose: '1', amt: '100', ref: '3' },
      { med: 'Tramadol 50 mg', atc: 'N02AX02', date: '2025-01-01', dose: '1', amt: '100', ref: '3' },
      { med: 'Simvastatin 20 mg', atc: 'C10AA01', date: '2025-01-01', dose: '1', amt: '100', ref: '3' },
      { med: 'Spironolakton 25 mg', atc: 'C03DA01', date: '2025-01-01', dose: '1', amt: '100', ref: '3' },
    ];

    await page.evaluate(async () => {
      const mod = await import('/src/lib/state.svelte.ts');
      mod.clearAllMedState();
    });
    await page.waitForTimeout(100);

    for (let i = 0; i < drugs.length; i++) {
      if (i > 0) {
        await page.evaluate(async () => {
          const mod = await import('/src/lib/state.svelte.ts');
          mod.pushMedCard();
          mod.appState.activeMedIdx = mod.medCards.length - 1;
        });
      }
      await page.evaluate(async (d) => {
        const mod = await import('/src/lib/state.svelte.ts');
        const f = mod.medCards[mod.appState.activeMedIdx].form;
        f.medRaw = d.med;
        f.dateVal = d.date;
        f.doseRaw = d.dose;
        f.amtRaw = d.amt;
        f.refRaw = d.ref;
        f.atcCode = d.atc;
      }, drugs[i]);
      await page.waitForTimeout(50);
    }

    await page.waitForTimeout(1000);

    const alertCount = await page.locator('#interactionAlerts .interaction-alert').count();
    expect(alertCount).toBeGreaterThanOrEqual(2);
    expect(allConsoleErrors.length).toBe(0);
    expect(allPageErrors.length).toBe(0);
  });

  test('State reset stress — fyll → rensa → fyll 100x', async ({ page }) => {
    test.setTimeout(180_000);
    for (let i = 0; i < 100; i++) {
      try {
        await page.evaluate(async () => {
          const mod = await import('/src/lib/state.svelte.ts');
          const f = mod.medCards[0].form;
          f.medRaw = 'Metformin 500 mg';
          f.dateVal = '2025-01-01';
          f.doseRaw = '2';
          f.amtRaw = '100';
          f.refRaw = '3';
        });
      } catch {}
      await page.waitForTimeout(40);
      try {
        await page.evaluate(async () => {
          const mod = await import('/src/lib/state.svelte.ts');
          mod.clearAllMedState();
        });
      } catch {}
      await page.waitForTimeout(40);
    }
    expect(allConsoleErrors.length).toBe(0);
    expect(allPageErrors.length).toBe(0);
  });

  test('Midnight boundary — stega över midnatt', async ({ page }) => {
    test.setTimeout(60_000);
    await page.evaluate(async () => {
      const mod = await import('/src/lib/state.svelte.ts');
      const f = mod.medCards[0].form;
      f.medRaw = 'Metformin 500 mg';
      f.dateVal = '2025-01-01';
      f.doseRaw = '2';
      f.amtRaw = '100';
      f.refRaw = '3';
    });
    await page.waitForTimeout(200);

    for (let hours = 1; hours <= 48; hours++) {
      const newTime = new Date(MOCK_DATE.getTime() + hours * 3_600_000);
      await page.clock.setFixedTime(newTime);
      await page.waitForTimeout(10);
      await page.evaluate(async () => {
        const mod = await import('/src/lib/state.svelte.ts');
        mod.tickCurrentDate();
      });
    }

    await page.clock.setFixedTime(MOCK_DATE);
    expect(allConsoleErrors.length).toBe(0);
    expect(allPageErrors.length).toBe(0);
  });
});
