// Hämtar Janusmeds interaktioner för alla läkemedel i verktygets lista.
//
//   1. Kartläggning: alla produkter slås upp i grupper om 200 för att få deras
//      substanser och administrationsväg (= profil). Interaktionerna på de sidorna
//      samlas också in.
//   2. Täckning: en representativ produkt per profil; blockparsplanen ser till att
//      varje par av profiler visas tillsammans på minst en sida.
//   3. Stickprov: slumpade par kontrolleras var för sig på en egen sida med bara
//      de två produkterna, och resultatet jämförs med det insamlade. Avvikelser
//      stoppar uppdateringen.

import { HttpError, type HttpClient } from '../lib/http.ts';
import { log, progress } from '../lib/log.ts';
import { InteractionCollector } from './collect.ts';
import { janusmedUrl, parseJanusPage } from './page.ts';
import { chunk, planPairCoverage, sample, seededRandom } from './plan.ts';

/**
 * Högst 150 produkter per sida. 400 avvisas (414, för lång adress) och sidor med 200
 * produkter och många interaktioner ger ibland serverfel; då delas anropet automatiskt.
 */
export const MAX_IDS_PER_PAGE = 150;

export interface JanusCrawlOptions {
  /** Antal slumpade par per sort (med respektive utan interaktion) i stickprovet. */
  verifySamples?: number;
  /** Frö för stickprovet, så att en körning går att upprepa. */
  seed?: number;
}

export interface JanusCrawlResult {
  collector: InteractionCollector;
  stats: {
    products: number;
    unknownToJanusmed: number;
    profiles: number;
    requests: number;
    /** Par som inte gick att kontrollera (Janusmed gav serverfel även för paret ensamt). */
    failedPairs: number;
    verified: number;
    verifyMismatches: string[];
  };
}

async function fetchPage(http: HttpClient, nplIds: readonly string[]) {
  return parseJanusPage(await http.getText(janusmedUrl(nplIds)));
}

/**
 * Janusmed visar högst 1000 interaktioner per sida och kapar resten utan att säga till.
 * En sida med så många interaktioner kan alltså vara ofullständig och delas upp.
 */
export const JANUSMED_PAGE_CAP = 1000;

/** Serverfel som beror på att sidan blir för stor, inte på en enskild produkt. */
const isServerError = (e: unknown) => e instanceof HttpError && e.status >= 500;

/**
 * Hämtar en sida och registrerar den. Om sidan blir för stor — Janusmed ger serverfel
 * (HTTP 500) eller når taket på 1000 interaktioner — delas anropet i tre delar med 2/3
 * av produkterna vardera, så att varje par fortfarande finns med i minst en del.
 * Returnerar antalet anrop och antalet par som inte gick att kontrollera.
 */
export async function collectPage(http: HttpClient, collector: InteractionCollector, nplIds: readonly string[]): Promise<{ requests: number; failedPairs: number }> {
  let complete = false;
  try {
    const page = await fetchPage(http, nplIds);
    collector.addPage(page); // även en kapad sida innehåller korrekta interaktioner
    complete = page.interactions.length < JANUSMED_PAGE_CAP;
  } catch (e) {
    if (!isServerError(e)) throw e;
  }
  if (complete) return { requests: 1, failedPairs: 0 };
  if (nplIds.length <= 2) {
    log.warn(`Janusmed kunde inte visa ${nplIds.join(' + ')} fullständigt`);
    return { requests: 1, failedPairs: 1 };
  }
  let requests = 1, failedPairs = 0;
  for (const part of planPairCoverage(nplIds, Math.ceil(nplIds.length / 3))) {
    const r = await collectPage(http, collector, part);
    requests += r.requests;
    failedPairs += r.failedPairs;
  }
  return { requests, failedPairs };
}

export async function crawlJanusmed(http: HttpClient, nplIds: readonly string[], opts: JanusCrawlOptions = {}): Promise<JanusCrawlResult> {
  const { verifySamples = 75, seed = 20260927 } = opts;
  const ids = [...new Set(nplIds)].sort();
  const collector = new InteractionCollector();
  let requests = 0;

  // ── 1. Kartläggning ────────────────────────────────────────────────────────
  const mapping = chunk(ids, MAX_IDS_PER_PAGE);
  const tick1 = progress('Janusmed kartläggning', mapping.length);
  let failedPairs = 0;
  const run = async (group: string[], tick: () => void) => {
    const r = await collectPage(http, collector, group);
    requests += r.requests;
    failedPairs += r.failedPairs;
    tick();
  };
  await Promise.all(mapping.map((group) => run(group, tick1)));
  const unknown = ids.filter((id) => !collector.productProfile.has(id));
  const profiles = [...collector.representative.keys()].sort();
  log.info(`Janusmed: ${ids.length - unknown.length} av ${ids.length} produkter kända, ${profiles.length} profiler`);
  if (ids.length > 0 && unknown.length / ids.length > 0.25) {
    throw new Error(`Janusmed känner inte igen ${unknown.length} av ${ids.length} produkter — har sidformatet ändrats?`);
  }

  // ── 2. Täckning av alla profilpar ─────────────────────────────────────────
  const reps = profiles.map((k) => collector.representative.get(k)!);
  const plan = planPairCoverage(reps, MAX_IDS_PER_PAGE / 2);
  const tick2 = progress('Janusmed profilpar', plan.length);
  await Promise.all(plan.map((group) => run(group, tick2)));
  if (failedPairs > 0) log.warn(`Janusmed: ${failedPairs} produktpar kunde inte kontrolleras fullständigt`);

  // ── 3. Stickprov mot enskilda sidor ───────────────────────────────────────
  const random = seededRandom(seed);
  const withHits = [...collector.pairs.entries()]
    .filter(([, hits]) => [...hits.values()].some((h) => h.severity !== 'A'))
    .map(([k]) => k).sort();
  const checks = sample(withHits, verifySamples, random);
  for (let n = 0; n < verifySamples * 20 && checks.length < verifySamples * 2 && profiles.length > 1; n++) {
    const a = profiles[Math.floor(random() * profiles.length)];
    const b = profiles[Math.floor(random() * profiles.length)];
    const key = a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
    if (a !== b && !collector.pairs.has(key)) checks.push(key);
  }
  const mismatches: string[] = [];
  const tick3 = progress('Janusmed stickprov', checks.length);
  await Promise.all(checks.map(async (key) => {
    const [pa, pb] = key.split('\u0000');
    const single = new InteractionCollector();
    single.addPage(await fetchPage(http, [collector.representative.get(pa)!, collector.representative.get(pb)!]));
    requests++;
    const describe = (c: InteractionCollector) => [...(c.pairs.get(key)?.values() ?? [])]
      .filter((h) => h.severity !== 'A')
      .map((h) => `${h.a}-${h.b}:${h.severity}${h.documentation}`).sort().join(' ');
    const expected = describe(collector);
    const actual = describe(single);
    if (expected !== actual) mismatches.push(`${pa} + ${pb}: insamlat "${expected}", enskild sida "${actual}"`);
    tick3();
  }));
  for (const m of mismatches) log.warn(`Janusmed stickprov avviker: ${m}`);
  for (const combo of collector.unknownAdminCombos) log.warn(`Janusmed: okänd kombination av administrationsvägar ${combo} räknades som träff`);

  return {
    collector,
    stats: {
      products: ids.length,
      unknownToJanusmed: unknown.length,
      profiles: profiles.length,
      requests,
      failedPairs,
      verified: checks.length,
      verifyMismatches: mismatches,
    },
  };
}
