// Janusmed: säker tolkning av sidtillståndet, interaktioner per profil, anropsplan och datafil.
// Fixturerna är riktiga sidor från janusmed.se (behandlingstexter bortklippta).
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { evaluateNuxtPayload, extractNuxtState, NuxtParseError } from '../../../scripts/data/janusmed/nuxt';
import { janusmedUrl, parseJanusPage, parseJanusState } from '../../../scripts/data/janusmed/page';
import { adminMatches, InteractionCollector, profileKey } from '../../../scripts/data/janusmed/collect';
import { chunk, planPairCoverage, sample, seededRandom } from '../../../scripts/data/janusmed/plan';
import { buildInteractionData } from '../../../scripts/data/janusmed/build';
import { validateInteractionData } from '../../../src/lib/interaction-data';
import { collectPage, JANUSMED_PAGE_CAP } from '../../../scripts/data/janusmed/crawl';
import { HttpError, type HttpClient } from '../../../scripts/data/lib/http';

const fixture = (name: string) => readFileSync(`tests/fixtures/pipeline/${name}`, 'utf8');
const FOUR = fixture('janusmed-4-products.html');
const DICLOFENAC = fixture('janusmed-diclofenac-routes.html');

describe('evaluateNuxtPayload — kör aldrig kod från sidan', () => {
  it('utvärderar parametrar, objekt, listor och bokstavliga värden', () => {
    expect(evaluateNuxtPayload('(function(a,b,c){return {x:a,y:[b,c,-1,!0,void 0],"z-z":`t`}}("A",2,null))'))
      .toEqual({ x: 'A', y: [2, null, -1, true, undefined], 'z-z': 't' });
  });
  it.each([
    ['funktionsanrop', '(function(a){return {x:alert(1)}}(1))'],
    ['egenskapsuppslag', '(function(a){return {x:a.constructor}}(1))'],
    ['okänt globalt namn', '(function(a){return {x:process}}(1))'],
    ['operator', '(function(a){return {x:a+1}}(1))'],
    ['flera satser', '(function(a){a.x=1;return {}}(1))'],
    ['getter', '(function(){return {get x(){return 1}}}())'],
    ['beräknad nyckel', '(function(a){return {[a]:1}}("k"))'],
    ['inte ett anrop', '{x:1}'],
  ])('avvisar %s', (_what, src) => {
    expect(() => evaluateNuxtPayload(src)).toThrow(NuxtParseError);
  });
  it('__proto__ kan inte förorena objekt', () => {
    const v = evaluateNuxtPayload('(function(){return {"__proto__":{polluted:1}}}())') as Record<string, unknown>;
    expect(Object.getPrototypeOf(v)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it('sida utan tillstånd', () => {
    expect(() => extractNuxtState('<html></html>')).toThrow(/saknar window.__NUXT__/);
  });
});

describe('parseJanusPage — riktig sida med fyra läkemedel', () => {
  const page = parseJanusPage(FOUR);

  it('produkter med moderssubstans och administrationsväg', () => {
    const byNpl = new Map(page.products.map((p) => [p.nplId, p]));
    expect([...byNpl.keys()].sort()).toEqual(['19921023000083', '20060303000033', '20101218000050', '20141202000055']);
    expect(byNpl.get('20060303000033')!.admin).toBe('Enteral (peroral)');
    for (const p of page.products) expect(p.substanceIds).toHaveLength(1);
  });

  it('de tre interaktionerna som Janusmed visar, med klass', () => {
    const shown = page.interactions
      .map((ix) => `${ix.a.name} - ${ix.b.name} ${ix.groups.map((g) => g.severity + g.documentation).join(',')}`)
      .filter((s) => !/ A\d/.test(s)).sort();
    expect(shown).toEqual(['sertralin - citalopram D0', 'tramadol - citalopram C1', 'tramadol - sertralin C1']);
  });

  it('samma interaktioner som sidans kort (HTML) — tillståndet och det som visas stämmer', () => {
    // Korten finns inte i den bantade fixturen; id:na nedan är avskrivna från den fullständiga sidan.
    const cards = ['sertralin - citalopram-D0', 'tramadol - citalopram-C1', 'tramadol - sertralin-C1'];
    const fromState = page.interactions.filter((ix) => ix.groups.some((g) => g.severity !== 'A'))
      .map((ix) => `${ix.a.name} - ${ix.b.name}-${ix.groups[0].severity}${ix.groups[0].documentation}`).sort();
    expect(fromState).toEqual(cards);
  });

  it('datum för Janusmeds senaste uppdatering', () => {
    expect(page.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('avvisar oväntat format i stället för att tyst ge tom data', () => {
    expect(() => parseJanusState({ state: { search: [] } })).toThrow(/interactions/);
    expect(() => parseJanusState({ state: { search: [{}], interactions: { interactions: [] } } })).toThrow(/nplId/);
    const bad = { state: { search: [], interactions: { interactions: [{ substances: [{ nslId: 'a', name: 'a' }, { nslId: 'b', name: 'b' }], drugFormGroups: [{ sevClassification: 'X', docClassification: '0', substances: [] }] }] } } };
    expect(() => parseJanusState(bad)).toThrow(/Okänd klass/);
  });

  it('adress med alla NPL-id', () => {
    expect(janusmedUrl(['1', '2'])).toBe('https://janusmed.se/interaktioner?nplIds=1&nplIds=2');
  });
});

describe('InteractionCollector — administrationsväg avgör', () => {
  it('diklofenak: interaktionen med warfarin gäller tabletten men inte gelen', () => {
    const page = parseJanusPage(DICLOFENAC);
    const c = new InteractionCollector();
    c.addPage(page);
    const profileOf = (npl: string) => c.productProfile.get(npl)!;
    const tablet = profileOf('20040916002570'), gel = profileOf('20190128000052'), waran = profileOf('19640101000028');
    expect(tablet).not.toBe(gel); // samma substans, olika väg → olika profiler
    const key = (a: string, b: string) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);
    const hits = [...(c.pairs.get(key(tablet, waran))?.values() ?? [])];
    expect(hits.map((h) => h.severity + h.documentation)).toEqual(['D4']);
    expect(c.pairs.has(key(gel, waran))).toBe(false);
    expect(c.unknownAdminCombos.size).toBe(0);
  });

  it('adminMatches', () => {
    expect(adminMatches('Enteral (peroral)', 'Enteral or Parenteral')).toBe(true);
    expect(adminMatches('Parenteral', 'Enteral or Parenteral')).toBe(true);
    expect(adminMatches('Topical', 'Enteral or Parenteral')).toBe(false);
    expect(adminMatches('Topical', 'Topical')).toBe(true);
    expect(adminMatches('Enteral (peroral)', undefined)).toBe(true);
    const unknown = new Set<string>();
    expect(adminMatches('Okänd väg', 'Ny väg', unknown)).toBe(true); // hellre en varning för mycket
    expect([...unknown]).toEqual(['Ny väg ↔ Okänd väg']);
  });

  it('interaktion inom samma produkt räknas inte; allvarligaste klassen behålls', () => {
    const c = new InteractionCollector();
    const prod = (nplId: string, subs: string[]) => ({ nplId, admin: 'Enteral (peroral)', substanceIds: subs, lowDoseIds: [] as string[] });
    const ix = (a: string, b: string, severity: 'B' | 'C' | 'D', documentation: number) => ({
      a: { id: a, name: a }, b: { id: b, name: b }, groups: [{ severity, documentation, admin: {} }],
    });
    c.addPage({ products: [prod('1', ['x', 'y']), prod('2', ['z'])], interactions: [ix('x', 'y', 'D', 0), ix('x', 'z', 'B', 1)], updated: null });
    c.addPage({ products: [prod('1', ['x', 'y']), prod('2', ['z'])], interactions: [ix('x', 'z', 'C', 3)], updated: '2026-09-01' });
    expect(c.pairs.size).toBe(1);
    const [hits] = [...c.pairs.values()];
    expect([...hits.values()]).toEqual([{ a: 'x', b: 'z', severity: 'C', documentation: 3 }]);
    expect(c.janusmedUpdated).toBe('2026-09-01');
  });

  it('en representant per profil: lägsta NPL-id', () => {
    const c = new InteractionCollector();
    c.addProducts([
      { nplId: '3', admin: 'Enteral (peroral)', substanceIds: ['s'], lowDoseIds: [] },
      { nplId: '2', admin: 'Enteral (peroral)', substanceIds: ['s'], lowDoseIds: [] },
      { nplId: '4', admin: 'Parenteral', substanceIds: ['s'], lowDoseIds: [] },
      { nplId: '5', admin: 'Enteral (peroral)', substanceIds: [], lowDoseIds: [] },
      { nplId: '6', admin: 'Parenteral', substanceIds: [], lowDoseIds: ['j'] },
    ]);
    expect(c.representative.get(profileKey({ admin: 'Enteral (peroral)', substanceIds: ['s'] }))).toBe('2');
    expect(c.representative.size).toBe(3);
    expect(c.productProfile.has('5')).toBe(false);
    expect(c.productProfile.get('6')).toBe('Parenteral|'); // känd, men utan interaktioner
  });
});

describe('planPairCoverage — varje par kontrolleras', () => {
  it('täcker alla par, oavsett antal och blockstorlek', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 60 }), fc.integer({ min: 1, max: 20 }), (n, size) => {
      const items = Array.from({ length: n }, (_, i) => i);
      const requests = planPairCoverage(items, size);
      const covered = new Set<string>();
      for (const r of requests) {
        expect(r.length).toBeLessThanOrEqual(2 * size);
        for (const a of r) for (const b of r) if (a < b) covered.add(`${a}|${b}`);
      }
      expect(covered.size).toBe(n < 2 ? 0 : (n * (n - 1)) / 2);
    }), { numRuns: 300 });
  });
  it('antal anrop: block·(block−1)/2', () => {
    expect(planPairCoverage(Array.from({ length: 1376 }, (_, i) => i), 75)).toHaveLength(171);
    expect(planPairCoverage([1, 2, 3], 100)).toEqual([[1, 2, 3]]);
    expect(planPairCoverage([1], 100)).toEqual([]);
  });
  it('chunk och deterministiskt stickprov', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(sample([1, 2, 3, 4, 5], 3, seededRandom(1))).toEqual(sample([1, 2, 3, 4, 5], 3, seededRandom(1)));
  });
});

describe('buildInteractionData', () => {
  it('riktig sida → giltig, deterministisk datafil utan A-interaktioner', () => {
    const c = new InteractionCollector();
    c.addPage(parseJanusPage(FOUR));
    const npl = ['19921023000083', '20060303000033', '20101218000050', '20141202000055'];
    const data = buildInteractionData(c, npl);
    expect(validateInteractionData(data)).toEqual([]);
    expect(Object.keys(data.products).sort()).toEqual(npl);
    const shown = data.interactions.map(([, , a, b, cls]) => [data.substances[a], data.substances[b]].sort().join('+') + ' ' + cls).sort();
    expect(shown).toEqual(['citalopram+sertralin D0', 'citalopram+tramadol C1', 'sertralin+tramadol C1']);
    // Samma indata i annan ordning ger exakt samma fil.
    const c2 = new InteractionCollector();
    c2.addPage(parseJanusPage(FOUR));
    expect(JSON.stringify(buildInteractionData(c2, [...npl].reverse()))).toBe(JSON.stringify(data));
  });

  it('produkter utanför listan tas inte med', () => {
    const c = new InteractionCollector();
    c.addPage(parseJanusPage(FOUR));
    const data = buildInteractionData(c, ['20060303000033', '19921023000083']);
    expect(data.profiles).toBe(2);
    expect(data.interactions).toHaveLength(1);
  });
});

describe('validateInteractionData', () => {
  const base = { format: 1, janusmedUpdated: null, substances: ['a', 'b'], profiles: 2, products: { '20000101000011': 0 }, interactions: [[0, 1, 0, 1, 'D0']] };
  it('godkänner giltig data', () => expect(validateInteractionData(base)).toEqual([]));
  it.each([
    ['fel format', { ...base, format: 2 }],
    ['profil utanför', { ...base, products: { '20000101000011': 5 } }],
    ['ogiltigt NPL-id', { ...base, products: { '123': 0 } }],
    ['fel ordning på profiler', { ...base, interactions: [[1, 0, 0, 1, 'D0']] }],
    ['klass A', { ...base, interactions: [[0, 1, 0, 1, 'A0']] }],
    ['substans utanför', { ...base, interactions: [[0, 1, 0, 9, 'D0']] }],
    ['dubblett', { ...base, interactions: [[0, 1, 0, 1, 'D0'], [0, 1, 0, 1, 'C0']] }],
  ])('underkänner %s', (_what, data) => expect(validateInteractionData(data).length).toBeGreaterThan(0));
});

// ── Syntetiska sidor för gränsfall som inte syns i fixturerna ─────────────────

/** Bygger en Janusmed-liknande sida (window.__NUXT__) av vanliga objekt. */
function nuxtPage(state: unknown): string {
  return `<script>window.__NUXT__=(function(){return ${JSON.stringify({ state })}}());</script>`;
}
const sub = (id: string, low = false) => ({ nslId: id, name: id, isTopParent: true, topParent: id, lowDosageFlag: low });
const product = (nplId: string, subs: ReturnType<typeof sub>[]) => ({ nplId, drugForm: { administration: 'Enteral (peroral)' }, substances: subs });
const ixRow = (a: string, b: string) => ({
  substances: [{ nslId: a, name: a }, { nslId: b, name: b }],
  drugFormGroups: [{ sevClassification: 'D', docClassification: '0', substances: [] }],
});

describe('lågdossubstanser (t.ex. spårämnen i näringslösningar)', () => {
  it('ingår inte i profilen och får inga interaktioner', () => {
    const page = parseJanusState({ state: {
      search: [product('1', [sub('jod', true), sub('glukos')]), product('2', [sub('jod')])],
      interactions: { interactions: [] },
    } });
    expect(page.products[0]).toMatchObject({ substanceIds: ['glukos'], lowDoseIds: ['jod'] });
    expect(page.products[1]).toMatchObject({ substanceIds: ['jod'], lowDoseIds: [] });
  });
});

describe('collectPage — sidor som blir för stora', () => {
  /** Falsk Janusmed: en interaktion per par av produkter; kapar vid `cap`, serverfel över `maxIds`. */
  function fakeJanusmed(cap: number, maxIds = Infinity) {
    let requests = 0;
    const http: HttpClient = {
      stats: { requests: 0, retries: 0, failures: 0, bytes: 0 },
      async getText(url: string) {
        requests++;
        const ids = new URL(url).searchParams.getAll('nplIds');
        if (ids.length > maxIds) throw new HttpError(url, 500);
        const rows = [];
        for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) rows.push(ixRow(`s${ids[i]}`, `s${ids[j]}`));
        return nuxtPage({ search: ids.map((id) => product(id, [sub(`s${id}`)])), interactions: { interactions: rows.slice(0, cap) } });
      },
    };
    return { http, count: () => requests };
  }
  const ids = Array.from({ length: 30 }, (_, i) => String(i + 10));

  it('taket på 1000 interaktioner gäller Janusmed', () => expect(JANUSMED_PAGE_CAP).toBe(1000));

  it('en sida som når taket delas tills alla par är med', async () => {
    const big = Array.from({ length: 50 }, (_, i) => String(i + 100)); // 1225 par > 1000
    const fake = fakeJanusmed(JANUSMED_PAGE_CAP);
    const c = new InteractionCollector();
    const r = await collectPage(fake.http, c, big);
    expect(c.pairs.size).toBe((50 * 49) / 2);
    expect(r.requests).toBeGreaterThan(1);
    expect(r.failedPairs).toBe(0);
  });

  it('serverfel för stora sidor delas också', async () => {
    const fake = fakeJanusmed(JANUSMED_PAGE_CAP, 12);
    const c = new InteractionCollector();
    const r = await collectPage(fake.http, c, ids);
    expect(c.pairs.size).toBe((30 * 29) / 2);
    expect(r.failedPairs).toBe(0);
  });

  it('andra fel avbryter i stället för att tyst ge ofullständig data', async () => {
    const http: HttpClient = { stats: { requests: 0, retries: 0, failures: 0, bytes: 0 }, getText: async (u) => { throw new HttpError(u, 403); } };
    await expect(collectPage(http, new InteractionCollector(), ids)).rejects.toMatchObject({ status: 403 });
  });
});
