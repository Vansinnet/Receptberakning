import type { LTCardPeriod } from './types';
import { MAX_LT_PERIODS, MIN_LT_PERIODS } from './constants';

export const ltPeriods = $state<LTCardPeriod[]>([{ start: '', end: '', total: 0 }]);

export const ltState = $state({
  medRaw: '',
  doseRaw: '',
});

export function setLtPeriodField(i: number, field: keyof LTCardPeriod, value: string): void {
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
  ltPeriods.push({ start: '', end: '', total: 0 });
  return true;
}

export function spliceLtPeriod(i: number): boolean {
  if (ltPeriods.length <= MIN_LT_PERIODS) return false;
  ltPeriods.splice(i, 1);
  return true;
}

export function resetLtPeriods(): void {
  ltPeriods.length = 0;
  ltPeriods.push({ start: '', end: '', total: 0 });
}
