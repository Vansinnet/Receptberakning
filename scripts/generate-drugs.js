const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const DB_FILE = path.join(DATA_DIR, "product-db.json");
const OUT_FILE = path.join(__dirname, "..", "Kod", "drugs.js");
const INDEX_FILE = path.join(__dirname, "..", "Kod", "index.html");

const ATC_GROUP_LABELS = {
  "N05A": "Antipsykotika",
  "N05B": "Ångestdämpande (bensodiazepiner)",
  "N05C": "Sömnmedel och lugnande medel",
  "N06A": "Antidepressiva (SSRI/SNRI/TCA/övriga)",
  "N06B": "ADHD / CNS-stimulantia",
  "N06C": "Kombinationer psykofarmaka",
  "N06D": "Läkemedel vid demens",
  "N07B": "Läkemedel vid beroendetillstånd",
  "N02B": "Smärtstillande och febernedsättande",
  "N02A": "Opioider",
  "C07A": "Betareceptorblockerare",
  "C08C": "Kalciumantagonister",
  "C09A": "ACE-hämmare",
  "C09C": "Angiotensin II-receptorblockerare",
  "C10A": "Kolesterolsänkande",
  "C03C": "Diuretika",
  "B01A": "Antikoagulantia / trombocythämmare",
  "A10B": "Diabetesläkemedel",
  "H03A": "Sköldkörtelhormoner",
  "A02B": "Mag-/tarmsår och reflux",
  "R06A": "Allergimedicin",
  "J01C": "Antibiotika (penicilliner)",
  "J01A": "Antibiotika (tetracykliner)",
  "J01F": "Antibiotika (makrolider)",
  "M01A": "Antiinflammatoriska och reumatiska",
  "H02A": "Kortison / immunmodulerande",
  "M04A": "Giktmedel",
  "M05B": "Osteoporos",
  "G04C": "Urologi / prostata",
  "N03A": "Antiepileptika",
  "N02C": "Migränmedel",
  "G04B": "Erektil dysfunktion",
  "A11C": "Vitamin D",
  "B03B": "Vitamin B12 och folsyra",
  "A12B": "Kalium",
  "C01A": "Hjärtglykosider",
  "C02": "Kärlvidgande",
  "C07": "Beta-blockerare",
  "C08": "Kalciumantagonister",
  "C09": "ACE-hämmare / ARB",
  "C10": "Lipidsänkande",
  "A10": "Diabetes",
  "B01": "Blodförtunnande",
  "J01": "Antibiotika",
  "N02": "Smärtstillande",
  "N03": "Epilepsi / neurologi",
  "N04": "Parkinson",
  "N05": "Psykofarmaka",
  "N06": "Antidepressiva / ADHD",
  "N07": "Övriga nervsystemet",
  "R03": "Astma / KOL",
  "R05": "Hosta och förkylning",
  "R06": "Allergi",
  "S01": "Ögonmedel",
  "A02": "Mag/tarm",
  "H03": "Sköldkörtel",
  "M01": "Antiinflammatoriska",
  "M04": "Gikt",
  "M05": "Osteoporos",
  "G04": "Urologi",
  "C01": "Hjärta",
  "C03": "Vätskedrivande",
  "A11": "Vitaminer",
  "A12": "Mineraler",
  "B03": "Medel vid anemi",
  "H02": "Kortison",
};

function getAtcGroup(atcCode) {
  return atcCode ? atcCode.substring(0, 4) : null;
}

function getGroupLabel(atcCode) {
  const g4 = getAtcGroup(atcCode);
  if (!g4) return "Övrigt";

  if (ATC_GROUP_LABELS[g4]) return ATC_GROUP_LABELS[g4];

  const g3 = atcCode.substring(0, 3);
  if (ATC_GROUP_LABELS[g3]) return ATC_GROUP_LABELS[g3];

  const g1 = atcCode.substring(0, 1);
  if (ATC_GROUP_LABELS[g1]) return `${ATC_GROUP_LABELS[g1]}`;

  return atcCode.substring(0, 3);
}

function cleanName(name) {
  return (name || "").replace(/®/g, "").trim();
}

function isLiquidOrTopicalDoseForm(doseForm, strength) {
  if (strength && /\/ml/.test(strength)) return true;
  if (strength && /\/g/.test(strength)) return true;
  if (strength && /IE\/ml/.test(strength)) return true;
  if (!doseForm) return false;
  const lower = doseForm.toLowerCase();
  const kw = [
    "lösning", "injektion", "infusion", "droppar", "sirap",
    "mixtur", "kräm", "salva", "liniment", "spray", "schampo",
    "tuggummi", "plåster", "depotplåster", "depotinjektion",
    "oral emulsion", "oralt pulver", "granulat", "pulver till",
    "vagitorium", "suppositorium", "gel",
    "munsköljvätska", "munhålegel", "dentalgel",
    "rektalsuspension", "kutan", "vaginal",
    "endosbehållare", "nässpray",
    "ögondroppar", "örondroppar", "inhalationspulver",
    "inhalationsspray"
  ];
  for (const k of kw) {
    if (lower.includes(k)) return true;
  }
  return false;
}

function loadProductDb() {
  console.log("  Laddar produktdatabas...");
  if (!fs.existsSync(DB_FILE)) {
    console.error("  FEL: product-db.json finns inte. Kör build-product-db.js först.");
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function generateDrugEntries(atcCode, products) {
  const entries = [];
  const seen = new Set();

  for (const prod of products) {
    if (isLiquidOrTopicalDoseForm(prod.doseForm, prod.strength)) continue;

    const nameBase = cleanName(prod.tradeName);
    const strength = prod.strength || "";
    const form = cleanForm(prod.doseForm);

    for (const pkg of prod.packages) {
      if (pkg.quantity <= 1) continue;

      const key = `${nameBase} ${strength}|${pkg.quantity}|${form}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const entry = {
        name: `${nameBase} ${strength}`,
        pkg: pkg.quantity,
        form: form
      };
      if (prod.narcoticClass && prod.narcoticClass !== "NO_NARCOTICS_CLASS") {
        entry.narc = prod.narcoticClass;
      }
      entries.push(entry);
    }
  }

  return entries;
}

function cleanForm(doseForm) {
  if (!doseForm) return "Tablett";
  const form = doseForm.toLowerCase();

  if (form.includes("depottablett") || form.includes("depotablett")) return "Depottablett";
  if (form.includes("depotkapsel") || form.includes("depotkapsel")) return "Depotkapsel";
  if (form.includes("enterotablett")) return "Enterotablett";
  if (form.includes("enterokapsel")) return "Enterokapsel";
  if (form.includes("resoriblett")) return "Resoriblett";
  if (form.includes("tuggtablett")) return "Tuggtablett";
  if (form.includes("brustablett")) return "Brustablett";
  if (form.includes("munlöslig")) return "Munsönderfallande";
  if (form.includes("smälttablett")) return "Smälttablett";
  if (form.includes("kapsel") && form.includes("hård")) return "Kapsel";
  if (form.includes("kapsel") && form.includes("mjuk")) return "Mjuk kapsel";
  if (form.includes("kapsel")) return "Kapsel";
  if (form.includes("tablett")) return "Tablett";

  return doseForm;
}

function generateDrugsJs(candidates) {
  const groups = {};

  for (const [atcCode, products] of Object.entries(candidates)) {
    const entries = generateDrugEntries(atcCode, products);
    if (entries.length === 0) continue;

    const label = getGroupLabel(atcCode);
    if (!groups[label]) groups[label] = [];
    groups[label].push(...entries);
  }

  const sections = Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0], "sv"));

  let output = "var DRUG_LIST = [\n";

  for (const [label, entries] of sections) {
    output += `  // === ${label} ===\n`;

    const sorted = entries.sort((a, b) => a.name.localeCompare(b.name, "sv"));

    for (const entry of sorted) {
      if (entry.narc) {
        output += `  { name: ${JSON.stringify(entry.name)}, pkg: ${entry.pkg}, form: ${JSON.stringify(entry.form)}, narc: ${JSON.stringify(entry.narc)} },\n`;
      } else {
        output += `  { name: ${JSON.stringify(entry.name)}, pkg: ${entry.pkg}, form: ${JSON.stringify(entry.form)} },\n`;
      }
    }

    output += "\n";
  }

  output += "];\n\n";
  output += "function searchDrugs(query) {\n";
  output += "  if (!query || query.length < 2) return [];\n";
  output += "  var q = query.toLowerCase().trim();\n";
  output += "  var results = [];\n";
  output += "  for (var i = 0; i < DRUG_LIST.length; i++) {\n";
  output += "    if (DRUG_LIST[i].name.toLowerCase().indexOf(q) === 0) {\n";
  output += "      results.push(DRUG_LIST[i]);\n";
  output += "      if (results.length >= 10) break;\n";
  output += "    }\n";
  output += "  }\n";
  output += "  return results;\n";
  output += "}\n";

  return output;
}

function updateIndexDate() {
  if (!fs.existsSync(INDEX_FILE)) return;
  const today = new Date().toISOString().split("T")[0];
  let html = fs.readFileSync(INDEX_FILE, "utf8");
  html = html.replace(/uppdaterad \d{4}-\d{2}-\d{2}/, `uppdaterad ${today}`);
  fs.writeFileSync(INDEX_FILE, html);
  console.log(`  Datum i index.html uppdaterat till ${today}`);
}

function main() {
  console.log("=== generate-drugs.js ===\n");

  console.log("Steg 1: Ladda produktdatabas...");
  const productDb = loadProductDb();
  console.log(`  ${Object.keys(productDb).length} ATC-grupper i databasen\n`);

  console.log("Steg 2: Generera drugs.js (alla produkter)...");
  const content = generateDrugsJs(productDb);
  fs.writeFileSync(OUT_FILE, content, "utf8");

  const entryCount = content.split("\n").filter(l => l.includes("name:")).length;
  console.log(`  ${entryCount} läkemedelsentries genererade`);
  console.log(`  Skrivet till ${OUT_FILE}\n`);

  console.log("Steg 3: Uppdatera datum i index.html...");
  updateIndexDate();

  console.log("\n=== generate-drugs.js slutförd ===");
}

main();
