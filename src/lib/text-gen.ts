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

// === PATIENT TEXT TEMPLATES ===

interface PatientTemplates {
  greeting: string;
  closing: string;
  multiIntro: string;
  singleRenew: (name: string, endDate?: string) => string;
  singleTooEarly: (name: string, s: MedState) => string;
  singleOveruse: (name: string, s: MedState, c: string) => string;
  singleOverusePast: (name: string, s: MedState) => string;
  closingEndPast: string;
  closingContactPast: string;
  closingFuture: (s: MedState) => string;
  multiRenew: (name: string, endDate?: string) => string;
  multiTooEarly: (name: string, s: MedState) => string;
  multiOverusePast: (name: string, s: MedState) => string;
  multiOveruseNotPast: (name: string, s: MedState, c: string) => string;
  multiContactPast: string;
  multiFuture: (s: MedState) => string;
}

const PATIENT_TEXT: Record<string, PatientTemplates> = {
  sv: {
    greeting:          'Hej,',
    closing:           'Vid frågor är du välkommen att kontakta oss via 1177.',
    multiIntro:        'Vi har tagit emot din förfrågan om receptförnyelse för följande läkemedel:',
    singleRenew:       (name: string, endDate?: string) => `Vi har tagit emot din förfrågan om receptförnyelse för ${name} och kommer att förnya ditt recept inom 2–3 arbetsdagar${endDate ? ` så att läkemedlet räcker till och med ${endDate}` : ''}. Du kan därefter hämta ut din medicin på valfritt apotek.`,
    singleTooEarly:    (name: string, s: MedState)      => `Vi har tagit emot din förfrågan om receptförnyelse för ${name}. Enligt din ordination (${s.dose} ${s.doseUnitLabel || 'st/dag'}) beräknas medicinen räcka till den ${s.prescribedEndDateStr}. Eftersom det datumet inte ännu har passerat kan vi inte förnya receptet just nu. Vänligen hör av dig igen runt den ${s.renewDateStr} så hjälper vi dig då med nytt recept.`,
    singleOveruse:     (name: string, s: MedState, c: string)   => `Vi har tagit emot din förfrågan om receptförnyelse för ${name}. Utifrån föregående recept beräknades medicinen räcka till den ${s.prescribedEndDateStr}. Vi har granskat förfrågan och kan tyvärr inte förnya receptet vid detta tillfälle. ${c}`,
    singleOverusePast: (name: string, s: MedState)      => `Vi har tagit emot din förfrågan om receptförnyelse för ${name}. Utifrån föregående recept beräknades medicinen räcka till den ${s.prescribedEndDateStr}. Receptet kan nu förnyas — vänligen hör av dig igen så hjälper vi dig med nytt recept.`,
    closingEndPast:    'Receptet kan nu förnyas. Kontakta oss igen om du vill ha ett nytt recept utfärdat.',
    closingContactPast:'Medicinen beräknas ta slut inom kort — vänligen hör av dig igen så hjälper vi dig.',
    closingFuture:     (s: MedState)            => `Vänligen hör av dig igen närmre den ${s.prescribedContactDateStr} så hjälper vi dig då.`,
    multiRenew:        (name: string, endDate?: string) => `${name}: Vi förnyar ditt recept inom 2–3 arbetsdagar${endDate ? ` så att läkemedlet räcker till och med ${endDate}` : ''}.`,
    multiTooEarly:     (name: string, s: MedState)      => `${name}: Enligt din ordination beräknas medicinen räcka till ${s.prescribedEndDateStr} — vi kan därför inte förnya receptet ännu. Hör av dig runt ${s.renewDateStr}.`,
    multiOverusePast:  (name: string, s: MedState)      => `${name}: Beräknades räcka till ${s.prescribedEndDateStr}. Receptet kan nu förnyas — kontakta oss igen.`,
    multiOveruseNotPast:(name: string, s: MedState, c: string)  => `${name}: Beräknades räcka till ${s.prescribedEndDateStr} — kan tyvärr inte förnyas vid detta tillfälle. ${c}`,
    multiContactPast:  'Medicinen beräknas ta slut inom kort — hör av dig igen.',
    multiFuture:       (s: MedState)            => `Hör av dig närmre ${s.prescribedContactDateStr}.`,
  },
  en: {
    greeting:          'Hello,',
    closing:           'If you have questions, please contact us through 1177.',
    multiIntro:        'We have received your prescription renewal request for the following medications:',
    singleRenew:       (name: string, endDate?: string) => `We have received your prescription renewal request for ${name} and will renew your prescription within 2–3 working days${endDate ? ` so that the medication lasts until ${endDate}` : ''}. You can then collect your medication at any pharmacy.`,
    singleTooEarly:    (name: string, s: MedState)      => `We have received your prescription renewal request for ${name}. Based on your prescription (${s.dose} ${s.doseUnitLabel || 'units/day'}), your medication is estimated to last until ${s.prescribedEndDateStr}. Since that date has not yet passed, we are unable to renew the prescription at this time. Please contact us again around ${s.renewDateStr} and we will help you then.`,
    singleOveruse:     (name: string, s: MedState, c: string)   => `We have received your prescription renewal request for ${name}. Based on the previous prescription, the medication was estimated to last until ${s.prescribedEndDateStr}. We have reviewed your request and are unfortunately unable to renew the prescription at this time. ${c}`,
    singleOverusePast: (name: string, s: MedState)      => `We have received your prescription renewal request for ${name}. Based on the previous prescription, the medication was estimated to last until ${s.prescribedEndDateStr}. The prescription can now be renewed — please contact us again for a new prescription.`,
    closingEndPast:    'Your prescription can now be renewed. Please contact us again if you would like a new prescription.',
    closingContactPast:'Your medication is expected to run out shortly — please contact us again and we will help you.',
    closingFuture:     (s: MedState)            => `Please contact us again closer to ${s.prescribedContactDateStr}.`,
    multiRenew:        (name: string, endDate?: string) => `${name}: We will renew your prescription within 2–3 working days${endDate ? ` so that the medication lasts until ${endDate}` : ''}.`,
    multiTooEarly:     (name: string, s: MedState)      => `${name}: Based on your prescription, the medication is estimated to last until ${s.prescribedEndDateStr} — it is therefore too early to renew. Please contact us around ${s.renewDateStr}.`,
    multiOverusePast:  (name: string, s: MedState)      => `${name}: Based on the previous prescription, the medication was estimated to last until ${s.prescribedEndDateStr}. The prescription can now be renewed — please contact us again.`,
    multiOveruseNotPast:(name: string, s: MedState, c: string)  => `${name}: Based on the previous prescription, the medication was estimated to last until ${s.prescribedEndDateStr} — we are unfortunately unable to renew it at this time. ${c}`,
    multiContactPast:  'The medication is expected to run out shortly — please contact us again.',
    multiFuture:       (s: MedState)            => `Please contact us again closer to ${s.prescribedContactDateStr}.`,
  },
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
    }
  } else {
    lines.push(t.multiIntro, '');
    for (const { name, i } of toRenew) {
      lines.push(t.multiRenew(name, prescribeEnds[i]));
    }
    for (const item of tooEarly) {
      lines.push(t.multiTooEarly(item.name, resolveState(item, states)));
    }
    for (const item of overuse) {
      const s = resolveState(item, states);
      const parsedEpast = parseDateUTC(s.prescribedEndDateStr || '');
      const epast = parsedEpast && parsedEpast < getToday();
      if (epast) {
        lines.push(t.multiOverusePast(item.name, s));
      } else {
        const c = s.prescribedContactIsPast ? t.multiContactPast : t.multiFuture(s);
        lines.push(t.multiOveruseNotPast(item.name, s, c));
      }
    }
    lines.push('', t.closing);
  }

  return lines.join('\n');
}

// === JOURNAL TEXT ===

export function buildJournalText(
  toRenew: Array<{ name: string; i: number; state?: MedState | null; earlyRenewal?: string }>,
  tooEarly: Array<{ name: string; i: number; state?: MedState | null }>,
  overuse: Array<{ name: string; i: number; state?: MedState | null }>,
  validCount: number,
  prescribeEnds: Record<number, string> = {},
  states?: MedState[]
): string {
  const lines: string[] = [];

  if (validCount === 1) {
    if (toRenew.length === 1) {
      const s = resolveState(toRenew[0], states);
      const endSuffix = prescribeEnds[toRenew[0].i] ? ` (räcker t.o.m. ${prescribeEnds[toRenew[0].i]})` : '';

      if (toRenew[0].earlyRenewal === 'overuse') {
        lines.push(
          'Kontaktorsak: Receptförnyelse via 1177.', '',
          `Bedömning: Patienten begär förnyelse av ${toRenew[0].name}. Senaste receptet utfärdades ${s.pDateStr} (totalt ${s.total} ${s.doseUnit || 'st'}, ordination ${s.dose} ${s.doseUnitLabel || 'st/dag'}) och borde räcka till ${s.prescribedEndDateStr}.${remainingDosesNote(s)}`,
          `Beräknad snittförbrukning: ${s.displayAvgStr} ${s.avgNote} — överstiger ordination. Receptet förnyas på klinisk indikation efter individuell bedömning.`,
          '', `Åtgärd: Nytt recept utfärdat${endSuffix}. Svar skickat till patient via 1177.`
        );
      } else {
        const earlyNote = toRenew[0].earlyRenewal === 'tooEarly'
          ? ` Receptet förnyas på klinisk indikation efter individuell bedömning trots att receptperioden löper ut ${s.prescribedEndDateStr} (${s.daysToPrescribedEnd} dagar kvar).`
          : '';
        lines.push(
          'Kontaktorsak: Receptförnyelse via 1177.', '',
          `Bedömning: Patienten begär förnyelse av ${toRenew[0].name}. Senaste receptet utfärdades ${s.pDateStr} (totalt ${s.total} ${s.doseUnit || 'st'}, ordination ${s.dose} ${s.doseUnitLabel || 'st/dag'}) och beräknas räcka till ${s.prescribedEndDateStr}.${remainingDosesNote(s)}${earlyNote}`,
          `Förbrukning bedöms vara enligt ordination (snittförbrukning: ${s.displayAvgStr} ${s.avgNote}).`,
          '', `Åtgärd: Nytt recept utfärdat${endSuffix}. Svar skickat till patient via 1177.`
        );
      }
    } else if (tooEarly.length === 1) {
      const s = resolveState(tooEarly[0], states);
      lines.push(
        'Kontaktorsak: Receptförnyelse via 1177.', '',
        `Bedömning: Patienten begär förnyelse av ${tooEarly[0].name}. Senaste receptet utfärdades ${s.pDateStr} (totalt ${s.total} ${s.doseUnit || 'st'}, ordination ${s.dose} ${s.doseUnitLabel || 'st/dag'}) och beräknas räcka till ${s.prescribedEndDateStr} (${s.daysToPrescribedEnd} dagar kvar).${remainingDosesNote(s)}`,
        `Förbrukning bedöms vara enligt ordination (snittförbrukning: ${s.displayAvgStr} ${s.avgNote}).`,
        '', 'Åtgärd: Ej förnyat — för tidigt. Svar skickat till patient via 1177.'
      );
    } else if (overuse.length === 1) {
      const s = resolveState(overuse[0], states);
      const u1 = s.doseUnit || 'st';
      const sn = s.remainingDoses != null
        ? (s.daysRemaining != null && s.daysRemaining > 0
            ? `Vid förnyelse framkommer att patienten har ${s.remainingDoses} ${u1} (${s.daysRemaining} dagar) kvar.`
            : 'Vid förnyelse framkommer att patienten uppger att medicinen är slut.')
        : (s.daysToPrescribedEnd != null && s.daysToPrescribedEnd > 0
            ? `Aktuell receptperiod löper ut om ${s.daysToPrescribedEnd} dagar (t.o.m. ${s.prescribedEndDateStr}).`
            : 'Aktuell receptperiod är avslutad.');
      const atgard = s.earlyRenewalDecision === 'no'
        ? 'Åtgärd: Ej förnyat efter klinisk, individuell bedömning.'
        : s.earlyRenewalDecision === 'yes'
          ? 'Åtgärd: Nytt recept utfärdat efter klinisk, individuell bedömning.'
          : 'Åtgärd: Klinisk bedömning krävs.';
      lines.push(
        'Kontaktorsak: Receptförnyelse via 1177.', '',
        `Bedömning: Patienten begär förnyelse av ${overuse[0].name}. Senaste receptet utfärdades ${s.pDateStr} (totalt ${s.total} ${s.doseUnit || 'st'}, ordination ${s.dose} ${s.doseUnitLabel || 'st/dag'}) och borde räcka till ${s.prescribedEndDateStr}. ${sn} Beräknad snittförbrukning: ${s.displayAvgStr} ${s.avgNote}.`,
        '', atgard
      );
    }
  } else {
    lines.push('Kontaktorsak: Receptförnyelse via 1177 (flera läkemedel).', '');
    for (const item of toRenew) {
      const s = resolveState(item, states);
      const atgardText = item.earlyRenewal === 'overuse'
        ? 'Åtgärd: Förnyat efter klinisk, individuell bedömning.'
        : item.earlyRenewal === 'tooEarly'
          ? `Åtgärd: Förnyat efter klinisk, individuell bedömning (${s.daysToPrescribedEnd}d kvar av receptperiod).`
          : 'Åtgärd: Förnyat.';
      const remNote = item.earlyRenewal !== 'overuse' ? remainingDosesNote(s) : '';
      const endInfo = item.earlyRenewal === 'overuse'
        ? `Borde räcka t.o.m. ${s.prescribedEndDateStr}. Snitt: ${s.displayAvgStr} — överstiger ordination.`
        : `Räcker t.o.m. ${s.prescribedEndDateStr}.${remNote} Snitt: ${s.displayAvgStr}.`;
      lines.push(`${item.name}: Utfärdat ${s.pDateStr} (${s.total} ${s.doseUnit || 'st'}, ${s.dose} ${s.doseUnitLabel || 'st/dag'}). ${endInfo} ${atgardText}`, '');
    }
    for (const item of tooEarly) {
      const s = resolveState(item, states);
      lines.push(`${item.name}: Utfärdat ${s.pDateStr} (${s.total} ${s.doseUnit || 'st'}, ${s.dose} ${s.doseUnitLabel || 'st/dag'}). Räcker t.o.m. ${s.prescribedEndDateStr} (${s.daysToPrescribedEnd} dagar kvar). Snitt: ${s.displayAvgStr}. Åtgärd: Ej förnyat — för tidigt.`, '');
    }
    for (const item of overuse) {
      const s = resolveState(item, states);
      const u2 = s.doseUnit || 'st';
      const sn2 = s.remainingDoses != null
        ? (s.daysRemaining != null && s.daysRemaining > 0
            ? `Vid förnyelse framkommer att patienten har ${s.remainingDoses} ${u2} (${s.daysRemaining} dagar) kvar.`
            : 'Vid förnyelse framkommer att patienten uppger att medicinen är slut.')
        : (s.daysToPrescribedEnd != null && s.daysToPrescribedEnd > 0
            ? `Receptperiod löper ut om ${s.daysToPrescribedEnd} dagar.`
            : 'Receptperioden är avslutad.');
      const atgard = s.earlyRenewalDecision === 'no'
        ? 'Åtgärd: Ej förnyat efter klinisk, individuell bedömning.'
        : s.earlyRenewalDecision === 'yes'
          ? 'Åtgärd: Förnyat efter klinisk, individuell bedömning.'
          : 'Åtgärd: Klinisk bedömning krävs.';
      lines.push(`${item.name}: Utfärdat ${s.pDateStr} (${s.total} ${s.doseUnit || 'st'}, ${s.dose} ${s.doseUnitLabel || 'st/dag'}). Borde räcka t.o.m. ${s.prescribedEndDateStr}. ${sn2} Snitt: ${s.displayAvgStr}. ${atgard}`, '');
    }
    lines.push(
      toRenew.length > 0
        ? `Recept utfärdat för: ${toRenew.map(item => {
            const ed = prescribeEnds[item.i];
            return ed ? `${item.name} fram till och med ${ed}` : item.name;
          }).join(', ')}. Svar skickat via 1177.`
        : 'Inga recept utfärdade. Svar skickat via 1177.'
    );
  }

  return lines.join('\n');
}

// === NURSE JOURNAL TEXT ===

export function buildNurseJournalText(
  states: MedState[],
  nurseVitalNormal?: boolean,
  nurseFollowUpAdequate?: boolean
): string {
  const allMeds: Array<{ name: string; i: number; endDate: string }> = [];
  let hasOutsideLimits = false;

  for (let i = 0; i < states.length; i++) {
    const s = states[i];
    if (!s || !s.valid || s.calculable === false) continue;
    const name = s.medNameStripped || s.medRaw || `Läkemedel ${i + 1}`;
    const isOutside = (s.isOveruse || s.isTooEarly) && s.earlyRenewalDecision !== 'yes';
    if (isOutside) hasOutsideLimits = true;
    allMeds.push({ name, i, endDate: s.prescribedEndDateStr || '' });
  }

  if (allMeds.length === 0) return '';

  const nvn = nurseVitalNormal ?? false;
  const nfu = nurseFollowUpAdequate ?? false;

  const lines: string[] = [];
  lines.push(`Patient önskar förnyelse av ${allMeds.map(m => m.name).join(', ')}.`);

  if (allMeds.length === 1) {
    const endStr = allMeds[0].endDate ? ` till och med ${allMeds[0].endDate}` : '';
    const suffix = hasOutsideLimits ? ' utifrån tidigare förskrivning' : '';
    lines.push(`Vid bedömningen bedöms patientens nuvarande ${allMeds[0].name} räcka${endStr}${suffix}.`);
  } else {
    const endParts = allMeds.map(m => {
      const endStr = m.endDate ? ` till och med ${m.endDate}` : '';
      return `${m.name} räcka${endStr}`;
    });
    const suffix = hasOutsideLimits ? ' utifrån tidigare förskrivning' : '';
    lines.push(`Vid bedömningen bedöms patientens nuvarande ${endParts.join(' och ')}${suffix}.`);
  }

  const missing: string[] = [];
  if (!nvn) missing.push('vitalparametrar');
  if (!nfu) missing.push('medicinska uppföljning');

  if (missing.length === 0) {
    lines.push('Patientens vitalparametrar och medicinska uppföljning bedöms adekvata.');
  } else if (missing.length === 2) {
    lines.push('Patientens vitalparametrar och medicinska uppföljning bedöms vara avvikande.');
  } else {
    const prefix = missing[0] === 'vitalparametrar' ? 'Patientens vitalparametrar' : 'Patientens medicinska uppföljning';
    lines.push(`${prefix} bedöms vara avvikande.`);
  }

  lines.push('Lägger receptärendet till läkare för slutlig bedömning.');
  return lines.join('\n');
}
