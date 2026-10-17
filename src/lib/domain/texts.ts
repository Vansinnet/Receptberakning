// === TEXTFÖRSLAG ===
// Rena funktioner som bygger patientsvar (svenska/engelska), journalanteckning,
// sjuksköterskans journaltext och långtidsanalysens journaltext.
// Texterna är förslag: läkaren anpassar dem innan de kopieras.

import type { Assessment, Decision, DoseInterval, DoseUnit, LtDoseUnit, LtInterval } from '../types';
import { CONTACT_BEFORE_END_DAYS, DAYS_REMAINING_WARN, INTERVAL_LABEL, UNIT_DISPLAY } from '../constants';
import { addDays, fmtDate, fmtFixed, fmtMg, fmtPct, fmtQty, normalizeDoseInput } from '../utils';
import { daysLeftText, type RenewalOk } from './renewal';
import type { PrescriptionResult } from './prescribe';
import type { LongtermResult, LtFillResult, LtUnit } from './longterm';

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
  return `${normalizeDoseInput(it.doseRaw, it.unit).trim().replace('.', ',')} ${UNIT_DISPLAY[it.unit].short}/${INTERVAL_LABEL[it.interval]}`;
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

/** "5 mg", "5 mg och 7,5 mg", "5 mg, 7,5 mg och 10 mg". */
export function strengthList(strengths: number[]): string {
  const s = strengths.map((x) => `${fmtMg(x)} mg`);
  return s.length <= 1 ? (s[0] ?? '') : `${s.slice(0, -1).join(', ')} och ${s[s.length - 1]}`;
}

/** Takten anges per dag eller vecka, som maxdosen. */
const LT_PER: Record<LtInterval, string> = { 1: 'dag', 7: 'vecka' };

/** Långtidsanalysen som sammanhang för texterna: läkemedlet och hur maxdosen angavs. */
export interface LtTextContext {
  medName: string;
  /** Narkotikaklass (II–V) om preparatet är narkotikaklassat. */
  regulation: string | null;
  /** Enhetsordet för antal: st, ml, plåster eller doser. */
  noun: string;
  doseUnit: LtDoseUnit;
  interval: LtInterval;
}

type LongtermOk = Extract<LongtermResult, { kind: 'ok' }>;

/** Takten som enhet: "mg/dag", "plåster/vecka". */
export function ltRateUnit(unit: LtUnit, noun: string, interval: LtInterval): string {
  return `${unit === 'mg' ? 'mg' : noun}/${LT_PER[interval]}`;
}

/** Takt per dag visad per intervall med två decimaler: 1/7 per dag → "1,00" per vecka. */
export function ltRate(ratePerDay: number, interval: LtInterval): string {
  return fmtFixed(ratePerDay * interval, 2);
}

/** Ett uttag: "30 × 7,5 mg", "30 × 5 mg + 30 × 7,5 mg" (samma dag) eller "4 plåster". */
export function ltFillText(f: LtFillResult, noun: string): string {
  return f.parts.map((p) => (p.strength === null ? `${p.count} ${noun}` : `${p.count} × ${fmtMg(p.strength)} mg`)).join(' + ');
}

/** En mängd i uttagens enhet: "225 mg", "4 plåster". */
export function ltAmountText(unit: LtUnit, amount: number, noun: string): string {
  return unit === 'mg' ? `${fmtMg(amount)} mg` : `${fmtQty(amount)} ${noun}`;
}

/** Borde finnas kvar: i st när alla uttag har samma styrka, annars i mg; i antal utan styrka. */
export function ltRemainText(r: LongtermOk, noun: string): string {
  const rem = r.shouldRemain ?? 0;
  if (r.unit === 'mg' && r.strengths.length === 1) return `${fmtQty(rem / r.strengths[0])} ${noun}`;
  return ltAmountText(r.unit, rem, noun);
}

/** Maxdosen enligt receptet: "1 st/dag (7,5 mg/dag), från 2026-07-01 2 st/dag (15 mg/dag)". */
export function ltMaxDoseText(r: LongtermOk, c: LtTextContext): string {
  const per = LT_PER[c.interval];
  const one = r.strengths.length === 1 ? r.strengths[0] : null;
  return (r.maxDose ?? []).map((seg) => {
    let s: string;
    if (r.unit === 'antal') s = `${fmtMg(seg.dose)} ${c.noun}/${per}`;
    else if (c.doseUnit === 'st' && one) s = `${fmtMg(seg.dose / one)} ${c.noun}/${per} (${fmtMg(seg.dose)} mg/${per})`;
    else s = `${fmtMg(seg.dose)} mg/${per}`;
    return seg.from ? `från ${fmtDate(seg.from)} ${s}` : s;
  }).join(', ');
}

/**
 * Journaltext för långtidsanalysen. Tom så länge någon rad inte räknas (ofullständig eller fel)
 * eller maxdosen är fel, så att en ofullständig analys inte kopieras in i journalen.
 */
export function buildLongtermText(c: LtTextContext, r: LongtermResult): string {
  if (r.kind !== 'ok' || r.skipped.length || r.doseErrors.some((e) => e.from || e.dose)) return '';
  const ru = ltRateUnit(r.unit, c.noun, c.interval);
  const pct = (p: number | null) => (p === null ? '' : ` (${fmtPct(p)} av maxdos)`);
  const n = r.fills.length;
  const lines = [`Aktuellt: Förbrukningsanalys av ${c.medName.trim() || 'läkemedel'}${c.regulation ? ` (narkotika klass ${c.regulation})` : ''}.`];
  if (r.maxDose) lines.push(`Maxdos enligt receptet: ${ltMaxDoseText(r, c)}.`);
  if (r.strengths.length > 1) lines.push(`Uttag i styrkorna ${strengthList(r.strengths)}, räknat i mg.`);
  lines.push(`Underlag: ${n} uttag ${n === 1 ? fmtDate(r.first) : `${fmtDate(r.first)} – ${fmtDate(r.last)}`} enligt uttagshistoriken, inmatade för hand.`);
  if (r.average) lines.push(`Mellan första och sista uttaget hämtades i snitt ${ltRate(r.average.rate, c.interval)} ${ru} ut${pct(r.average.pct)}.`);
  if (n >= 2) {
    const head = ru.split('/')[0];
    const rates = r.fills.filter((f) => !f.last).map((f) => ltRate(f.rate!, c.interval));
    lines.push(`${head[0].toUpperCase()}${head.slice(1)} per ${LT_PER[c.interval]} mellan uttagen: ${rates.join(' – ')}.`);
  }
  if (r.ifOutToday) lines.push(`Om patienten har slut idag: ${ltRate(r.ifOutToday.rate, c.interval)} ${ru}${pct(r.ifOutToday.pct)}.`);
  if (r.shouldRemain !== null) {
    lines.push(r.shouldRemain > 0
      ? `Vid senaste uttaget borde minst ${ltRemainText(r, c.noun)} ha funnits kvar, räknat med maxdos.`
      : 'Vid senaste uttaget borde inget ha funnits kvar, räknat med maxdos.');
  }
  lines.push('Bedömning: ');
  return lines.join('\n');
}
