// === LÅNGTIDSANALYSENS STATE ===
// I mg-läget har varje period ett antal per styrka; countsRaw hålls lika långt som strengthsRaw.
import type { LtMode, LtPeriodInput } from '../types';
import { MAX_LT_PERIODS, MAX_LT_STRENGTHS } from '../constants';
import { calcLongterm } from '../domain/longterm';
import { buildLongtermText } from '../domain/texts';
import { extractDoseUnit, parseNum, stripManufacturer } from '../utils';
import type { DrugEntry } from '../drug-search';
import { getToday } from './case.svelte';

export const ltState = $state({
  medName: '',
  doseRaw: '',
  /** Räknesätt. Är en inställning, inte patientdata, och rensas därför inte. */
  mode: 'units' as LtMode,
  /** mg-läget: styrkorna i mg, t.ex. ['5', '7,5']. */
  strengthsRaw: [''] as string[],
  periods: [] as LtPeriodInput[],
});

const emptyPeriod = (): LtPeriodInput => ({
  startRaw: '', endRaw: '', totalRaw: '', countsRaw: ltState.strengthsRaw.map(() => ''),
});
ltState.periods = [emptyPeriod()];

const _result = $derived(calcLongterm(
  ltState.periods, ltState.doseRaw, getToday(), ltState.mode === 'mg' ? ltState.strengthsRaw : null,
));
const _text = $derived(buildLongtermText(ltState.medName, ltState.doseRaw, _result));

export function getLtResult() { return _result; }
export function getLtText() { return _text; }

/** Finns något inskrivet i långtidsanalysen? Används av inaktivitetsrensningen. */
export function hasLtData(): boolean {
  return !!ltState.medName || !!ltState.doseRaw || ltState.strengthsRaw.some((s) => s.trim())
    || ltState.periods.some((p) => p.startRaw || p.endRaw || p.totalRaw || p.countsRaw?.some((c) => c.trim()));
}

export function addPeriod(): boolean {
  if (ltState.periods.length >= MAX_LT_PERIODS) return false;
  ltState.periods.push(emptyPeriod());
  return true;
}

export function removePeriod(i: number): void {
  if (ltState.periods.length <= 1) { ltState.periods[0] = emptyPeriod(); return; }
  ltState.periods.splice(i, 1);
}

/**
 * Byter räknesätt och tömmer dosen, eftersom den anges i en annan enhet. Första gången mg-läget väljs fylls den första styrkan i från
 * läkemedelsnamnet, om det innehåller en styrka i mg ("Imovane 7,5 mg" → 7,5).
 */
export function setLtMode(mode: LtMode): void {
  // Dosen betyder olika saker i lägena (enheter/dag eller mg/dag) och får inte följa med.
  if (mode !== ltState.mode) ltState.doseRaw = '';
  ltState.mode = mode;
  if (mode === 'mg' && ltState.strengthsRaw.every((s) => !s.trim())) {
    const d = extractDoseUnit(ltState.medName);
    if (d && d.unit === 'mg') ltState.strengthsRaw[0] = String(d.amount).replace('.', ',');
  }
}

/**
 * Läkemedel valt ur läkemedelsdatabasen. Namnet fylls i. I mg-läget läggs preparatets styrka
 * till bland styrkorna om den inte redan finns, så att t.ex. Imovane 7,5 mg och sedan
 * Imovane 5 mg ger två styrkekolumner. Med flera styrkor blir namnet utan styrka ("Imovane").
 */
export function applyLtDrug(d: DrugEntry): void {
  const name = stripManufacturer(d.name);
  ltState.medName = name;
  if (ltState.mode !== 'mg') return;
  const s = extractDoseUnit(name);
  if (!s || s.unit !== 'mg') return;
  const has = ltState.strengthsRaw.some((raw) => parseNum(raw) === s.amount);
  if (!has) {
    const empty = ltState.strengthsRaw.findIndex((raw) => !raw.trim());
    const value = String(s.amount).replace('.', ',');
    if (empty >= 0) ltState.strengthsRaw[empty] = value;
    else if (addStrength()) ltState.strengthsRaw[ltState.strengthsRaw.length - 1] = value;
  }
  if (ltState.strengthsRaw.filter((raw) => raw.trim()).length > 1) {
    ltState.medName = name.replace(/\s*\d+(?:[.,]\d+)?\s*mg\b/i, '').trim();
  }
}

export function addStrength(): boolean {
  if (ltState.strengthsRaw.length >= MAX_LT_STRENGTHS) return false;
  ltState.strengthsRaw.push('');
  for (const p of ltState.periods) (p.countsRaw ??= []).push('');
  return true;
}

export function removeStrength(j: number): void {
  if (ltState.strengthsRaw.length <= 1) {
    ltState.strengthsRaw[0] = '';
    for (const p of ltState.periods) p.countsRaw = [''];
    return;
  }
  ltState.strengthsRaw.splice(j, 1);
  for (const p of ltState.periods) p.countsRaw?.splice(j, 1);
}

export function clearLongterm(): void {
  ltState.medName = '';
  ltState.doseRaw = '';
  ltState.strengthsRaw = [''];
  ltState.periods = [emptyPeriod()];
}
