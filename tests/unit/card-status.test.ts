import { describe, it, expect, beforeAll } from 'vitest';
import { setMockNow } from '../../src/lib/clock';
import { medCards, getCardStatus, getActiveTexts, _syncCardStatus, clearAllMedState, spliceMedCard } from '../../src/lib/state.svelte';

const MOCK_TODAY_MS = new Date('2025-06-15T00:00:00.000Z').getTime();

beforeAll(() => {
  setMockNow(MOCK_TODAY_MS);
});

function fillCard(idx: number, overrides: Partial<typeof medCards[0]['form']> = {}) {
  medCards[idx].form = {
    medRaw: 'Testabol 10 mg', dateVal: '2025-05-16', doseRaw: '1', amtRaw: '100', refRaw: '3', leftRaw: '',
    doseUnit: 'st', doseInterval: 1, notCalculable: false, atcCode: null, nplId: null,
    ...overrides,
  };
}

function syncAndGetStatus(cardId: number) {
  getActiveTexts();
  _syncCardStatus();
  return getCardStatus(cardId);
}

describe('getActiveTexts — TextResult shape', () => {
  it('getActiveTexts() returns patientText, patientTextEn, journalText', () => {
    clearAllMedState();
    fillCard(0);
    const texts = getActiveTexts();
    expect(typeof texts.patientText).toBe('string');
    expect(typeof texts.patientTextEn).toBe('string');
    expect(typeof texts.journalText).toBe('string');
  });
});

describe('_syncCardStatus populates _cardStatus ($state)', () => {
  it('getCardStatus() returns CardStatusCache after sync', () => {
    clearAllMedState();
    fillCard(0);
    const cs = syncAndGetStatus(1);
    expect(cs).toBeDefined();
    expect(cs?.valid).toBe(true);
    expect(cs?.calculable).toBe(true);
  });

  it('correct isTooEarly for early scenario', () => {
    clearAllMedState();
    fillCard(0, { dateVal: '2024-11-28', leftRaw: '200' });
    const cs = syncAndGetStatus(1);
    expect(cs?.isTooEarly).toBe(true);
    expect(cs?.isOveruse).toBe(false);
  });

  it('correct isOveruse for overuse scenario', () => {
    clearAllMedState();
    fillCard(0, { leftRaw: '80' });
    const cs = syncAndGetStatus(1);
    expect(cs?.isOveruse).toBe(true);
  });

  it('updates all cards, not just active', () => {
    clearAllMedState();
    fillCard(0, { dateVal: '2024-11-28', leftRaw: '200' });
    medCards[1] = {
      _cardId: 2,
      form: { medRaw: 'Testabol 10 mg', dateVal: '2024-11-28', doseRaw: '1', amtRaw: '100', refRaw: '3', leftRaw: '200',
        doseUnit: 'st', doseInterval: 1, notCalculable: false, atcCode: null, nplId: null },
      earlyRenewalDecision: null,
      activeTab: 'patient' as const,
      patientLang: 'sv' as const,
    };
    getActiveTexts();
    _syncCardStatus();
    expect(getCardStatus(1)).toBeDefined();
    expect(getCardStatus(2)).toBeDefined();
    expect(getCardStatus(2)?.isTooEarly).toBe(true);
  });
});

describe('spliceMedCard cleans both caches', () => {
  it('removed card returns undefined from getCardStatus()', () => {
    clearAllMedState();
    fillCard(0, { leftRaw: '80' });
    // Need ≥2 cards for spliceMedCard to work
    medCards[1] = {
      _cardId: 2,
      form: { medRaw: '', dateVal: '', doseRaw: '', amtRaw: '', refRaw: '', leftRaw: '',
        doseUnit: 'st', doseInterval: 1, notCalculable: false, atcCode: null, nplId: null },
      earlyRenewalDecision: null, activeTab: 'patient' as const, patientLang: 'sv' as const,
    };
    syncAndGetStatus(1);
    expect(getCardStatus(1)).toBeDefined();
    spliceMedCard(0);
    expect(getCardStatus(1)).toBeUndefined();
  });
});

describe('clearAllMedState cleans both caches', () => {
  it('all statuses return undefined after clear', () => {
    clearAllMedState();
    fillCard(0);
    syncAndGetStatus(1);
    clearAllMedState();
    expect(getCardStatus(1)).toBeUndefined();
  });
});

describe('no infinite loop', () => {
  it('50 rapid form changes complete', () => {
    clearAllMedState();
    fillCard(0);
    const start = Date.now();
    for (let i = 0; i < 50; i++) {
      medCards[0].form.leftRaw = String(i);
      _syncCardStatus();
    }
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(3000);
  });
});
