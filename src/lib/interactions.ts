// Interaktionskontroll mot Janusmeds data (hämtad månadsvis, se scripts/data/update.ts).
//
// Varje läkemedel i listan har ett NPL-id. Datan knyter NPL-id till en profil
// (substanser + administrationsväg) och anger för varje par av profiler vilka
// substanspar som interagerar och med vilken klass. Läkemedel som skrivits in för
// hand, eller som Janusmed inte känner till, kan inte kontrolleras — de rapporteras
// separat så att användaren inte tror att kombinationen är kontrollerad.

import type { InteractionClass, InteractionData } from './interaction-data';

export type Severity = 'danger' | 'warn';

export interface SubstancePair {
  /** Substans i det första läkemedlet. */
  a: string;
  /** Substans i det andra läkemedlet. */
  b: string;
  cls: InteractionClass;
}

export interface InteractionWarning {
  /** Etiketterna (läkemedelsnamnen) i den ordning läkemedlen lagts till. */
  drugs: [string, string];
  /** Allvarligaste klassen bland substansparen. */
  cls: InteractionClass;
  severity: Severity;
  pairs: SubstancePair[];
}

export interface InteractionEntry {
  /** Etikett som visas, t.ex. "Sertralin Accord 50 mg". */
  label: string;
  nplId: string | null;
}

export interface InteractionResult {
  warnings: InteractionWarning[];
  /** Etiketter för läkemedel som inte kunde kontrolleras. */
  unchecked: string[];
}

/** Janusmeds beskrivning av klassens bokstav, i kort form. */
export const CLASS_LABEL: Record<'B' | 'C' | 'D', string> = {
  D: 'Bör undvikas',
  C: 'Kan hanteras, t.ex. med dosjustering',
  B: 'Klinisk betydelse okänd eller varierar',
};

let data: InteractionData | null = null;
/** "profilA|profilB" → rader */
const index = new Map<string, InteractionData['interactions']>();
let loading: Promise<void> | null = null;

/** Laddar datan en gång (lat inläsning, delas av alla anrop). */
export function loadInteractions(): Promise<void> {
  if (data) return Promise.resolve();
  loading ??= import('./data/janusmed.json')
    .then((mod) => setInteractionData(mod.default as unknown as InteractionData))
    .catch((e: unknown) => {
      console.warn('[interactions] Kunde inte ladda interaktionsdata:', e);
      loading = null;
    });
  return loading;
}

/** Sätter datan direkt (används av tester). */
export function setInteractionData(d: InteractionData): void {
  index.clear();
  for (const row of d.interactions) {
    const key = `${row[0]}|${row[1]}`;
    const list = index.get(key);
    if (list) list.push(row); else index.set(key, [row]);
  }
  data = d;
}

export function interactionsLoaded(): boolean {
  return data !== null;
}

/** När Janusmed senast uppdaterade datan som används (ÅÅÅÅ-MM-DD), om känt. */
export function interactionsUpdated(): string | null {
  return data?.janusmedUpdated ?? null;
}

/** Bokstaven avgör först (D allvarligast), därefter högre dokumentationsgrad. */
function rank(cls: InteractionClass): number {
  return 'BCD'.indexOf(cls[0]) * 10 + Number(cls[1]);
}

export function checkInteractions(entries: readonly InteractionEntry[]): InteractionResult {
  const d = data;
  if (!d) return { warnings: [], unchecked: entries.map((e) => e.label) };
  const known: { label: string; profile: number }[] = [];
  const unchecked: string[] = [];
  for (const e of entries) {
    const profile = e.nplId ? d.products[e.nplId] : undefined;
    if (profile === undefined) unchecked.push(e.label);
    else known.push({ label: e.label, profile });
  }

  const warnings: InteractionWarning[] = [];
  for (let x = 0; x < known.length; x++) {
    for (let y = x + 1; y < known.length; y++) {
      const p = known[x], q = known[y];
      if (p.profile === q.profile) continue;
      const flipped = p.profile > q.profile;
      const rows = index.get(flipped ? `${q.profile}|${p.profile}` : `${p.profile}|${q.profile}`);
      if (!rows) continue;
      const pairs = rows
        .map(([, , sa, sb, cls]): SubstancePair => {
          const [a, b] = flipped ? [sb, sa] : [sa, sb];
          return { a: d.substances[a], b: d.substances[b], cls };
        })
        .sort((m, n) => rank(n.cls) - rank(m.cls));
      const cls = pairs[0].cls;
      warnings.push({ drugs: [p.label, q.label], cls, severity: cls[0] === 'D' ? 'danger' : 'warn', pairs });
    }
  }
  warnings.sort((m, n) => rank(n.cls) - rank(m.cls));
  return { warnings, unchecked };
}
