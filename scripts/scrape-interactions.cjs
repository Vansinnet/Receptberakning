/**
 * scrape-interactions.cjs
 * Skrapar Janusmed interaktioner för alla ATC-grupper i drugs.json.
 * Grupperar läkemedel per ATC5-kod (första 5 tecken), väljer en NPL-ID-representant per grupp,
 * och för varje ATC5-par slår den upp på Janusmed om en interaktion finns.
 *
 * Körning: node scripts/scrape-interactions.cjs
 * Indata:  public/data/drugs.json
 * Utdata:  src/lib/data/interactions-scraped.json (ersätter/scrapade regler)
 * Progress: data/_interactions-progress.json (stöder resume)
 */

const fs = require('fs');
const path = require('path');
const https = require('node:https');
const dns = require('node:dns');

const isIncremental = process.argv.includes('--incremental');
dns.setDefaultResultOrder('ipv4first');

const CONCURRENCY = 48;
const MAX_RPS = 50;
const PROGRESS_SAVE_INTERVAL = 100;
const RETRY_COUNT = 2;

const _rateTimestamps = [];
async function rateLimit() {
  const now = Date.now();
  while (_rateTimestamps.length && now - _rateTimestamps[0] > 1000) {
    _rateTimestamps.shift();
  }
  if (_rateTimestamps.length >= MAX_RPS) {
    const waitMs = _rateTimestamps[0] + 1000 - now + 1;
    _rateTimestamps.shift();
    await sleep(waitMs);
  }
  _rateTimestamps.push(Date.now());
}

const KEEP_ALIVE_AGENT = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 120_000,
  maxSockets: CONCURRENCY * 2,
  maxFreeSockets: CONCURRENCY,
  timeout: 30_000,
});

const FETCH_OPTS = {
  agent: KEEP_ALIVE_AGENT,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    Accept: 'text/html,application/xhtml+xml',
    Connection: 'keep-alive',
  },
};

const DATA_DIR = path.join(__dirname, '..', 'data');
const DRUGS_FILE = path.join(__dirname, '..', 'public', 'data', 'drugs.json');
const OUTPUT_FILE = path.join(__dirname, '..', 'src', 'lib', 'data', 'interactions-scraped.json');
const PROGRESS_FILE = path.join(DATA_DIR, '_interactions-progress.json');

// Severity-mappning: bg-färg från Janusmed-badge → vår severity
const BG_TO_SEVERITY = {
  yellow: 'warn',
  orange: 'warn',
  red: 'danger',
};

function classificationToSeverity(bgColor) {
  return BG_TO_SEVERITY[bgColor] || 'warn';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, retries = RETRY_COUNT) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, FETCH_OPTS);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (i === retries) throw e;
      await sleep(1000 * (i + 1));
    }
  }
}

/**
 * Ladda drugs.json och gruppera per ATC5 (första 5 tecknen i ATC-kod).
 * För varje grupp sparas en lista med NPL-ID:n + första namnet.
 */
function loadAndGroup() {
  console.log('  Laddar', DRUGS_FILE);
  const raw = JSON.parse(fs.readFileSync(DRUGS_FILE, 'utf8'));
  console.log(`  ${raw.length} entries lästa`);

  const groups = {};
  for (const drug of raw) {
    if (!drug.a || !drug.i || !drug.n) continue;
    const atc5 = drug.a.substring(0, 5).toUpperCase();
    if (!groups[atc5]) {
      groups[atc5] = { nplIds: [], name: drug.n, productCount: 0 };
    }
    groups[atc5].nplIds.push(drug.i);
    if (groups[atc5].productCount === 0) groups[atc5].name = drug.n;
    groups[atc5].productCount++;
  }

  const keys = Object.keys(groups).sort();
  console.log(`  ${keys.length} unika ATC5-grupper`);

  let single = 0;
  for (const k of keys) {
    if (groups[k].productCount === 1) single++;
  }
  console.log(`  Varav ${single} grupper med endast 1 läkemedel`);

  return { groups, keys };
}

/**
 * Generera alla unika par från ATC5-keys.
 */
function generatePairs(keys) {
  const pairs = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      pairs.push([keys[i], keys[j]]);
    }
  }
  console.log(`  ${pairs.length} unika ATC5-par att kontrollera`);
  return pairs;
}

/**
 * Parsa Janusmed HTML och extrahera interaktionsdata.
 * Returnerar array av { severity, title } eller tom array.
 */
function parseInteractionPage(html) {
  const results = [];

  // 1. Kontrollera om interaktioner finns
  const countMatch = html.match(/<h6[^>]*>\s*(\d+)\s+interaktion/i);
  if (!countMatch || parseInt(countMatch[1]) === 0) return results;

  // 2. Hitta alla interaction cards
  // Cards har struktur: <article id="interaction-card-..." data-cy="interaction-card-...">
  // Inuti: <header data-gtm="interaction: ...: KLASS"> och <h4 data-cy="card-title">TITEL</h4>
  const cardRegex = /<article[^>]*?id="interaction-card-([^"]*)"[^>]*?data-cy="[^"]*?"[^>]*?>([\s\S]*?)<\/article>/g;
  let cardMatch;
  while ((cardMatch = cardRegex.exec(html)) !== null) {
    const cardHtml = cardMatch[2];
    const cardId = cardMatch[1];

    // Reducera cardId från "tramadol - sertralin-C1" till "tramadol - sertralin"
    // (ta bort sista -CLASS-suffixet)
    const titleFromId = cardId.replace(/-[^-]+$/, '').trim();
    if (!titleFromId) continue;

    // Extrahera severity från card: data-gtm på header eller card-classification
    // Leta efter data-gtm="C1" eller data-gtm="D" inom card
    const gtmMatch = cardHtml.match(/data-gtm="([^"]+)"\s+data-cy="card-classification"/);
    const severityCode = gtmMatch ? gtmMatch[1] : 'C1';

    // Extrahera badge färg för severity
    const badgeMatch = cardHtml.match(/classification[^>]*?bg-(\w+)/);
    const badgeColor = badgeMatch ? badgeMatch[1] : 'yellow';
    const severity = classificationToSeverity(badgeColor);

    // Extrahera titel från card — prova interaction-header först, fallback till card-title
    const headerMatch = cardHtml.match(/data-cy="interaction-header">\s*([\s\S]*?)\s*<\/h5>/);
    const title = headerMatch ? headerMatch[1].trim() : null;
    const cardTitleMatch = !headerMatch ? cardHtml.match(/data-cy="card-title"[^>]*?>\s*([\s\S]*?)\s*<\/h4>/) : null;
    const finalTitle = title || (cardTitleMatch ? cardTitleMatch[1].trim() : titleFromId);

    results.push({ severity, title: finalTitle });
  }

  // Fallback: om cardRegex inte fungerade, försök enklare parsning
  if (results.length === 0) {
    const simpleTitleMatch = html.match(/data-cy="card-title">\s*([\s\S]*?)\s*<\/h4>/);
    if (simpleTitleMatch) {
      results.push({ severity: 'warn', title: simpleTitleMatch[1].trim() });
    }
  }

  return results;
}

/**
 * Ladda progress från fil (om den finns).
 */
function loadProgress() {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  } catch {
    return { checked: {}, rules: [], lastIdx: 0 };
  }
}

function saveProgress(progress) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function main() {
  console.log('=== scrape-interactions.cjs ===\n');

  // 1. Ladda och gruppera
  console.log('Steg 1: Ladda läkemedelsdata och gruppera per ATC5...');
  const { groups, keys } = loadAndGroup();

  // 2. Generera par
  console.log('\nSteg 2: Generera ATC5-par...');
  const pairs = generatePairs(keys);

  // 3. Ladda progress och beräkna återstående par
  const progress = loadProgress();

  // Om --incremental: hitta endast par där minst en ATC4-grupp är NY
  const existingAtc5 = new Set();
  if (isIncremental) {
    try {
      const existingRules = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
      if (Array.isArray(existingRules)) {
        for (const r of existingRules) {
          if (r.atcGroupA) for (const g of r.atcGroupA) existingAtc5.add(g);
          if (r.atcGroupB) for (const g of r.atcGroupB) existingAtc5.add(g);
        }
      }
    } catch {}
    console.log(`  ${existingAtc5.size} ATC5-grupper redan i interactions-scraped.json`);
  }

  const totalPairs = pairs.length;
  const remaining = pairs.filter((p) => {
    const k = `${p[0]}|${p[1]}`;
    const progressStatus = progress.checked[k] || progress.checked[`${p[1]}|${p[0]}`];

    // --incremental: hoppa om BÅDA ATC4-grupperna redan finns i databasen
    if (isIncremental && existingAtc5.has(p[0]) && existingAtc5.has(p[1])) {
      // Markera som checked så vi inte gör om den
      if (!progressStatus) progress.checked[k] = true;
      return false;
    }

    // Hoppa över om redan OK-kontrollerad; gör om errors
    return progressStatus === undefined || typeof progressStatus === 'string' && progressStatus.startsWith('error:');
  });

  console.log(`\nSteg 3: Skrapa Janusmed...`);
  console.log(`  Redan kontrollerade: ${totalPairs - remaining.length}`);
  console.log(`  Kvar att kontrollera: ${remaining.length}\n`);

  if (remaining.length === 0) {
    console.log('  Alla par redan kontrollerade!');
  }

  let completed = totalPairs - remaining.length;
  let errors = 0;
  let lastSaved = 0;
  let lastProgressOutput = 0;
  const startTime = Date.now();
  let etaMinutes = '?';

  // Worker pool: håll CONCURRENCY aktiva workers, ingen batch-fördröjning
  let remainingIdx = 0;
  let activeWorkers = 0;

  function processOne() {
    if (remainingIdx >= remaining.length) return;
    const idx = remainingIdx++;
    const [atcA, atcB] = remaining[idx];

    activeWorkers++;

    const nplA = groups[atcA].nplIds[0];
    const nplB = groups[atcB].nplIds[0];

    const doCheck = async () => {
      if (!nplA || !nplB) {
        completed++;
        activeWorkers--;
        showProgress();
        return;
      }

      const key = `${atcA}|${atcB}`;
      const url = `https://janusmed.se/interaktioner?nplIds=${nplA}&nplIds=${nplB}`;

      try {
        await rateLimit();
        const html = await fetchWithRetry(url);
        const interactions = parseInteractionPage(html);

        if (interactions.length > 0) {
          const rulesToAdd = interactions.map((ix) => ({
            atcGroupA: [atcA],
            atcGroupB: [atcB],
            severity: ix.severity,
            title: ix.title,
            description: ix.title,
            recommendation: 'Kontrollera på Janusmed för detaljerad information.',
          }));
          progress.rules.push(...rulesToAdd);
        }

        progress.checked[key] = true;
        completed++;
        activeWorkers--;

        // Spara progress var PROGRESS_SAVE_INTERVAL:e lyckad request
        const doneCount = completed - (totalPairs - remaining.length);
        if (doneCount - lastSaved >= PROGRESS_SAVE_INTERVAL) {
          lastSaved = doneCount;
          saveProgress(progress);
        }

        showProgress();

        // Starta nästa worker så fort denna är klar
        processOne();
      } catch (e) {
        progress.checked[key] = 'error:' + e.message;
        errors++;
        completed++;
        activeWorkers--;
        showProgress();
        processOne();
      }
    };

    doCheck();
  }

  function showProgress() {
    const pct = Math.round((completed / totalPairs) * 100);
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = completed > (totalPairs - remaining.length) ? (completed - (totalPairs - remaining.length)) / elapsed : 0;
    const remainingToDo = remaining.length - (completed - (totalPairs - remaining.length));
    const eta = rate > 0 ? Math.round(remainingToDo / rate) : 0;
    const etaStr = eta > 0 ? `${Math.floor(eta / 60)}m ${eta % 60}s` : '?';

    process.stdout.write(`\r  ${completed}/${totalPairs} (${pct}%), ${progress.rules.length} interaktioner funna, ${errors} fel, ETA: ${etaStr}   `);
  }

  // Starta första CONCURRENCY workers
  for (let i = 0; i < CONCURRENCY; i++) {
    processOne();
  }

  // Vänta tills alla workers är klara
  while (activeWorkers > 0 || remainingIdx < remaining.length) {
    await sleep(50);
  }

  console.log(`\n  ${completed}/${totalPairs} (100%) - ${Math.round((Date.now() - startTime) / 1000)}s`);

  // 4. Skriv resultat
  console.log(`\nSteg 4: Skriv ${progress.rules.length} interaktionsregler till ${OUTPUT_FILE}...`);
  const outDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(progress.rules, null, 2));
  console.log('  Klart!\n');

  saveProgress(progress);

  console.log(`=== scrape-interactions.cjs slutförd ===`);
  console.log(`  Totalt: ${totalPairs} par kontrollerade`);
  console.log(`  Interaktioner funna: ${progress.rules.length}`);
  console.log(`  Fel: ${errors}`);
}

main().catch((e) => {
  console.error('\nFATAL:', e.message);
  process.exit(1);
});
