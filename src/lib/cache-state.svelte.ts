import type { CardStatusCache, CardResult } from './types';

export let _cardResultsCache = $state<Record<number, { fp: string; cr: CardResult | null; status: CardStatusCache }>>({});

export let _cardStatus = $state<Record<number, CardStatusCache>>({});

export function getCardStatus(cardId: number): CardStatusCache | undefined {
  return _cardStatus[cardId];
}

export function getCachedResult(cardId: number): CardResult | null {
  return _cardResultsCache[cardId]?.cr ?? null;
}

export function _resetCaches(): void {
  for (const key of Object.keys(_cardResultsCache)) { delete _cardResultsCache[Number(key)]; }
  for (const key of Object.keys(_cardStatus)) { delete _cardStatus[Number(key)]; }
}
