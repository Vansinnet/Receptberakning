// Format och validering för interaktionsdatan (src/lib/data/janusmed.json).
// Delas av appen, datapipelinen och testerna så att alla läser och skriver samma format.

/** Klass enligt Janusmed: bokstav för klinisk betydelse (B–D) + dokumentationsgrad (0–4). */
export type InteractionClass = `${'B' | 'C' | 'D'}${0 | 1 | 2 | 3 | 4}`;

/**
 * [profilA, profilB, substans i A, substans i B, klass]
 * Profilerna är index i `profiles`, substanserna index i `substances`. profilA < profilB.
 */
export type InteractionRow = [number, number, number, number, InteractionClass];

export interface InteractionData {
  /** Formatversion. */
  format: 1;
  /** När Janusmed senast uppdaterade sin interaktionsdatabas (ÅÅÅÅ-MM-DD). */
  janusmedUpdated: string | null;
  /** Substansnamn, t.ex. "sertralin". */
  substances: string[];
  /** Antal profiler (substanser + administrationsväg). */
  profiles: number;
  /** NPL-id → profil. Produkter som saknas här är okända för Janusmed. */
  products: Record<string, number>;
  interactions: InteractionRow[];
}

const CLASS = /^[BCD][0-4]$/;

/** Kontrollerar formatet. Returnerar en lista med fel (tom om datan är giltig). */
export function validateInteractionData(data: unknown): string[] {
  const errors: string[] = [];
  const d = data as Partial<InteractionData> | null;
  if (!d || typeof d !== 'object') return ['Datan är inte ett objekt'];
  if (d.format !== 1) errors.push(`Okänt format: ${String(d.format)}`);
  if (!Array.isArray(d.substances) || d.substances.some((s) => typeof s !== 'string' || !s)) errors.push('Ogiltig substanslista');
  if (!Number.isInteger(d.profiles) || (d.profiles ?? 0) < 1) errors.push('Ogiltigt antal profiler');
  if (!d.products || typeof d.products !== 'object') errors.push('Saknar produkter');
  if (!Array.isArray(d.interactions)) errors.push('Saknar interaktioner');
  if (errors.length) return errors;

  const nSub = d.substances!.length, nProf = d.profiles!;
  for (const [npl, prof] of Object.entries(d.products!)) {
    if (!/^\d{14}$/.test(npl)) errors.push(`Ogiltigt NPL-id: ${npl}`);
    if (!Number.isInteger(prof) || prof < 0 || prof >= nProf) errors.push(`Ogiltig profil för ${npl}`);
    if (errors.length > 20) return errors;
  }
  let prev = '';
  for (const row of d.interactions!) {
    const [pa, pb, sa, sb, cls] = row;
    const ok = Array.isArray(row) && row.length === 5
      && Number.isInteger(pa) && Number.isInteger(pb) && pa >= 0 && pa < pb && pb < nProf
      && Number.isInteger(sa) && Number.isInteger(sb) && sa >= 0 && sa < nSub && sb >= 0 && sb < nSub
      && typeof cls === 'string' && CLASS.test(cls);
    if (!ok) errors.push(`Ogiltig interaktionsrad: ${JSON.stringify(row)}`);
    const key = JSON.stringify(row.slice(0, 4));
    if (key === prev) errors.push(`Dubblett: ${key}`);
    prev = key;
    if (errors.length > 20) return errors;
  }
  return errors;
}
