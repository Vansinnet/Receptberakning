// drug-search.ts — lazy-loadar läkemedelsdatabasen via IndexedDB-cache eller fetch.
// Portad från Kod/drug-loader.js. Enligt B3-beslutet: IndexedDB → fetch('drugs.json').
// __DRUG_DATA__-globalen existerar inte i 4.0.

const CACHE_NAME = 'drug-data';
const DB_NAME = 'ReceptCache';
const STORE_NAME = 'drugs';
const MIN_SEARCH_QUERY_LENGTH = 2;
const MAX_AUTOCOMPLETE_RESULTS = 10;

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
}

let _drugList: DrugEntry[] | null = null;
let _drugMap: Map<string, DrugEntry> | null = null;
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
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function fetchAndCache(serverVersion: number): Promise<DrugEntry[]> {
  const resp = await fetch('/data/drugs.json');
  if (!resp.ok) throw new Error(`drugs.json: ${resp.status}`);
  const entries = await resp.json();
  openDB().then(db => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ id: CACHE_NAME, version: serverVersion, entries, ts: Date.now() }, CACHE_NAME);
    } catch { /* cache failure is non-critical */ }
  }).catch(() => {});
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

      if (cached && cached.version === serverVersion && serverVersion > 0) {
        _drugList = cached.entries;
      } else {
        _drugList = await fetchAndCache(serverVersion);
      }
    } catch (err) {
      console.error('[drug-search] kunde inte ladda läkemedelsdata:', err);
      _drugList = [];
    }
    _drugMap = new Map();
    for (let i = 0; i < _drugList.length; i++) {
      const key = _drugList[i].n.toLowerCase().trim();
      if (!_drugMap.has(key)) _drugMap.set(key, _drugList[i]);
    }
  })();
  return _loadPromise;
}

export function searchDrugs(query: string): DrugEntry[] {
  if (!_drugList) return [];
  if (!query || query.length < MIN_SEARCH_QUERY_LENGTH) return [];
  const q = query.toLowerCase().trim();
  const results: DrugEntry[] = [];
  for (let i = 0; i < _drugList.length; i++) {
    if (_drugList[i].n.toLowerCase().indexOf(q) === 0) {
      results.push(_drugList[i]);
      if (results.length >= MAX_AUTOCOMPLETE_RESULTS) break;
    }
  }
  return results;
}

export function getDrugByName(name: string): DrugEntry | undefined {
  if (!_drugMap) return undefined;
  return _drugMap.get((name || '').toLowerCase().trim());
}
