// === LÅNGTIDSANALYSENS STATE ===
// Uttagen skrivs in rad för rad ur uttagshistoriken. Läkemedlet ger styrkan som föreslås på nya
// rader och enhetsordet för antal (st, ml, plåster, doser). Maxdosen enligt receptet är valfri.
// Reaktivitetskedja: ltState → _result ($derived) → _text ($derived). Inga $effect.
import type { LtDoseUnit, LtFillInput, LtInterval, LtMaxDoseInput } from '../types';
import { MAX_LT_FILLS, MAX_LT_MAX_DOSES } from '../constants';
import { calcLongterm } from '../domain/longterm';
import { buildLongtermText, type LtTextContext } from '../domain/texts';
import { extractDoseUnit, parseDateUTC, stripManufacturer } from '../utils';
import type { DrugEntry } from '../drug-search';
import { getToday } from './case.svelte';

const emptyFill = (strengthRaw = ''): LtFillInput => ({ dateRaw: '', countRaw: '', strengthRaw });
const emptyMaxDose = (): LtMaxDoseInput => ({ fromRaw: '', doseRaw: '' });

export const ltState = $state({
  medName: '',
  /** Narkotikaklass från läkemedelsdatabasen. */
  regulation: null as string | null,
  /** Enhetsordet för antal, från läkemedlets beredningsform. */
  noun: 'st',
  /** Styrkan i mg som föreslås på nya rader (från läkemedlets namn). */
  strengthRaw: '',
  fills: [emptyFill()] as LtFillInput[],
  /** Första raden är maxdosen; följande är ändringar från och med ett datum. */
  maxDoses: [emptyMaxDose()] as LtMaxDoseInput[],
  doseUnit: 'st' as LtDoseUnit,
  interval: 1 as LtInterval,
});

const _context = $derived<LtTextContext>({
  medName: ltState.medName, regulation: ltState.regulation, noun: ltState.noun,
  doseUnit: ltState.doseUnit, interval: ltState.interval,
});
const _result = $derived(calcLongterm(ltState.fills, ltState.maxDoses, ltState.doseUnit, ltState.interval, getToday()));
const _text = $derived(buildLongtermText(_context, _result));

export function getLtResult() { return _result; }
export function getLtText() { return _text; }
export function getLtContext() { return _context; }

const isEmptyFill = (f: LtFillInput) => !f.dateRaw.trim() && !f.countRaw.trim();

/** Finns något inskrivet i långtidsanalysen? Används av inaktivitetsrensningen. */
export function hasLtData(): boolean {
  return !!ltState.medName.trim() || ltState.fills.some((f) => !isEmptyFill(f))
    || ltState.maxDoses.some((m) => m.doseRaw.trim() || m.fromRaw.trim());
}

/**
 * Ny rad för nästa uttag. Raderna sorteras först efter datum (rader utan giltigt datum sist),
 * så att listan följer uttagshistoriken. Den nya raden får samma styrka som raden ovanför.
 * Finns redan en tom rad används den. Returnerar radens index, eller -1 vid maxantal.
 */
export function addFill(): number {
  const key = (f: LtFillInput) => parseDateUTC(f.dateRaw.trim())?.getTime() ?? Infinity;
  const filled = ltState.fills.filter((f) => !isEmptyFill(f)).sort((a, b) => key(a) - key(b));
  const empty = ltState.fills.find(isEmptyFill);
  if (!empty && ltState.fills.length >= MAX_LT_FILLS) return -1;
  const strength = filled[filled.length - 1]?.strengthRaw ?? ltState.strengthRaw;
  ltState.fills = [...filled, empty ?? emptyFill(strength)];
  return ltState.fills.length - 1;
}

export function removeFill(i: number): void {
  if (ltState.fills.length <= 1) { ltState.fills = [emptyFill(ltState.strengthRaw)]; return; }
  ltState.fills.splice(i, 1);
}

/** Ny maxdos från och med ett datum (receptet har ändrats). */
export function addMaxDose(): boolean {
  if (ltState.maxDoses.length >= MAX_LT_MAX_DOSES) return false;
  ltState.maxDoses.push(emptyMaxDose());
  return true;
}

export function removeMaxDose(i: number): void {
  if (i > 0) ltState.maxDoses.splice(i, 1);
}

/** Enhetsordet för antal: plåster, ml, doser eller st. */
function nounFor(d: DrugEntry): string {
  if (/plåster/i.test(d.form ?? '')) return 'plåster';
  if (d.unit === 'ml') return 'ml';
  if (d.unit === 'dos') return 'doser';
  return 'st';
}

/**
 * Läkemedel valt ur läkemedelsdatabasen. Styrkan i mg hämtas från namnet ("Imovane 7,5 mg" → 7,5)
 * och fylls i på rader som saknar styrka. Preparat utan styrka i mg (t.ex. plåster i mikrogram
 * per timme) räknas i antal.
 */
export function applyLtDrug(d: DrugEntry): void {
  const name = stripManufacturer(d.name);
  ltState.medName = name;
  ltState.regulation = d.regulation ?? null;
  ltState.noun = nounFor(d);
  const s = extractDoseUnit(name);
  ltState.strengthRaw = s && s.unit === 'mg' ? String(s.amount).replace('.', ',') : '';
  for (const f of ltState.fills) {
    if (!f.strengthRaw.trim() || isEmptyFill(f)) f.strengthRaw = ltState.strengthRaw;
  }
}

/** Namnet skrivs för hand: narkotikaklassen hör till ett valt preparat och tas bort. */
export function setLtNameManually(name: string): void {
  ltState.medName = name;
  ltState.regulation = null;
}

export function clearLongterm(): void {
  ltState.medName = '';
  ltState.regulation = null;
  ltState.noun = 'st';
  ltState.strengthRaw = '';
  ltState.fills = [emptyFill()];
  ltState.maxDoses = [emptyMaxDose()];
  ltState.doseUnit = 'st';
  ltState.interval = 1;
}
