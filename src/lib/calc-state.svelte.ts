import type { CalcResult, CardStatusCache } from './types';
import { validateValues, calcCore } from './calc';
import { medCards, appState } from './form-state.svelte';

interface CalcEntry {
	calc: CalcResult | null;
	status: CardStatusCache;
}

function _emptyStatus(): CardStatusCache {
	return {
		valid: false, calculable: false, statusText: 'Ej ifyllt',
		consumptionPct: 0, daysToPrescribedEnd: 0, prescribedEndDateStr: '',
	};
}

function _makeStatus(calc: CalcResult): CardStatusCache {
	return {
		valid: calc.valid,
		calculable: calc.calculable ?? false,
		statusText: calc.statusText || '—',
		consumptionPct: calc.consumptionPct,
		daysToPrescribedEnd: calc.daysToPrescribedEnd ?? 0,
		prescribedEndDateStr: calc.prescribedEndDateStr ?? '',
	};
}

const _allCalcs = $derived.by((): Record<number, CalcEntry> => {
	void appState.currentDate;
	const out: Record<number, CalcEntry> = {};
	for (const card of medCards) {
		const f = card.form;
		if (!f.medRaw) {
			out[card._cardId] = { calc: null, status: _emptyStatus() };
			continue;
		}
		const v = validateValues(
			f.medRaw, f.dateVal, f.doseRaw, f.amtRaw, f.refRaw, f.leftRaw,
			String(f.doseInterval), f.doseUnit, f.notCalculable,
		);
		const calc = calcCore(v);
		out[card._cardId] = { calc, status: _makeStatus(calc) };
	}
	return out;
});

export function getCardStatus(cardId: number): CardStatusCache | undefined {
	return _allCalcs[cardId]?.status;
}

export function getCardCalc(cardId: number): CalcResult | null {
	return _allCalcs[cardId]?.calc ?? null;
}

export function getActiveCalc(): CalcResult | null {
	const card = medCards[appState.activeMedIdx];
	return card ? (_allCalcs[card._cardId]?.calc ?? null) : null;
}

export function getAllCalcs() { return _allCalcs; }
