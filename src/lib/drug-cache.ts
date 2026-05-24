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

let _onLoadError: (() => void) | null = null;

export function setDrugsLoadErrorHandler(cb: () => void) {
	_onLoadError = cb;
}

async function _fetchWithRetry(url: string, retries = 3): Promise<Response> {
	let lastErr: unknown;
	for (let i = 0; i < retries; i++) {
		try {
			const resp = await fetch(url);
			if (resp.ok) return resp;
			if (resp.status >= 400 && resp.status < 500) throw new Error(`${url}: HTTP ${resp.status}`);
		} catch (e) {
			lastErr = e;
		}
		if (i < retries - 1) await new Promise(r => setTimeout(r, 500 * Math.pow(2, i)));
	}
	_onLoadError?.();
	throw lastErr ?? new Error(`${url}: misslyckades efter ${retries} försök`);
}

function getDB(): Promise<IDBDatabase> {
  if (!_dbPromise) {
    _dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE_NAME); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { console.warn('[drug-cache] IndexedDB open failed:', req.error); reject(req.error); };
    });
  }
  return _dbPromise;
}

/** Laddar läkemedelsdata från IndexedDB-cache. Returnerar null vid cachemiss eller fel. */
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
  } catch (e) {
    console.warn('[drug-cache] IndexedDB read misslyckades:', e instanceof Error ? e.message : e);
    return null;
  }
}

/** Hämtar drugs.json från nätverk, validerar och cachrar i IndexedDB. */
export async function fetchAndCache(serverVersion: number): Promise<RawDrugEntry[]> {
  const resp = await _fetchWithRetry('/data/drugs.json');
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
