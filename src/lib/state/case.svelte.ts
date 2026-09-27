// === ÄRENDETS STATE ===
// Ett ärende = en patient med upp till 8 läkemedel. Varje läkemedel bär sitt underlag,
// sitt beslut och sina förskrivningsinställningar, så att allt har en enda källa.
// Beräkningar och texter flödar via $derived: meds → results → texts. Inga $effect.
// Ingen patientdata sparas någonstans utanför webbläsarens minne.

import type { Assessment, Decision, MedCard, MedForm, Role } from '../types';
import { DEFAULT_PRESCRIBE_MONTHS, MAX_MED_CARDS } from '../constants';
import { parseDateUTC, stripManufacturer, todayStr } from '../utils';
import { calcRenewal, isRenewalOk, type RenewalResult } from '../domain/renewal';
import { calcPrescription, type PrescriptionResult } from '../domain/prescribe';
import { buildJournalText, buildNurseText, buildPatientText, type Lang, type TextItem } from '../domain/texts';
import type { DrugEntry } from '../drug-search';

export function emptyForm(): MedForm {
  return {
    name: '', atcCode: null, nplId: null, doseForm: '', regulation: null, notCalculable: false,
    unit: 'st', dateRaw: '', doseRaw: '', interval: 1, packageRaw: '', refillsRaw: '',
  };
}

function newCard(id: number): MedCard {
  return {
    id, form: emptyForm(), decision: null,
    prescribe: { period: DEFAULT_PRESCRIBE_MONTHS, endDateRaw: '', packageRaw: null, fromToday: false },
  };
}

export type TextTab = 'patient' | 'journal';

export const caseState = $state({
  meds: [newCard(1)] as MedCard[],
  activeId: 1,
  nextId: 2,
  role: 'doctor' as Role,
  vital: null as Assessment,
  followUp: null as Assessment,
  textTab: 'patient' as TextTab,
  lang: 'sv' as Lang,
  /** Handredigerade texter, nyckel = textKey(). */
  textEdits: {} as Record<string, string>,
  confirmClear: false,
  /** Dagens datum som ÅÅÅÅ-MM-DD. Uppdateras när fliken blir synlig igen. */
  today: todayStr(),
});

// ── Härledda värden ─────────────────────────────────────────────────────────

export interface MedResult {
  id: number;
  renewal: RenewalResult;
  prescription: PrescriptionResult | null;
}

const _today = $derived(parseDateUTC(caseState.today)!);

const _results = $derived.by((): MedResult[] =>
  caseState.meds.map((m) => {
    const renewal = calcRenewal(m.form, _today);
    const prescription = isRenewalOk(renewal) && m.decision === 'yes'
      ? calcPrescription(renewal, m.prescribe, _today)
      : null;
    return { id: m.id, renewal, prescription };
  }),
);

const _textItems = $derived.by((): TextItem[] => {
  const items: TextItem[] = [];
  caseState.meds.forEach((m, i) => {
    const res = _results[i];
    const name = stripManufacturer(m.form.name.trim()) || m.form.name.trim();
    if (!name) return;
    if (res.renewal.kind !== 'ok' && res.renewal.kind !== 'manual') return;
    items.push({
      name, unit: m.form.unit, interval: m.form.interval, doseRaw: m.form.doseRaw, dateRaw: m.form.dateRaw,
      decision: m.decision,
      renewal: isRenewalOk(res.renewal) ? res.renewal : null,
      prescription: res.prescription,
    });
  });
  return items;
});

const _effectiveTab = $derived<TextTab>(caseState.role === 'nurse' ? 'journal' : caseState.textTab);
const _textKey = $derived(`${caseState.role}-${_effectiveTab}-${_effectiveTab === 'patient' ? caseState.lang : ''}`);

const _generatedText = $derived.by(() => {
  if (caseState.role === 'nurse') return buildNurseText(_textItems, caseState.vital, caseState.followUp);
  return _effectiveTab === 'journal' ? buildJournalText(_textItems) : buildPatientText(caseState.lang, _textItems);
});

export function getToday(): Date { return _today; }
export function getResults(): MedResult[] { return _results; }
export function getResult(id: number): MedResult | undefined { return _results.find((r) => r.id === id); }
export function getTextItems(): TextItem[] { return _textItems; }
export function getEffectiveTab(): TextTab { return _effectiveTab; }
export function getGeneratedText(): string { return _generatedText; }
export function isTextEdited(): boolean { return caseState.textEdits[_textKey] !== undefined; }
export function getText(): string { return caseState.textEdits[_textKey] ?? _generatedText; }

export function getActiveMed(): MedCard | undefined {
  return caseState.meds.find((m) => m.id === caseState.activeId);
}

// ── Åtgärder ────────────────────────────────────────────────────────────────

export function selectMed(id: number): void {
  if (caseState.meds.some((m) => m.id === id)) caseState.activeId = id;
}

/** Lägger till ett tomt läkemedel och väljer det. Returnerar false vid max 8. */
export function addMed(): boolean {
  if (caseState.meds.length >= MAX_MED_CARDS) return false;
  const card = newCard(caseState.nextId++);
  caseState.meds.push(card);
  caseState.activeId = card.id;
  return true;
}

export function removeMed(id: number): void {
  const idx = caseState.meds.findIndex((m) => m.id === id);
  if (idx < 0) return;
  if (caseState.meds.length === 1) {
    caseState.meds[0] = newCard(caseState.nextId++);
    caseState.activeId = caseState.meds[0].id;
    return;
  }
  caseState.meds.splice(idx, 1);
  if (caseState.activeId === id) caseState.activeId = caseState.meds[Math.min(idx, caseState.meds.length - 1)].id;
}

/** Fyller i läkemedlet från läkemedelsdatabasen. Förpackningsstorleken för nyförskrivning följer formuläret. */
export function applyDrug(id: number, d: DrugEntry): void {
  const m = caseState.meds.find((x) => x.id === id);
  if (!m) return;
  m.form.name = stripManufacturer(d.name);
  m.form.atcCode = d.atcCode || null;
  m.form.nplId = d.nplId || null;
  m.form.doseForm = d.form ?? '';
  m.form.regulation = d.regulation || null;
  m.form.notCalculable = !!d.notCalculable;
  m.form.unit = d.unit === 'ml' ? 'ml' : d.unit === 'dos' ? 'dos' : 'st';
  m.form.packageRaw = d.packageSize && d.packageSize > 0 ? String(d.packageSize) : '';
  m.prescribe.packageRaw = null;
}

/** Namnet skrivs för hand: kopplingen till läkemedelsdatabasen släpps. */
export function setNameManually(id: number, name: string): void {
  const m = caseState.meds.find((x) => x.id === id);
  if (!m) return;
  m.form.name = name;
  m.form.atcCode = null;
  m.form.nplId = null;
  m.form.doseForm = '';
  m.form.regulation = null;
  m.form.notCalculable = false;
}

export function setDecision(id: number, d: Decision): void {
  const m = caseState.meds.find((x) => x.id === id);
  if (m) m.decision = m.decision === d ? null : d;
}

export function setPrescribePackage(id: number, raw: string): void {
  const m = caseState.meds.find((x) => x.id === id);
  if (m) m.prescribe.packageRaw = raw.trim() === '' ? null : raw;
}

export function setRole(r: Role): void { caseState.role = r; }
export function setTextTab(t: TextTab): void { caseState.textTab = t; }
export function setLang(l: Lang): void { caseState.lang = l; }
export function editText(value: string): void { caseState.textEdits[_textKey] = value; }
export function resetText(): void { delete caseState.textEdits[_textKey]; }

export function refreshToday(): void {
  const t = todayStr();
  if (t !== caseState.today) caseState.today = t;
}

/** Rensar all patientdata i ärendet. */
export function clearCase(): void {
  caseState.meds = [newCard(1)];
  caseState.activeId = 1;
  caseState.nextId = 2;
  caseState.vital = null;
  caseState.followUp = null;
  caseState.textEdits = {};
  caseState.textTab = 'patient';
  caseState.lang = 'sv';
  caseState.confirmClear = false;
  refreshToday();
}

export function hasCaseData(): boolean {
  return caseState.meds.some((m) => m.form.name.trim() || m.form.dateRaw || m.form.doseRaw);
}
