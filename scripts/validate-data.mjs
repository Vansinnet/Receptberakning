import { readFileSync, existsSync } from 'fs';

let errors = 0;

function err(msg) {
  console.error('  FAIL: ' + msg);
  errors++;
}

// ── Validate drugs.json ──
const drugsPath = 'public/data/drugs.json';
if (!existsSync(drugsPath)) {
  err('drugs.json saknas');
} else {
  const drugs = JSON.parse(readFileSync(drugsPath, 'utf8'));
  if (!Array.isArray(drugs)) {
    err('drugs.json är inte en array');
  } else if (drugs.length === 0) {
    err('drugs.json är tom');
  } else {
    console.log(`drugs.json: ${drugs.length} poster`);
    for (let i = 0; i < drugs.length; i++) {
      const d = drugs[i];
      if (typeof d.n !== 'string' || !d.n) err(`post ${i}: saknar eller ogiltigt fält 'n'`);
      if (typeof d.i !== 'string' || !d.i) err(`post ${i}: saknar eller ogiltigt fält 'i'`);
      if (typeof d.a !== 'string' || !d.a) err(`post ${i}: saknar eller ogiltigt fält 'a'`);
    }
  }
}

// ── Validate interactions-scraped.json ──
const intPath = 'src/lib/data/interactions-scraped.json';
if (!existsSync(intPath)) {
  err('interactions-scraped.json saknas');
} else {
  const rules = JSON.parse(readFileSync(intPath, 'utf8'));
  if (!Array.isArray(rules)) {
    err('interactions-scraped.json är inte en array');
  } else if (rules.length === 0) {
    err('interactions-scraped.json är tom');
  } else {
    console.log(`interactions-scraped.json: ${rules.length} regler`);
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i];
      if (!Array.isArray(r.atcGroupA) || r.atcGroupA.length === 0) err(`regel ${i}: saknar eller ogiltigt atcGroupA`);
      if (!Array.isArray(r.atcGroupB) || r.atcGroupB.length === 0) err(`regel ${i}: saknar eller ogiltigt atcGroupB`);
      if (!['danger', 'warn'].includes(r.severity)) err(`regel ${i}: ogiltig severity "${r.severity}" (ska vara danger eller warn)`);
      if (typeof r.title !== 'string' || !r.title) err(`regel ${i}: saknar eller ogiltig title`);
      if (typeof r.description !== 'string' || !r.description) err(`regel ${i}: saknar eller ogiltig description`);
      if (typeof r.recommendation !== 'string' || !r.recommendation) err(`regel ${i}: saknar eller ogiltig recommendation`);
    }
  }
}

if (errors > 0) {
  console.error(`\n${errors} valideringsfel hittades.`);
  process.exit(1);
} else {
  console.log('All data validerad utan fel.');
}
