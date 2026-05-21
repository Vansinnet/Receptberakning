import type { FormValues, MedCard } from './types';
import { validateValues, calcCore } from './calc';
import { MAX_MED_CARDS } from './constants';
import { getNow } from './clock';

function createEmptyCard(cardId: number): MedCard {
  return {
    _cardId: cardId,
    form: {
      medRaw: '', dateVal: '', doseRaw: '', amtRaw: '', refRaw: '', leftRaw: '',
      doseUnit: 'st', doseInterval: 1, notCalculable: false,
      atcCode: null, nplId: null,
    },
    decision: null,
    activeTab: 'patient',
    patientLang: 'sv',
  };
}

export const appState = $state({
  nextCardId: 2,
  activeMedIdx: 0,
  nurseViewActive: false,
  nurseVitalNormal: false,
  nurseFollowUpAdequate: false,
  currentDate: getNow().toDateString(),
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
  const newKey = getNow().toDateString();
  if (appState.currentDate !== newKey) {
    appState.currentDate = newKey;
  }
}

const _activeValidated = $derived.by(() => {
  void appState.currentDate;
  return validateValues(
    medCards[appState.activeMedIdx]?.form?.medRaw ?? '',
    medCards[appState.activeMedIdx]?.form?.dateVal ?? '',
    medCards[appState.activeMedIdx]?.form?.doseRaw ?? '',
    medCards[appState.activeMedIdx]?.form?.amtRaw ?? '',
    medCards[appState.activeMedIdx]?.form?.refRaw ?? '',
    medCards[appState.activeMedIdx]?.form?.leftRaw ?? '',
    String(medCards[appState.activeMedIdx]?.form?.doseInterval ?? 1),
    medCards[appState.activeMedIdx]?.form?.doseUnit ?? 'st',
    medCards[appState.activeMedIdx]?.form?.notCalculable ?? false,
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
