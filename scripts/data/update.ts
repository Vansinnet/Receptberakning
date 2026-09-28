// Månatlig uppdatering av läkemedelslistan (FASS) och interaktionsdatan (Janusmed).
//
//   node scripts/data/update.ts                 hela kedjan
//   node scripts/data/update.ts --only=fass     bara läkemedelslistan
//   node scripts/data/update.ts --only=janusmed bara interaktionerna (utgår från nuvarande drugs.json)
//   node scripts/data/update.ts --dry-run       hämta och kontrollera, men skriv inga datafiler
//   node scripts/data/update.ts --limit=200     provkörning med de första 200 FASS-produkterna
//
// Slutkoder: 0 = klart (med eller utan ändringar), 2 = stoppad av krympningsspärren,
// 1 = fel. Rapporten skrivs till data/update-report.md och, i GitHub Actions, till
// körningens sammanfattning. Datafilerna skrivs bara om allt är godkänt.

import { appendFile, readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import type { RawDrugEntry } from '../../src/lib/drug-cache.ts';
import { validateDrugEntries, type DrugsVersion } from '../../src/lib/drug-data.ts';
import { validateInteractionData, type InteractionData } from '../../src/lib/interaction-data.ts';
import { crawlFass, type FassCrawlResult } from './fass/crawl.ts';
import { buildDrugEntries } from './fass/products.ts';
import { checkShrink, drugMetrics, formatGuardTable, interactionMetrics, type GuardResult } from './guard.ts';
import { buildInteractionData } from './janusmed/build.ts';
import { crawlJanusmed, recheckDisappeared, type JanusCrawlResult } from './janusmed/crawl.ts';
import { jsonLines, readJsonIfExists, sha256, writeFileAtomic } from './lib/files.ts';
import { createHttpClient } from './lib/http.ts';
import { log } from './lib/log.ts';

export const PATHS = {
  drugs: 'public/data/drugs.json',
  drugsVersion: 'public/data/drugs-version.json',
  interactions: 'src/lib/data/janusmed.json',
  report: 'data/update-report.md',
};

export const EXIT_BLOCKED = 2;

async function readText(path: string): Promise<string | null> {
  try { return await readFile(path, 'utf8'); } catch { return null; }
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      only: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      limit: { type: 'string' },
    },
  });
  const only = values.only;
  if (only && only !== 'fass' && only !== 'janusmed') throw new Error('--only ska vara fass eller janusmed');
  const dryRun = values['dry-run'];
  const limit = values.limit ? Number(values.limit) : undefined;
  const today = new Date().toISOString().slice(0, 10);

  const report: string[] = [`# Datauppdatering ${today}`, ''];
  const guards: GuardResult[] = [];
  const writes: { path: string; content: string }[] = [];

  // ── Läkemedelslistan ──────────────────────────────────────────────────────
  const currentDrugsText = await readText(PATHS.drugs);
  const currentDrugs = currentDrugsText ? JSON.parse(currentDrugsText) as RawDrugEntry[] : null;
  let drugs: RawDrugEntry[];
  let fass: FassCrawlResult | null = null;

  if (only !== 'janusmed') {
    const http = createHttpClient({ rps: 8, concurrency: 8 });
    fass = await log.group('FASS', () => crawlFass(http, { limit }));
    drugs = buildDrugEntries(fass.products);
    const errors = validateDrugEntries(drugs);
    if (errors.length) throw new Error(`Den nya läkemedelslistan är ogiltig:\n${errors.join('\n')}`);
    guards.push(checkShrink(currentDrugs ? drugMetrics(currentDrugs) : null, drugMetrics(drugs)));
    const content = jsonLines(drugs);
    if (content !== currentDrugsText) {
      const version: DrugsVersion = { version: sha256(content).slice(0, 16), updated: today, entries: drugs.length };
      writes.push({ path: PATHS.drugs, content }, { path: PATHS.drugsVersion, content: `${JSON.stringify(version, null, 2)}\n` });
    }
    const s = fass.stats;
    report.push('## FASS', '',
      `- Produkter i FASS: ${s.inSitemap}`,
      `- Användbara produkter: ${fass.products.length} (${s.skipped} ej marknadsförda eller utan ATC-kod, ${s.noData} utan produktdata, ${s.failed} gick inte att hämta)`,
      `- Poster i läkemedelslistan: ${drugs.length}`,
      `- Anrop: ${http.stats.requests} (${http.stats.retries} omförsök), ${(http.stats.bytes / 1e6).toFixed(0)} MB`, '');
  } else {
    if (!currentDrugs) throw new Error(`${PATHS.drugs} saknas`);
    drugs = currentDrugs;
  }

  // ── Interaktioner ─────────────────────────────────────────────────────────
  let janus: JanusCrawlResult | null = null;
  if (only !== 'fass') {
    // HTTP 500 betyder här att sidan blev för stor; den delas direkt i stället för att försökas igen.
    const http = createHttpClient({ rps: 1, concurrency: 2, retries: 3, timeoutMs: 120_000, retryStatuses: [408, 425, 429, 502, 503, 504] });
    const nplIds = drugs.map((d) => d.i);
    janus = await log.group('Janusmed', () => crawlJanusmed(http, nplIds, { seed: Number(today.replaceAll('-', '')) }));
    const current = await readJsonIfExists<InteractionData>(PATHS.interactions);
    const previousValid = current && validateInteractionData(current).length === 0 ? current : null;
    const collector = janus.collector;
    const recheck = await log.group('Janusmed: försvunna interaktioner', () => recheckDisappeared(http, collector, previousValid));
    if (recheck.skipped > 0) {
      throw new Error(`${recheck.disappeared} interaktionspar har försvunnit sedan förra datan — för många för att kontrollera (${recheck.skipped} okontrollerade). Granska innan publicering.`);
    }
    const data = buildInteractionData(collector, nplIds);
    const errors = validateInteractionData(data);
    if (errors.length) throw new Error(`Den nya interaktionsdatan är ogiltig:\n${errors.join('\n')}`);
    const s = janus.stats;
    const allowedMismatches = Math.max(1, Math.floor(s.verified * 0.03));
    if (s.verifyMismatches.length > allowedMismatches) {
      throw new Error(`Stickprovet avvek i ${s.verifyMismatches.length} av ${s.verified} fall:\n${s.verifyMismatches.join('\n')}`);
    }
    guards.push(checkShrink(previousValid ? interactionMetrics(previousValid) : null, interactionMetrics(data)));
    const content = jsonLines(data as unknown as Record<string, unknown>, ['products', 'interactions']);
    const previous = await readText(PATHS.interactions);
    // Om bara Janusmeds datumstämpel har ändrats finns inget nytt att publicera.
    const withoutDate = (t: string | null) => t?.replace(/"janusmedUpdated": [^\n]*/, '');
    if (withoutDate(content) !== withoutDate(previous)) writes.push({ path: PATHS.interactions, content });
    report.push('## Janusmed', '',
      `- Janusmed senast uppdaterad: ${data.janusmedUpdated ?? 'okänt'}`,
      `- Produkter kända i Janusmed: ${s.products - s.unknownToJanusmed} av ${s.products}`,
      `- Profiler (substanser + administrationsväg): ${s.profiles}`,
      `- Interaktionsrader (klass B–D): ${data.interactions.length}`,
      `- Anrop: ${s.requests}, ${(http.stats.bytes / 1e6).toFixed(0)} MB`,
      `- Stickprov mot enskilda sidor: ${s.verified} kontrollerade, ${s.verifyMismatches.length} avvikelser`,
      `- Interaktionspar som fanns förra gången men saknades nu: ${recheck.disappeared}, kontrollerade var för sig — ${recheck.restored} fanns kvar hos Janusmed och återställdes`,
      ...(s.failedPairs ? [`- Par som Janusmed inte kunde visa fullständigt: ${s.failedPairs}`] : []),
      ...s.verifyMismatches.map((m) => `  - ${m}`), '');
  }

  // ── Spärr och skrivning ───────────────────────────────────────────────────
  const blocked = guards.some((g) => !g.ok);
  report.push('## Nyckeltal', '', formatGuardTable(guards), '');
  if (blocked) {
    report.push('**Uppdateringen stoppades:** minst ett nyckeltal minskade med 20 % eller mer. Inga filer har ändrats.',
      'Granska källan och kör om arbetsflödet manuellt, eller uppdatera lokalt, om minskningen är korrekt.');
  } else if (writes.length === 0) {
    report.push('Inga ändringar i datan.');
  } else {
    report.push(`Uppdaterade filer: ${writes.map((w) => `\`${w.path}\``).join(', ')}${dryRun ? ' (provkörning — inget skrevs)' : ''}`);
    if (!dryRun) for (const w of writes) await writeFileAtomic(w.path, w.content);
  }

  const text = `${report.join('\n')}\n`;
  await writeFileAtomic(PATHS.report, text);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, text);
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `changed=${!blocked && !dryRun && writes.length > 0}\nblocked=${blocked}\n`);
  }
  console.log(`\n${text}`);
  if (blocked) { log.error('Krympningsspärren stoppade uppdateringen'); return EXIT_BLOCKED; }
  return 0;
}

main().then(
  (code) => { process.exitCode = code; },
  (e: unknown) => {
    log.error(e instanceof Error ? e.message : String(e));
    if (e instanceof Error && e.stack) console.error(e.stack);
    process.exitCode = 1;
  },
);
