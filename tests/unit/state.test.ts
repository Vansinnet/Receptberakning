// T28, T29 och regressionsfel från granskningen av 4.0, testade på ärendets state.
import { describe, it, expect, beforeEach } from 'vitest';
import { flushSync } from 'svelte';
import { setMockNow } from '../../src/lib/clock';
import {
  caseState, addMed, applyDrug, clearCase, editText, getResult, getText, isTextEdited, refreshToday,
  removeMed, resetText, selectMed, setDecision, setNameManually, setPrescribePackage,
} from '../../src/lib/state/case.svelte';
import type { DrugEntry } from '../../src/lib/drug-search';

setMockNow(new Date(2026, 9, 1, 10, 0, 0).getTime());

const sertralin: DrugEntry = { name: 'Sertralin Accord 50 mg', nplId: '123', atcCode: 'N06AB06', packageSize: 100, unit: 'st', form: 'Tablett' };

function fillSlutRecept(id: number) {
  const m = caseState.meds.find((x) => x.id === id)!;
  m.form.dateRaw = '2025-06-01';
  m.form.doseRaw = '1';
  m.form.refillsRaw = '3';
}

beforeEach(() => { clearCase(); refreshToday(); flushSync(); });

describe('T28 förpackningsstorleken har en enda källa', () => {
  it('ändrad förpackning i formuläret används i nyförskrivningen', () => {
    const id = caseState.activeId;
    applyDrug(id, sertralin);
    fillSlutRecept(id);
    setDecision(id, 'yes');
    caseState.meds[0].form.packageRaw = '30';
    flushSync();
    const p = getResult(id)!.prescription!;
    expect(p).toMatchObject({ kind: 'ok', days: 183, units: 183, packages: 7, packageSize: 30 });
  });
  it('egen förpackning i nyförskrivningen gäller tills fältet töms', () => {
    const id = caseState.activeId;
    applyDrug(id, sertralin);
    fillSlutRecept(id);
    setDecision(id, 'yes');
    setPrescribePackage(id, '50');
    flushSync();
    expect(getResult(id)!.prescription).toMatchObject({ packageSize: 50, packages: 4 });
    setPrescribePackage(id, '');
    flushSync();
    expect(getResult(id)!.prescription).toMatchObject({ packageSize: 100, packages: 2 });
  });
});

describe('T29 läkemedel inskrivet för hand', () => {
  it('nyförskrivningen beräknas direkt', () => {
    const id = caseState.activeId;
    setNameManually(id, 'Eget läkemedel 5 mg');
    caseState.meds[0].form.packageRaw = '100';
    fillSlutRecept(id);
    setDecision(id, 'yes');
    flushSync();
    expect(getResult(id)!.prescription).toMatchObject({ kind: 'ok', packages: 2 });
  });
});

describe('Ärendet', () => {
  it('max 8 läkemedel', () => {
    for (let i = 0; i < 10; i++) addMed();
    expect(caseState.meds.length).toBe(8);
  });
  it('att ta bort sista läkemedlet lämnar ett tomt kort', () => {
    const id = caseState.activeId;
    setNameManually(id, 'X');
    removeMed(id);
    expect(caseState.meds.length).toBe(1);
    expect(caseState.meds[0].form.name).toBe('');
  });
  it('beslut växlar av vid andra klicket', () => {
    const id = caseState.activeId;
    setDecision(id, 'no');
    setDecision(id, 'no');
    expect(caseState.meds[0].decision).toBeNull();
  });
  it('handredigerad text kan återställas och rensas med ärendet', () => {
    const id = caseState.activeId;
    applyDrug(id, sertralin);
    fillSlutRecept(id);
    flushSync();
    expect(getText()).toContain('Sertralin 50 mg');
    editText('Egen text');
    flushSync();
    expect(isTextEdited()).toBe(true);
    expect(getText()).toBe('Egen text');
    resetText();
    flushSync();
    expect(getText()).toContain('Sertralin 50 mg');
    editText('Egen text');
    clearCase();
    flushSync();
    expect(isTextEdited()).toBe(false);
    expect(getText()).toBe('');
  });
  it('sjuksköterskerollen ger alltid journaltext', () => {
    const id = caseState.activeId;
    applyDrug(id, sertralin);
    fillSlutRecept(id);
    caseState.role = 'nurse';
    flushSync();
    expect(getText()).toContain('Ärendet lämnas till läkare för bedömning.');
  });
});

describe('Ärendet — porterat från 4.0', () => {
  it('ta bort läkemedlet i mitten väljer grannen och behåller de andra', () => {
    const a = caseState.activeId; setNameManually(a, 'A');
    addMed(); const b = caseState.activeId; setNameManually(b, 'B');
    addMed(); const c = caseState.activeId; setNameManually(c, 'C');
    selectMed(b);
    removeMed(b);
    expect(caseState.meds.map((m) => m.form.name)).toEqual(['A', 'C']);
    expect(caseState.activeId).toBe(c);
  });
  it('beslut hålls isär mellan läkemedlen', () => {
    const a = caseState.activeId;
    addMed(); const b = caseState.activeId;
    setDecision(a, 'yes');
    setDecision(b, 'no');
    expect(caseState.meds.map((m) => m.decision)).toEqual(['yes', 'no']);
  });
  it('50 snabba ändringar ger samma resultat som en', () => {
    const id = caseState.activeId;
    applyDrug(id, sertralin);
    fillSlutRecept(id);
    for (let i = 0; i < 50; i++) caseState.meds[0].form.doseRaw = String((i % 5) + 1);
    caseState.meds[0].form.doseRaw = '1';
    flushSync();
    const r = getResult(id)!.renewal;
    expect(r.kind === 'ok' && r.coverDays).toBe(300);
  });
});

describe('Midnattsbyte', () => {
  it('resultaten räknas om när datumet byts', () => {
    setMockNow(new Date(2026, 9, 1, 23, 59, 0).getTime());
    refreshToday();
    const id = caseState.activeId;
    setNameManually(id, 'Test 1 mg');
    const m = caseState.meds[0];
    m.form.dateRaw = '2026-08-12'; m.form.doseRaw = '1'; m.form.packageRaw = '100'; m.form.refillsRaw = '3';
    flushSync();
    const before = getResult(id)!.renewal;
    expect(before.kind === 'ok' && before.daysLeft).toBe(249);
    setMockNow(new Date(2026, 9, 2, 0, 1, 0).getTime());
    refreshToday();
    flushSync();
    const after = getResult(id)!.renewal;
    expect(caseState.today).toBe('2026-10-02');
    expect(after.kind === 'ok' && after.daysLeft).toBe(248);
    setMockNow(new Date(2026, 9, 1, 10, 0, 0).getTime());
    refreshToday();
  });
});
