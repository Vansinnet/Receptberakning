import { getToday, parseDateUTC } from './utils';

// === PATIENT TEXT ===

const PATIENT_TEXT: Record<string, { greeting: string; closing: string }> = {
  sv: { greeting: 'Hej,', closing: 'Vid frågor är du välkommen att kontakta oss via 1177.' },
  en: { greeting: 'Hello,', closing: 'If you have questions, please contact us through 1177.' },
};

export function buildPatientText(
  lang: string,
  cards: Array<{ name: string; prescribedEndDateStr?: string; decision: 'yes' | 'no' | null; daysToPrescribedEnd?: number; contactDateStr?: string; prescribeEnd?: string }>
): string {
  const t = PATIENT_TEXT[lang] || PATIENT_TEXT.sv;
  const en = lang === 'en';
  const lines: string[] = [t.greeting, ''];

  const list = cards.map(c => c.name).join(', ');
  const first = cards[0];

  if (cards.length === 1 && first) {
    if (first.decision === 'yes') {
      const endText = first.prescribeEnd ? ` så att det räcker till ${first.prescribeEnd}` : '';
      lines.push(en
        ? `We have received your prescription renewal request for ${first.name}. We will renew your prescription${first.prescribeEnd ? ` to last until ${first.prescribeEnd}` : ''}.`
        : `Vi har tagit emot din förfrågan om receptförnyelse för ${first.name}. Vi förnyar ditt recept${endText}.`);
      lines.push(en
        ? `You can collect your medication at any pharmacy within 2–3 working days.`
        : `Du kan inom 2–3 arbetsdagar hämta ut det på valfritt apotek.`);
    } else if (first.decision === 'no') {
      const prescribedEnd = first.prescribedEndDateStr;
      const days = first.daysToPrescribedEnd ?? 0;
      const verb = days < 0 ? 'beräknades' : 'beräknas';
      if (en) {
        lines.push(`We have received your request.`);
        if (prescribedEnd) {
          const enPast = days < 0 ? 'was expected' : 'is expected';
          if (days >= 14 && first.contactDateStr) {
            lines.push(`The current prescription ${enPast} to last until ${prescribedEnd}. Please contact us again closer to ${first.contactDateStr}.`);
          } else {
            lines.push(`The current prescription ${enPast} to last until ${prescribedEnd}.`);
          }
        }
        lines.push(`We are unfortunately unable to renew the prescription at this time following an individual clinical assessment by a physician.`);
      } else {
        lines.push(`Vi har tagit emot din förfrågan.`);
        if (prescribedEnd) {
          if (days >= 14 && first.contactDateStr) {
            lines.push(`Nuvarande recept ${verb} räcka t.o.m. ${prescribedEnd}. Hör av dig närmare ${first.contactDateStr}.`);
          } else {
            lines.push(`Nuvarande recept ${verb} räcka t.o.m. ${prescribedEnd}.`);
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
        const endText = c.prescribeEnd ? ` så att det räcker till ${c.prescribeEnd}` : '';
        lines.push(en
          ? `  ${c.name}: We will renew your prescription${c.prescribeEnd ? ` to last until ${c.prescribeEnd}` : ''}. You can collect it within 2–3 working days.`
          : `  ${c.name}: Vi förnyar ditt recept${endText}. Du kan inom 2–3 arbetsdagar hämta ut det på valfritt apotek.`);
      } else if (c.decision === 'no') {
        const prescribedEnd = c.prescribedEndDateStr;
        const days = c.daysToPrescribedEnd ?? 0;
        const verb = days < 0 ? 'beräknades' : 'beräknas';
        if (en) {
          const enPast = days < 0 ? 'was expected' : 'is expected';
          if (prescribedEnd) {
            if (days >= 14 && c.contactDateStr) {
              lines.push(`  ${c.name}: Unable to renew. Prescription ${enPast} to last until ${prescribedEnd}. Contact us closer to ${c.contactDateStr}.`);
            } else {
              lines.push(`  ${c.name}: Unable to renew. Prescription ${enPast} to last until ${prescribedEnd}.`);
            }
          } else {
            lines.push(`  ${c.name}: Unable to renew following clinical assessment.`);
          }
        } else {
          if (prescribedEnd) {
            if (days >= 14 && c.contactDateStr) {
              lines.push(`  ${c.name}: Kan tyvärr inte förnyas. Nuvarande recept ${verb} räcka t.o.m. ${prescribedEnd}. Hör av dig närmare ${c.contactDateStr}.`);
            } else {
              lines.push(`  ${c.name}: Kan tyvärr inte förnyas. Nuvarande recept ${verb} räcka t.o.m. ${prescribedEnd}.`);
            }
          } else {
            lines.push(`  ${c.name}: Kan tyvärr inte förnyas efter klinisk individuell bedömning av läkare.`);
          }
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
  prescribeEnds?: Record<number, string>
): string {
  const lines: string[] = [];
  lines.push('Kontaktorsak: Receptförnyelse via 1177.', '');

  for (const c of cards) {
    const note = c.daysToPrescribedEnd > 0 ? ` (${c.daysToPrescribedEnd} dagar kvar)` : ' (receptperioden är slut)';
    const verb = c.daysToPrescribedEnd < 0 ? 'beräknades' : 'beräknas';
    const prescribeEnd = prescribeEnds?.[c.i] ?? '';
    const atgard = c.decision === 'yes'
      ? (prescribeEnd ? `Åtgärd: Förnyat så att läkemedlet räcker till ${prescribeEnd}.` : 'Åtgärd: Förnyat.')
      : c.decision === 'no' ? 'Åtgärd: Ej förnyat efter klinisk bedömning.'
      : 'Åtgärd: Klinisk bedömning krävs.';

    lines.push(`Bedömning: Patienten begär förnyelse av ${c.name}. Senaste receptet utfärdades ${c.pDateStr} (totalt ${c.total} ${c.doseUnit || 'st'}, ordination ${c.dose} ${c.doseUnitLabel || 'st/dag'}) och ${verb} räcka till ${c.prescribedEndDateStr}${note}.`);
    const consumptionStr = `${c.consumptionPct.toFixed(1)}% av ordinerad dos`;
    lines.push(`Snittförbrukning: ${c.displayAvgStr} ${c.avgNote} (${consumptionStr}).`);
    lines.push(atgard, '');
  }
  return lines.join('\n');
}

export function buildNurseJournalText(
  states: Array<{ _cardId: number; medRaw?: string; valid?: boolean; calculable?: boolean; prescribedEndDateStr?: string; daysToPrescribedEnd?: number; consumptionPct?: number; decision?: 'yes' | 'no' | null }>,
  nurseVitalNormal?: boolean,
  nurseFollowUpAdequate?: boolean
): string {
  const allMeds: Array<{ name: string; endDate: string; days: number }> = [];
  for (const s of states) {
    if (!s || !s.valid || s.calculable === false) continue;
    allMeds.push({ name: s.medRaw || 'Läkemedel', endDate: s.prescribedEndDateStr || '', days: s.daysToPrescribedEnd ?? 0 });
  }
  if (allMeds.length === 0) return '';

  const nvn = nurseVitalNormal ?? false;
  const nfu = nurseFollowUpAdequate ?? false;
  const lines: string[] = [];
  lines.push(`Patient önskar förnyelse av ${allMeds.map(m => m.name).join(', ')}.`);
  for (const m of allMeds) {
    const verb = m.days < 0 ? 'beräknades' : 'beräknas';
    lines.push(`  ${m.name} ${verb} räcka t.o.m. ${m.endDate || '—'}.`);
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
