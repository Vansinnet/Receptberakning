// Spärr mot oväntade förändringar i datan.
//
// Om en källa ändrar sitt format, blockerar hämtningen eller bara svarar halvt kan
// resultatet bli en kraftigt krympt databas som ändå ser giltig ut. Uppdateringen
// stoppas därför om något nyckeltal minskar med 20 % eller mer jämfört med datan
// som ligger ute nu. En människa får då granska innan något publiceras.

import type { RawDrugEntry } from '../../src/lib/drug-cache.ts';
import type { InteractionData } from '../../src/lib/interaction-data.ts';

export const MAX_SHRINK = 0.2;

export interface Metric {
  name: string;
  before: number | null;
  after: number;
}

export interface GuardResult {
  ok: boolean;
  metrics: (Metric & { change: number | null; blocked: boolean })[];
}

export function drugMetrics(entries: readonly RawDrugEntry[]): Record<string, number> {
  return {
    'Läkemedel (poster)': entries.length,
    'Läkemedel (unika NPL-id)': new Set(entries.map((e) => e.i)).size,
    'Läkemedel (unika ATC-koder)': new Set(entries.map((e) => e.a)).size,
  };
}

export function interactionMetrics(data: InteractionData): Record<string, number> {
  const pairs = new Set(data.interactions.map((r) => `${r[0]}|${r[1]}`));
  const dPairs = new Set(data.interactions.filter((r) => r[4].startsWith('D')).map((r) => `${r[0]}|${r[1]}`));
  return {
    'Interaktioner (profilpar)': pairs.size,
    'Interaktioner klass D (profilpar)': dPairs.size,
    'Interaktioner (substanser)': data.substances.length,
    'Produkter kända i Janusmed': Object.keys(data.products).length,
  };
}

/** Jämför före/efter. `before` null = ingen tidigare data (första körningen) → aldrig spärr. */
export function checkShrink(before: Record<string, number> | null, after: Record<string, number>, maxShrink = MAX_SHRINK): GuardResult {
  const metrics = Object.entries(after).map(([name, a]) => {
    const b = before?.[name] ?? null;
    const change = b === null || b === 0 ? null : (a - b) / b;
    const blocked = change !== null && change <= -maxShrink;
    return { name, before: b, after: a, change, blocked };
  });
  return { ok: metrics.every((m) => !m.blocked), metrics };
}

export function formatGuardTable(results: GuardResult[]): string {
  const rows = results.flatMap((r) => r.metrics).map((m) => {
    const change = m.change === null ? 'ny' : `${m.change >= 0 ? '+' : ''}${(m.change * 100).toFixed(1)} %`;
    return `| ${m.name} | ${m.before ?? '–'} | ${m.after} | ${change}${m.blocked ? ' ⛔' : ''} |`;
  });
  return ['| Nyckeltal | Före | Efter | Förändring |', '|---|---:|---:|---:|', ...rows].join('\n');
}
