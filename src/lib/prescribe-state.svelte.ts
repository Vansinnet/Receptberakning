import type { PrescribeEntry } from './types';

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
