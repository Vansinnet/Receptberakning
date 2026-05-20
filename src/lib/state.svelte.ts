// === SVELTE 5 REAKTIVT TILLSTÅNDSLAGER ===
// Ersätter 3.0:s state.js. All formulärdata lever i $state — inte i DOM.
// $derived-kedjan: formValues → validatedInput → calcResult → UI.
//
// ⚠ Svelte 5-syntax i .svelte.ts-filer:
//    - $state(), $derived(), $effect() stöds på modulnivå
//    - `export let x = $state()` är INTE tillåtet — använd wrapper-objekt
//      eller getter/setter-funktioner för primitiver som ska exporteras

import type { DoseUnit, DoseInterval, CalcResult, MedState } from './types';
import type { PrescribeResult } from './prescribe-calc';
import { validateValues, calcCore } from './calc';
import { getToday, stripManufacturer, parseDateUTC, fmtDate } from './utils';
import { calcPrescribeResult, canRenewMed } from './prescribe-calc';
import { buildPatientText, buildJournalText, buildNurseJournalText } from './text-gen';
import { MAX_MED_CARDS, MAX_LT_PERIODS, MIN_LT_PERIODS } from './constants';

// =====================================================
// TYPER
// =====================================================

export interface FormValues {
  medRaw: string;
  dateVal: string;
  doseRaw: string;
  amtRaw: string;
  refRaw: string;
  leftRaw: string;
  doseUnit: DoseUnit;
  doseInterval: DoseInterval;
  notCalculable: boolean;
  atcCode: string | null;
  nplId: string | null;
}

export interface MedCard {
  _cardId: number;
  form: FormValues;
  decision: 'yes' | 'no' | null;
  activeTab: 'patient' | 'journal';
  patientLang: 'sv' | 'en';
}

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

// =====================================================
// APP-STATE — exporterat $state-objekt för direkt access
// =====================================================

export const appState = $state({
  nextCardId: 2,
  activeMedIdx: 0,
  nurseViewActive: false,
  nurseVitalNormal: false,
  nurseFollowUpAdequate: false,
  currentDate: new Date().toDateString(),
});

// =====================================================
// LÄKEMEDELSKORT
// =====================================================

export const medCards = $state<MedCard[]>([createEmptyCard(1)]);

export function pushMedCard(): number | null {
  if (medCards.length >= MAX_MED_CARDS) return null;
  const cardId = appState.nextCardId++;
  medCards.push(createEmptyCard(cardId));
  return cardId;
}

export function spliceMedCard(i: number): void {
  if (medCards.length <= 1) return;
  const removedCardId = medCards[i]._cardId;
  medCards.splice(i, 1);
  delete _cardResultsCache[removedCardId];
  delete _cardStatus[removedCardId];
  delete _prescribeState[removedCardId];
  if (appState.activeMedIdx > i) {
    appState.activeMedIdx -= 1;
  } else if (appState.activeMedIdx >= medCards.length) {
    appState.activeMedIdx = medCards.length - 1;
  }
}

// =====================================================
// NURSE — RESET
// =====================================================

export function resetNurseState(): void {
  appState.nurseViewActive = false;
  appState.nurseVitalNormal = false;
  appState.nurseFollowUpAdequate = false;
}

// =====================================================
// MIDNATT — TRIGGA OM $derived-KEDJAN
// =====================================================

export function tickCurrentDate(): void {
  const newKey = new Date().toDateString();
  if (appState.currentDate !== newKey) {
    appState.currentDate = newKey;
  }
}

// =====================================================
// $derived: VALIDERING + BERÄKNING
// =====================================================

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

// =====================================================
// $derived: TEXTORKESTRERING
// =====================================================

type CardStatusCache = {
  valid: boolean;
  calculable: boolean;
  statusText: string;
  consumptionPct: number;
  daysToPrescribedEnd: number;
  prescribedEndDateStr: string;
};

interface TextResult {
  patientText: string;
  patientTextEn: string;
  journalText: string;
  cardStatuses: Record<number, CardStatusCache>;
  cacheUpdates: Array<{ cardId: number; entry: { fp: string; cr: CardResult | null; status: CardStatusCache } }>;
}

export interface CardResult {
  cardId: number;
  calc: CalcResult;
  medNameStripped: string;
}

let _cardResultsCache = $state<Record<number, { fp: string; cr: CardResult | null; status: CardStatusCache }>>({});

let _cardStatus = $state<Record<number, CardStatusCache>>({});

export function getCardStatus(cardId: number): CardStatusCache | undefined {
  return _cardStatus[cardId];
}

export function getCachedResult(cardId: number): CardResult | null {
  return _cardResultsCache[cardId]?.cr ?? null;
}

const _prescribeEnds = $derived.by((): Record<number, string> => {
  const result: Record<number, string> = {};
  for (const card of medCards) {
    const ps = _prescribeState[card._cardId];
    if (!ps?.packageSize) continue;
    const cached = _cardResultsCache[card._cardId];
    if (!cached?.cr) continue;
    const s: MedState = {
      _cardId: card._cardId,
      dose: cached.cr.calc.dose,
      doseInterval: cached.cr.calc.doseInterval,
      doseUnit: cached.cr.calc.doseUnit,
      prescribedEndDateStr: cached.cr.calc.prescribedEndDateStr,
    };
    const pr = calcPrescribeResult(s, ps);
    if (pr?.endDateStr) result[card._cardId] = pr.endDateStr;
  }
  return result;
});

const _prescribeSummary = $derived.by((): Record<number, PrescribeResult | null> => {
  const result: Record<number, PrescribeResult | null> = {};
  for (const card of medCards) {
    const ps = _prescribeState[card._cardId];
    const cached = _cardResultsCache[card._cardId];
    if (!ps || !cached?.cr) { result[card._cardId] = null; continue; }
    result[card._cardId] = calcPrescribeResult({
      _cardId: card._cardId,
      dose: cached.cr.calc.dose,
      doseInterval: cached.cr.calc.doseInterval,
      doseUnit: cached.cr.calc.doseUnit,
      prescribedEndDateStr: cached.cr.calc.prescribedEndDateStr,
    }, ps);
  }
  return result;
});

export function getPrescribeSummary() { return _prescribeSummary; }

interface CardsForTextEntry {
  name: string; i: number; dose: number; doseUnitLabel: string; doseUnit: string;
  total: number; pDateStr: string; prescribedEndDateStr: string; displayAvgStr: string;
  avgNote: string; daysToPrescribedEnd: number; consumptionPct: number;
  decision: 'yes' | 'no' | null;
}

function _computeAllCards(): {
  cardResults: CardResult[];
  cardStatuses: Record<number, CardStatusCache>;
  cacheUpdates: Array<{ cardId: number; entry: { fp: string; cr: CardResult | null; status: CardStatusCache } }>;
  medCardMap: Map<number, MedCard>;
} {
  const cardResults: CardResult[] = [];
  const cardStatuses: Record<number, CardStatusCache> = {};
  const cacheUpdates: Array<{ cardId: number; entry: { fp: string; cr: CardResult | null; status: CardStatusCache } }> = [];
  const medCardMap = new Map(medCards.map(m => [m._cardId, m]));
  for (let i = 0; i < medCards.length; i++) {
    const card = medCards[i];
    if (!card) continue;
    const f = card.form;
    if (!f.medRaw) {
      cardStatuses[card._cardId] = {
        valid: false, calculable: false,
        statusText: 'Ej ifyllt', consumptionPct: 0, daysToPrescribedEnd: 0,
        prescribedEndDateStr: '',
      };
      continue;
    }

    const fp = [f.medRaw, f.dateVal, f.doseRaw, f.amtRaw, f.refRaw, f.leftRaw,
      f.doseUnit, f.doseInterval, f.notCalculable, card.decision, appState.currentDate].join('\x00');

    const cached = _cardResultsCache[card._cardId];
    if (cached && cached.fp === fp) {
      cardStatuses[card._cardId] = cached.status;
      if (cached.cr) cardResults.push(cached.cr);
      continue;
    }

    const validated = validateValues(
      f.medRaw, f.dateVal, f.doseRaw, f.amtRaw, f.refRaw, f.leftRaw,
      String(f.doseInterval), f.doseUnit, f.notCalculable,
    );

    const calc = calcCore(validated);

    if (!calc.valid || calc.calculable === false) {
      const status: CardStatusCache = {
        valid: calc.valid, calculable: calc.calculable ?? false,
        statusText: calc.statusText || '—',
        consumptionPct: calc.consumptionPct,
        daysToPrescribedEnd: calc.daysToPrescribedEnd ?? 0,
        prescribedEndDateStr: '',
      };
      cardStatuses[card._cardId] = status;
      cacheUpdates.push({ cardId: card._cardId, entry: { fp, cr: null, status } });
      continue;
    }

    const medNameStripped = stripManufacturer(f.medRaw) || f.medRaw;

    const cr: CardResult = { cardId: card._cardId, calc, medNameStripped };
    const status: CardStatusCache = {
      valid: true, calculable: true,
      statusText: calc.statusText || 'OK',
      consumptionPct: calc.consumptionPct,
      daysToPrescribedEnd: calc.daysToPrescribedEnd ?? 0,
      prescribedEndDateStr: calc.prescribedEndDateStr ?? '',
    };
    cardResults.push(cr);
    cardStatuses[card._cardId] = status;
    cacheUpdates.push({ cardId: card._cardId, entry: { fp, cr, status } });
  }
  return { cardResults, cardStatuses, cacheUpdates, medCardMap };
}

function _buildCardsForText(cardResults: CardResult[], medCardMap: Map<number, MedCard>): CardsForTextEntry[] {
  const entries: CardsForTextEntry[] = [];
  for (const cr of cardResults) {
    const mc = medCardMap.get(cr.cardId);
    entries.push({
      name: cr.medNameStripped, i: cr.cardId,
      dose: cr.calc.dose ?? 0, doseUnitLabel: cr.calc.doseUnitLabel ?? 'st/dag',
      doseUnit: cr.calc.doseUnit ?? 'st', total: cr.calc.total ?? 0,
      pDateStr: cr.calc.pDateStr ?? '', prescribedEndDateStr: cr.calc.prescribedEndDateStr ?? '',
      displayAvgStr: cr.calc.displayAvgStr ?? '', avgNote: cr.calc.avgNote ?? '',
      daysToPrescribedEnd: cr.calc.daysToPrescribedEnd ?? 0,
      consumptionPct: cr.calc.consumptionPct,
      decision: mc?.decision ?? null,
    });
  }
  return entries;
}

function _buildTextResult(
  cardResults: CardResult[],
  cardsForText: CardsForTextEntry[],
  cardStatuses: Record<number, CardStatusCache>,
  cacheUpdates: Array<{ cardId: number; entry: { fp: string; cr: CardResult | null; status: CardStatusCache } }>,
  prescribeEnds: Record<number, string>,
): TextResult {
  const validCount = cardResults.length;

  const ptCards = cardsForText.map(c => {
    let contactDateStr = '';
    if (c.daysToPrescribedEnd >= 14 && c.prescribedEndDateStr) {
      const parsed = parseDateUTC(c.prescribedEndDateStr);
      if (parsed) {
        parsed.setUTCDate(parsed.getUTCDate() - 7);
        contactDateStr = fmtDate(parsed);
      }
    }
    return {
      name: c.name, prescribedEndDateStr: c.prescribedEndDateStr, decision: c.decision,
      daysToPrescribedEnd: c.daysToPrescribedEnd, contactDateStr,
      prescribeEnd: prescribeEnds[c.i] ?? '',
    };
  });

  let patientText = '', patientTextEn = '', journalText = '';
  try {
    patientText   = buildPatientText('sv', ptCards);
    patientTextEn = buildPatientText('en', ptCards);
    journalText   = buildJournalText(cardsForText, validCount, prescribeEnds);
  } catch (e) {
    console.error('[v3 _texts] Textgenerering kraschade:', e);
    patientText = patientTextEn = journalText = 'Ett internt fel uppstod vid textgenerering.';
  }

  if (appState.nurseViewActive) {
    const nurseDecisionMap = new Map(medCards.map(mc => [mc._cardId, mc.decision]));
    const nurseJournalText = buildNurseJournalText(
      cardResults.map(cr => ({
        _cardId: cr.cardId, medRaw: cr.medNameStripped,
        valid: true, calculable: true,
        prescribedEndDateStr: cr.calc.prescribedEndDateStr,
        daysToPrescribedEnd: cr.calc.daysToPrescribedEnd ?? 0,
        consumptionPct: cr.calc.consumptionPct,
        decision: nurseDecisionMap.get(cr.cardId) ?? null,
      })),
      appState.nurseVitalNormal,
      appState.nurseFollowUpAdequate,
    );
    return { patientText: '', patientTextEn: '', journalText: nurseJournalText, cardStatuses, cacheUpdates };
  }

  return { patientText, patientTextEn, journalText, cardStatuses, cacheUpdates };
}

const _texts = $derived.by((): TextResult => {
  try {
    void appState.currentDate;
    const computed = _computeAllCards();
    if (computed.cardResults.length === 0) {
      return { patientText: '', patientTextEn: '', journalText: '', cardStatuses: computed.cardStatuses, cacheUpdates: computed.cacheUpdates };
    }
    const cardsForText = _buildCardsForText(computed.cardResults, computed.medCardMap);
    return _buildTextResult(computed.cardResults, cardsForText, computed.cardStatuses, computed.cacheUpdates, _prescribeEnds);
  } catch (e) {
    console.error('[v3 _texts] KRASCH:', e instanceof Error ? e.stack : String(e));
    return { patientText: '', patientTextEn: '', journalText: 'Textgenerering misslyckades', cardStatuses: {} as Record<number, CardStatusCache>, cacheUpdates: [] };
  }
});

export function getActiveTexts(): TextResult {
  const { patientText, patientTextEn, journalText } = _texts;
  return { patientText, patientTextEn, journalText, cardStatuses: {}, cacheUpdates: [] };
}

export function _syncCardStatus(): void {
  const statuses = _texts.cardStatuses;
  for (const cardId of Object.keys(statuses)) {
    _cardStatus[Number(cardId)] = statuses[Number(cardId)];
  }
  const caches = _texts.cacheUpdates;
  for (const c of caches) {
    _cardResultsCache[c.cardId] = c.entry;
  }
}

export function _textsVersion(): number {
  void _texts.patientText;
  return Object.keys(_texts.cardStatuses).length;
}

// =====================================================
// LÄNGVARIG FÖRBRUKNING — PERIODER
// =====================================================

export interface LTPeriod {
  start: string;
  total: number;
  end: string;
}

export const ltPeriods = $state<LTPeriod[]>([{ start: '', total: 0, end: '' }]);

export const ltState = $state({
  medRaw: '',
  doseRaw: '',
});

export function setLtPeriodField(i: number, field: keyof LTPeriod, value: string): void {
  if (!ltPeriods[i]) return;
  if (field === 'total') {
    ltPeriods[i].total = parseFloat(value) || 0;
  } else if (field === 'start') {
    ltPeriods[i].start = value;
  } else if (field === 'end') {
    ltPeriods[i].end = value;
  }
}

export function pushLtPeriod(): boolean {
  if (ltPeriods.length >= MAX_LT_PERIODS) return false;
  ltPeriods.push({ start: '', total: 0, end: '' });
  return true;
}

export function spliceLtPeriod(i: number): boolean {
  if (ltPeriods.length <= MIN_LT_PERIODS) return false;
  ltPeriods.splice(i, 1);
  return true;
}

export function resetLtPeriods(): void {
  ltPeriods.length = 0;
  ltPeriods.push({ start: '', total: 0, end: '' });
}

// =====================================================
// PRESCRIBE STATE
// =====================================================

export interface PrescribeEntry {
  packageSize: string;
  _lastAmt?: string;
  mode?: string;
  months?: number;
  endDate?: string;
  startFromToday?: boolean;
}

const _prescribeState = $state<Record<number, PrescribeEntry>>({});

export function getPrescribeState(cardId: number): PrescribeEntry | undefined {
  return _prescribeState[cardId];
}

export function initPrescribeState(cardId: number, initial: PrescribeEntry): void {
  _prescribeState[cardId] = initial;
}

export function applyPrescribeStatePatch(cardId: number, patch: Partial<PrescribeEntry>): void {
  if (!_prescribeState[cardId]) return;
  Object.assign(_prescribeState[cardId], patch);
}

export function clearPrescribeState(): void {
  for (const key of Object.keys(_prescribeState)) {
    delete _prescribeState[Number(key)];
  }
}

export function clearCardPrescribeState(cardId: number): void {
  delete _prescribeState[cardId];
}

// =====================================================
// ÅTERSTÄLLNING (pagehide / clearAll)
// =====================================================

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
  _cardResultsCache = {};
  _cardStatus = {};
}

const _hasSummary = $derived.by(() => {
  let count = 0;
  for (let i = 0; i < medCards.length; i++) {
    const ps = _prescribeState[medCards[i]._cardId];
    if (!ps || !ps.packageSize) continue;
    const status = _cardStatus[medCards[i]._cardId];
    if (!canRenewMed({
      _cardId: medCards[i]._cardId,
      valid: status?.valid ?? false,
      calculable: status?.calculable ?? false,
      decision: medCards[i].decision,
    })) continue;
    count++;
  }
  return count >= 2;
});

export function getHasSummary(): boolean {
  return _hasSummary;
}
