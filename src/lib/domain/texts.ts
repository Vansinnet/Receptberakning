// === TEXTFÖRSLAG ===
// Rena funktioner som bygger patientsvar (svenska/engelska), journalanteckning,
// sjuksköterskans journaltext och långtidsanalysens journaltext.
// Texterna är förslag: läkaren anpassar dem innan de kopieras.

import type { Assessment, Decision, DoseInterval, DoseUnit } from '../types';
import { CONTACT_BEFORE_END_DAYS, DAYS_REMAINING_WARN, INTERVAL_LABEL, UNIT_DISPLAY } from '../constants';
import { addDays, fmtDate, fmtFixed, fmtPct, fmtQty } from '../utils';
import { daysLeftText, type RenewalOk } from './renewal';
import type { PrescriptionResult } from './prescribe';
import type { LongtermResult } from './longterm';

export type Lang = 'sv' | 'en';

/** Ett läkemedel som ingår i texterna. `renewal` saknas för ej beräkningsbara beredningar. */
export interface TextItem {
  name: string;
  unit: DoseUnit;
  interval: DoseInterval;
  doseRaw: string;
  dateRaw: string;
  decision: Decision;
  renewal: RenewalOk | null;
  prescription: PrescriptionResult | null;
}

const T = {
  sv: {
    greeting: 'Hej,',
    closing: 'Vid frågor är du välkommen att kontakta oss via 1177.',
    received: (n: string) => `Vi har tagit emot din förfrågan om receptförnyelse för ${n}.`,
    receivedShort: 'Vi har tagit emot din förfrågan.',
    receivedList: (l: string) => `Vi har tagit emot din förfrågan om receptförnyelse för följande läkemedel: ${l}.`,
    renew: (until: string) => `Vi förnyar ditt recept${until ? ` så att det räcker till ${until}` : ''}.`,
    pickup: 'Du kan inom 2–3 arbetsdagar hämta ut det på valfritt apotek.',
    lasts: (past: boolean, d: string) => `Nuvarande recept ${past ? 'beräknades' : 'beräknas'} räcka t.o.m. ${d}.`,
    contact: (d: string) => `Hör av dig närmare ${d}.`,
    decline: 'Vi kan tyvärr inte förnya receptet vid detta tillfälle efter klinisk individuell bedömning av läkare.',
    declineShort: 'Kan tyvärr inte förnyas efter klinisk individuell bedömning av läkare.',
    pending: 'Din förfrågan är under bedömning.',
  },
  en: {
    greeting: 'Hello,',
    closing: 'If you have questions, please contact us through 1177.',
    received: (n: string) => `We have received your prescription renewal request for ${n}.`,
    receivedShort: 'We have received your request.',
    receivedList: (l: string) => `We have received your prescription renewal request for the following medications: ${l}.`,
    renew: (until: string) => `We will renew your prescription${until ? ` to last until ${until}` : ''}.`,
    pickup: 'You can collect your medication at any pharmacy within 2–3 working days.',
    lasts: (past: boolean, d: string) => `The current prescription ${past ? 'was expected' : 'is expected'} to last until ${d}.`,
    contact: (d: string) => `Please contact us again closer to ${d}.`,
    decline: 'We are unfortunately unable to renew the prescription at this time following an individual clinical assessment by a physician.',
    declineShort: 'Unable to renew following an individual clinical assessment by a physician.',
    pending: 'Your request is currently being assessed.',
  },
};

function renewUntil(it: TextItem): string {
  const p = it.prescription;
  return p && p.kind === 'ok' ? fmtDate(p.target) : '';
}

function declineBody(t: typeof T.sv, r: RenewalOk): string {
  let s = t.lasts(r.daysLeft < 0, fmtDate(r.endDate));
  if (r.daysLeft >= DAYS_REMAINING_WARN) s += ' ' + t.contact(fmtDate(addDays(r.endDate, -CONTACT_BEFORE_END_DAYS)));
  return s;
}

/** Svar till patienten för hela ärendet. */
export function buildPatientText(lang: Lang, items: TextItem[]): string {
  if (items.length === 0) return '';
  const t = T[lang];
  const lines: string[] = [t.greeting, ''];

  if (items.length === 1) {
    const it = items[0];
    if (it.decision === 'yes') lines.push(`${t.received(it.name)} ${t.renew(renewUntil(it))}`, t.pickup);
    else if (it.decision === 'no') {
      lines.push(t.receivedShort);
      if (it.renewal) lines.push(declineBody(t, it.renewal));
      lines.push(t.decline);
    } else lines.push(`${t.received(it.name)} ${t.pending}`);
  } else {
    lines.push(t.receivedList(items.map((i) => i.name).join(', ')), '');
    for (const it of items) {
      if (it.decision === 'yes') lines.push(`  ${it.name}: ${t.renew(renewUntil(it))} ${t.pickup}`);
      else if (it.decision === 'no') {
        lines.push(it.renewal ? `  ${it.name}: ${declineBody(t, it.renewal)} ${t.decline}` : `  ${it.name}: ${t.declineShort}`);
      } else lines.push(`  ${it.name}: ${t.pending}`);
    }
  }
  lines.push('', t.closing);
  return lines.join('\n');
}

function doseText(it: TextItem): string {
  return `${it.doseRaw.trim().replace('.', ',')} ${UNIT_DISPLAY[it.unit].short}/${INTERVAL_LABEL[it.interval]}`;
}

/** Läkarens journalanteckning för hela ärendet. */
export function buildJournalText(items: TextItem[]): string {
  if (items.length === 0) return '';
  const lines: string[] = ['Kontaktorsak: Receptförnyelse via 1177.', ''];
  for (const it of items) {
    const u = UNIT_DISPLAY[it.unit].short;
    const r = it.renewal;
    if (r) {
      let s = `${it.name}: Senaste recept ${fmtDate(r.prescribedDate)}, ${fmtQty(r.packageSize)} ${u} × ${r.refills} uttag = ${fmtQty(r.total)} ${u}, ordination ${doseText(it)}. `;
      s += `${r.daysLeft < 0 ? 'Beräknades' : 'Beräknas'} räcka t.o.m. ${fmtDate(r.endDate)} (${daysLeftText(r.daysLeft).toLowerCase()}). `;
      s += `Borde finnas kvar idag: ${fmtQty(r.expectedLeft)} ${u}.`;
      if (r.consumption) s += ` Om patienten har slut nu motsvarar det ${fmtPct(r.consumption.pct)} av ordinerad dos.`;
      lines.push(s);
    } else {
      lines.push(`${it.name}: Beredningsformen lämpar sig inte för beräkning. Manuell bedömning.`);
    }
    const p = it.prescription;
    if (it.decision === 'yes') {
      lines.push(p && p.kind === 'ok'
        ? `Åtgärd: Förnyat, ${p.packages} förp. à ${fmtQty(p.packageSize)} ${u} (${fmtQty(p.units)} ${u}), räcker till ${fmtDate(p.target)}.`
        : 'Åtgärd: Förnyat.');
    } else if (it.decision === 'no') lines.push('Åtgärd: Ej förnyat efter klinisk bedömning.');
    else lines.push('Åtgärd: Bedömning pågår.');
    lines.push('');
  }
  return lines.join('\n').trim();
}

const VITAL: Record<string, string> = { normal: 'bedöms normala', deviating: 'bedöms avvikande', notAssessed: 'har inte bedömts' };
const FOLLOWUP: Record<string, string> = { normal: 'bedöms adekvat', deviating: 'bedöms avvikande', notAssessed: 'har inte bedömts' };

/** Sjuksköterskans journaltext. Ett ej valt läge skrivs som "har inte bedömts". */
export function buildNurseText(items: TextItem[], vital: Assessment, followUp: Assessment): string {
  if (items.length === 0) return '';
  const lines = [`Patienten önskar förnyelse av ${items.map((i) => i.name).join(', ')}.`];
  for (const it of items) {
    if (it.renewal) lines.push(`  ${it.name} ${it.renewal.daysLeft < 0 ? 'beräknades' : 'beräknas'} räcka t.o.m. ${fmtDate(it.renewal.endDate)}.`);
    else lines.push(`  ${it.name}: beredningsformen kräver manuell bedömning.`);
  }
  lines.push(`Vitalparametrar ${VITAL[vital ?? 'notAssessed']}. Medicinsk uppföljning ${FOLLOWUP[followUp ?? 'notAssessed']}.`);
  lines.push('Ärendet lämnas till läkare för bedömning.');
  return lines.join('\n');
}

/** Journaltext för långtidsanalysen. */
export function buildLongtermText(medName: string, doseRaw: string, r: LongtermResult): string {
  if (r.kind !== 'ok') return '';
  const dose = doseRaw.trim().replace('.', ',');
  const lines = [
    `Aktuellt: Förbrukningsanalys av ${medName.trim() || 'läkemedel'}.`,
    '',
    `Ordinerad dos: ${dose} enheter/dag.`,
    `Analysperiod: ${r.periods.length} ${r.periods.length === 1 ? 'period' : 'perioder'}, totalt ${r.unionDays} dagar (${fmtDate(r.first)} – ${fmtDate(r.last)}).`,
  ];
  if (r.overlap) lines.push('Perioderna överlappar. Överlappande dagar räknas en gång.');
  lines.push('', 'Perioder:');
  for (const p of r.periods) {
    lines.push(`  ${fmtDate(p.start)} – ${fmtDate(p.end)} (${p.days} dagar, ${p.total} enheter, snitt ${fmtFixed(p.avgPerDay, 2)} enheter/dag, ${fmtPct(p.pct)})`);
  }
  lines.push('', `Sammanlagd snittförbrukning: ${fmtFixed(r.avgPerDay, 2)} enheter/dag (${fmtPct(r.pct)} av ordinerad dos).`, '', 'Bedömning: ');
  return lines.join('\n');
}
