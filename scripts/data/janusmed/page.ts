// Tolkar Janusmeds interaktionssida (https://janusmed.se/interaktioner?nplIds=…&nplIds=…)
// till produkter, deras substanser och de interaktioner Janusmed visar för kombinationen.
//
// Janusmed klassar varje interaktion med en bokstav för klinisk betydelse och en siffra
// för dokumentationsgrad (0–4):
//   D  Kliniskt betydelsefull interaktion som bör undvikas.
//   C  Kliniskt betydelsefull interaktion som kan hanteras med t.ex. dosjustering.
//   B  Interaktionens kliniska betydelse är okänd och/eller varierar.
//   A  Saknar klinisk betydelse — visas inte automatiskt i Janusmed.
// Interaktionen kan gälla bara vissa administrationsvägar (t.ex. peroralt men inte
// kutant); därför finns administrationsvägen per substans i varje "drugFormGroup".

import { extractNuxtState } from './nuxt.ts';

export type Severity = 'A' | 'B' | 'C' | 'D';

export interface JanusSubstance { id: string; name: string }

export interface JanusProduct {
  nplId: string;
  /** Administrationsväg enligt Janusmed, t.ex. "Enteral (peroral)", "Parenteral", "Topical". */
  admin: string;
  /** Aktiva substanser (moderssubstans, t.ex. citalopram och inte citalopramhydrobromid). */
  substanceIds: string[];
  /**
   * Substanser i så låg dos att Janusmed inte visar deras interaktioner (t.ex. spårämnen
   * i näringslösningar). De ingår inte i profilen.
   */
  lowDoseIds: string[];
}

export interface JanusFormGroup {
  severity: Severity;
  documentation: number;
  /** Administrationsväg per substans-id. */
  admin: Record<string, string>;
}

export interface JanusInteraction {
  a: JanusSubstance;
  b: JanusSubstance;
  groups: JanusFormGroup[];
}

export interface JanusPage {
  products: JanusProduct[];
  interactions: JanusInteraction[];
  /** När Janusmed senast uppdaterade sin interaktionsdatabas (ÅÅÅÅ-MM-DD), om det anges. */
  updated: string | null;
}

export class JanusPageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JanusPageError';
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, what: string): string => {
  if (typeof v !== 'string' || !v) throw new JanusPageError(`Saknar ${what}`);
  return v;
};
const arr = (v: unknown, what: string): unknown[] => {
  if (!Array.isArray(v)) throw new JanusPageError(`Saknar ${what}`);
  return v;
};

function parseProduct(raw: unknown): JanusProduct {
  if (!isObj(raw)) throw new JanusPageError('Produkt är inte ett objekt');
  const nplId = str(raw.nplId, 'produktens nplId');
  const form = isObj(raw.drugForm) ? raw.drugForm : {};
  const admin = typeof form.administration === 'string' && form.administration ? form.administration : 'Okänd';
  const ids = new Set<string>();
  const lowDose = new Set<string>();
  for (const s of arr(raw.substances, `substanser för ${nplId}`)) {
    if (!isObj(s)) continue;
    // Salter och estrar pekar på moderssubstansen via topParent; interaktionerna anges på den.
    const id = s.isTopParent === true ? s.nslId : (s.topParent ?? s.nslId);
    if (typeof id === 'string' && id) (s.lowDosageFlag === true ? lowDose : ids).add(id);
  }
  for (const id of ids) lowDose.delete(id);
  return { nplId, admin, substanceIds: [...ids].sort(), lowDoseIds: [...lowDose].sort() };
}

function parseInteraction(raw: unknown): JanusInteraction {
  if (!isObj(raw)) throw new JanusPageError('Interaktion är inte ett objekt');
  const subs = arr(raw.substances, 'interaktionens substanser');
  if (subs.length !== 2) throw new JanusPageError(`Interaktion med ${subs.length} substanser`);
  const [a, b] = subs.map((s): JanusSubstance => {
    if (!isObj(s)) throw new JanusPageError('Substans är inte ett objekt');
    return { id: str(s.nslId, 'substansens nslId'), name: str(s.name, 'substansens namn').trim() };
  });
  const groups = arr(raw.drugFormGroups, 'interaktionens drugFormGroups').map((g): JanusFormGroup => {
    if (!isObj(g)) throw new JanusPageError('drugFormGroup är inte ett objekt');
    const severity = g.sevClassification;
    if (severity !== 'A' && severity !== 'B' && severity !== 'C' && severity !== 'D') {
      throw new JanusPageError(`Okänd klass: ${String(severity)}`);
    }
    const documentation = Number(g.docClassification);
    if (!Number.isInteger(documentation) || documentation < 0 || documentation > 4) {
      throw new JanusPageError(`Okänd dokumentationsgrad: ${String(g.docClassification)}`);
    }
    const admin: Record<string, string> = {};
    for (const s of arr(g.substances, 'drugFormGroup-substanser')) {
      if (isObj(s) && typeof s.nslId === 'string' && typeof s.administration === 'string') admin[s.nslId] = s.administration;
    }
    return { severity, documentation, admin };
  });
  if (groups.length === 0) throw new JanusPageError(`Interaktionen ${a.name} – ${b.name} saknar klassning`);
  return { a, b, groups };
}

export function parseJanusState(state: unknown): JanusPage {
  if (!isObj(state) || !isObj(state.state)) throw new JanusPageError('Oväntat format på Janusmeds sidtillstånd');
  const s = state.state;
  const products = arr(s.search, 'produktlistan (state.search)').map(parseProduct);
  const ixState = isObj(s.interactions) ? s.interactions : null;
  if (!ixState) throw new JanusPageError('Saknar state.interactions');
  const interactions = arr(ixState.interactions, 'interaktionslistan').map(parseInteraction);
  const dates = isObj(s.dates) ? s.dates : {};
  const updated = typeof dates.interactions === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dates.interactions)
    ? dates.interactions.slice(0, 10) : null;
  return { products, interactions, updated };
}

export function parseJanusPage(html: string): JanusPage {
  return parseJanusState(extractNuxtState(html));
}

export const janusmedUrl = (nplIds: readonly string[]) =>
  `https://janusmed.se/interaktioner?${nplIds.map((id) => `nplIds=${encodeURIComponent(id)}`).join('&')}`;
