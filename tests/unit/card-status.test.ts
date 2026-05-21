import { describe, it, expect, beforeEach } from 'vitest';
import {
  medCards,
  pushMedCard,
  spliceMedCard,
  appState,
  getCardStatus,
  getActiveTexts,
  clearAllMedState,
  getActiveResult,
  _syncCardStatus,
  getTextsState,
} from '../../src/lib/state.svelte';
import { setMockNow } from '../../src/lib/clock';

setMockNow(new Date('2025-05-20T00:00:00Z').getTime());

function fillCard(idx: number, overrides: Partial<{
  medRaw: string; dateVal: string; doseRaw: string; amtRaw: string; refRaw: string; leftRaw: string;
}> = {}) {
  if (idx < medCards.length) {
    const f = medCards[idx].form;
    if (overrides.medRaw !== undefined) f.medRaw = overrides.medRaw;
    if (overrides.dateVal !== undefined) f.dateVal = overrides.dateVal;
    if (overrides.doseRaw !== undefined) f.doseRaw = overrides.doseRaw;
    if (overrides.amtRaw !== undefined) f.amtRaw = overrides.amtRaw;
    if (overrides.refRaw !== undefined) f.refRaw = overrides.refRaw;
    if (overrides.leftRaw !== undefined) f.leftRaw = overrides.leftRaw;
  }
}

function syncAndGetStatus(cardId: number) {
  void getTextsState();
  _syncCardStatus();
  return getCardStatus(cardId);
}

beforeEach(() => {
  clearAllMedState();
});

describe('getActiveTexts — TextResult shape', () => {
  it('getActiveTexts() returns patientText, patientTextEn, journalText', () => {
    const t = getActiveTexts();
    expect(t).toHaveProperty('patientText');
    expect(t).toHaveProperty('patientTextEn');
    expect(t).toHaveProperty('journalText');
  });
});

describe('_syncCardStatus populates _cardStatus ($state)', () => {
  it('getCardStatus() returns CardStatusCache after sync', () => {
    fillCard(0, { medRaw: 'Sertralin 50 mg', dateVal: '2024-08-13', doseRaw: '1', amtRaw: '100', refRaw: '3' });
    const cs = syncAndGetStatus(1);
    expect(cs).toBeDefined();
    expect(cs!.valid).toBe(true);
    expect(cs!.calculable).toBe(true);
    expect(typeof cs!.consumptionPct).toBe('number');
    expect(typeof cs!.daysToPrescribedEnd).toBe('number');
  });

  it('cardStatus tracks consumptionPct', () => {
    fillCard(0, { medRaw: 'Sertralin 50 mg', dateVal: '2024-08-13', doseRaw: '1', amtRaw: '100', refRaw: '3' });
    const cs = syncAndGetStatus(1);
    expect(cs!.consumptionPct).toBeGreaterThan(0);
  });

  it('cardStatus tracks daysToPrescribedEnd', () => {
    fillCard(0, { medRaw: 'Sertralin 50 mg', dateVal: '2024-08-13', doseRaw: '1', amtRaw: '100', refRaw: '3' });
    const cs = syncAndGetStatus(1);
    expect(cs!.daysToPrescribedEnd).toBeGreaterThan(0);
  });
});

describe('spliceMedCard cleans both caches', () => {
  it('removed card returns undefined from getCardStatus()', () => {
    fillCard(0, { medRaw: 'Sertralin 50 mg', dateVal: '2024-08-13', doseRaw: '1', amtRaw: '100', refRaw: '3' });
    syncAndGetStatus(1);
    pushMedCard();
    fillCard(1, { medRaw: 'Tramadol 50 mg', dateVal: '2024-08-13', doseRaw: '1', amtRaw: '100', refRaw: '3' });
    syncAndGetStatus(2);
    spliceMedCard(0);
    expect(getCardStatus(1)).toBeUndefined();
  });

  it('MedCard.decision is null initially', () => {
    expect(medCards[0].decision).toBe(null);
  });
});

describe('clearAllMedState cleans both caches', () => {
  it('all statuses return undefined after clear', () => {
    fillCard(0, { medRaw: 'Sertralin 50 mg', dateVal: '2024-08-13', doseRaw: '1', amtRaw: '100', refRaw: '3' });
    syncAndGetStatus(1);
    clearAllMedState();
    expect(getCardStatus(1)).toBeUndefined();
  });
});

describe('no infinite loop', () => {
  it('50 rapid form changes complete', () => {
    fillCard(0, { medRaw: 'Sertralin 50 mg', dateVal: '2024-08-13', doseRaw: '1', amtRaw: '100', refRaw: '3' });
    for (let i = 0; i < 50; i++) {
      medCards[0].form.medRaw = i % 2 === 0 ? 'Sertralin 50 mg' : 'Tramadol 50 mg';
      void getActiveTexts();
    }
    expect(true).toBe(true);
  });
});
