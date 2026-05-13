const fs = require("fs");
const path = require("path");

const CONCURRENCY = 10;
const DELAY_MS = 100;
const DATA_DIR = path.join(__dirname, "..", "data");
const OUT_FILE = path.join(DATA_DIR, "product-db.json");
const PROGRESS_FILE = path.join(DATA_DIR, "_crawl-progress.json");

function classifyDoseForm(doseForm, strength) {
  if (!doseForm) return { unit: "st", notCalculable: false };
  const lower = doseForm.toLowerCase();

  // notCalculable: krämer, salvor, pastor, gaser, dialysvätskor, schampo, badtillsats, pulver, beredningssatser
  if (lower.includes("kräm") || lower.includes("salva") || lower.includes("liniment") || lower.includes("pasta")) return { unit: null, notCalculable: true };
  if (lower.includes("gel") && !lower.includes("ögongel")) return { unit: null, notCalculable: true };
  if (lower.includes("schampo") || lower.includes("badtillsats")) return { unit: null, notCalculable: true };
  if (lower.includes("medicinsk gas") || lower.includes("dialysvätska") || lower.includes("hemodialys") || lower.includes("hemofiltration")) return { unit: null, notCalculable: true };
  if (lower.includes("spädningsvätska") || lower.includes("spolvätska") || lower.includes("ögonsköljvätska")) return { unit: null, notCalculable: true };
  if (lower.includes("inhalationsånga")) return { unit: null, notCalculable: true };
  if (lower.includes("beredningssats")) return { unit: null, notCalculable: true };
  if (lower.includes("puder")) return { unit: null, notCalculable: true };
  if (strength && /\/g/.test(strength) && (lower.includes("kräm") || lower.includes("salva") || lower.includes("gel"))) return { unit: null, notCalculable: true };

  // unit: "dos" — doserade enheter (puffar, sprutor, droppar)
  if (lower.includes("inhalationsspray") || lower.includes("inhalationspulver")) return { unit: "dos", notCalculable: false };
  if (lower.includes("förfylld spruta") || lower.includes("förfylld injektionspenna")) return { unit: "dos", notCalculable: false };
  if (lower.includes("rektalskum")) return { unit: "dos", notCalculable: false };
  if (lower.includes("nässpray")) return { unit: "dos", notCalculable: false };
  if (lower.includes("endosbehållare")) return { unit: "dos", notCalculable: false };
  if (lower.includes("ögondroppar") || lower.includes("örondroppar")) return { unit: "dos", notCalculable: false };
  if (strength && /\/dos/.test(strength)) return { unit: "dos", notCalculable: false };

  // unit: "ml" — volymmätta vätskor
  if (lower.includes("oral lösning") || lower.includes("oral suspension") || lower.includes("oral emulsion") || lower.includes("oral mixtur")) return { unit: "ml", notCalculable: false };
  if (lower.includes("orala droppar") || lower.includes("droppar")) return { unit: "ml", notCalculable: false };
  if (lower.includes("sirap")) return { unit: "ml", notCalculable: false };
  if ((lower.includes("injektion") || lower.includes("infusion")) && !lower.includes("förfylld")) return { unit: "ml", notCalculable: false };
  if (lower.includes("kutan lösning") || lower.includes("kutan spray") || lower.includes("kutant skum")) return { unit: "ml", notCalculable: false };
  if (lower.includes("rektalsuspension")) return { unit: "ml", notCalculable: false };
  if (lower.includes("munsköljvätska")) return { unit: "ml", notCalculable: false };
  if (strength && /\/ml/.test(strength) && !lower.includes("kräm") && !lower.includes("salva")) return { unit: "ml", notCalculable: false };

  // unit: "st" — diskreta fasta enheter (tabletter, kapslar, plåster, implantat, tuggummi, suppar)
  return { unit: "st", notCalculable: false };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, retries = 1) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (i === retries) throw e;
      await sleep(1000 * (i + 1));
    }
  }
}

async function fetchSitemapNplIds(sitemapUrl) {
  console.log(`  Hämtar sitemap: ${sitemapUrl}`);
  const xml = await fetchWithRetry(sitemapUrl);
  const ids = new Set();
  const re = /<loc>https:\/\/fass\.se\/(?:health\/)?product\/(\d+)<\/loc>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    ids.add(m[1]);
  }
  console.log(`  Hittade ${ids.size} unika NPL-ID:n`);
  return [...ids];
}

function extractProductData(html) {
  const all = [];
  const re = /self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    all.push(JSON.parse('"' + m[1] + '"'));
  }

  if (all.length === 0) return null;

  const payload = all.join("\n");
  const lines = payload.split("\n");

  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx < 0) continue;
    const jsonStr = line.substring(colonIdx + 1);
    try {
      const obj = JSON.parse(jsonStr);
      const data = findProductHeader(obj);
      if (data) return data;
    } catch (e) {}
  }
  return null;
}

function findProductHeader(obj, depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 25) return null;

  if (obj.productHeader) {
    const ph = obj.productHeader;
    const pi = ph.productInformation || {};

    let substanceName = null;
    if (ph.activeSubstances && ph.activeSubstances[0]) {
      substanceName = ph.activeSubstances[0].substanceName;
    }

    return {
      nplId: pi.nplId || obj.nplId || null,
      tradeName: pi.tradeName || null,
      substanceName: substanceName,
      atcCode: pi.atcCode || null,
      doseForm: pi.doseForm || null,
      strength: pi.strength || null,
      narcoticClass: pi.narcoticClassEnum
        ? pi.narcoticClassEnum.replace("CLASS_", "")
        : null,
      packages: (ph.packages || []).filter(p => p.isOnTheMarket),
      alternativeForms: ph.alternativeForms || []
    };
  }

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const found = findProductHeader(obj[i], depth + 1);
      if (found) return found;
    }
  } else {
    for (const key of Object.keys(obj)) {
      const found = findProductHeader(obj[key], depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function normalizeProduct(raw) {
  if (!raw || !raw.doseForm) return null;

  const classification = classifyDoseForm(raw.doseForm, raw.strength);

  const tradeName = (raw.tradeName || "").replace(/®$/, "").trim();
  if (!tradeName) return null;

  const seen = new Set();
  const packages = [];
  for (const p of raw.packages) {
    const isParallel = p.parallelDistributingOrganizationName != null;
    const key = `${p.quantity}-${p.container}`;
    const existing = packages.find(x => x.quantity === p.quantity && x.container === p.container);
    if (existing) {
      if (!isParallel && existing.isParallel) {
        existing.isParallel = false;
        existing.nplPackId = p.nplPackId;
        existing.itemNumber = p.itemNumber;
      }
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    packages.push({
      nplPackId: p.nplPackId,
      quantity: p.quantity,
      container: p.container,
      itemNumber: p.itemNumber,
      isParallel: isParallel
    });
  }

  if (packages.length === 0) return null;

  return {
    nplId: raw.nplId,
    tradeName: tradeName,
    substanceName: raw.substanceName || null,
    atcCode: raw.atcCode || null,
    doseForm: raw.doseForm,
    strength: raw.strength || "",
    narcoticClass: raw.narcoticClass || null,
    unit: classification.unit,
    notCalculable: classification.notCalculable,
    packages: packages
  };
}

function loadProgress() {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
  } catch (e) {
    return { processed: {}, errors: {} };
  }
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function main() {
  console.log("=== build-product-db.js ===\n");

  console.log("Steg 1: Hämta sitemap och extrahera NPL-ID:n...");
  const nplIds = await fetchSitemapNplIds("https://fass.se/sitemap-health-product.xml");

  console.log("Steg 2: Crawla produktsidor...");
  const progress = loadProgress();
  const existingIds = new Set(Object.keys(progress.processed));

  const remaining = nplIds.filter(id => !existingIds.has(id));
  console.log(`  Redan processade: ${nplIds.length - remaining.length}`);
  console.log(`  Kvar att processa: ${remaining.length}\n`);

  if (remaining.length === 0) {
    console.log("  Alla produkter redan processade! Fortsätter till steg 3.\n");
  }

  let completed = nplIds.length - remaining.length;
  const total = nplIds.length;

  for (let i = 0; i < remaining.length; i += CONCURRENCY) {
    const batch = remaining.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (nplId) => {
        try {
          const url = `https://fass.se/health/product/${nplId}`;
          const html = await fetchWithRetry(url);
          const raw = extractProductData(html);
          if (!raw) {
            progress.errors[nplId] = "No product data found";
            return null;
          }
          const normalized = normalizeProduct(raw);
          progress.processed[nplId] = normalized;
          return normalized;
        } catch (e) {
          progress.errors[nplId] = e.message;
          progress.processed[nplId] = null;
          return null;
        }
      })
    );

    for (const result of results) {
      completed++;
      if (result.status === "fulfilled" && result.value) {}
    }

    if (i + CONCURRENCY < remaining.length) {
      const pct = Math.round((completed / total) * 100);
      process.stdout.write(`\r  ${completed}/${total} (${pct}%)   `);
      saveProgress(progress);
      await sleep(DELAY_MS);
    }
  }

  console.log(`\r  ${completed}/${total} (100%)   `);

  let productCount = 0;
  let errorCount = 0;
  for (const v of Object.values(progress.processed)) {
    if (v) productCount++;
    else errorCount++;
  }
  console.log(`\n  Produkter extraherade: ${productCount}`);
  console.log(`  Fel: ${Object.keys(progress.errors).length}\n`);

  console.log("Steg 3: Gruppera per ATC-kod...");
  const db = {};
  for (const [nplId, p] of Object.entries(progress.processed)) {
    if (!p || !p.atcCode) continue;
    if (!db[p.atcCode]) db[p.atcCode] = [];
    db[p.atcCode].push(p);
  }
  console.log(`  ${Object.keys(db).length} unika ATC-koder\n`);

  console.log(`Steg 4: Skriver ${OUT_FILE}...`);
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(db, null, 2));
  console.log("  Klart!\n");

  console.log("=== build-product-db.js slutförd ===");
}

main().catch(e => {
  console.error("FATAL:", e.message);
  console.error(e.stack);
  process.exit(1);
});
