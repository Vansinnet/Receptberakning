// Insamlade interaktioner → kompakt, deterministisk datafil för appen.

import type { InteractionClass, InteractionData, InteractionRow } from '../../../src/lib/interaction-data.ts';
import type { InteractionCollector } from './collect.ts';

const sv = new Intl.Collator('sv');

/**
 * Bygger datafilen. Endast produkter i `nplIds` tas med. A-interaktioner (utan klinisk
 * betydelse) tas bort, precis som Janusmed inte visar dem automatiskt.
 */
export function buildInteractionData(collector: InteractionCollector, nplIds: Iterable<string>): InteractionData {
  const wanted = new Set(nplIds);
  const usedProfiles = new Set<string>();
  for (const [npl, prof] of collector.productProfile) if (wanted.has(npl)) usedProfiles.add(prof);
  const profileList = [...usedProfiles].sort();
  const profileIndex = new Map(profileList.map((p, i) => [p, i]));

  const rawRows: { pa: number; pb: number; a: string; b: string; cls: InteractionClass }[] = [];
  const substanceIds = new Set<string>();
  for (const [key, hits] of collector.pairs) {
    const [ka, kb] = key.split('\u0000');
    const ia = profileIndex.get(ka), ib = profileIndex.get(kb);
    if (ia === undefined || ib === undefined) continue;
    for (const h of hits.values()) {
      if (h.severity === 'A') continue;
      // Profilindex följer samma ordning som nycklarna (båda sorterade), så ia < ib.
      rawRows.push({ pa: ia, pb: ib, a: h.a, b: h.b, cls: `${h.severity}${h.documentation}` as InteractionClass });
      substanceIds.add(h.a);
      substanceIds.add(h.b);
    }
  }

  const name = (id: string) => collector.substanceNames.get(id) ?? id;
  const substances = [...substanceIds].sort((x, y) => sv.compare(name(x), name(y)) || (x < y ? -1 : 1));
  const substanceIndex = new Map(substances.map((s, i) => [s, i]));

  const interactions: InteractionRow[] = rawRows
    .map((r): InteractionRow => [r.pa, r.pb, substanceIndex.get(r.a)!, substanceIndex.get(r.b)!, r.cls])
    .sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || x[3] - y[3]);

  const products: Record<string, number> = {};
  for (const npl of [...wanted].sort()) {
    const prof = collector.productProfile.get(npl);
    if (prof !== undefined) products[npl] = profileIndex.get(prof)!;
  }

  return {
    format: 1,
    janusmedUpdated: collector.janusmedUpdated,
    substances: substances.map(name),
    profiles: profileList.length,
    products,
    interactions,
  };
}
