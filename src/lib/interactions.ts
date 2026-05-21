import interactionsRaw from './data/interactions.json';

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
}

export const INTERACTIONS: InteractionRule[] = interactionsRaw as InteractionRule[];

const _idxA = new Map<string, number[]>();
const _idxB = new Map<string, number[]>();
for (let i = 0; i < INTERACTIONS.length; i++) {
  for (const p of INTERACTIONS[i].atcGroupA) {
    const arr = _idxA.get(p) ?? []; _idxA.set(p, arr); arr.push(i);
  }
  for (const p of INTERACTIONS[i].atcGroupB) {
    const arr = _idxB.get(p) ?? []; _idxB.set(p, arr); arr.push(i);
  }
}

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

// @internal — exponeras för testkompatibilitet
export function atcMatches(atcCode: string | null | undefined, pattern: string): boolean {
  return atcCode ? atcCode.startsWith(pattern) : false;
}

export function CHECK_INTERACTIONS(atcEntries: Array<{ a: string; i: string }>): InteractionWarning[] {
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
        const ix = INTERACTIONS[ruleIdx];
        const key = `${ruleIdx}|${ix.title}|${atcEntries[x].i}|${atcEntries[y].i}`;
        if (seen.has(key)) continue;
        seen.add(key);
        warnings.push({
          severity: ix.severity, title: ix.title, description: ix.description, recommendation: ix.recommendation,
          drugs: [atcEntries[x].i, atcEntries[y].i],
        });
      }
    }
  }
  return warnings;
}
