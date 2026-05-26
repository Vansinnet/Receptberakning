import type { CalcResult, CardsForTextEntry, PrescribeInput } from './types';
import type { PrescribeResult } from './prescribe-calc';
import { stripManufacturer, parseDateUTC, fmtDate } from './utils';
import { CONTACT_REMINDER_DAYS } from './constants';
import { calcPrescribeResult } from './prescribe-calc';
import { buildPatientText, buildJournalText, buildNurseJournalText } from './text-gen';
import { medCards, appState } from './form-state.svelte';
import { getPrescribeState } from './prescribe-state.svelte';
import { getAllCalcs } from './calc-state.svelte';

interface TextResult {
	patientText: string;
	patientTextEn: string;
	journalText: string;
}

export interface ActiveTexts {
	patientText: string;
	patientTextEn: string;
	journalText: string;
}

const _prescribeResults = $derived.by((): Record<number, PrescribeResult | null> => {
	void appState.currentDate;
	const calcs = getAllCalcs();
	const out: Record<number, PrescribeResult | null> = {};
	for (const card of medCards) {
		const entry = calcs[card._cardId];
		if (!entry?.calc) { out[card._cardId] = null; continue; }
		const calc = entry.calc;
		if (!calc.valid) { out[card._cardId] = null; continue; }
		if (calc.calculable === false) { out[card._cardId] = null; continue; }
		const ps = getPrescribeState(card._cardId);
		if (!ps) { out[card._cardId] = null; continue; }
		const s: PrescribeInput = {
			_cardId: card._cardId,
			dose: calc.dose,
			doseInterval: calc.doseInterval,
			doseUnit: calc.doseUnit,
			prescribedEndDateStr: calc.prescribedEndDateStr,
		};
		out[card._cardId] = calcPrescribeResult(s, ps);
	}
	return out;
});

function _buildCardsForText(calcs: Record<number, { calc: CalcResult | null }>): CardsForTextEntry[] {
	const entries: CardsForTextEntry[] = [];
	for (const card of medCards) {
		const entry = calcs[card._cardId];
		if (!entry?.calc) continue;
		const c = entry.calc;
		if (!c.valid) continue;
		if (c.calculable === false) continue;
		const medNameStripped = stripManufacturer(card.form.medRaw) || card.form.medRaw;
		entries.push({
			name: medNameStripped, i: card._cardId,
			dose: c.dose, doseUnitLabel: c.doseUnitLabel,
			doseUnit: c.doseUnit, total: c.total,
			pDateStr: c.pDateStr, prescribedEndDateStr: c.prescribedEndDateStr,
			displayAvgStr: c.displayAvgStr, avgNote: c.avgNote,
			daysToPrescribedEnd: c.daysToPrescribedEnd,
			consumptionPct: c.consumptionPct,
			decision: card.decision,
		});
	}
	return entries;
}

const _texts = $derived.by((): TextResult => {
	try {
		void appState.currentDate;
		const calcs = getAllCalcs();
		const prescribes = _prescribeResults;

		const cardsForText = _buildCardsForText(calcs);
		if (cardsForText.length === 0) {
			return { patientText: '', patientTextEn: '', journalText: '' };
		}

		const prescribeEnds: Record<number, string> = {};
		for (const cft of cardsForText) {
			const pr = prescribes[cft.i];
			if (pr?.endDateStr) prescribeEnds[cft.i] = pr.endDateStr;
		}

		const ptCards = cardsForText.map(c => {
			let contactDateStr = '';
			if (c.daysToPrescribedEnd >= CONTACT_REMINDER_DAYS && c.prescribedEndDateStr) {
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
			journalText   = buildJournalText(cardsForText, prescribeEnds);
		} catch (e) {
			console.error('[text-state] Textgenerering kraschade:', e);
			patientText = patientTextEn = journalText = 'Ett internt fel uppstod vid textgenerering.';
		}

		if (appState.nurseViewActive) {
			const nurseDecisionMap = new Map(medCards.map(mc => [mc._cardId, mc.decision]));
			const nurseJournalText = buildNurseJournalText(
				cardsForText.map(c => ({
					_cardId: c.i, medRaw: c.name,
					valid: true, calculable: true,
					prescribedEndDateStr: c.prescribedEndDateStr,
					daysToPrescribedEnd: c.daysToPrescribedEnd,
					consumptionPct: c.consumptionPct,
					decision: nurseDecisionMap.get(c.i) ?? null,
				})),
				appState.nurseVitalNormal,
				appState.nurseFollowUpAdequate,
			);
			return { patientText: '', patientTextEn: '', journalText: nurseJournalText };
		}

		return { patientText, patientTextEn, journalText };
	} catch (e) {
		console.error('[text-state] KRASCH:', e instanceof Error ? e.stack : String(e));
		return { patientText: '', patientTextEn: '', journalText: 'Textgenerering misslyckades' };
	}
});

/** Returnerar patienttexter (sv+en) och journaltext för samtliga giltiga kort. */
export function getActiveTexts(): ActiveTexts {
	const { patientText, patientTextEn, journalText } = _texts;
	return { patientText, patientTextEn, journalText };
}

export function getTextsState() { return _texts; }

export function getActivePrescribeResult(): PrescribeResult | null {
	const card = medCards[appState.activeMedIdx];
	if (!card) return null;
	return _prescribeResults[card._cardId] ?? null;
}

export function getPrescribeSummary() { return _prescribeResults; }

const _hasSummary = $derived.by(() => {
	let count = 0;
	const summary = _prescribeResults;
	for (let i = 0; i < medCards.length; i++) {
		if (!summary[medCards[i]._cardId]) continue;
		if (medCards[i].decision === 'no') continue;
		count++;
	}
	return count >= 2;
});

export function getHasSummary(): boolean {
	return _hasSummary;
}
