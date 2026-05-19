import type { MedState } from './types';
import { getToday, parseDateUTC } from './utils';

// === STATE RESOLVER ===

// Sentry-MedState med tomma strängar för alla datumfält — används som fallback
// för att undvika att "undefined" renderas i patient/journal-texter.
const EMPTY_STATE: MedState = {
  _cardId: 0,
  medRaw: '', medNameStripped: '', pDateStr: '', total: 0, dose: 0,
  doseUnit: 'st', doseUnitLabel: '', prescribedEndDateStr: '',
  displayAvgStr: '', avgNote: '', remainingDoses: null, daysRemaining: 0,
  daysToPrescribedEnd: 0, renewDateStr: '', prescribedContactDateStr: '',
  prescribedContactIsPast: false, valid: false, calculable: false,
  earlyRenewalDecision: null, isOveruse: false, isTooEarly: false,
  statusText: '', verdictTitle: '', verdictSub: '',
  metrics: [], alerts: [], doseInterval: 1, endDateStr: '',
};

export function resolveState(item: { state?: MedState | null; i: number }, states?: MedState[]): MedState {
  return (item.state || (states ? states[item.i] : null) || EMPTY_STATE) as MedState;
}

// === REMAINING DOSES NOTE ===

export function remainingDosesNote(s: MedState, leading: string = ' '): string {
  if (s.remainingDoses == null) return '';
  const u: string = s.doseUnit || 'st';
  if (s.daysRemaining != null && s.daysRemaining > 0) {
    return `${leading}Vid förnyelse framkommer att patienten har ${s.remainingDoses} ${u} (${s.daysRemaining} dagar) kvar.`;
  }
  if (Number(s.remainingDoses) > 0) {
    return `${leading}Vid förnyelse framkommer att patienten har ${s.remainingDoses} ${u} kvar (under ett dygn).`;
  }
  return `${leading}Vid förnyelse framkommer att patienten uppger att medicinen är slut.`;
}

// === PATIENT TEXT — enkel version utan klinisk bedömning ===

const PATIENT_TEXT: Record<string, { greeting: string; closing: string }> = {
  sv: { greeting: 'Hej,', closing: 'Vid frågor är du välkommen att kontakta oss via 1177.' },
  en: { greeting: 'Hello,', closing: 'If you have questions, please contact us through 1177.' },
};

// === PATIENT TEXT ===

export function buildPatientText(
  lang: string,
  cards: Array<{ name: string; i: number; state?: MedState | null }>,
  decision: 'yes' | 'no' | null,
  prescribeEndDate?: string
): string {
  const t = PATIENT_TEXT[lang] || PATIENT_TEXT.sv;
  const lines: string[] = [t.greeting, ''];
  const name = cards[0]?.name || '';
  if (decision === 'yes') {
    const endDate = prescribeEndDate ? ` så att läkemedlet räcker till och med ${prescribeEndDate}` : '';
    lines.push(`Vi har tagit emot din förfrågan om receptförnyelse för ${name} och kommer att förnya ditt recept inom 2–3 arbetsdagar${endDate}. Du kan därefter hämta ut din medicin på valfritt apotek.`);
  } else if (decision === 'no') {
    lines.push(`Vi har tagit emot din förfrågan om receptförnyelse för ${name}. Vi kan tyvärr inte förnya receptet vid detta tillfälle.`);
  } else {
    lines.push(`Vi har tagit emot din förfrågan om receptförnyelse för ${name}. Din förfrågan är under bedömning.`);
  }
  lines.push('', t.closing);
  return lines.join('\n');
}

export function buildJournalText(
  cards: Array<{ name: string; i: number; dose: number; doseUnitLabel: string; doseUnit: string; total: number; pDateStr: string; prescribedEndDateStr: string; displayAvgStr: string; avgNote: string; daysToPrescribedEnd: number; consumptionPct: number; decision: 'yes' | 'no' | null }>,
  validCount: number,
  prescribeEndDate?: string
): string {
  const lines: string[] = [];
  lines.push('Kontaktorsak: Receptförnyelse via 1177.', '');

  for (const c of cards) {
    const endSuffix = prescribeEndDate ? ` (förskrivs t.o.m. ${prescribeEndDate})` : '';
    const consumptionStr = `${c.consumptionPct.toFixed(1)}% av ordinerad dos`;
    const note = c.daysToPrescribedEnd > 0 ? ` (${c.daysToPrescribedEnd} dagar kvar)` : ' (receptperioden är slut)';
    const atgard = c.decision === 'yes' ? 'Åtgärd: Förnyat.'
      : c.decision === 'no' ? 'Åtgärd: Ej förnyat efter klinisk bedömning.'
      : 'Åtgärd: Klinisk bedömning krävs.';

    lines.push(`Bedömning: Patienten begär förnyelse av ${c.name}. Senaste receptet utfärdades ${c.pDateStr} (totalt ${c.total} ${c.doseUnit || 'st'}, ordination ${c.dose} ${c.doseUnitLabel || 'st/dag'}) och beräknas räcka till ${c.prescribedEndDateStr}${note}.`);
    lines.push(`Snittförbrukning: ${c.displayAvgStr} ${c.avgNote} (${consumptionStr}).`);
    lines.push(atgard, '');
  }
  return lines.join('\n');
}

export function buildNurseJournalText(
  states: Array<{ _cardId: number; medRaw?: string; valid?: boolean; calculable?: boolean; prescribedEndDateStr?: string; consumptionPct?: number; decision?: 'yes' | 'no' | null }>,
  nurseVitalNormal?: boolean,
  nurseFollowUpAdequate?: boolean
): string {
  const allMeds: Array<{ name: string; endDate: string }> = [];
  for (const s of states) {
    if (!s || !s.valid || s.calculable === false) continue;
    allMeds.push({ name: s.medRaw || 'Läkemedel', endDate: s.prescribedEndDateStr || '' });
  }
  if (allMeds.length === 0) return '';

  const nvn = nurseVitalNormal ?? false;
  const nfu = nurseFollowUpAdequate ?? false;
  const lines: string[] = [];
  lines.push(`Patient önskar förnyelse av ${allMeds.map(m => m.name).join(', ')}.`);
  for (const m of allMeds) {
    lines.push(`  ${m.name} beräknas räcka t.o.m. ${m.endDate || '—'}.`);
  }

  const missing: string[] = [];
  if (!nvn) missing.push('vitalparametrar');
  if (!nfu) missing.push('medicinska uppföljning');
  if (missing.length === 0) {
    lines.push('Patientens vitalparametrar och medicinska uppföljning bedöms adekvata.');
  } else {
    lines.push(`${missing.length === 2 ? 'Patientens vitalparametrar och medicinska uppföljning' : `Patientens ${missing[0]}`} bedöms vara avvikande.`);
  }
  lines.push('Lägger receptärendet till läkare för slutlig bedömning.');
  return lines.join('\n');
}
