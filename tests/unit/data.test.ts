// Kontroller av datafilerna som publiceras (körs i varje bygge, även efter den
// automatiska månadsuppdateringen). Ett fel här stoppar publiceringen.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { RawDrugEntry } from '../../src/lib/drug-cache';
import { validateDrugEntries, type DrugsVersion } from '../../src/lib/drug-data';
import { validateInteractionData, type InteractionData } from '../../src/lib/interaction-data';
import { checkInteractions, setInteractionData } from '../../src/lib/interactions';

const drugsText = readFileSync('public/data/drugs.json', 'utf8');
const drugs = JSON.parse(drugsText) as RawDrugEntry[];
const version = JSON.parse(readFileSync('public/data/drugs-version.json', 'utf8')) as DrugsVersion;
const janus = JSON.parse(readFileSync('src/lib/data/janusmed.json', 'utf8')) as InteractionData;

describe('läkemedelslistan (drugs.json)', () => {
  it('har giltigt format', () => {
    expect(validateDrugEntries(drugs)).toEqual([]);
  });
  it('är rimligt stor', () => {
    expect(drugs.length).toBeGreaterThan(5000);
  });
  it('versionsfilen hör till exakt den här listan (annars kan webbläsare behålla en gammal lista)', () => {
    expect(version.version).toBe(createHash('sha256').update(drugsText).digest('hex').slice(0, 16));
    expect(version.entries).toBe(drugs.length);
  });
  it('vanliga läkemedel finns med', () => {
    for (const atc of ['N06AB06', 'N02BE01', 'C09AA05', 'B01AA03', 'N05AN01', 'A10BA02']) {
      expect(drugs.some((d) => d.a === atc), atc).toBe(true);
    }
  });
});

describe('interaktionsdatan (janusmed.json)', () => {
  it('har giltigt format', () => {
    expect(validateInteractionData(janus)).toEqual([]);
  });
  it('täcker nästan alla läkemedel i listan', () => {
    const ids = new Set(drugs.map((d) => d.i));
    const known = [...ids].filter((id) => id in janus.products).length;
    expect(known / ids.size).toBeGreaterThan(0.95);
  });
  it('innehåller inga produkter som inte finns i läkemedelslistan', () => {
    const ids = new Set(drugs.map((d) => d.i));
    expect(Object.keys(janus.products).filter((id) => !ids.has(id))).toEqual([]);
  });
});

// Kliniskt kända kombinationer. Om ett av dessa test fallerar har antingen Janusmed
// ändrat sin bedömning eller hämtningen gått fel — granska innan datan publiceras.
describe('kliniskt kända interaktioner i den riktiga datan', () => {
  beforeAll(() => setInteractionData(janus));

  /** En tablett eller kapsel med ATC-koden som Janusmed känner till. */
  function oral(atc: string) {
    const d = drugs.find((x) => x.a === atc && /tablett|kapsel/i.test(x.f ?? '') && x.i in janus.products);
    if (!d) throw new Error(`Hittar ingen tablett/kapsel med ATC ${atc}`);
    return { label: `${d.n} (${atc})`, nplId: d.i };
  }
  function byForm(atc: string, form: RegExp) {
    const d = drugs.find((x) => x.a === atc && form.test(x.f ?? '') && x.i in janus.products);
    if (!d) throw new Error(`Hittar ingen produkt med ATC ${atc} och form ${form}`);
    return { label: `${d.n} (${atc})`, nplId: d.i };
  }
  const cls = (a: ReturnType<typeof oral>, b: ReturnType<typeof oral>) => checkInteractions([a, b]).warnings[0]?.cls[0] ?? '–';

  it.each([
    ['sertralin + citalopram (serotonergt)', 'N06AB06', 'N06AB04', 'D'],
    ['warfarin + ibuprofen (blödning)', 'B01AA03', 'M01AE01', 'D'],
    ['litium + ibuprofen (litiumtoxicitet)', 'N05AN01', 'M01AE01', 'CD'],
    ['enalapril + spironolakton (hyperkalemi)', 'C09AA02', 'C03DA01', 'CD'],
    ['tramadol + sertralin (serotonergt)', 'N02AX02', 'N06AB06', 'CD'],
    ['simvastatin + klaritromycin (myopati)', 'C10AA01', 'J01FA09', 'D'],
  ])('%s', (_what, atcA, atcB, expected) => {
    expect(expected).toContain(cls(oral(atcA), oral(atcB)));
  });

  it('paracetamol + omeprazol: ingen interaktion', () => {
    expect(cls(oral('N02BE01'), oral('A02BC01'))).toBe('–');
  });

  it('diklofenak: tabletten interagerar med warfarin, gelen gör det inte', () => {
    expect(cls(oral('M01AB05'), oral('B01AA03'))).toBe('D');
    expect(cls(byForm('M02AA15', /gel/i), oral('B01AA03'))).toBe('–');
  });
});
