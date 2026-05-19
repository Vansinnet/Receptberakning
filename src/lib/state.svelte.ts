// === SVELTE 5 REAKTIVT TILLSTÅNDSLAGER ===
// Ersätter 3.0:s state.js. All formulärdata lever i $state — inte i DOM.
// $derived-kedjan: formValues → validatedInput → calcResult → UI.
//
// ⚠ Svelte 5-syntax i .svelte.ts-filer:
//    - $state(), $derived(), $effect() stöds på modulnivå
//    - `export let x = $state()` är INTE tillåtet — använd wrapper-objekt
//      eller getter/setter-funktioner för primitiver som ska exporteras

import type { DoseUnit, DoseInterval, CalcResult, PrevCalcResult, MedState } from './types';
import { validateValues, calcCore } from './calc';
import { getToday, stripManufacturer } from './utils';
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
  earlyRenewalDecision: 'yes' | 'no' | null;
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
    earlyRenewalDecision: null,
    activeTab: 'patient',
    patientLang: 'sv',
  };
}

// =====================================================
// WRAPPER-OBJEKT FÖR PRIMITIV $state (export-optimerad)
// =====================================================

const _app = $state({
  nextCardId: 2,
  activeMedIdx: 0,
  nurseViewActive: false,
  nurseVitalNormal: false,
  nurseFollowUpAdequate: false,
  // currentDate används för att trigga om $derived-kedjan vid midnattsbyte.
  // Uppdateras av visibilitychange-handler i App.svelte.
  currentDate: new Date().toDateString(),
});

// =====================================================
// LÄKEMEDELSKORT
// =====================================================

export const medCards = $state<MedCard[]>([createEmptyCard(1)]);

export function pushMedCard(): number | null {
  if (medCards.length >= MAX_MED_CARDS) return null;
  const cardId = _app.nextCardId++;
  medCards.push(createEmptyCard(cardId));
  return cardId;
}

export function spliceMedCard(i: number): void {
  if (medCards.length <= 1) return;
  const removedCardId = medCards[i]._cardId;
  medCards.splice(i, 1);
  _cardStatusPrev.delete(removedCardId);
  _cardResultsCache.delete(removedCardId);
  delete _cardStatus[removedCardId];
  delete _prescribeState[removedCardId];
  if (_app.activeMedIdx > i) {
    _app.activeMedIdx -= 1;
  } else if (_app.activeMedIdx >= medCards.length) {
    _app.activeMedIdx = medCards.length - 1;
  }
}

// =====================================================
// ACTIVE INDEX + NURSE
// =====================================================

export function getActiveMedIdx(): number { return _app.activeMedIdx; }
export function setActiveMedIdx(i: number): void { _app.activeMedIdx = i; }

export function getNurseViewActive(): boolean { return _app.nurseViewActive; }
export function setNurseViewActive(v: boolean): void { _app.nurseViewActive = v; }

export function getNurseVitalNormal(): boolean { return _app.nurseVitalNormal; }
export function setNurseVitalNormal(v: boolean): void { _app.nurseVitalNormal = v; }

export function getNurseFollowUpAdequate(): boolean { return _app.nurseFollowUpAdequate; }
export function setNurseFollowUpAdequate(v: boolean): void { _app.nurseFollowUpAdequate = v; }

export function resetNurseState(): void {
  _app.nurseViewActive = false;
  _app.nurseVitalNormal = false;
  _app.nurseFollowUpAdequate = false;
}

// =====================================================
// MIDNATT — TRIGGA OM $derived-KEDJAN
// =====================================================

export function tickCurrentDate(): void {
  const newKey = new Date().toDateString();
  if (_app.currentDate !== newKey) {
    _app.currentDate = newKey;
  }
}

// =====================================================
// $derived: VALIDERING
// =====================================================

const _activeValidated = $derived(
  (_app.currentDate,
  validateValues(
    medCards[_app.activeMedIdx]?.form?.medRaw ?? '',
    medCards[_app.activeMedIdx]?.form?.dateVal ?? '',
    medCards[_app.activeMedIdx]?.form?.doseRaw ?? '',
    medCards[_app.activeMedIdx]?.form?.amtRaw ?? '',
    medCards[_app.activeMedIdx]?.form?.refRaw ?? '',
    medCards[_app.activeMedIdx]?.form?.leftRaw ?? '',
    String(medCards[_app.activeMedIdx]?.form?.doseInterval ?? 1),
    medCards[_app.activeMedIdx]?.form?.doseUnit ?? 'st',
    medCards[_app.activeMedIdx]?.form?.notCalculable ?? false,
  ))
);

export function getActiveValidated() {
  return _activeValidated;
}

export function getActiveResult() {
  return _activeResult;
}

// =====================================================
// PER-KORT RESULTATCACHE (från textorkestreringen)
// =====================================================

type CardStatusCache = {
  isOveruse: boolean;
  isTooEarly: boolean;
  earlyRenewalDecision: 'yes' | 'no' | null;
  valid: boolean;
  calculable: boolean;
  statusText: string;
  prescribedEndDateStr: string;
};

// ════════════════════════════════════════════════════════════════════════════
// ⚠ KRITISK ARKITEKTUR — _cardStatusPrev + _cardResultsCache
// ════════════════════════════════════════════════════════════════════════════
// Dessa två Maps får ALDRIG göras till $state. De läses inne i _texts $derived.by
// (för prev-flaggvärden respektive fingerprintcache) och skrivs i _syncCardStatus
// $effect. Om de vore reaktiva skulle:
//   1. .get() i $derived.by registrera ett beroende
//   2. .set() i $effect trigga omvärdering av $derived.by
//   3. $derived.by producera nya objekt → $effect körs → .set() → steg 2
//   → Svelte 5 kastar effect_update_depth_exceeded (feedback-loop)
//
// Detta är fundamentalt: flagsChanged-detektering i calcCore kräver att
// föregående körnings utdata används som indata till nästa körning av samma
// $derived — en cyklisk beroendegraf som inte kan uttryckas rent deklarativt.
// Något måste vara imperativt. Dessa icke-reaktiva Maps är den minimala lösningen.
// ════════════════════════════════════════════════════════════════════════════
//
// _cardStatusPrev: lagrar prev-värden för flagsChanged (isOveruse, isTooEarly).
//   Läses i _activeResult ($derived) och _texts ($derived.by).
//   Skrivs i _syncCardStatus ($effect i App.svelte).
//
// _cardResultsCache: fingeravtryckscache för _texts ($derived.by).
//   Läses och "skrivs" i _texts; de facto-skrivningen sker via cacheUpdates
//   som processas i _syncCardStatus.
//
// _cardStatus ($state): den reaktiva spegeln — alla UI-komponenter läser
//   härifrån via getCardStatus(). Per-nyckel-uppdateringar möjliggör
//   fin granularitet i reaktiviteten.
// ════════════════════════════════════════════════════════════════════════════
const _cardStatusPrev = new Map<number, CardStatusCache>();
let _cardStatus = $state<Record<number, CardStatusCache>>({});

export function getCardStatus(cardId: number): CardStatusCache | undefined {
  return _cardStatus[cardId];
}

// =====================================================
// $derived: BERÄKNING
// =====================================================

const _activeResult = $derived(
  calcCore(_activeValidated, {
    isOveruse: _cardStatusPrev.get(medCards[_app.activeMedIdx]?._cardId ?? -1)?.isOveruse ?? false,
    isTooEarly: _cardStatusPrev.get(medCards[_app.activeMedIdx]?._cardId ?? -1)?.isTooEarly ?? false,
    earlyRenewalDecision: medCards[_app.activeMedIdx]?.earlyRenewalDecision ?? null,
  })
);

// =====================================================
// $derived: TEXTORKESTRERING (ersätter generateAndDistribute)
// =====================================================

interface TextResult {
  patientText: string;
  patientTextEn: string;
  journalText: string;
  cardStatusUpdates: Array<{ cardId: number; status: CardStatusCache }>;
  cacheUpdates: Array<{ cardId: number; entry: { fp: string; cr: CardResult | null; status: CardStatusCache } }>;
}

interface CardResult {
  cardId: number;
  calc: CalcResult;
  medNameStripped: string;
}

// ⚠ Samma icke-reaktiva mönster som _cardStatusPrev ovan (feedback-loop-risken gäller även här).
const _cardResultsCache = new Map<number, { fp: string; cr: CardResult | null; status: CardStatusCache }>();

const _texts = $derived.by((): TextResult => {
  // Tvinga omvärdering vid midnattsbyte — texterna ska alltid spegla dagens datum.
  void _app.currentDate;

  // 1. Beräkna calcCore för alla giltiga kort och gruppera
  const cardResults: CardResult[] = [];
  const cardStatusUpdates: Array<{ cardId: number; status: CardStatusCache }> = [];
  const cacheUpdates: Array<{ cardId: number; entry: { fp: string; cr: CardResult | null; status: CardStatusCache } }> = [];
  for (let i = 0; i < medCards.length; i++) {
    const card = medCards[i];
    if (!card) continue;
    const f = card.form;
    if (!f.medRaw) {
      cardStatusUpdates.push({ cardId: card._cardId, status: {
        isOveruse: false, isTooEarly: false, earlyRenewalDecision: null,
        valid: false, calculable: false,
        statusText: 'Ej ifyllt', prescribedEndDateStr: '',
      }});
      continue;
    }

    const fp = [f.medRaw, f.dateVal, f.doseRaw, f.amtRaw, f.refRaw, f.leftRaw,
      f.doseUnit, f.doseInterval, f.notCalculable, card.earlyRenewalDecision].join('\x00');

    const cached = _cardResultsCache.get(card._cardId);
    if (cached && cached.fp === fp) {
      cardStatusUpdates.push({ cardId: card._cardId, status: cached.status });
      if (cached.cr) cardResults.push(cached.cr);
      continue;
    }

    const validated = validateValues(
      f.medRaw, f.dateVal, f.doseRaw, f.amtRaw, f.refRaw, f.leftRaw,
      String(f.doseInterval), f.doseUnit, f.notCalculable,
    );

    const calc = calcCore(validated, {
      isOveruse: _cardStatusPrev.get(card._cardId)?.isOveruse ?? false,
      isTooEarly: _cardStatusPrev.get(card._cardId)?.isTooEarly ?? false,
      earlyRenewalDecision: card.earlyRenewalDecision,
    });

    if (!calc.valid || calc.calculable === false) {
      const status: CardStatusCache = {
        isOveruse: false, isTooEarly: false, earlyRenewalDecision: null,
        valid: calc.valid, calculable: calc.calculable ?? false,
        statusText: calc.statusText || '—',
        prescribedEndDateStr: '',
      };
      cardStatusUpdates.push({ cardId: card._cardId, status });
      cacheUpdates.push({ cardId: card._cardId, entry: { fp, cr: null, status } });
      continue;
    }

    const medNameStripped = stripManufacturer(f.medRaw) || f.medRaw;

    const cr: CardResult = { cardId: card._cardId, calc, medNameStripped };
    const status: CardStatusCache = {
      isOveruse: calc.isOveruse ?? false,
      isTooEarly: calc.isTooEarly ?? false,
      earlyRenewalDecision: calc.earlyRenewalDecision ?? null,
      valid: true,
      calculable: true,
      statusText: calc.statusText || 'OK',
      prescribedEndDateStr: calc.prescribedEndDateStr ?? '',
    };
    cardResults.push(cr);
    cardStatusUpdates.push({ cardId: card._cardId, status });
    cacheUpdates.push({ cardId: card._cardId, entry: { fp, cr, status } });
  }

  const validCount = cardResults.length;
  if (validCount === 0) {
    return { patientText: '', patientTextEn: '', journalText: '', cardStatusUpdates, cacheUpdates };
  }

  // 2. Gruppera
  const toRenew: Array<{ name: string; i: number; state: MedState | null; earlyRenewal?: string }> = [];
  const tooEarly: Array<{ name: string; i: number; state: MedState | null }> = [];
  const overuse: Array<{ name: string; i: number; state: MedState | null }> = [];

  for (let idx = 0; idx < cardResults.length; idx++) {
    const cr = cardResults[idx];
    const name = cr.medNameStripped;
    const state: MedState = {
      _cardId: cr.cardId,
      medRaw: cr.medNameStripped,
      medNameStripped: cr.medNameStripped,
      pDateStr: cr.calc.pDateStr,
      total: cr.calc.total,
      dose: cr.calc.dose,
      doseInterval: cr.calc.doseInterval,
      doseUnit: cr.calc.doseUnit,
      doseUnitLabel: cr.calc.doseUnitLabel,
      prescribedEndDateStr: cr.calc.prescribedEndDateStr,
      displayAvgStr: cr.calc.displayAvgStr,
      avgNote: cr.calc.avgNote,
      remainingDoses: cr.calc.remainingDoses,
      daysRemaining: cr.calc.daysRemaining,
      daysToPrescribedEnd: cr.calc.daysToPrescribedEnd,
      renewDateStr: cr.calc.renewDateStr,
      prescribedContactDateStr: cr.calc.prescribedContactDateStr,
      prescribedContactIsPast: cr.calc.prescribedContactIsPast,
        isOveruse: cr.calc.isOveruse,
        isTooEarly: cr.calc.isTooEarly,
        earlyRenewalDecision: cr.calc.earlyRenewalDecision,
      valid: true,
      calculable: true,
    };

    if (cr.calc.isOveruse && cr.calc.earlyRenewalDecision === 'yes')
      toRenew.push({ name, i: cr.cardId, state, earlyRenewal: 'overuse' });
    else if (cr.calc.isOveruse)
      overuse.push({ name, i: cr.cardId, state });
    else if (cr.calc.isTooEarly && cr.calc.earlyRenewalDecision === 'yes')
      toRenew.push({ name, i: cr.cardId, state, earlyRenewal: 'tooEarly' });
    else if (cr.calc.isTooEarly)
      tooEarly.push({ name, i: cr.cardId, state });
    else
      toRenew.push({ name, i: cr.cardId, state });
  }

  // 3. Sjuksköterskeläge
  if (_app.nurseViewActive) {
    const journalText = buildNurseJournalText(
      cardResults.map(cr => ({
        _cardId: cr.cardId,
        medRaw: cr.medNameStripped,
        medNameStripped: cr.medNameStripped,
        valid: true,
        calculable: true,
        isOveruse: cr.calc.isOveruse,
        isTooEarly: cr.calc.isTooEarly,
        earlyRenewalDecision: medCards.find(mc => mc._cardId === cr.cardId)?.earlyRenewalDecision ?? null,
        prescribedEndDateStr: cr.calc.prescribedEndDateStr,
      })),
      _app.nurseVitalNormal,
      _app.nurseFollowUpAdequate,
    );
    return { patientText: '', patientTextEn: '', journalText, cardStatusUpdates, cacheUpdates };
  }

  // 4. Beräkna prescribeEnds för toRenew
  const prescribeEnds: Record<number, string> = {};
  for (const item of toRenew) {
    try {
      const ps = _prescribeState[item.i];
      if (ps) {
        const s: MedState = {
          _cardId: item.i,
          dose: item.state?.dose,
          doseInterval: (item.state?.doseInterval ?? 1) as DoseInterval,
          doseUnit: (item.state?.doseUnit ?? 'st') as DoseUnit,
          prescribedEndDateStr: item.state?.prescribedEndDateStr,
        };
        const pr = calcPrescribeResult(s, ps);
        if (pr && pr.endDateStr) prescribeEnds[item.i] = pr.endDateStr;
      }
    } catch { /* ignore */ }
  }

  // 5. Generera texter
  const patientText   = buildPatientText('sv', toRenew, tooEarly, overuse, validCount, prescribeEnds);
  const patientTextEn = buildPatientText('en', toRenew, tooEarly, overuse, validCount, prescribeEnds);
  const journalText   = buildJournalText(toRenew, tooEarly, overuse, validCount, prescribeEnds);

  return { patientText, patientTextEn, journalText, cardStatusUpdates, cacheUpdates };
});

export function getActiveTexts(): TextResult {
  const { patientText, patientTextEn, journalText } = _texts;
  return { patientText, patientTextEn, journalText, cardStatusUpdates: [], cacheUpdates: [] };
}

export function _syncCardStatus(): void {
  const updates = _texts.cardStatusUpdates;
  for (const u of updates) {
    _cardStatusPrev.set(u.cardId, u.status);
    _cardStatus[u.cardId] = u.status;
  }
  const caches = _texts.cacheUpdates;
  for (const c of caches) {
    _cardResultsCache.set(c.cardId, c.entry);
  }
}

export function _textsVersion(): number {
  return _texts.cardStatusUpdates.length;
}

// =====================================================
// LÄNGVARIG FÖRBRUKNING — PERIODER
// =====================================================

export interface LTPeriod {
  start: string;
  total: string;
  end: string;
}

export const ltPeriods = $state<LTPeriod[]>([{ start: '', total: '', end: '' }]);

export function setLtPeriodField(i: number, field: keyof LTPeriod, value: string): void {
  if (ltPeriods[i]) ltPeriods[i][field] = value;
}

export function pushLtPeriod(): boolean {
  if (ltPeriods.length >= MAX_LT_PERIODS) return false;
  ltPeriods.push({ start: '', total: '', end: '' });
  return true;
}

export function spliceLtPeriod(i: number): boolean {
  if (ltPeriods.length <= MIN_LT_PERIODS) return false;
  ltPeriods.splice(i, 1);
  return true;
}

export function resetLtPeriods(): void {
  ltPeriods.length = 0;
  ltPeriods.push({ start: '', total: '', end: '' });
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
}

const _prescribeState = $state<Record<number, PrescribeEntry>>({});

export function getPrescribeState(i: number): PrescribeEntry | undefined {
  return _prescribeState[i];
}

export function initPrescribeState(i: number, initial: PrescribeEntry): void {
  _prescribeState[i] = initial;
}

export function applyPrescribeStatePatch(i: number, patch: Partial<PrescribeEntry>): void {
  if (!_prescribeState[i]) return;
  Object.assign(_prescribeState[i], patch);
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
  _app.activeMedIdx = 0;
  _app.nextCardId = 2;
  clearPrescribeState();
  resetLtPeriods();
  resetNurseState();
  _cardStatusPrev.clear();
  _cardResultsCache.clear();
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
      isOveruse: status?.isOveruse ?? false,
      isTooEarly: status?.isTooEarly ?? false,
      earlyRenewalDecision: medCards[i].earlyRenewalDecision,
    })) continue;
    count++;
  }
  return count >= 2;
});

export function getHasSummary(): boolean {
  return _hasSummary;
}
