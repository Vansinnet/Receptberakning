import { MIN_SEARCH_QUERY_LENGTH, MAX_AUTOCOMPLETE_RESULTS } from './constants';
import { loadFromCache, fetchAndCache, type RawDrugEntry } from './drug-cache';

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

export function searchDrugs(query: string): DrugEntry[] {
  if (!_drugList || !_drugListLower) return [];
  if (!query || query.length < MIN_SEARCH_QUERY_LENGTH) return [];
  const q = query.toLowerCase().trim();
  const results: Array<{ entry: DrugEntry; idx: number }> = [];
  const lower = _drugListLower;
  for (let i = 0; i < _drugList.length; i++) {
    if (lower[i].includes(q)) {
      results.push({ entry: _drugList[i], idx: i });
    }
  }
  results.sort((a, b) => {
    const aName = lower[a.idx];
    const bName = lower[b.idx];
    const aStarts = aName.startsWith(q) ? 0 : 1;
    const bStarts = bName.startsWith(q) ? 0 : 1;
    if (aStarts !== bStarts) return aStarts - bStarts;
    const aCombi = a.entry.name.includes('/') ? 1 : 0;
    const bCombi = b.entry.name.includes('/') ? 1 : 0;
    if (aCombi !== bCombi) return aCombi - bCombi;
    return a.entry.name.length - b.entry.name.length;
  });
  return results.slice(0, MAX_AUTOCOMPLETE_RESULTS).map(r => r.entry);
}

export function getDrugByName(name: string): DrugEntry | undefined {
  if (!_drugMap) return undefined;
  return _drugMap.get((name || '').toLowerCase().trim());
}
