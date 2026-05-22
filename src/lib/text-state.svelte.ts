import type { CalcResult, MedCard, CardStatusCache, CardResult, CardsForTextEntry, PrescribeEntry, PrescribeInput } from './types';
import type { PrescribeResult } from './prescribe-calc';
import { validateValues, calcCore } from './calc';
import { stripManufacturer, parseDateUTC, fmtDate } from './utils';
import { CONTACT_REMINDER_DAYS } from './constants';
import { calcPrescribeResult } from './prescribe-calc';
import { buildPatientText, buildJournalText, buildNurseJournalText } from './text-gen';
import { appState, medCards, resetNurseState, createEmptyCard, getActiveResult } from './form-state.svelte';
import { getPrescribeState, clearPrescribeState, clearCardPrescribeState } from './prescribe-state.svelte';
import { ltState, resetLtPeriods } from './longterm-state.svelte';
import { _cardResultsCache, _cardStatus, _resetCaches } from './cache-state.svelte';

const _prescribeSummaryState = $state<Record<number, PrescribeResult | null>>({});

interface TextResult {
  patientText: string;
  patientTextEn: string;
  journalText: string;
  cardStatuses: Record<number, CardStatusCache>;
  cacheUpdates: Array<{ cardId: number; entry: { fp: string; cr: CardResult | null; status: CardStatusCache } }>;
  prescribeSummary: Record<number, PrescribeResult | null>;
}

export interface ActiveTexts {
  patientText: string;
  patientTextEn: string;
  journalText: string;
}

export function getPrescribeSummary() { return _prescribeSummaryState; }

function _computeAllCards(): {
  cardResults: CardResult[];
  cardStatuses: Record<number, CardStatusCache>;
  cacheUpdates: Array<{ cardId: number; entry: { fp: string; cr: CardResult | null; status: CardStatusCache } }>;
  medCardMap: Map<number, MedCard>;
  prescribeEnds: Record<number, string>;
  prescribeSummary: Record<number, PrescribeResult | null>;
} {
  const cardResults: CardResult[] = [];
  const cardStatuses: Record<number, CardStatusCache> = {};
  const cacheUpdates: Array<{ cardId: number; entry: { fp: string; cr: CardResult | null; status: CardStatusCache } }> = [];
  const medCardMap = new Map(medCards.map(m => [m._cardId, m]));
  const prescribeEnds: Record<number, string> = {};
  const prescribeSummary: Record<number, PrescribeResult | null> = {};

  function _tryPrescribe(cardId: number, calc: CalcResult): void {
    const ps = getPrescribeState(cardId);
    if (!ps) { prescribeSummary[cardId] = null; return; }
    const s: PrescribeInput = {
      _cardId: cardId,
      dose: calc.dose,
      doseInterval: calc.doseInterval,
      doseUnit: calc.doseUnit,
      prescribedEndDateStr: calc.prescribedEndDateStr,
    };
    const pr = calcPrescribeResult(s, ps);
    if (pr) {
      prescribeSummary[cardId] = pr;
      if (pr.endDateStr) prescribeEnds[cardId] = pr.endDateStr;
    } else {
      prescribeSummary[cardId] = null;
    }
  }
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
      prescribeSummary[card._cardId] = null;
      continue;
    }

    const fp = [f.medRaw, f.dateVal, f.doseRaw, f.amtRaw, f.refRaw, f.leftRaw,
      f.doseUnit, f.doseInterval, f.notCalculable, appState.currentDate].join('\x00');

    const cached = _cardResultsCache[card._cardId];
    if (cached && cached.fp === fp) {
      cardStatuses[card._cardId] = cached.status;
      if (cached.cr) {
        cardResults.push(cached.cr);
        _tryPrescribe(card._cardId, cached.cr.calc);
      } else {
        prescribeSummary[card._cardId] = null;
      }
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
      prescribeSummary[card._cardId] = null;
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
    _tryPrescribe(card._cardId, calc);
  }
  return { cardResults, cardStatuses, cacheUpdates, medCardMap, prescribeEnds, prescribeSummary };
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
  prescribeSummary: Record<number, PrescribeResult | null>,
): TextResult {
  const validCount = cardResults.length;

  const ptCards = cardsForText.map(c => {
    let contactDateStr = '';
      if (c.daysToPrescribedEnd >= CONTACT_REMINDER_DAYS && c.prescribedEndDateStr) {
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
    return { patientText: '', patientTextEn: '', journalText: nurseJournalText, cardStatuses, cacheUpdates, prescribeSummary };
  }

  return { patientText, patientTextEn, journalText, cardStatuses, cacheUpdates, prescribeSummary };
}

const _texts = $derived.by((): TextResult => {
  try {
    void appState.currentDate;
    const computed = _computeAllCards();
    if (computed.cardResults.length === 0) {
      return { patientText: '', patientTextEn: '', journalText: '', cardStatuses: computed.cardStatuses, cacheUpdates: computed.cacheUpdates, prescribeSummary: computed.prescribeSummary };
    }
    const cardsForText = _buildCardsForText(computed.cardResults, computed.medCardMap);
    return _buildTextResult(computed.cardResults, cardsForText, computed.cardStatuses, computed.cacheUpdates, computed.prescribeEnds, computed.prescribeSummary);
  } catch (e) {
    console.error('[v3 _texts] KRASCH:', e instanceof Error ? e.stack : String(e));
    return { patientText: '', patientTextEn: '', journalText: 'Textgenerering misslyckades', cardStatuses: {} as Record<number, CardStatusCache>, cacheUpdates: [], prescribeSummary: {} };
  }
});

export function getActiveTexts(): ActiveTexts {
  const { patientText, patientTextEn, journalText } = _texts;
  return { patientText, patientTextEn, journalText };
}

export function getActivePrescribeResult(): PrescribeResult | null {
  const result = getActiveResult();
  if (!result.valid || result.calculable === false) return null;
  const card = medCards[appState.activeMedIdx];
  if (!card) return null;
  const ps = getPrescribeState(card._cardId);
  const s: PrescribeInput = {
    _cardId: card._cardId,
    dose: result.dose,
    doseInterval: result.doseInterval,
    doseUnit: result.doseUnit,
    prescribedEndDateStr: result.prescribedEndDateStr,
  };
  return calcPrescribeResult(s, ps ?? null);
}

export function _syncCardStatus(): void {
  const statuses = _texts.cardStatuses;
  for (const [cardIdStr, status] of Object.entries(statuses)) {
    const cardId = Number(cardIdStr);
    _cardStatus[cardId] = status;
    if (!status.valid) {
      const card = medCards.find(c => c._cardId === cardId);
      if (card && card.decision !== null) {
        card.decision = null;
      }
    }
  }
  const caches = _texts.cacheUpdates;
  for (const c of caches) {
    _cardResultsCache[c.cardId] = c.entry;
  }
  const summary = _texts.prescribeSummary;
  for (const [cardIdStr, pr] of Object.entries(summary)) {
    _prescribeSummaryState[Number(cardIdStr)] = pr;
  }
}

export function getTextsState() { return _texts; }

const _hasSummary = $derived.by(() => {
  let count = 0;
  const summary = _prescribeSummaryState;
  for (let i = 0; i < medCards.length; i++) {
    if (!summary[medCards[i]._cardId]) continue;
    if (medCards[i].decision === 'no') continue;
    count++;
  }
  return count >= 2;
});

export function getHasSummary(): boolean {
  return _hasSummary;
}

export function spliceMedCard(i: number): void {
  if (medCards.length <= 1) return;
  const removedCardId = medCards[i]._cardId;
  medCards.splice(i, 1);
  delete _cardResultsCache[removedCardId];
  delete _cardStatus[removedCardId];
  delete _prescribeSummaryState[removedCardId];
  clearCardPrescribeState(removedCardId);
  if (appState.activeMedIdx > i) {
    appState.activeMedIdx -= 1;
  } else if (appState.activeMedIdx >= medCards.length) {
    appState.activeMedIdx = medCards.length - 1;
  }
}

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
  _resetCaches();
  for (const key of Object.keys(_prescribeSummaryState)) { delete _prescribeSummaryState[Number(key)]; }
}
