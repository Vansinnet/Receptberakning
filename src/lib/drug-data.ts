// Format och validering för läkemedelslistan (public/data/drugs.json och drugs-version.json).
// Delas av appen, datapipelinen och testerna.

import type { RawDrugEntry } from './drug-cache';

/** public/data/drugs-version.json */
export interface DrugsVersion {
  /** Innehållshash av drugs.json. Ändras bara när innehållet ändras, så att webbläsarnas cache förnyas då. */
  version: string;
  /** När listan senast ändrades (ÅÅÅÅ-MM-DD). */
  updated: string;
  entries: number;
}

const UNITS = new Set(['ml', 'dos']);

/** Kontrollerar drugs.json. Returnerar en lista med fel (tom om datan är giltig). */
export function validateDrugEntries(data: unknown): string[] {
  if (!Array.isArray(data)) return ['drugs.json är inte en lista'];
  if (data.length === 0) return ['drugs.json är tom'];
  const errors: string[] = [];
  data.forEach((raw: unknown, i) => {
    const d = raw as Partial<RawDrugEntry> | null;
    const where = `post ${i} (${String(d?.n ?? '?')})`;
    if (!d || typeof d !== 'object') errors.push(`${where}: inte ett objekt`);
    else {
      if (typeof d.n !== 'string' || !d.n.trim()) errors.push(`${where}: saknar namn`);
      if (typeof d.i !== 'string' || !/^\d{14}$/.test(d.i)) errors.push(`${where}: ogiltigt NPL-id`);
      if (typeof d.a !== 'string' || !/^[A-Z]\d{2}/.test(d.a)) errors.push(`${where}: ogiltig ATC-kod`);
      if (d.p !== undefined && !(Number.isFinite(d.p) && d.p > 1)) errors.push(`${where}: ogiltig förpackningsstorlek`);
      if (d.u !== undefined && !UNITS.has(d.u)) errors.push(`${where}: ogiltig enhet ${String(d.u)}`);
      if (d.c !== undefined && d.c !== true) errors.push(`${where}: ogiltigt c`);
    }
  });
  return errors.slice(0, 50);
}
