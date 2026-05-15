// drug-loader.js — lazy-loadar läkemedelsdatabasen via IndexedDB-cache eller fetch
// Ersätter den tidigare inline drugs.js (803 KB) med asynkron laddning.
// På file:// laddas drug-data.js som en defer-script i index.html och
// __DRUG_DATA__ kontrolleras först.

let _drugList = null;
let _drugMap = null;
let _loadPromise = null;
let _searchSeq = 0;
let _drugLoadFailed = false;

const CACHE_NAME = 'drug-data';
const DB_NAME = 'ReceptCache';
const STORE_NAME = 'drugs';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE_NAME); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadFromCache() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(CACHE_NAME);
      req.onsuccess = () => {
        const data = req.result;
        if (data && data.entries && data.version) {
          resolve(data.entries);
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

async function fetchAndCache() {
  const resp = await fetch('drugs.json');
  if (!resp.ok) throw new Error(`drugs.json: ${resp.status}`);
  const entries = await resp.json();
  // Cache i IndexedDB asynkront — blockera inte användaren
  openDB().then(db => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ id: CACHE_NAME, version: 1, entries, ts: Date.now() }, CACHE_NAME);
    } catch {}
  }).catch(() => {});
  return entries;
}

async function loadDrugs() {
  if (_drugList) return;
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    try {
      // 1. __DRUG_DATA__ från drug-data.js (defer-script i HTML)
      if (typeof __DRUG_DATA__ !== 'undefined') {
        _drugList = __DRUG_DATA__;
      } else {
        // 2. IndexedDB-cache
        const cached = await loadFromCache();
        if (cached) {
          _drugList = cached;
        } else {
          // 3. Fetch från nätverk
          _drugList = await fetchAndCache();
        }
      }
    } catch (err) {
      console.error('[drug-loader] kunde inte ladda läkemedelsdata:', err.message || err);
      _drugList = [];
      _drugLoadFailed = true;
    }
    // Bygg uppslags-Map
    _drugMap = new Map();
    for (let i = 0; i < _drugList.length; i++) {
      const key = _drugList[i].n.toLowerCase().trim();
      if (!_drugMap.has(key)) _drugMap.set(key, _drugList[i]);
    }
  })();
  return _loadPromise;
}

function searchDrugs(query) {
  if (!_drugList) return [];
  if (!query || query.length < MIN_SEARCH_QUERY_LENGTH) return [];
  const q = query.toLowerCase().trim();
  const results = [];
  for (let i = 0; i < _drugList.length; i++) {
    if (_drugList[i].n.toLowerCase().indexOf(q) === 0) {
      results.push(_drugList[i]);
      if (results.length >= MAX_AUTOCOMPLETE_RESULTS) break;
    }
  }
  return results;
}

function getDrugByName(name) {
  if (!_drugMap) return undefined;
  // getDrugByName gör egen lowercase — _drugMap har redan lowercased nycklar
  return _drugMap.get((name || '').toLowerCase().trim());
}

// Hanterar autocomplete-input asynkront. Varje anrop inkrementerar en sekvensräknare
// så att äldre, långsammare sökresultat kasseras om en nyare sökning startat.
async function handleAcInput() {
  const medInput = document.getElementById('medInput');
  if (!medInput) return;
  const q = medInput.value.trim();
  const seq = ++_searchSeq;
  await loadDrugs();
  if (seq !== _searchSeq) return;
  if (_drugLoadFailed) {
    _drugLoadFailed = false;
    showToast('Kunde inte ladda l\u00e4kemedelslistan \u2014 s\u00f6kfunktionen \u00e4r otillg\u00e4nglig. F\u00f6rs\u00f6k ladda om sidan.');
    return;
  }
  const results = searchDrugs(q);
  if (seq !== _searchSeq) return;
  if (results.length > 0) {
    renderAutocomplete(results);
  } else {
    hideAutocomplete();
  }
}
