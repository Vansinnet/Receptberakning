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
    const unit = prod.unit || "st";
    const notCalculable = prod.notCalculable || false;

    const nameBase = cleanName(prod.tradeName);
    const strength = prod.strength || "";
    const form = cleanForm(prod.doseForm);

    for (const pkg of prod.packages) {
      if (pkg.quantity <= 1) continue;

      const key = `${nameBase} ${strength}|${pkg.quantity}|${form}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const entry = {
        name: `${nameBase} ${strength}`.trim(),
        pkg: pkg.quantity,
        form: form,
        nplId: prod.nplId,
        atc: atcCode
      };
      if (unit !== "st") entry.unit = unit;
      if (notCalculable) entry.notCalculable = true;
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
  if (form.includes("munlöslig") || form.includes("munsönderfallande")) return "Munsönderfallande";
  if (form.includes("smälttablett")) return "Smälttablett";
  if (form.includes("sublingual")) return "Sublingual tablett";
  if (form.includes("kapsel") && form.includes("hård")) return "Kapsel";
  if (form.includes("kapsel") && form.includes("mjuk")) return "Mjuk kapsel";
  if (form.includes("kapsel")) return "Kapsel";
  if (form.includes("tablett")) return "Tablett";

  if (form.includes("plåster")) return "Plåster";
  if (form.includes("implantat")) return "Implantat";
  if (form.includes("tuggummi")) return "Tuggummi";
  if (form.includes("vagitorium")) return "Vagitorium";
  if (form.includes("suppositorium")) return "Suppositorium";

  if (form.includes("oral lösning")) return "Oral lösning";
  if (form.includes("oral suspension")) return "Oral suspension";
  if (form.includes("oral emulsion")) return "Oral emulsion";
  if (form.includes("oral mixtur")) return "Oral mixtur";
  if (form.includes("orala droppar")) return "Orala droppar";
  if (form.includes("sirap")) return "Sirap";

  if (form.includes("inhalationsspray")) return "Inhalationsspray";
  if (form.includes("inhalationspulver")) return "Inhalationspulver";
  if (form.includes("nässpray")) return "Nässpray";
  if (form.includes("rektalskum")) return "Rektalskum";
  if (form.includes("endosbehållare")) return "Endosbehållare";

  if (form.includes("förfylld spruta")) return "Förfylld spruta";
  if (form.includes("förfylld injektionspenna")) return "Injektionspenna";
  if (form.includes("injektionsvätska")) return "Injektionsvätska";
  if (form.includes("injektion")) return "Injektionsvätska";
  if (form.includes("infusionsvätska")) return "Infusionsvätska";
  if (form.includes("infusion")) return "Infusionsvätska";

  if (form.includes("ögondroppar")) return "Ögondroppar";
  if (form.includes("örondroppar")) return "Örondroppar";

  if (form.includes("kutan lösning")) return "Kutan lösning";
  if (form.includes("kutan spray")) return "Kutan spray";
  if (form.includes("kutant skum")) return "Kutant skum";
  if (form.includes("rektalsuspension")) return "Rektalsuspension";
  if (form.includes("munsköljvätska")) return "Munsköljvätska";

  if (form.includes("kräm")) return "Kräm";
  if (form.includes("salva")) return "Salva";
  if (form.includes("gel")) return "Gel";
  if (form.includes("pasta")) return "Pasta";

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

  let output = "const DRUG_LIST = [\n";

  for (const [label, entries] of sections) {
    output += `  // === ${label} ===\n`;

    const sorted = entries.sort((a, b) => a.name.localeCompare(b.name, "sv"));

    for (const entry of sorted) {
      const fields = [
        `n: ${JSON.stringify(entry.name)}`,
        `p: ${entry.pkg}`,
        `f: ${JSON.stringify(entry.form)}`,
        `i: ${JSON.stringify(entry.nplId)}`,
        `a: ${JSON.stringify(entry.atc)}`,
      ];
      if (entry.unit && entry.unit !== "st") fields.push(`u: ${JSON.stringify(entry.unit)}`);
      if (entry.notCalculable) fields.push(`c: true`);
      if (entry.narc) fields.push(`r: ${JSON.stringify(entry.narc)}`);
      output += `  { ${fields.join(", ")} },\n`;
    }

    output += "\n";
  }

  output += "];\n\n";
  output += "function searchDrugs(query) {\n";
  output += "  if (!query || query.length < 2) return [];\n";
  output += "  var q = query.toLowerCase().trim();\n";
  output += "  var results = [];\n";
  output += "  for (var i = 0; i < DRUG_LIST.length; i++) {\n";
  output += "    if (DRUG_LIST[i].n.toLowerCase().indexOf(q) === 0) {\n";
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

  const entryCount = content.split("\n").filter(l => l.includes("n:")).length;
  console.log(`  ${entryCount} läkemedelsentries genererade`);
  console.log(`  Skrivet till ${OUT_FILE}\n`);

  console.log("Steg 3: Uppdatera datum i index.html...");
  updateIndexDate();

  console.log("\n=== generate-drugs.js slutförd ===");
}

main();
