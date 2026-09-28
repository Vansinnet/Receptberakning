// === LÅNGTIDSANALYSENS STATE ===
import type { LtPeriodInput } from '../types';
import { MAX_LT_PERIODS } from '../constants';
import { calcLongterm } from '../domain/longterm';
import { buildLongtermText } from '../domain/texts';
import { getToday } from './case.svelte';

const emptyPeriod = (): LtPeriodInput => ({ startRaw: '', endRaw: '', totalRaw: '' });

export const ltState = $state({
  medName: '',
  doseRaw: '',
  periods: [emptyPeriod()] as LtPeriodInput[],
});

const _result = $derived(calcLongterm(ltState.periods, ltState.doseRaw, getToday()));
const _text = $derived(buildLongtermText(ltState.medName, ltState.doseRaw, _result));

export function getLtResult() { return _result; }
export function getLtText() { return _text; }

export function addPeriod(): boolean {
  if (ltState.periods.length >= MAX_LT_PERIODS) return false;
  ltState.periods.push(emptyPeriod());
  return true;
}

export function removePeriod(i: number): void {
  if (ltState.periods.length <= 1) { ltState.periods[0] = emptyPeriod(); return; }
  ltState.periods.splice(i, 1);
}

export function clearLongterm(): void {
  ltState.medName = '';
  ltState.doseRaw = '';
  ltState.periods = [emptyPeriod()];
}
