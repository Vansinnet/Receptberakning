import type { MedCard } from './types';
import { MAX_MED_CARDS } from './constants';
import { todayStr } from './utils';
import { validateValues } from './calc';
import { getActiveCalc } from './calc-state.svelte';
import { clearCardPrescribeState, clearPrescribeState } from './prescribe-state.svelte';
import { resetLtPeriods, ltState } from './longterm-state.svelte';

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

/** Lägger till ett nytt tomt läkemedelskort. Returnerar cardId, eller null om MAX_MED_CARDS nåtts. */
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

export function getActiveResult() { return getActiveCalc(); }

export function clearCardForm(cardId: number): void {
  const card = medCards.find(c => c._cardId === cardId);
  if (!card) return;
  card.form = createEmptyCard(0).form;
  card.decision = null;
}

export function spliceMedCard(i: number): void {
  if (medCards.length <= 1) return;
  const removedCardId = medCards[i]._cardId;
  medCards.splice(i, 1);
  clearCardPrescribeState(removedCardId);
  if (appState.activeMedIdx > i) {
    appState.activeMedIdx -= 1;
  } else if (appState.activeMedIdx >= medCards.length) {
    appState.activeMedIdx = medCards.length - 1;
  }
}

/** Rensar all patientdata — återställer medCards, appState, ltState och prescribeState. */
export function clearAllMedState(): void {
  medCards.length = 0;
  medCards.push(createEmptyCard(1));
  appState.activeMedIdx = 0;
  appState.nextCardId = 2;
  clearPrescribeState();
  resetLtPeriods();
  ltState.medRaw = '';
  ltState.doseRaw = '';
  resetNurseState();
}
