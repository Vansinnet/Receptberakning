import { getToday, parseDateUTC } from './utils';

// === PATIENT TEXT ===

type CardView = {
  name: string;
  prescribedEndDateStr?: string;
  decision: 'yes' | 'no' | null;
  daysToPrescribedEnd?: number;
  contactDateStr?: string;
  prescribeEnd?: string;
};

const TPL = {
  sv: {
    greeting: 'Hej,',
    closing: 'Vid frågor är du välkommen att kontakta oss via 1177.',
    single_yes: (name: string, end: string) =>
      `Vi har tagit emot din förfrågan om receptförnyelse för ${name}. Vi förnyar ditt recept${end}.`,
    single_yes_footer: 'Du kan inom 2–3 arbetsdagar hämta ut det på valfritt apotek.',
    single_no_header: 'Vi har tagit emot din förfrågan.',
    single_no_body: (verb: string, date: string, contact: string) =>
      `Nuvarande recept ${verb} räcka t.o.m. ${date}.${contact}`,
    single_no_footer: 'Vi kan tyvärr inte förnya receptet vid detta tillfälle efter klinisk individuell bedömning av läkare.',
    single_null: (name: string) =>
      `Vi har tagit emot din förfrågan om receptförnyelse för ${name}. Din förfrågan är under bedömning.`,
    multi_intro: (list: string) =>
      `Vi har tagit emot din förfrågan om receptförnyelse för följande läkemedel: ${list}.`,
    multi_item_yes: (name: string, end: string) =>
      `  ${name}: Vi förnyar ditt recept${end}. Du kan inom 2–3 arbetsdagar hämta ut det på valfritt apotek.`,
    multi_item_no: (name: string, verb: string, date: string, contact: string) =>
      `  ${name}: Kan tyvärr inte förnyas. Nuvarande recept ${verb} räcka t.o.m. ${date}.${contact}`,
    multi_item_no_nodate: (name: string) =>
      `  ${name}: Kan tyvärr inte förnyas efter klinisk individuell bedömning av läkare.`,
  },
  en: {
    greeting: 'Hello,',
    closing: 'If you have questions, please contact us through 1177.',
    single_yes: (name: string, end: string) =>
      `We have received your prescription renewal request for ${name}. We will renew your prescription${end}.`,
    single_yes_footer: 'You can collect your medication at any pharmacy within 2–3 working days.',
    single_no_header: 'We have received your request.',
    single_no_body: (verb: string, date: string, contact: string) =>
      `The current prescription ${verb} to last until ${date}.${contact}`,
    single_no_footer: 'We are unfortunately unable to renew the prescription at this time following an individual clinical assessment by a physician.',
    single_null: (name: string) =>
      `We have received your prescription renewal request for ${name}. Your request is currently being assessed.`,
    multi_intro: (list: string) =>
      `We have received your prescription renewal request for the following medications: ${list}.`,
    multi_item_yes: (name: string, end: string) =>
      `  ${name}: We will renew your prescription${end}. You can collect it within 2–3 working days.`,
    multi_item_no: (name: string, verb: string, date: string, contact: string) =>
      `  ${name}: Unable to renew. Prescription ${verb} to last until ${date}.${contact}`,
    multi_item_no_nodate: (name: string) =>
      `  ${name}: Unable to renew following clinical assessment.`,
  },
};

function _noBody(lang: typeof TPL.sv, days: number, date: string, contact?: string): string {
  const verb = days < 0 ? 'beräknades' : 'beräknas';
  const contactStr = days >= 14 && contact ? ` Hör av dig närmare ${contact}.` : '';
  return lang.single_no_body(verb, date, contactStr);
}

function _noBodyEn(lang: typeof TPL.en, days: number, date: string, contact?: string): string {
  const verb = days < 0 ? 'was expected' : 'is expected';
  const contactStr = days >= 14 && contact ? ` Please contact us again closer to ${contact}.` : '';
  return lang.single_no_body(verb, date, contactStr);
}

function _itemNoBody(lang: typeof TPL.sv, name: string, days: number, date: string, contact?: string): string {
  const verb = days < 0 ? 'beräknades' : 'beräknas';
  const contactStr = days >= 14 && contact ? ` Hör av dig närmare ${contact}.` : '';
  return lang.multi_item_no(name, verb, date, contactStr);
}

function _itemNoBodyEn(lang: typeof TPL.en, name: string, days: number, date: string, contact?: string): string {
  const verb = days < 0 ? 'was expected' : 'is expected';
  const contactStr = days >= 14 && contact ? ` Please contact us again closer to ${contact}.` : '';
  return lang.multi_item_no(name, verb, date, contactStr);
}

function _buildSingle(lang: typeof TPL.sv, card: CardView, en: boolean): string[] {
  if (card.decision === 'yes') {
    const end = card.prescribeEnd ? (en ? ` to last until ${card.prescribeEnd}` : ` så att det räcker till ${card.prescribeEnd}`) : '';
    return [lang.single_yes(card.name, end), lang.single_yes_footer];
  }
  if (card.decision === 'no') {
    const lines = [lang.single_no_header];
    const date = card.prescribedEndDateStr;
    if (date) {
      const days = card.daysToPrescribedEnd ?? 0;
      lines.push(en ? _noBodyEn(TPL.en, days, date, card.contactDateStr) : _noBody(lang, days, date, card.contactDateStr));
    }
    lines.push(lang.single_no_footer);
    return lines;
  }
  return [lang.single_null(card.name)];
}

function _buildMulti(lang: typeof TPL.sv, cards: CardView[], en: boolean): string[] {
  const lines: string[] = [lang.multi_intro(cards.map(c => c.name).join(', '))];
  for (const c of cards) {
    if (c.decision === 'yes') {
      const end = c.prescribeEnd ? (en ? ` to last until ${c.prescribeEnd}` : ` så att det räcker till ${c.prescribeEnd}`) : '';
      lines.push(lang.multi_item_yes(c.name, end));
    } else if (c.decision === 'no') {
      const date = c.prescribedEndDateStr;
      if (!date) {
        lines.push(lang.multi_item_no_nodate(c.name));
      } else {
        const days = c.daysToPrescribedEnd ?? 0;
        lines.push(en ? _itemNoBodyEn(TPL.en, c.name, days, date, c.contactDateStr) : _itemNoBody(lang, c.name, days, date, c.contactDateStr));
      }
    }
  }
  return lines;
}

export function buildPatientText(lang: string, cards: CardView[]): string {
  const en = lang === 'en';
  const tpl = en ? TPL.en : TPL.sv;
  const lines = [tpl.greeting, ''];

  if (cards.length === 1) {
    lines.push(..._buildSingle(tpl, cards[0], en));
  } else if (cards.length > 1) {
    lines.push(..._buildMulti(tpl, cards, en));
  }

  lines.push('', tpl.closing);
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
