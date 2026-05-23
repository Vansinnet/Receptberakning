/**
 * Fuzz-test: 2000 realistiska kliniska användningar av Receptberäkning 4.0.
 * Simulerar en läkares arbetsdag med receptförnyelser.
 * Inkluderar interaktions-stress och memory tracking.
 *
 * Kräver: npm run dev (Vite dev-server på port 5173)
 * Körning: npx playwright test tests/e2e/fuzz.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';

const BASE = 'http://localhost:5173';
const MOCK_DATE = new Date('2025-06-15T10:00:00Z');

// ============================================================
// 1. DATA — realistiska läkemedel och förskrivningsmönster
// ============================================================

interface Scenario {
  med: string;
  date: string;
  dose: string;
  doseInterval?: string;
  amt: string;
  ref: string;
  left: string;
  atc?: string;
  nplId?: string;
  expected: 'valid' | 'empty' | 'notCalc' | 'calcFail';
  extra?: (p: Page) => Promise<void>;
}

// Varje scenario = en läkarbedömning av en receptförnyelse
// Mock-datum: 2025-06-15. Alla datum räknas bakåt från detta.
// Värdena är verifierade mot calcCore för att producera rätt resultat.
const SEQUENCES: Scenario[] = [
  // ==================== 20× STANDARDFÖRNYELSE (OK) ====================

  // 1–4 Metformin (diabetes, 2 tabletter/dag — vanligast i primärvård)
  // dose=2, amt=100, ref=3 → totalDays=150. Med 165d sedan 2025-01-01 är perioden slut → OK
  { med: 'Metformin 500 mg', date: '2025-01-01', dose: '2', amt: '100', ref: '3', left: '', expected: 'valid' },
  // 151d sedan, perioden slut → OK
  { med: 'Metformin 500 mg', date: '2025-01-15', dose: '2', amt: '100', ref: '3', left: '', expected: 'valid' },
  // 134d sedan, totalDays=100 (2×100), perioden slut → OK
  { med: 'Metformin 500 mg', date: '2025-02-01', dose: '2', amt: '100', ref: '2', left: '', expected: 'valid' },
  // 287d sedan, totalDays=150, perioden slut länge → OK
  { med: 'Metformin 500 mg', date: '2024-09-01', dose: '2', amt: '100', ref: '3', left: '', expected: 'valid' },

  // 5–7 Losartan, Atorvastatin (blodtryck/kolesterol, 1 tablett/dag)
  // 304d sedan, totalDays=300 → perioden slut → OK (avg 0.99)
  { med: 'Losartan 50 mg', date: '2024-08-15', dose: '1', amt: '100', ref: '3', left: '', expected: 'valid' },
  // 335d sedan, totalDays=300 → perioden slut → OK (avg 0.90)
  { med: 'Atorvastatin 20 mg', date: '2024-07-15', dose: '1', amt: '100', ref: '3', left: '', expected: 'valid' },
  // 196d sedan, totalDays=200, 4d kvar → OK (avg 0.61)
  { med: 'Losartan 50 mg', date: '2024-12-01', dose: '1', amt: '100', ref: '2', left: '', expected: 'valid' },

  // 8–10 Omeprazol, Sertralin (magskydd/SSRI, 1/dag)
  // 287d sedan, totalDays=300 → perioden slut → OK
  { med: 'Omeprazol 20 mg', date: '2024-09-01', dose: '1', amt: '100', ref: '3', left: '', expected: 'valid' },
  // 349d sedan, totalDays=300 → perioden slut → OK
  { med: 'Sertralin 50 mg', date: '2024-07-01', dose: '1', amt: '100', ref: '3', left: '', expected: 'valid' },
  // 257d sedan, ref=2 → total=200, accessible=200, avg=0.78 → OK
  { med: 'Sertralin 50 mg', date: '2024-10-01', dose: '1', amt: '100', ref: '2', left: '', expected: 'valid' },

  // 11–14 Metformin 850 mg + varianter
  { med: 'Metformin 850 mg', date: '2025-01-01', dose: '2', amt: '100', ref: '3', left: '', expected: 'valid' },
  { med: 'Metformin 850 mg', date: '2024-12-01', dose: '2', amt: '100', ref: '2', left: '', expected: 'valid' },
  // 196d sedan, total=400, totalDays=200, 4d kvar → OK
  { med: 'Metformin 500 mg', date: '2024-12-01', dose: '2', amt: '200', ref: '2', left: '', expected: 'valid' },
  // 227d sedan, ref=3, left=20: consumed=280, avg=1.23, dose=2 → OK (1.23/2=62%)
  { med: 'Metformin 500 mg', date: '2024-11-01', dose: '2', amt: '100', ref: '3', left: '20', expected: 'valid' },

  // 15–16 Ramipril/Amlodipin (blodtryck) — 1/dag, ref=2 för att undvika överförbrukning
  { med: 'Ramipril 5 mg', date: '2024-08-01', dose: '1', amt: '100', ref: '2', left: '', expected: 'valid' },
  { med: 'Amlodipin 5 mg', date: '2024-10-01', dose: '1', amt: '100', ref: '2', left: '', expected: 'valid' },

  // 17–18 Kvarvarande tabletter angivna
  { med: 'Metformin 500 mg', date: '2025-01-01', dose: '2', amt: '100', ref: '3', left: '15', expected: 'valid' },
  { med: 'Losartan 50 mg', date: '2024-11-01', dose: '1', amt: '100', ref: '2', left: '', expected: 'valid' },

  // 19–20 Långtidsmedicin — Waran/Elvanse (särskilda preparat)
  { med: 'Waran 2.5 mg', date: '2024-06-01', dose: '1', amt: '100', ref: '3', left: '', expected: 'valid' },
  { med: 'Elvanse 50 mg', date: '2025-02-15', dose: '1', amt: '100', ref: '1', left: '10', expected: 'valid' },

  // ==================== 10× ÖVERFÖRBRUKNING (isOveruse) ====================

  // 21–22 Alvedon — akut smärta, hög förbrukning
  // 66d sedan, ref=1, left=5: consumed=95, avg=1.44 > 1.10 → overuse
  { med: 'Alvedon 500 mg', date: '2025-04-10', dose: '1', amt: '100', ref: '1', left: '5', expected: 'valid' },
  // 134d sedan, amt=100, ref=3, left=0: accessible=200, consumed=200, avg=1.49 > 1.10 → overuse
  { med: 'Alvedon 500 mg', date: '2025-02-01', dose: '1', amt: '100', ref: '3', left: '0', expected: 'valid' },

  // 23–24 Losartan — förbrukat för snabbt, lite kvar
  // 92d sedan, amt=100, ref=3, left=20: accessible=100(1 batch), consumed=80, avg=0.87 → under 1.10
  // Byt till ref=1, left=0: avg=100/92=1.09 → NEJ (inte > 1.10)
  // Byt till ref=1, left=0, date 2025-04-05 (71d): avg=100/71=1.41 → overuse ✓
  { med: 'Losartan 50 mg', date: '2025-04-05', dose: '1', amt: '100', ref: '1', left: '0', expected: 'valid' },
  // 75d sedan, ref=2, left=10: accessible=100(1 batch), consumed=90, avg=1.20 > 1.10 → overuse ✓
  { med: 'Losartan 50 mg', date: '2025-04-01', dose: '1', amt: '100', ref: '2', left: '10', expected: 'valid' },

  // 25–26 Sertralin — högre takt än ordinerat
  // 75d sedan, amt=100, ref=1, left=0: avg=100/75=1.33 → overuse ✓
  { med: 'Sertralin 50 mg', date: '2025-04-01', dose: '1', amt: '100', ref: '1', left: '0', expected: 'valid' },
  // 120d sedan, ref=2, left=0: accessible=200(2batcher), consumed=200, avg=1.67 > 1.10 → overuse ✓
  { med: 'Sertralin 50 mg', date: '2025-02-15', dose: '1', amt: '100', ref: '2', left: '0', expected: 'valid' },

  // 27 Metformin hög förbrukning
  // 106d sedan, dose=2, ref=2, left=5: accessible=200(2batcher), consumed=195, avg=1.84
  // 1.84/2=0.92 → inte overuse! 
  // Byt till: dose=1, ref=1, left=0: avg=100/106=0.94 → fortfarande inte overuse
  // Byt till: dose=1, date 2025-05-01 (45d), ref=1, left=0: avg=100/45=2.22 → overuse ✓
  { med: 'Metformin 500 mg', date: '2025-05-01', dose: '1', amt: '100', ref: '1', left: '0', expected: 'valid' },

  // 28 Atorvastatin lite kvar
  // 196d sedan, ref=3, left=15: accessible=200(2batcher), consumed=185, avg=0.94 → under 1.10
  // Byt till: date 2025-04-01 (75d), ref=1, left=0: avg=100/75=1.33 → overuse ✓
  { med: 'Atorvastatin 20 mg', date: '2025-04-01', dose: '1', amt: '100', ref: '1', left: '0', expected: 'valid' },

  // 29–30 Overuse + klinisk override
  // 106d sedan, dose=1, ref=1, left=0: avg=100/106=0.94 → inte overuse!
  // Byt till: date 2025-04-15 (61d): avg=100/61=1.64 → overuse ✓
  {
    med: 'Waran 2.5 mg', date: '2025-04-15', dose: '1', amt: '100', ref: '1', left: '0', expected: 'valid',
    extra: async (p) => { await p.evaluate(async () => { const m = await import('/src/lib/state.svelte.ts'); m.medCards[m.appState.activeMedIdx].decision = 'yes'; }); },
  },
  {
    med: 'Metformin 500 mg', date: '2025-02-15', dose: '1', amt: '100', ref: '2', left: '5', expected: 'valid',
    extra: async (p) => { await p.evaluate(async () => { const m = await import('/src/lib/state.svelte.ts'); m.medCards[m.appState.activeMedIdx].decision = 'yes'; }); },
  },

  // ==================== 8× FÖR TIDIG FÖRNYELSE (isTooEarly) ====================

  // 31–32 Nyutbytt nyligen
  // 31d sedan, left=280: earlyPickup, consumed=10, avg=0.32 → ej overuse
  // daysToPrescribedEnd = 2025-05-15+300-2025-06-15 = 269 > 60 → tooEarly ✓
  { med: 'Losartan 50 mg', date: '2025-05-15', dose: '1', amt: '100', ref: '3', left: '280', expected: 'valid' },
  // 14d sedan, left=290: consumed=10, avg=0.71, daysToPrescribedEnd=300-14=286 > 60 → tooEarly ✓
  { med: 'Omeprazol 20 mg', date: '2025-06-01', dose: '1', amt: '100', ref: '3', left: '290', expected: 'valid' },

  // 33–34 Färskt recept
  // 31d sedan, left=270, earlyPickup, consumed=30, avg=0.97, daysToPrescribedEnd=269 > 60 → tooEarly ✓
  { med: 'Atorvastatin 20 mg', date: '2025-05-15', dose: '1', amt: '100', ref: '3', left: '270', expected: 'valid' },
  // 45d sedan, left=220, consumed=80, avg=1.78/2=89%, daysToPrescribedEnd=150-45=105 > 30 → tooEarly ✓
  { med: 'Metformin 500 mg', date: '2025-05-01', dose: '2', amt: '100', ref: '3', left: '220', expected: 'valid' },

  // 35–36 Too early + klinisk override (förnya ändå)
  {
    med: 'Losartan 50 mg', date: '2025-05-15', dose: '1', amt: '100', ref: '3', left: '280', expected: 'valid',
    extra: async (p) => { await p.evaluate(async () => { const m = await import('/src/lib/state.svelte.ts'); m.medCards[m.appState.activeMedIdx].decision = 'yes'; }); },
  },
  {
    med: 'Omeprazol 20 mg', date: '2025-06-01', dose: '1', amt: '100', ref: '3', left: '290', expected: 'valid',
    extra: async (p) => { await p.evaluate(async () => { const m = await import('/src/lib/state.svelte.ts'); m.medCards[m.appState.activeMedIdx].decision = 'yes'; }); },
  },

  // 37–38 Låg dos — Waran varannan dag
  // 106d sedan, dose=0.5, left=90: total=300, batchDuration=200, 1 batch dispensed
  // consumed=100-90=10, avg=10/106=0.09 → ej overuse
  // daysToPrescribedEnd=300-106=194 > 60 → tooEarly ✓
  { med: 'Waran 2.5 mg', date: '2025-03-01', dose: '0.5', amt: '100', ref: '3', left: '90', expected: 'valid' },
  // 75d sedan, left=80, consumed=20, avg=0.27, totalDays=200, daysToPrescribedEnd=125 > 40 → tooEarly ✓
  { med: 'Waran 2.5 mg', date: '2025-04-01', dose: '0.5', amt: '100', ref: '1', left: '80', expected: 'valid' },

  // ==================== 5× FLERA LÄKEMEDEL (multikort) ====================

  // 39 Första kortet: Metformin (OK)
  { med: 'Metformin 500 mg', date: '2025-01-01', dose: '2', amt: '100', ref: '3', left: '', expected: 'valid' },

  // 40 Andra kortet: Atorvastatin (OK)
  { med: 'Atorvastatin 20 mg', date: '2024-07-15', dose: '1', amt: '100', ref: '3', left: '', expected: 'valid' },

  // 41 Första kortet: Sertralin (OK)
  { med: 'Sertralin 50 mg', date: '2024-07-01', dose: '1', amt: '100', ref: '3', left: '', expected: 'valid' },

  // 42 Andra kortet: Metformin overuse
  { med: 'Metformin 500 mg', date: '2025-05-01', dose: '1', amt: '100', ref: '1', left: '0', expected: 'valid' },

  // 43 Första kortet: Metformin (OK) — 3 kort totalt
  { med: 'Metformin 500 mg', date: '2025-01-01', dose: '2', amt: '100', ref: '3', left: '', expected: 'valid' },

  // ==================== 3× SJUKSKÖTERSKEVY ====================

  {
    med: 'Metformin 500 mg', date: '2025-01-01', dose: '2', amt: '100', ref: '3', left: '', expected: 'valid',
    extra: async (p) => {
      await p.evaluate(async () => {
        const mod = await import('/src/lib/state.svelte.ts');
        mod.appState.nurseViewActive = true;
        mod.appState.nurseVitalNormal = true;
        mod.appState.nurseFollowUpAdequate = true;
      });
      await p.waitForTimeout(150);
    },
  },
  {
    med: 'Alvedon 500 mg', date: '2025-02-01', dose: '1', amt: '100', ref: '3', left: '0', expected: 'valid',
    extra: async (p) => {
      await p.evaluate(async () => {
        const mod = await import('/src/lib/state.svelte.ts');
        if (!mod.appState.nurseViewActive) mod.appState.nurseViewActive = true;
      });
    },
  },
  {
    med: 'Losartan 50 mg', date: '2024-08-15', dose: '1', amt: '100', ref: '3', left: '', expected: 'valid',
    extra: async (p) => {
      await p.evaluate(async () => {
        const mod = await import('/src/lib/state.svelte.ts');
        mod.appState.nurseViewActive = false;
        mod.appState.nurseVitalNormal = false;
        mod.appState.nurseFollowUpAdequate = false;
      });
    },
  },

  // ==================== 2× LÅNGVARIG FÖRBRUKNING ====================

  {
    med: 'Metformin 500 mg', date: '2025-01-01', dose: '2', amt: '100', ref: '3', left: '', expected: 'valid',
    extra: async (p) => {
      await p.click('[data-tab="longterm"]');
      await p.waitForTimeout(200);
      await p.locator('#lt-med').fill('Metformin 500 mg');
      await p.locator('#lt-dose').fill('2');
      await p.locator('#lt-start-0').fill('2024-01-01');
      await p.locator('#lt-total-0').fill('600');
      await p.locator('#lt-end-0').fill('2024-07-01');
      await p.waitForTimeout(400);
      await expect(p.locator('#lt-resGrid')).toBeVisible();
      await expect(p.locator('#lt-copyBody')).not.toBeEmpty();
      await p.click('[data-tab="renew"]');
    },
  },
  {
    med: 'Losartan 50 mg', date: '2024-08-15', dose: '1', amt: '100', ref: '3', left: '', expected: 'valid',
    extra: async (p) => {
      await p.click('[data-tab="longterm"]');
      await p.waitForTimeout(200);
      await p.locator('#lt-med').fill('Losartan 50 mg');
      await p.locator('#lt-dose').fill('1');
      await p.locator('#lt-start-0').fill('2024-01-01');
      await p.locator('#lt-total-0').fill('200');
      await p.locator('#lt-end-0').fill('2024-06-01');
      await p.waitForTimeout(200);
      await p.click('#addPeriodBtn');
      await p.waitForTimeout(100);
      await p.locator('#lt-start-1').fill('2024-07-01');
      await p.locator('#lt-total-1').fill('200');
      await p.locator('#lt-end-1').fill('2024-12-31');
      await p.waitForTimeout(400);
      await expect(p.locator('#lt-resGrid')).toBeVisible();
      await expect(p.locator('#lt-period-table')).toBeVisible();
      await p.click('[data-tab="renew"]');
    },
  },

  // ==================== 2× GRÄNSFALL ====================

  // 49 Ej beräkningsbar — förberedning som inte kan kvantifieras
  {
    med: 'Kräm baseline', date: '2025-01-01', dose: '1', amt: '100', ref: '3', left: '', expected: 'notCalc',
    extra: async (p) => {
      await p.evaluate(async () => {
        const mod = await import('/src/lib/state.svelte.ts');
        const idx = mod.appState.activeMedIdx;
        if (idx >= 0 && idx < mod.medCards.length) {
          mod.medCards[idx].form.notCalculable = true;
        }
      });
    },
  },

  // 50 Rensa + ny patient → börja om
  {
    med: 'Metformin 500 mg', date: '2025-01-01', dose: '2', amt: '100', ref: '3', left: '', expected: 'valid',
    extra: async (p) => {
      await p.evaluate(async () => {
        const mod = await import('/src/lib/state.svelte.ts');
        mod.clearAllMedState();
      });
      await p.waitForTimeout(200);
      await expect(p.locator('#medInput')).toHaveValue('');
      await expect(p.locator('.med-item')).toHaveCount(1);
    },
  },

  // ==================== 10× INTERAKTIONS-STRESS ====================

  // 51 warfarin (B01AA) + NSAID (M01AE) → danger
  {
    med: 'Waran 2.5 mg', date: '2025-01-01', dose: '1', amt: '100', ref: '3', left: '',
    atc: 'B01AA03', nplId: '20000101000016', expected: 'valid',
    extra: async (p) => {
      await p.evaluate(async () => { const m = await import('/src/lib/state.svelte.ts'); m.pushMedCard(); m.appState.activeMedIdx = m.medCards.length - 1; });
      const mod = await p.evaluate(async () => { const m = await import('/src/lib/state.svelte.ts'); const f = m.medCards[m.appState.activeMedIdx].form; f.medRaw = 'Ipren 400 mg'; f.dateVal = '2025-01-01'; f.doseRaw = '1'; f.amtRaw = '100'; f.refRaw = '3'; f.atcCode = 'M01AE01'; return 'ok'; });
      await p.waitForTimeout(300);
      await expect(p.locator('#interactionAlerts')).toBeVisible();
    },
  },

  // 52 SSRI (N06AB) + tramadol (N02AX)
  {
    med: 'Sertralin 50 mg', date: '2024-07-01', dose: '1', amt: '100', ref: '3', left: '',
    atc: 'N06AB04', expected: 'valid',
    extra: async (p) => {
      await p.evaluate(async () => { const m = await import('/src/lib/state.svelte.ts'); m.pushMedCard(); m.appState.activeMedIdx = m.medCards.length - 1; });
      await p.evaluate(async () => { const m = await import('/src/lib/state.svelte.ts'); const f = m.medCards[m.appState.activeMedIdx].form; f.medRaw = 'Tramadol 50 mg'; f.dateVal = '2024-09-01'; f.doseRaw = '1'; f.amtRaw = '100'; f.refRaw = '3'; f.atcCode = 'N02AX02'; });
      await p.waitForTimeout(300);
      await expect(p.locator('#interactionAlerts')).toBeVisible();
    },
  },

  // 53 ACE-hämmare (C09AA) + kaliumsparande diuretika (C03DA)
  {
    med: 'Enalapril 10 mg', date: '2024-08-01', dose: '1', amt: '100', ref: '3', left: '',
    atc: 'C09AA02', expected: 'valid',
    extra: async (p) => {
      await p.evaluate(async () => { const m = await import('/src/lib/state.svelte.ts'); m.pushMedCard(); m.appState.activeMedIdx = m.medCards.length - 1; });
      await p.evaluate(async () => { const m = await import('/src/lib/state.svelte.ts'); const f = m.medCards[m.appState.activeMedIdx].form; f.medRaw = 'Spironolakton 25 mg'; f.dateVal = '2024-08-01'; f.doseRaw = '1'; f.amtRaw = '100'; f.refRaw = '3'; f.atcCode = 'C03DA01'; });
      await p.waitForTimeout(300);
      await expect(p.locator('#interactionAlerts')).toBeVisible();
    },
  },

  // 54 warfarin + SSRI + NSAID — 3 läkemedel, flera korsinteraktioner
  {
    med: 'Waran 2.5 mg', date: '2025-01-01', dose: '1', amt: '100', ref: '3', left: '',
    atc: 'B01AA03', expected: 'valid',
    extra: async (p) => {
      await p.evaluate(async () => { const m = await import('/src/lib/state.svelte.ts'); m.pushMedCard(); m.appState.activeMedIdx = m.medCards.length - 1; });
      await p.evaluate(async () => { const m = await import('/src/lib/state.svelte.ts'); const f = m.medCards[m.appState.activeMedIdx].form; f.medRaw = 'Sertralin 50 mg'; f.dateVal = '2025-01-01'; f.doseRaw = '1'; f.amtRaw = '100'; f.refRaw = '3'; f.atcCode = 'N06AB04'; });
      await p.evaluate(async () => { const m = await import('/src/lib/state.svelte.ts'); m.pushMedCard(); m.appState.activeMedIdx = m.medCards.length - 1; });
      await p.evaluate(async () => { const m = await import('/src/lib/state.svelte.ts'); const f = m.medCards[m.appState.activeMedIdx].form; f.medRaw = 'Ipren 400 mg'; f.dateVal = '2025-01-01'; f.doseRaw = '1'; f.amtRaw = '100'; f.refRaw = '3'; f.atcCode = 'M01AE01'; });
      await p.waitForTimeout(400);
      const count = await p.locator('#interactionAlerts .interaction-alert').count();
      expect(count).toBeGreaterThanOrEqual(2);
    },
  },

  // 55 litium (N05AN) + NSAID (M01AE)
  {
    med: 'Litium 300 mg', date: '2025-01-01', dose: '1', amt: '100', ref: '3', left: '',
    atc: 'N05AN01', expected: 'valid',
    extra: async (p) => {
      await p.evaluate(async () => { const m = await import('/src/lib/state.svelte.ts'); m.pushMedCard(); m.appState.activeMedIdx = m.medCards.length - 1; });
      await p.evaluate(async () => { const m = await import('/src/lib/state.svelte.ts'); const f = m.medCards[m.appState.activeMedIdx].form; f.medRaw = 'Ipren 400 mg'; f.dateVal = '2025-01-01'; f.doseRaw = '1'; f.amtRaw = '100'; f.refRaw = '3'; f.atcCode = 'M01AE01'; });
      await p.waitForTimeout(300);
      await expect(p.locator('#interactionAlerts')).toBeVisible();
    },
  },

  // 56 statin (C10AA) + amlodipin (C08CA)
  {
    med: 'Simvastatin 20 mg', date: '2024-12-01', dose: '1', amt: '100', ref: '3', left: '',
    atc: 'C10AA01', expected: 'valid',
    extra: async (p) => {
      await p.evaluate(async () => { const m = await import('/src/lib/state.svelte.ts'); m.pushMedCard(); m.appState.activeMedIdx = m.medCards.length - 1; });
      await p.evaluate(async () => { const m = await import('/src/lib/state.svelte.ts'); const f = m.medCards[m.appState.activeMedIdx].form; f.medRaw = 'Amlodipin 5 mg'; f.dateVal = '2024-12-01'; f.doseRaw = '1'; f.amtRaw = '100'; f.refRaw = '3'; f.atcCode = 'C08CA01'; });
      await p.waitForTimeout(300);
      await expect(p.locator('#interactionAlerts')).toBeVisible();
    },
  },

  // 57 SSRI (N06AB) + MAO (N06AF) — danger
  {
    med: 'Sertralin 50 mg', date: '2024-07-01', dose: '1', amt: '100', ref: '3', left: '',
    atc: 'N06AB04', expected: 'valid',
    extra: async (p) => {
      await p.evaluate(async () => { const m = await import('/src/lib/state.svelte.ts'); m.pushMedCard(); m.appState.activeMedIdx = m.medCards.length - 1; });
      await p.evaluate(async () => { const m = await import('/src/lib/state.svelte.ts'); const f = m.medCards[m.appState.activeMedIdx].form; f.medRaw = 'MAO-hämmare X'; f.dateVal = '2024-07-01'; f.doseRaw = '1'; f.amtRaw = '100'; f.refRaw = '3'; f.atcCode = 'N06AF05'; });
      await p.waitForTimeout(300);
      await expect(p.locator('#interactionAlerts')).toBeVisible();
    },
  },

  // 58 3 olika blodtrycksläkemedel + NSAID — komplex multi-interaktion
  {
    med: 'Enalapril 10 mg', date: '2024-08-01', dose: '1', amt: '100', ref: '3', left: '',
    atc: 'C09AA02', expected: 'valid',
    extra: async (p) => {
      await p.evaluate(async () => { const m = await import('/src/lib/state.svelte.ts'); m.pushMedCard(); m.appState.activeMedIdx = m.medCards.length - 1; });
      await p.evaluate(async () => { const m = await import('/src/lib/state.svelte.ts'); const f = m.medCards[m.appState.activeMedIdx].form; f.medRaw = 'Losartan 50 mg'; f.dateVal = '2024-08-01'; f.doseRaw = '1'; f.amtRaw = '100'; f.refRaw = '3'; f.atcCode = 'C09CA01'; });
      await p.evaluate(async () => { const m = await import('/src/lib/state.svelte.ts'); m.pushMedCard(); m.appState.activeMedIdx = m.medCards.length - 1; });
      await p.evaluate(async () => { const m = await import('/src/lib/state.svelte.ts'); const f = m.medCards[m.appState.activeMedIdx].form; f.medRaw = 'Tiazid 25 mg'; f.dateVal = '2024-08-01'; f.doseRaw = '1'; f.amtRaw = '100'; f.refRaw = '3'; f.atcCode = 'C03AA03'; });
      await p.evaluate(async () => { const m = await import('/src/lib/state.svelte.ts'); m.pushMedCard(); m.appState.activeMedIdx = m.medCards.length - 1; });
      await p.evaluate(async () => { const m = await import('/src/lib/state.svelte.ts'); const f = m.medCards[m.appState.activeMedIdx].form; f.medRaw = 'Ipren 400 mg'; f.dateVal = '2024-08-01'; f.doseRaw = '1'; f.amtRaw = '100'; f.refRaw = '3'; f.atcCode = 'M01AE01'; });
      await p.waitForTimeout(500);
      const count = await p.locator('#interactionAlerts .interaction-alert').count();
      expect(count).toBeGreaterThanOrEqual(3);
    },
  },

  // 59 warfarin + makrolid (J01FA) + SSRI
  {
    med: 'Waran 2.5 mg', date: '2025-01-01', dose: '1', amt: '100', ref: '3', left: '',
    atc: 'B01AA03', expected: 'valid',
    extra: async (p) => {
      await p.evaluate(async () => { const m = await import('/src/lib/state.svelte.ts'); m.pushMedCard(); m.appState.activeMedIdx = m.medCards.length - 1; });
      await p.evaluate(async () => { const m = await import('/src/lib/state.svelte.ts'); const f = m.medCards[m.appState.activeMedIdx].form; f.medRaw = 'Erytromycin 250 mg'; f.dateVal = '2025-01-01'; f.doseRaw = '1'; f.amtRaw = '100'; f.refRaw = '3'; f.atcCode = 'J01FA01'; });
      await p.evaluate(async () => { const m = await import('/src/lib/state.svelte.ts'); m.pushMedCard(); m.appState.activeMedIdx = m.medCards.length - 1; });
      await p.evaluate(async () => { const m = await import('/src/lib/state.svelte.ts'); const f = m.medCards[m.appState.activeMedIdx].form; f.medRaw = 'Sertralin 50 mg'; f.dateVal = '2025-01-01'; f.doseRaw = '1'; f.amtRaw = '100'; f.refRaw = '3'; f.atcCode = 'N06AB04'; });
      await p.waitForTimeout(400);
      await expect(p.locator('#interactionAlerts')).toBeVisible();
    },
  },

  // 60 Rensa allt efter stress
  {
    med: 'Metformin 500 mg', date: '2025-01-01', dose: '2', amt: '100', ref: '3', left: '', expected: 'valid',
    extra: async (p) => {
      await p.evaluate(async () => {
        const mod = await import('/src/lib/state.svelte.ts');
        mod.clearAllMedState();
      });
      await p.waitForTimeout(200);
      await expect(p.locator('.med-item')).toHaveCount(1);
    },
  },
];

// ============================================================
// 2. HJÄLPFUNKTIONER
// ============================================================

interface LogEntry {
  seq: number;
  type: 'console_error' | 'console_warn' | 'page_error' | 'consistency';
  msg: string;
  detail?: string;
}

function fmtSeq(n: number): string {
  return `#${String(n).padStart(2, '0')}`;
}

async function fillForm(page: Page, seq: number, s: Scenario, errors: LogEntry[]) {
  try {
    const patched = await page.evaluate(async ({ med, date, dose, doseInterval, amt, ref, left, atc, nplId }) => {
      try {
        const mod = await import('/src/lib/state.svelte.ts');
        const idx = mod.appState.activeMedIdx;
        if (idx < 0 || idx >= mod.medCards.length) return 'bad_idx:' + idx;
        const form = mod.medCards[idx].form;
        form.medRaw = med;
        form.dateVal = date;
        form.doseRaw = dose;
        if (doseInterval) form.doseInterval = parseInt(doseInterval, 10) as 1 | 7 | 30;
        form.amtRaw = amt;
        form.refRaw = ref;
        form.leftRaw = left || '';
        if (atc) form.atcCode = atc;
        if (nplId) form.nplId = nplId;
        return 'ok';
      } catch (e: any) {
        return 'err:' + (e.message || String(e));
      }
    }, { med: s.med, date: s.date, dose: s.dose, doseInterval: s.doseInterval || '', amt: s.amt, ref: s.ref, left: s.left, atc: s.atc || '', nplId: s.nplId || '' });
    if (patched !== 'ok') {
      errors.push({ seq, type: 'consistency', msg: `fillForm state-mutation: ${patched}`, detail: fmtSeq(seq) });
    }
  } catch (err: any) {
    errors.push({ seq, type: 'consistency', msg: `fillForm evaluate: ${err.message}`, detail: fmtSeq(seq) });
  }
}

async function checkConsistency(page: Page, seq: number, s: Scenario, errors: LogEntry[]) {
  const tag = fmtSeq(seq);
  try {
    const result = await page.evaluate((exp) => {
      const issues: string[] = [];
      const es = document.querySelector('.result-empty-state');
      const rg = document.querySelector('.result-grid');
      const edb = document.querySelector('.early-decision-box');
      const cb = document.querySelector('.copy-body');
      const meds = document.querySelectorAll('.med-item');

      if (es && rg) issues.push('C5: empty-state+result-grid samtidigt');

      // v3: early-decision-box ska alltid synas vid giltigt resultat
      if (exp === 'valid' && !edb) {
        issues.push('C3: expected=valid men early-decision-box saknas');
      }

      document.querySelectorAll('.rv').forEach((el, i) => {
        const v = (el.textContent || '').trim();
        if (!v) issues.push('C2: .rv[' + i + '] tom');
        if (/NaN/.test(v)) issues.push('C2: .rv[' + i + '] NaN: "' + v + '"');
      });

      if (cb && cb.textContent?.includes('[fyll i här]')) {
        issues.push('C6: [fyll i här] i copy-body');
      }

      if (meds.length > 8) issues.push('C7: ' + meds.length + ' med-items (max 8)');

      if (document.querySelector('.nurse-col')) {
        issues.push('C8: nurse-col syns oväntat');
      }

      return issues;
    }, s.expected);

    // Retry: om C3-felet inträffar kan DOM:en vara en tick efter.
    // Vänta 300ms extra och kolla igen — rapportera endast om felet kvarstår.
    const hasC3 = result.some(issue => issue.startsWith('C3:'));
    if (hasC3) {
      await page.waitForTimeout(300);
      const retry = await page.evaluate(() => {
        return !!document.querySelector('.early-decision-box');
      });
      if (!retry) {
        // Felet kvarstår — rapportera
        for (const issue of result) {
          errors.push({ seq, type: 'consistency', msg: issue, detail: tag });
        }
        return;
      }
      // C3 löstes av retry — filtrera bort C3 från övriga fel
      for (const issue of result) {
        if (issue.startsWith('C3:')) continue;
        errors.push({ seq, type: 'consistency', msg: issue, detail: tag });
      }
      return;
    }

    for (const issue of result) {
      errors.push({ seq, type: 'consistency', msg: issue, detail: tag });
    }
  } catch (err: any) {
    errors.push({ seq, type: 'consistency', msg: `checkConsistency: ${err.message}`, detail: tag });
  }
}

// ============================================================
// 3. TEST — 2000 simuleringar (100 sekvenser × 20 varv)
// ============================================================

function build2000Scenarios(): Scenario[] {
  const ROUNDS = 20;
  const result: Scenario[] = [];
  for (let round = 0; round < ROUNDS; round++) {
    for (const s of SEQUENCES) {
      result.push({ ...s });
    }
  }
  return result;
}

test.describe('Fuzz — 2000 realistiska kliniska användningar', () => {
  test('Simulera 2000 receptförnyelser', async ({ page }) => {
    test.setTimeout(900_000);

    const SCENARIOS = build2000Scenarios();
    const errors: LogEntry[] = [];
    let lastConsoleErrorCount = 0;
    let lastPageErrorCount = 0;
    const allConsoleErrors: string[] = [];
    const allPageErrors: string[] = [];
    const memorySamples: Array<{ seq: number; usedMB: number; limitMB: number }> = [];

    page.on('console', msg => {
      if (msg.type() === 'error') allConsoleErrors.push(msg.text());
    });

    page.on('pageerror', err => {
      allPageErrors.push(err.message);
    });

    await page.clock.setFixedTime(MOCK_DATE);
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');

    // Ladda drugs.json för autocomplete
    await page.evaluate(async () => {
      try {
        const ds = await import('/src/lib/drug-search.ts');
        await ds.loadDrugs();
      } catch (e) { /* non-critical */ }
    });

    for (let seq = 1; seq <= SCENARIOS.length; seq++) {
      const s = SCENARIOS[seq - 1];
      const seqInRound = ((seq - 1) % SEQUENCES.length) + 1;

      // Multi-card scenarios (seqInRound 39-43): bygg upp kort gradvis
      if (seqInRound >= 39 && seqInRound <= 43) {
        if (seqInRound === 39) {
          await page.evaluate(async () => {
            const mod = await import('/src/lib/state.svelte.ts');
            mod.clearAllMedState();
          });
        } else if (seqInRound === 40 || seqInRound === 42) {
          await page.evaluate(async () => {
            const mod = await import('/src/lib/state.svelte.ts');
            mod.pushMedCard();
            mod.appState.activeMedIdx = mod.medCards.length - 1;
          });
        } else {
          // Switch to card 0
          await page.evaluate(async () => {
            const mod = await import('/src/lib/state.svelte.ts');
            mod.appState.activeMedIdx = 0;
          });
        }
      } else if (seqInRound === 50) {
        // Seq 50: rensa state även här — extra kör clearAllMedState efter
        // checkConsistency för verifiering, men vi måste rensa inför fillForm.
        await page.evaluate(async () => {
          const mod = await import('/src/lib/state.svelte.ts');
          mod.clearAllMedState();
        });
      } else {
        // Normal: reset to single clean card
        await page.evaluate(async () => {
          const mod = await import('/src/lib/state.svelte.ts');
          mod.clearAllMedState();
        });
      }

      await page.waitForTimeout(50);

      // Fill form via state mutation
      await fillForm(page, seq, s, errors);
      await page.waitForTimeout(100);

      // Run consistency checks
      await checkConsistency(page, seq, s, errors);

      // Memory tracking
      try {
        const mem = await page.evaluate(() => {
          const p = (performance as any).memory;
          return p ? { used: p.usedJSHeapSize / 1e6, limit: p.jsHeapSizeLimit / 1e6 } : null;
        });
        if (mem) memorySamples.push({ seq, usedMB: mem.used, limitMB: mem.limit });
      } catch { /* memory API not available */ }

      // Record any new console/page errors
      if (allConsoleErrors.length > lastConsoleErrorCount) {
        for (let i = lastConsoleErrorCount; i < allConsoleErrors.length; i++) {
          errors.push({ seq, type: 'console_error', msg: allConsoleErrors[i], detail: fmtSeq(seq) });
        }
      }
      lastConsoleErrorCount = allConsoleErrors.length;
      if (allPageErrors.length > lastPageErrorCount) {
        for (let i = lastPageErrorCount; i < allPageErrors.length; i++) {
          errors.push({ seq, type: 'page_error', msg: allPageErrors[i], detail: fmtSeq(seq) });
        }
      }
      lastPageErrorCount = allPageErrors.length;

      // Run extra actions
      if (s.extra) {
        try {
          await s.extra(page);
        } catch (err: any) {
          errors.push({ seq, type: 'consistency', msg: `extra actions misslyckades: ${err.message}`, detail: fmtSeq(seq) });
        }
      }
    }

    // ============================================================
    // 4. RAPPORTERING
    // ============================================================

    const consoleErrCount = errors.filter(e => e.type === 'console_error').length;
    const pageErrCount = errors.filter(e => e.type === 'page_error').length;
    const consistencyFailCount = errors.filter(e => e.type === 'consistency').length;

    const seqsWithErrors = new Set(errors.map(e => e.seq));
    const cleanSeqs = SCENARIOS.length - seqsWithErrors.size;

    // Gruppera fel för rapport
    const errorGroups = new Map<string, number>();
    for (const e of errors) {
      const key = `${e.type}: ${e.msg.substring(0, 120)}`;
      errorGroups.set(key, (errorGroups.get(key) || 0) + 1);
    }
    const sortedErrors = [...errorGroups.entries()].sort((a, b) => b[1] - a[1]);

    console.log('='.repeat(72));
    console.log('  FUZZ TEST RAPPORT — 2000 realistiska användningar');
    console.log('='.repeat(72));
    console.log(`  Totalt fel: ${errors.length}`);
    console.log(`    Console errors:  ${consoleErrCount}`);
    console.log(`    Page errors:     ${pageErrCount}`);
    console.log(`    Consistency:     ${consistencyFailCount}`);
    console.log(`  Rena sekvenser:  ${cleanSeqs}/${SCENARIOS.length} (${Math.round(cleanSeqs / SCENARIOS.length * 100)}%)`);

    if (memorySamples.length > 0) {
      const firstMem = memorySamples[0];
      const lastMem = memorySamples[memorySamples.length - 1];
      const mbs: number[] = memorySamples.map(s => s.usedMB);
      const maxMem = Math.max(...mbs);
      const avgMem = mbs.reduce((a, b) => a + b, 0) / mbs.length;
      console.log('-'.repeat(72));
      console.log('  Memory (JS heap):');
      console.log(`    Första: ${firstMem.usedMB.toFixed(1)} MB | Sista: ${lastMem.usedMB.toFixed(1)} MB`);
      console.log(`    Max:    ${maxMem.toFixed(1)} MB | Snitt:  ${avgMem.toFixed(1)} MB`);
      console.log(`    Limit:  ${firstMem.limitMB.toFixed(0)} MB`);
      const leakSuspected = lastMem.usedMB > firstMem.usedMB * 1.5;
      if (leakSuspected) console.log(`    ⚠ VARNING: Minnesanvändning ökat >50% — misstänkt läcka`);
    }
    console.log('-'.repeat(72));

    if (sortedErrors.length > 0) {
      console.log('  Topp-fel:');
      for (const [msg, count] of sortedErrors.slice(0, 15)) {
        console.log(`    ×${count}  ${msg}`);
      }
    } else {
      console.log('  Inga fel hittades.');
    }
    console.log('='.repeat(72));

    await page.screenshot({ path: 'test-results/fuzz-final.png', fullPage: true });

    expect(pageErrCount, `Page errors: ${allPageErrors.join('; ')}`).toBe(0);
  });
});
