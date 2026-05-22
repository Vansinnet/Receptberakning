import { MIN_SEARCH_QUERY_LENGTH, MAX_AUTOCOMPLETE_RESULTS, DEDUP_THRESHOLD, MAX_SEARCH_QUERY_LENGTH, STRENGTH_UNIT_PATTERN } from './constants';
import { loadFromCache, fetchAndCache, type RawDrugEntry } from './drug-cache';
import { stripManufacturer } from './utils';

export interface DrugEntry {
  name: string;
  nplId: string;
  atcCode: string;
  packageSize?: number;
  unit?: string;
  form?: string;
  regulation?: string;
  notCalculable?: boolean;
}

let _drugList: DrugEntry[] | null = null;
let _drugMap: Map<string, DrugEntry> | null = null;
let _drugListLower: string[] | null = null;
let _loadPromise: Promise<void> | null = null;

const _mapRaw = (entries: RawDrugEntry[]): DrugEntry[] => entries.map(e => ({
  name: e.n, nplId: e.i, atcCode: e.a, packageSize: e.p,
  unit: e.u, form: e.f, regulation: e.r, notCalculable: e.c,
}));

export async function loadDrugs(): Promise<void> {
  if (_drugList) return;
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    try {
      let serverVersion = 0;
      try {
        const vResp = await fetch('/data/drugs-version.json');
        if (vResp.ok) {
          const vData = await vResp.json();
          serverVersion = vData.version || 0;
        }
      } catch { /* non-critical */ }

      const cached = await loadFromCache();

      if (cached && cached.version === serverVersion) {
        _drugList = _mapRaw(cached.entries);
      } else {
        _drugList = _mapRaw(await fetchAndCache(serverVersion));
      }
    } catch (err) {
      console.error('[drug-search] kunde inte ladda läkemedelsdata:', err);
      _drugList = null;
      _loadPromise = null;
      return;
    }
    _drugMap = new Map();
    _drugListLower = [];
    for (let i = 0; i < _drugList.length; i++) {
      const key = _drugList[i].name.toLowerCase().trim();
      if (!_drugMap.has(key)) _drugMap.set(key, _drugList[i]);
      _drugListLower.push(key);
    }
  })();
  return _loadPromise;
}

const _strengthRe = new RegExp('(\\d+(?:[.,]\\d+)?)\\s*(?:' + STRENGTH_UNIT_PATTERN + ')\\b', 'gi');
const _stripStrengthRe = new RegExp('\\d+(?:[.,]\\d+)?\\s*(?:' + STRENGTH_UNIT_PATTERN + ')\\b', 'gi');

function _strengthVal(name: string): number {
  const matches = [...name.matchAll(_strengthRe)];
  if (matches.length === 0) return Infinity;
  return parseFloat(matches[matches.length - 1][1].replace(',', '.'));
}

function _stripStrength(name: string): string {
  return name.replace(_stripStrengthRe, '')
    .replace(/[/\s]+/g, ' ').trim();
}

function _dedupKey(entry: DrugEntry): string {
  const stripped = stripManufacturer(entry.name);
  const baseName = _stripStrength(stripped);
  const strength = _strengthVal(entry.name);
  return `${baseName.toLowerCase()}|${strength}|${entry.form ?? ''}|${entry.packageSize ?? ''}|${entry.unit ?? 'st'}`;
}

function _entryScore(entry: DrugEntry): number {
  let score = 0;
  if (entry.packageSize) score++;
  if (entry.form) score++;
  if (entry.atcCode) score++;
  return score;
}

function _sortEntries(entries: DrugEntry[], q: string): DrugEntry[] {
  const qLower = q.toLowerCase();
  const scored = entries.map(e => ({
    e,
    starts: e.name.toLowerCase().startsWith(qLower) ? 0 : 1,
    nameKey: _stripStrength(stripManufacturer(e.name)).toLowerCase(),
    strength: _strengthVal(e.name),
    pkg: e.packageSize ?? Infinity,
  }));
  scored.sort((a, b) => {
    if (a.starts !== b.starts) return a.starts - b.starts;
    if (a.nameKey !== b.nameKey) return a.nameKey.localeCompare(b.nameKey);
    if (a.strength !== b.strength) return a.strength - b.strength;
    return a.pkg - b.pkg;
  });
  return scored.map(s => s.e);
}

export function searchDrugs(query: string): DrugEntry[] {
  if (!_drugList || !_drugListLower) return [];
  if (!query || query.length < MIN_SEARCH_QUERY_LENGTH || query.length > MAX_SEARCH_QUERY_LENGTH) return [];
  const q = query.toLowerCase().trim();
  const results: Array<{ entry: DrugEntry; idx: number }> = [];
  const lower = _drugListLower;
  const rawLimit = MAX_AUTOCOMPLETE_RESULTS * 3;
  for (let i = 0; i < _drugList.length; i++) {
    if (lower[i].includes(q)) {
      results.push({ entry: _drugList[i], idx: i });
      if (results.length >= rawLimit) break;
    }
  }

  const entries = results.map(r => r.entry);

  if (entries.length > DEDUP_THRESHOLD) {
    const seen = new Map<string, DrugEntry>();
    for (const entry of entries) {
      const key = _dedupKey(entry);
      const existing = seen.get(key);
      if (!existing || _entryScore(entry) > _entryScore(existing)) {
        seen.set(key, entry);
      }
    }
    return _sortEntries([...seen.values()], q).slice(0, MAX_AUTOCOMPLETE_RESULTS);
  }

  return _sortEntries(entries, q).slice(0, MAX_AUTOCOMPLETE_RESULTS);
}

export function getDrugByName(name: string): DrugEntry | undefined {
  if (!_drugMap) return undefined;
  return _drugMap.get((name || '').toLowerCase().trim());
}
