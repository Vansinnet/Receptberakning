import type { FormValues, MedCard } from './types';
import { validateValues, calcCore } from './calc';
import { MAX_MED_CARDS } from './constants';
import { getNow } from './clock';
import { todayStr } from './utils';

export function createEmptyCard(cardId: number): MedCard {
  return {
    _cardId: cardId,
    form: {
      medRaw: '', dateVal: '', doseRaw: '', amtRaw: '', refRaw: '', leftRaw: '',
      doseUnit: 'st', doseInterval: 1, notCalculable: false,
      atcCode: null, nplId: null,
    },
    decision: null,
    patientLang: 'sv',
  };
}

export const appState = $state({
  nextCardId: 2,
  activeMedIdx: 0,
  nurseViewActive: false,
  nurseVitalNormal: false,
  nurseFollowUpAdequate: false,
  currentDate: todayStr(),
});

export const medCards = $state<MedCard[]>([createEmptyCard(1)]);

export function pushMedCard(): number | null {
  if (medCards.length >= MAX_MED_CARDS) return null;
  const cardId = appState.nextCardId++;
  medCards.push(createEmptyCard(cardId));
  return cardId;
}

export function resetNurseState(): void {
  appState.nurseViewActive = false;
  appState.nurseVitalNormal = false;
  appState.nurseFollowUpAdequate = false;
}

export function tickCurrentDate(): void {
  const newKey = todayStr();
  if (appState.currentDate !== newKey) {
    appState.currentDate = newKey;
  }
}

const _activeValidated = $derived.by(() => {
  void appState.currentDate;
  const c = medCards[appState.activeMedIdx];
  const f = c?.form;
  return validateValues(
    f?.medRaw ?? '',
    f?.dateVal ?? '',
    f?.doseRaw ?? '',
    f?.amtRaw ?? '',
    f?.refRaw ?? '',
    f?.leftRaw ?? '',
    String(f?.doseInterval ?? 1),
    f?.doseUnit ?? 'st',
    f?.notCalculable ?? false,
  );
});

export function getActiveValidated() { return _activeValidated; }

const _activeResult = $derived(calcCore(_activeValidated));

export function getActiveResult() { return _activeResult; }

export function clearCardForm(cardId: number): void {
  const card = medCards.find(c => c._cardId === cardId);
  if (!card) return;
  card.form = {
    medRaw: '', dateVal: '', doseRaw: '', amtRaw: '', refRaw: '', leftRaw: '',
    doseUnit: 'st', doseInterval: 1, notCalculable: false,
    atcCode: null, nplId: null,
  };
  card.decision = null;
}
