import type { CalcResult, MedCard, CardStatusCache, CardResult, PrescribeEntry, PrescribeInput } from './types';
import type { PrescribeResult } from './prescribe-calc';
import { validateValues, calcCore } from './calc';
import { stripManufacturer, parseDateUTC, fmtDate } from './utils';
import { calcPrescribeResult, canRenewMed } from './prescribe-calc';
import { buildPatientText, buildJournalText, buildNurseJournalText } from './text-gen';
import { appState, medCards, resetNurseState, createEmptyCard, getActiveResult } from './form-state.svelte';
import { getPrescribeState, clearPrescribeState, clearCardPrescribeState } from './prescribe-state.svelte';
import { ltState, resetLtPeriods } from './longterm-state.svelte';
import { _cardResultsCache, _cardStatus, getCardStatus, getCachedResult, _resetCaches } from './cache-state.svelte';

export { type CardStatusCache, type CardResult } from './types';

interface TextResult {
  patientText: string;
  patientTextEn: string;
  journalText: string;
  cardStatuses: Record<number, CardStatusCache>;
  cacheUpdates: Array<{ cardId: number; entry: { fp: string; cr: CardResult | null; status: CardStatusCache } }>;
}

export interface ActiveTexts {
  patientText: string;
  patientTextEn: string;
  journalText: string;
}

const _prescribeCombined = $derived.by((): Record<number, { endDateStr?: string; result: PrescribeResult | null }> => {
  const r: Record<number, { endDateStr?: string; result: PrescribeResult | null }> = {};
  for (const card of medCards) {
    const ps = getPrescribeState(card._cardId);
    const cached = _cardResultsCache[card._cardId];
    if (!ps || !cached?.cr) { r[card._cardId] = { result: null }; continue; }
    const s: PrescribeInput = {
      _cardId: card._cardId,
      dose: cached.cr.calc.dose,
      doseInterval: cached.cr.calc.doseInterval,
      doseUnit: cached.cr.calc.doseUnit,
      prescribedEndDateStr: cached.cr.calc.prescribedEndDateStr,
    };
    if (!ps.packageSize) { r[card._cardId] = { result: calcPrescribeResult(s, ps) }; continue; }
    const pr = calcPrescribeResult(s, ps);
    r[card._cardId] = { endDateStr: pr?.endDateStr ?? undefined, result: pr };
  }
  return r;
});

const _prescribeExtracted = $derived.by(() => {
  const ends: Record<number, string> = {};
  const summary: Record<number, PrescribeResult | null> = {};
  for (const [cardId, val] of Object.entries(_prescribeCombined)) {
    const id = Number(cardId);
    if (val.endDateStr) ends[id] = val.endDateStr;
    summary[id] = val.result ?? null;
  }
  return { ends, summary };
});

export function getPrescribeSummary() { return _prescribeExtracted.summary; }

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
      f.doseUnit, f.doseInterval, f.notCalculable, appState.currentDate].join('\x00');

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
    return _buildTextResult(computed.cardResults, cardsForText, computed.cardStatuses, computed.cacheUpdates, _prescribeExtracted.ends);
  } catch (e) {
    console.error('[v3 _texts] KRASCH:', e instanceof Error ? e.stack : String(e));
    return { patientText: '', patientTextEn: '', journalText: 'Textgenerering misslyckades', cardStatuses: {} as Record<number, CardStatusCache>, cacheUpdates: [] };
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
  for (const cardId of Object.keys(statuses)) {
    _cardStatus[Number(cardId)] = statuses[Number(cardId)];
  }
  const caches = _texts.cacheUpdates;
  for (const c of caches) {
    _cardResultsCache[c.cardId] = c.entry;
  }
  for (const [cardIdStr, status] of Object.entries(statuses)) {
    if (!status.valid) {
      const cardId = Number(cardIdStr);
      const card = medCards.find(c => c._cardId === cardId);
      if (card && card.decision !== null) {
        card.decision = null;
      }
    }
  }
}

export function getTextsState() { return _texts; }

const _hasSummary = $derived.by(() => {
  let count = 0;
  for (let i = 0; i < medCards.length; i++) {
    const ps = getPrescribeState(medCards[i]._cardId);
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

export function spliceMedCard(i: number): void {
  if (medCards.length <= 1) return;
  const removedCardId = medCards[i]._cardId;
  medCards.splice(i, 1);
  delete _cardResultsCache[removedCardId];
  delete _cardStatus[removedCardId];
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
}
