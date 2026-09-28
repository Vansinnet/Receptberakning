// FASS produktdata → läkemedelslistan i verktyget (public/data/drugs.json).
//
// Reglerna är desamma som i 4.0, med två skillnader:
//   • Utdata är deterministisk (fullständig sortering), så att en oförändrad källa
//     ger en byte-identisk fil och ingen onödig commit.
//   • Förpackningar som inte marknadsförs tas bort redan vid tolkningen.

import type { RawDrugEntry } from '../../../src/lib/drug-cache.ts';
import type { DoseUnit } from '../../../src/lib/constants.ts';
import { classifyDoseForm, displayForm } from './dose-form.ts';
import type { FassProductHeader } from './page.ts';

export interface Product {
  nplId: string;
  tradeName: string;
  atcCode: string;
  doseForm: string;
  strength: string;
  /** Narkotikaklass, t.ex. "II", eller null. */
  narcoticClass: string | null;
  unit: DoseUnit | null;
  notCalculable: boolean;
  /** Unika förpackningsstorlekar som marknadsförs, stigande. */
  packageSizes: number[];
}

const ATC = /^[A-Z]\d{2}[A-Z]{0,2}\d{0,2}$/;

/** Normaliserar FASS produkthuvud. Null om produkten inte kan användas i verktyget. */
export function toProduct(header: FassProductHeader, expectedNplId?: string): Product | null {
  const pi = header.productInformation;
  if (!pi) return null;
  const nplId = pi.nplId ?? expectedNplId;
  const tradeName = (pi.tradeName ?? '').replace(/®/g, '').trim();
  const atcCode = (pi.atcCode ?? '').trim().toUpperCase();
  const doseForm = (pi.doseForm ?? '').trim();
  if (!nplId || !tradeName || !doseForm || !ATC.test(atcCode)) return null;
  if (pi.applicableFor === 'ANIMAL') return null;

  const sizes = new Set<number>();
  for (const p of header.packages ?? []) {
    if (p.isOnTheMarket && typeof p.quantity === 'number' && Number.isFinite(p.quantity) && p.quantity > 0) {
      sizes.add(p.quantity);
    }
  }
  if (sizes.size === 0) return null;

  const strength = (pi.strength ?? '').trim();
  const narc = pi.narcoticClassEnum;
  const cls = classifyDoseForm(doseForm, strength);
  return {
    nplId, tradeName, atcCode, doseForm, strength,
    narcoticClass: narc && narc !== 'NO_NARCOTICS_CLASS' ? narc.replace(/^CLASS_/, '') : null,
    unit: cls.unit,
    notCalculable: cls.notCalculable,
    packageSizes: [...sizes].sort((a, b) => a - b),
  };
}

// ── Sorteringsgrupper (samma som 4.0) ───────────────────────────────────────

const ATC_GROUP_LABELS: Record<string, string> = {
  N05A: 'Antipsykotika', N05B: 'Ångestdämpande (bensodiazepiner)', N05C: 'Sömnmedel och lugnande medel',
  N06A: 'Antidepressiva (SSRI/SNRI/TCA/övriga)', N06B: 'ADHD / CNS-stimulantia', N06C: 'Kombinationer psykofarmaka',
  N06D: 'Läkemedel vid demens', N07B: 'Läkemedel vid beroendetillstånd',
  N02B: 'Smärtstillande och febernedsättande', N02A: 'Opioider',
  C07A: 'Betareceptorblockerare', C08C: 'Kalciumantagonister', C09A: 'ACE-hämmare',
  C09C: 'Angiotensin II-receptorblockerare', C10A: 'Kolesterolsänkande', C03C: 'Diuretika',
  B01A: 'Antikoagulantia / trombocythämmare', A10B: 'Diabetesläkemedel', H03A: 'Sköldkörtelhormoner',
  A02B: 'Mag-/tarmsår och reflux', R06A: 'Allergimedicin', J01C: 'Antibiotika (penicilliner)',
  J01A: 'Antibiotika (tetracykliner)', J01F: 'Antibiotika (makrolider)', M01A: 'Antiinflammatoriska och reumatiska',
  H02A: 'Kortison / immunmodulerande', M04A: 'Giktmedel', M05B: 'Osteoporos', G04C: 'Urologi / prostata',
  N03A: 'Antiepileptika', N02C: 'Migränmedel', G04B: 'Erektil dysfunktion', A11C: 'Vitamin D',
  B03B: 'Vitamin B12 och folsyra', A12B: 'Kalium', C01A: 'Hjärtglykosider',
  C02: 'Kärlvidgande', C07: 'Beta-blockerare', C08: 'Kalciumantagonister', C09: 'ACE-hämmare / ARB',
  C10: 'Lipidsänkande', A10: 'Diabetes', B01: 'Blodförtunnande', J01: 'Antibiotika', N02: 'Smärtstillande',
  N03: 'Epilepsi / neurologi', N04: 'Parkinson', N05: 'Psykofarmaka', N06: 'Antidepressiva / ADHD',
  N07: 'Övriga nervsystemet', R03: 'Astma / KOL', R05: 'Hosta och förkylning', R06: 'Allergi',
  S01: 'Ögonmedel', A02: 'Mag/tarm', H03: 'Sköldkörtel', M01: 'Antiinflammatoriska', M04: 'Gikt',
  M05: 'Osteoporos', G04: 'Urologi', C01: 'Hjärta', C03: 'Vätskedrivande', A11: 'Vitaminer',
  A12: 'Mineraler', B03: 'Medel vid anemi', H02: 'Kortison',
};

export function groupLabel(atcCode: string): string {
  return ATC_GROUP_LABELS[atcCode.slice(0, 4)] ?? ATC_GROUP_LABELS[atcCode.slice(0, 3)] ?? atcCode.slice(0, 3);
}

const sv = new Intl.Collator('sv');

/** Bygger läkemedelslistan: en post per namn, styrka, beredningsform och förpackningsstorlek. */
export function buildDrugEntries(products: Iterable<Product>): RawDrugEntry[] {
  const rows: { group: string; entry: RawDrugEntry }[] = [];
  const seen = new Set<string>();
  const sorted = [...products].sort((a, b) => (a.nplId < b.nplId ? -1 : a.nplId > b.nplId ? 1 : 0));
  for (const p of sorted) {
    const name = `${p.tradeName} ${p.strength}`.trim();
    const form = displayForm(p.doseForm);
    for (const size of p.packageSizes) {
      if (size <= 1) continue; // enstaka förpackningar (t.ex. 1 penna) ger ingen meningsfull beräkning
      const key = `${name}|${size}|${form}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const entry: RawDrugEntry = { n: name, p: size, f: form, i: p.nplId, a: p.atcCode };
      if (p.unit && p.unit !== 'st') entry.u = p.unit;
      if (p.notCalculable) entry.c = true;
      if (p.narcoticClass) entry.r = p.narcoticClass;
      rows.push({ group: groupLabel(p.atcCode), entry });
    }
  }
  rows.sort((x, y) =>
    sv.compare(x.group, y.group) || sv.compare(x.entry.n, y.entry.n)
    || (x.entry.p ?? 0) - (y.entry.p ?? 0) || sv.compare(x.entry.f ?? '', y.entry.f ?? '')
    || (x.entry.i < y.entry.i ? -1 : x.entry.i > y.entry.i ? 1 : 0));
  return rows.map((r) => r.entry);
}
