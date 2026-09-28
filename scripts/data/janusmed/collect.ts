// Samlar Janusmeds interaktioner per par av "profiler".
//
// En profil är det som avgör vilka interaktioner Janusmed visar för en produkt:
// dess aktiva substanser och administrationsväg. Alla produkter med samma profil
// behandlas lika (Oralin 50 mg och Sertralin Accord 100 mg har båda profilen
// "sertralin, peroralt"), så det räcker att kontrollera en produkt per profil.
//
// När en sida innehåller flera produkter med samma substans men olika
// administrationsväg (t.ex. diklofenak tablett och gel) anger Janusmed för varje
// interaktion vilka vägar den gäller. Interaktionen tillskrivs bara de profiler
// vars väg matchar.

import type { JanusFormGroup, JanusInteraction, JanusPage, JanusProduct, Severity } from './page.ts';

export const profileKey = (p: Pick<JanusProduct, 'admin' | 'substanceIds'>) => `${p.admin}|${p.substanceIds.join(',')}`;

const SEVERITY_RANK: Record<Severity, number> = { A: 0, B: 1, C: 2, D: 3 };

/** Administrationsvägar Janusmed använder i interaktionerna, som mönster för produktens väg. */
const GROUP_ADMIN_MATCH: Record<string, (productAdmin: string) => boolean> = {
  'Enteral or Parenteral': (p) => p.startsWith('Enteral') || p === 'Parenteral',
  Enteral: (p) => p.startsWith('Enteral'),
};

/**
 * Gäller interaktionsgruppens väg för produktens väg? Okända kombinationer räknas som
 * träff (hellre en varning för mycket än en för lite) och rapporteras.
 */
export function adminMatches(productAdmin: string, groupAdmin: string | undefined, unknown?: Set<string>): boolean {
  if (groupAdmin === undefined || groupAdmin === productAdmin) return true;
  const rule = GROUP_ADMIN_MATCH[groupAdmin];
  if (rule) return rule(productAdmin);
  if (KNOWN_ADMINS.has(groupAdmin) && KNOWN_ADMINS.has(productAdmin)) return false;
  unknown?.add(`${groupAdmin} ↔ ${productAdmin}`);
  return true;
}

/**
 * Alla administrationsvägar som förekommer hos produkterna i Janusmed (kartlagt 2026-09).
 * Två kända, olika vägar matchar inte varandra; en okänd väg matchar allt och rapporteras.
 */
export const KNOWN_ADMINS = new Set(['Enteral (peroral)', 'Enteral (non peroral)', 'Parenteral', 'Topical']);

export interface PairHit {
  /** Substans i profilen med lägst index. */
  a: string;
  /** Substans i den andra profilen. */
  b: string;
  severity: Severity;
  documentation: number;
}

export class InteractionCollector {
  /** nplId → profilnyckel, för alla produkter Janusmed känner till. */
  readonly productProfile = new Map<string, string>();
  /** Profilnyckel → en representativ produkt (lägsta nplId). */
  readonly representative = new Map<string, string>();
  readonly substanceNames = new Map<string, string>();
  /** "profilA\u0000profilB" (A < B) → substanspar ("a\u0000b") → träff. */
  readonly pairs = new Map<string, Map<string, PairHit>>();
  readonly unknownAdminCombos = new Set<string>();
  janusmedUpdated: string | null = null;

  addProducts(products: readonly JanusProduct[]): void {
    for (const p of products) {
      if (p.substanceIds.length === 0 && p.lowDoseIds.length === 0) continue;
      const key = profileKey(p);
      this.productProfile.set(p.nplId, key);
      const rep = this.representative.get(key);
      if (!rep || p.nplId < rep) this.representative.set(key, p.nplId);
    }
  }

  /** Registrerar alla interaktioner på en sida för alla profilpar sidan innehåller. */
  addPage(page: JanusPage): void {
    this.addProducts(page.products);
    if (page.updated && (!this.janusmedUpdated || page.updated > this.janusmedUpdated)) this.janusmedUpdated = page.updated;
    const onPage = new Map<string, JanusProduct>();
    for (const p of page.products) if (p.substanceIds.length) onPage.set(profileKey(p), p);
    // (Produkter med bara lågdossubstanser har en profil men deltar inte i några interaktioner.)
    for (const ix of page.interactions) {
      this.substanceNames.set(ix.a.id, ix.a.name);
      this.substanceNames.set(ix.b.id, ix.b.name);
      for (const g of ix.groups) this.addGroup(ix, g, onPage);
    }
  }

  private addGroup(ix: JanusInteraction, g: JanusFormGroup, onPage: Map<string, JanusProduct>): void {
    const withA: string[] = [];
    const withB: string[] = [];
    for (const [key, p] of onPage) {
      if (p.substanceIds.includes(ix.a.id) && adminMatches(p.admin, g.admin[ix.a.id], this.unknownAdminCombos)) withA.push(key);
      if (p.substanceIds.includes(ix.b.id) && adminMatches(p.admin, g.admin[ix.b.id], this.unknownAdminCombos)) withB.push(key);
    }
    for (const pa of withA) {
      for (const pb of withB) {
        if (pa === pb) continue; // interaktion inom samma produkt
        const [first, second, sa, sb] = pa < pb ? [pa, pb, ix.a.id, ix.b.id] : [pb, pa, ix.b.id, ix.a.id];
        this.record(`${first}\u0000${second}`, { a: sa, b: sb, severity: g.severity, documentation: g.documentation });
      }
    }
  }

  private record(pairKey: string, hit: PairHit): void {
    let hits = this.pairs.get(pairKey);
    if (!hits) { hits = new Map(); this.pairs.set(pairKey, hits); }
    const subKey = `${hit.a}\u0000${hit.b}`;
    const prev = hits.get(subKey);
    // Samma substanspar kan förekomma med olika klass för olika vägar: behåll den allvarligaste.
    if (!prev || SEVERITY_RANK[hit.severity] > SEVERITY_RANK[prev.severity]
      || (hit.severity === prev.severity && hit.documentation > prev.documentation)) {
      hits.set(subKey, hit);
    }
  }
}
