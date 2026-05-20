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
  cards: Array<{ name: string; prescribedEndDateStr?: string; decision: 'yes' | 'no' | null; daysToPrescribedEnd?: number; contactDateStr?: string }>
): string {
  const t = PATIENT_TEXT[lang] || PATIENT_TEXT.sv;
  const en = lang === 'en';
  const lines: string[] = [t.greeting, ''];

  const list = cards.map(c => c.name).join(', ');
  const first = cards[0];

  if (cards.length === 1 && first) {
    if (first.decision === 'yes') {
      lines.push(en
        ? `We have received your prescription renewal request for ${first.name} and will renew your prescription within 2–3 working days. You can then collect your medication at any pharmacy.`
        : `Vi har tagit emot din förfrågan om receptförnyelse för ${first.name}. Vi kommer att förnya ditt recept inom 2–3 arbetsdagar. Du kan därefter hämta ut din medicin på valfritt apotek.`);
    } else if (first.decision === 'no') {
      const prescribedEnd = first.prescribedEndDateStr;
      const days = first.daysToPrescribedEnd ?? 0;
      if (en) {
        lines.push(`We have received your request.`);
        if (prescribedEnd) {
          if (days >= 14 && first.contactDateStr) {
            lines.push(`The current prescription is expected to last until ${prescribedEnd}. Please contact us again closer to ${first.contactDateStr}.`);
          } else {
            lines.push(`The current prescription is expected to last until ${prescribedEnd}.`);
          }
        }
        lines.push(`We are unfortunately unable to renew the prescription at this time following an individual clinical assessment by a physician.`);
      } else {
        lines.push(`Vi har tagit emot din förfrågan.`);
        if (prescribedEnd) {
          if (days >= 14 && first.contactDateStr) {
            lines.push(`Nuvarande recept beräknas räcka t.o.m. ${prescribedEnd}. Hör av dig närmare ${first.contactDateStr}.`);
          } else {
            lines.push(`Nuvarande recept beräknas räcka t.o.m. ${prescribedEnd}.`);
          }
        }
        lines.push(`Vi kan tyvärr inte förnya receptet vid detta tillfälle efter klinisk individuell bedömning av läkare.`);
      }
    } else {
      lines.push(en
        ? `We have received your prescription renewal request for ${first.name}. Your request is currently being assessed.`
        : `Vi har tagit emot din förfrågan om receptförnyelse för ${first.name}. Din förfrågan är under bedömning.`);
    }
  } else if (cards.length > 1) {
    lines.push(en
      ? `We have received your prescription renewal request for the following medications: ${list}.`
      : `Vi har tagit emot din förfrågan om receptförnyelse för följande läkemedel: ${list}.`);
    for (const c of cards) {
      if (c.decision === 'yes') {
        lines.push(en ? `  ${c.name}: We will renew your prescription.` : `  ${c.name}: Vi förnyar ditt recept.`);
      } else if (c.decision === 'no') {
        const prescribedEnd = c.prescribedEndDateStr;
        const days = c.daysToPrescribedEnd ?? 0;
        if (en) {
          let extra = '';
          if (prescribedEnd) {
            if (days >= 14 && c.contactDateStr) {
              extra = ` Current prescription lasts until ${prescribedEnd}. Contact us closer to ${c.contactDateStr}.`;
            } else {
              extra = ` Current prescription lasts until ${prescribedEnd}.`;
            }
          }
          lines.push(`  ${c.name}: Unable to renew.${extra}`);
        } else {
          let extra = '';
          if (prescribedEnd) {
            if (days >= 14 && c.contactDateStr) {
              extra = ` Nuvarande recept räcker t.o.m. ${prescribedEnd}. Hör av dig närmare ${c.contactDateStr}.`;
            } else {
              extra = ` Nuvarande recept räcker t.o.m. ${prescribedEnd}.`;
            }
          }
          lines.push(`  ${c.name}: Kan tyvärr inte förnyas.${extra}`);
        }
      }
    }
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
