import type { AtcEntry } from './types';

export interface InteractionRule {
  atcGroupA: string[];
  atcGroupB: string[];
  severity: 'danger' | 'warn';
  title: string;
  description: string;
  recommendation: string;
}

export interface InteractionWarning {
  severity: 'danger' | 'warn';
  title: string;
  description: string;
  recommendation: string;
  drugs: [string, string];
  nplIds: [string | null, string | null];
}

let _INTERACTIONS: InteractionRule[] = [];
const _idxA = new Map<string, number[]>();
const _idxB = new Map<string, number[]>();
let _loaded = false;
let _promise: Promise<void> | null = null;

async function _doLoad(): Promise<void> {
  try {
    const mod = await import('./data/interactions-scraped.json');
    const raw: unknown = mod.default;
    _INTERACTIONS = Array.isArray(raw) ? raw as InteractionRule[] : [];
    for (let i = 0; i < _INTERACTIONS.length; i++) {
      for (const p of _INTERACTIONS[i].atcGroupA) {
        const arr = _idxA.get(p) ?? []; _idxA.set(p, arr); arr.push(i);
      }
      for (const p of _INTERACTIONS[i].atcGroupB) {
        const arr = _idxB.get(p) ?? []; _idxB.set(p, arr); arr.push(i);
      }
    }
    _loaded = true;
  } catch (e) {
    console.warn('[interactions] Kunde inte ladda interaktionsdata:', e);
    _loaded = true;
  }
}

/**
 * Laddar interaktionsdata från interactions-scraped.json (lazy-load).
 * Idempotent — returnerar redan löst Promise om data redan är laddad.
 */
export function loadInteractions(): Promise<void> {
  if (_loaded) return Promise.resolve();
  if (!_promise) _promise = _doLoad();
  return _promise;
}

// Trigger background load immediately
loadInteractions();

function _prefixMatches(code: string, idx: Map<string, number[]>): number[] {
  const matches: number[] = [];
  for (const [prefix, indices] of idx) {
    if (code.startsWith(prefix)) matches.push(...indices);
  }
  return matches;
}

function _intersect(a: number[], b: number[]): Set<number> {
  const result = new Set<number>();
  const shorter = a.length <= b.length ? a : b;
  const longer  = a.length <= b.length ? b : a;
  const set = new Set(longer);
  for (const v of shorter) {
    if (set.has(v)) result.add(v);
  }
  return result;
}

export function atcMatches(atcCode: string | null | undefined, pattern: string): boolean {
  return atcCode ? atcCode.startsWith(pattern) : false;
}

export function CHECK_INTERACTIONS(atcEntries: AtcEntry[]): InteractionWarning[] {
  if (!_loaded || _INTERACTIONS.length === 0) return [];
  if (atcEntries.length < 2) return [];

  const warnings: InteractionWarning[] = [];
  const seen = new Set<string>();

  for (let x = 0; x < atcEntries.length; x++) {
    for (let y = x + 1; y < atcEntries.length; y++) {
      const codeA = atcEntries[x].a;
      const codeB = atcEntries[y].a;
      if (!codeA || !codeB || codeA === codeB) continue;

      const aMatchesA = _prefixMatches(codeA, _idxA);
      const aMatchesB = _prefixMatches(codeA, _idxB);
      const bMatchesA = _prefixMatches(codeB, _idxA);
      const bMatchesB = _prefixMatches(codeB, _idxB);

      const candidateIndices = new Set<number>();
      for (const v of _intersect(aMatchesA, bMatchesB)) candidateIndices.add(v);
      for (const v of _intersect(bMatchesA, aMatchesB)) candidateIndices.add(v);

      for (const ruleIdx of candidateIndices) {
        const ix = _INTERACTIONS[ruleIdx];
        const key = `${ruleIdx}|${ix.title}|${atcEntries[x].i}|${atcEntries[y].i}`;
        if (seen.has(key)) continue;
        seen.add(key);
        warnings.push({
          severity: ix.severity, title: ix.title, description: ix.description, recommendation: ix.recommendation,
          drugs: [atcEntries[x].i, atcEntries[y].i],
          nplIds: [atcEntries[x].p ?? null, atcEntries[y].p ?? null],
        });
      }
    }
  }
  return warnings;
}
