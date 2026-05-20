// drug-search.ts — lazy-loadar läkemedelsdatabasen via IndexedDB-cache eller fetch.
// Portad från Kod/drug-loader.js. Enligt B3-beslutet: IndexedDB → fetch('drugs.json').
// __DRUG_DATA__-globalen existerar inte i 4.0.

import { MIN_SEARCH_QUERY_LENGTH, MAX_AUTOCOMPLETE_RESULTS } from './constants';

const CACHE_NAME = 'drug-data';
const DB_NAME = 'ReceptCache';
const STORE_NAME = 'drugs';

interface CacheData {
  version: number;
  entries: DrugEntry[];
}

export interface DrugEntry {
  n: string;
  i: string;
  a: string;
  p?: number;
  u?: string;
  f?: string;
  r?: string;
  c?: boolean;
}

let _drugList: DrugEntry[] | null = null;
let _drugMap: Map<string, DrugEntry> | null = null;
let _drugListLower: string[] | null = null;
let _loadPromise: Promise<void> | null = null;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE_NAME); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadFromCache(): Promise<CacheData | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(CACHE_NAME);
      req.onsuccess = () => {
        const data = req.result;
        if (data && data.entries && data.version) {
          resolve({ version: data.version, entries: data.entries });
        } else {
          resolve(null);
        }
        db.close();
      };
      req.onerror = () => { resolve(null); db.close(); };
      tx.onerror = () => { resolve(null); try { db.close(); } catch {} };
    });
  } catch {
    return null;
  }
}

async function fetchAndCache(serverVersion: number): Promise<DrugEntry[]> {
  const resp = await fetch('/data/drugs.json');
  if (!resp.ok) throw new Error(`drugs.json: ${resp.status}`);
  const entries = await resp.json();
  if (!Array.isArray(entries)) throw new Error('drugs.json: unexpected format');
  openDB().then(db => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put({ id: CACHE_NAME, version: serverVersion, entries, ts: Date.now() }, CACHE_NAME);
        req.onsuccess = () => db.close();
        req.onerror = () => { console.warn('[drug-search] IndexedDB cache write failed:', req.error); db.close(); };
      } catch (e) { console.warn('[drug-search] IndexedDB transaction failed:', e); }
    }).catch(e => { console.warn('[drug-search] IndexedDB open failed:', e); });
  return entries;
}

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
        _drugList = cached.entries;
      } else {
        _drugList = await fetchAndCache(serverVersion);
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
      const key = _drugList[i].n.toLowerCase().trim();
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
    const aCombi = a.entry.n.includes('/') ? 1 : 0;
    const bCombi = b.entry.n.includes('/') ? 1 : 0;
    if (aCombi !== bCombi) return aCombi - bCombi;
    return a.entry.n.length - b.entry.n.length;
  });
  return results.slice(0, MAX_AUTOCOMPLETE_RESULTS).map(r => r.entry);
}

export function getDrugByName(name: string): DrugEntry | undefined {
  if (!_drugMap) return undefined;
  return _drugMap.get((name || '').toLowerCase().trim());
}
