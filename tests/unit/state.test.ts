// T28, T29 och regressionsfel från granskningen av 4.0, testade på ärendets state.
import { describe, it, expect, beforeEach } from 'vitest';
import { flushSync } from 'svelte';
import { setMockNow } from '../../src/lib/clock';
import {
  caseState, addMed, applyDrug, clearCase, editText, getResult, getText, isTextEdited, refreshToday,
  removeMed, resetText, setDecision, setNameManually, setPrescribePackage,
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
