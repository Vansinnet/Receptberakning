const CACHE_NAME = 'drug-data';
const DB_NAME = 'ReceptCache';
const STORE_NAME = 'drugs';

export interface RawDrugEntry {
  n: string;
  i: string;
  a: string;
  p?: number;
  u?: string;
  f?: string;
  r?: string;
  c?: boolean;
}

export interface CacheData {
  version: number;
  entries: RawDrugEntry[];
}

let _dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (!_dbPromise) {
    _dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE_NAME); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return _dbPromise;
}

export async function loadFromCache(): Promise<CacheData | null> {
  try {
    const db = await getDB();
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
      req.onerror = () => { resolve(null); };
      tx.onerror = () => { resolve(null); };
    });
  } catch {
    return null;
  }
}

export async function fetchAndCache(serverVersion: number): Promise<RawDrugEntry[]> {
  const resp = await fetch('/data/drugs.json');
  if (!resp.ok) throw new Error(`drugs.json: ${resp.status}`);
  const text = await resp.text();
  const entries = JSON.parse(text, (key, val) => {
    if (key === '__proto__' || key === 'constructor') return undefined;
    return val;
  });
  if (!Array.isArray(entries)) throw new Error('drugs.json: unexpected format');
  getDB().then(db => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put({ id: CACHE_NAME, version: serverVersion, entries, ts: Date.now() }, CACHE_NAME);
        req.onerror = () => { console.warn('[drug-search] IndexedDB cache write failed:', req.error); };
      } catch (e) { console.warn('[drug-search] IndexedDB transaction failed:', e); }
    }).catch(e => { console.warn('[drug-search] IndexedDB open failed:', e); });
  return entries;
}
