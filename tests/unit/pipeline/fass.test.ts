// FASS: sitemap, produktsida, beredningsform och läkemedelslistan.
// Fixturerna är riktiga sidor från fass.se (långa texter bortklippta).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { classifyDoseForm, displayForm } from '../../../scripts/data/fass/dose-form';
import { extractFlightData, parseFlightRows, parseProductPage, parseSitemap, resolveFlightRef, type FassProductHeader } from '../../../scripts/data/fass/page';
import { buildDrugEntries, groupLabel, toProduct, type Product } from '../../../scripts/data/fass/products';
import { validateDrugEntries } from '../../../src/lib/drug-data';

const fixture = (name: string) => readFileSync(`tests/fixtures/pipeline/${name}`, 'utf8');

describe('parseSitemap', () => {
  it('läser NPL-id ur FASS sitemap', () => {
    expect(parseSitemap(fixture('fass-sitemap.xml'))).toEqual(['20210326000095', '20250114000074', '20250117000026']);
  });
  it('ignorerar andra adresser och ogiltiga id', () => {
    const xml = '<loc>https://fass.se/health/product/123</loc><loc>https://fass.se/health/atc/N06</loc>'
      + '<loc>https://fass.se/product/20060303000033</loc><loc>https://fass.se/health/product/20060303000033</loc>';
    expect(parseSitemap(xml)).toEqual(['20060303000033']);
  });
});

describe('parseProductPage', () => {
  it('hittar produkthuvudet även när raden är delad över flera push-anrop', () => {
    const html = fixture('fass-product-20060303000033.html');
    expect(html.match(/__next_f\.push/g)).toHaveLength(3);
    const h = parseProductPage(html)!;
    expect(h.productInformation).toMatchObject({
      nplId: '20060303000033', tradeName: 'Oralin', atcCode: 'N06AB06',
      doseForm: 'Filmdragerad tablett', strength: '50 mg', narcoticClassEnum: 'NO_NARCOTICS_CLASS',
    });
    expect(h.packages!.length).toBeGreaterThan(0);
  });

  it('produkthuvudet som referens till en annan rad (FASS andra format): Concerta 54 mg', () => {
    // Den gamla hämtningen missade det här formatet, så produkten saknades i listan.
    const h = parseProductPage(fixture('fass-product-20021101000335-ref.html'))!;
    expect(h.productInformation).toMatchObject({ nplId: '20021101000335', tradeName: 'Concerta®', strength: '54 mg', atcCode: 'N06BA04' });
    expect(toProduct(h)).toMatchObject({ tradeName: 'Concerta', narcoticClass: 'II', unit: 'st' });
  });

  it('textrader (T) läses med exakt bytelängd, även med å, ä och ö och utan radbrytning efter', () => {
    const text = 'Åäö: "x"';
    const flight = `1:T${Buffer.byteLength(text).toString(16)},${text}2:{"a":1}\n3:I[1,[],""]\n4:"$2:a"\n`;
    const rows = parseFlightRows(flight);
    expect(rows.get('1')).toBe(text);
    expect(rows.get('2')).toEqual({ a: 1 });
    expect(rows.has('3')).toBe(false);
    expect(resolveFlightRef(rows.get('4') as string, rows)).toBe(1);
  });

  it('referenser genom React-element följer props', () => {
    const rows = new Map<string, unknown>([['2a', ['$', 'div', null, { children: [['$', 'x', null, { data: 42 }]] }]]]);
    expect(resolveFlightRef('$2a:props:children:0:props:data', rows)).toBe(42);
    expect(resolveFlightRef('$99:props', rows)).toBeUndefined();
    expect(resolveFlightRef('$undefined', rows)).toBeUndefined();
  });

  it('sätter ihop bitarna i ordning med korrekt avkodning', () => {
    const html = '<script>self.__next_f.push([1,"a:\\"x"])</script><script>self.__next_f.push([1,"y\\"\\nb:1\\n"])</script>';
    expect(extractFlightData(html)).toBe('a:"xy"\nb:1\n');
  });

  it('null för sidor utan produktdata', () => {
    expect(parseProductPage('<html><body>Sidan finns inte</body></html>')).toBeNull();
    expect(parseProductPage('<script>self.__next_f.push([1,"1:{\\"productHeader\\":trasig"])</script>')).toBeNull();
  });
});

describe('toProduct', () => {
  it('riktig produkt: Oralin 50 mg', () => {
    const p = toProduct(parseProductPage(fixture('fass-product-20060303000033.html'))!)!;
    expect(p).toMatchObject({
      nplId: '20060303000033', tradeName: 'Oralin', atcCode: 'N06AB06', strength: '50 mg',
      narcoticClass: null, unit: 'st', notCalculable: false,
    });
    expect(p.packageSizes.every((n, i, a) => n > 0 && (i === 0 || n > a[i - 1]))).toBe(true);
  });

  const header = (over: Partial<NonNullable<FassProductHeader['productInformation']>> = {}, packages: FassProductHeader['packages'] = [
    { quantity: 30, isOnTheMarket: true }, { quantity: 100, isOnTheMarket: true },
  ]): FassProductHeader => ({
    productInformation: { nplId: '20000101000011', tradeName: 'Test®', atcCode: 'N02BE01', doseForm: 'Tablett', strength: '500 mg', ...over },
    packages,
  });

  it('tar bort ® och narkotikaklassens prefix', () => {
    expect(toProduct(header({ narcoticClassEnum: 'CLASS_II' }))).toMatchObject({ tradeName: 'Test', narcoticClass: 'II' });
  });
  it('bara förpackningar som marknadsförs, unika och sorterade', () => {
    const p = toProduct(header({}, [
      { quantity: 100, isOnTheMarket: true }, { quantity: 30, isOnTheMarket: true },
      { quantity: 30, isOnTheMarket: true, parallelDistributingOrganizationName: 'X' }, { quantity: 50, isOnTheMarket: false },
    ]))!;
    expect(p.packageSizes).toEqual([30, 100]);
  });
  it('null utan förpackning på marknaden, utan ATC, utan namn eller för djur', () => {
    expect(toProduct(header({}, [{ quantity: 30, isOnTheMarket: false }]))).toBeNull();
    expect(toProduct(header({ atcCode: null }))).toBeNull();
    expect(toProduct(header({ atcCode: 'QN02BE01' }))).toBeNull();
    expect(toProduct(header({ tradeName: ' ® ' }))).toBeNull();
    expect(toProduct(header({ applicableFor: 'ANIMAL' }))).toBeNull();
  });
});

describe('classifyDoseForm (samma regler som 4.0)', () => {
  it.each([
    ['Filmdragerad tablett', '50 mg', 'st', false],
    ['Kapsel, hård', '', 'st', false],
    ['Depotplåster', '', 'st', false],
    ['Kräm', '', null, true],
    ['Gel', '', null, true],
    ['Ögongel', '', 'dos', false],
    ['Granulat', '', null, true],
    ['Oral lösning', '1 mg/ml', 'ml', false],
    ['Tablett', '10 mg/g', null, true],
    ['Inhalationspulver', '', 'dos', false],
    ['Nässpray, lösning', '', 'dos', false],
    ['Kutan spray, lösning', '', 'ml', false],
    ['Ögondroppar, lösning', '', 'dos', false],
    ['Orala droppar, lösning', '', 'ml', false],
    ['Injektionsvätska, lösning', '', 'ml', false],
    ['Injektionsvätska, lösning i förfylld spruta', '', 'dos', false],
    ['Pulver till oral suspension', '', 'ml', false],
    ['Munhålepasta', '', null, true],
    ['Tablett', '100 mikrog/dos', 'dos', false],
    ['', '', 'st', false],
  ])('%s %s → %s', (form, strength, unit, notCalc) => {
    expect(classifyDoseForm(form, strength)).toEqual({ unit, notCalculable: notCalc });
  });
});

describe('displayForm (samma regler som 4.0)', () => {
  it.each([
    ['Filmdragerad tablett', 'Tablett'],
    ['Depottablett', 'Depottablett'],
    ['Kapsel, hård', 'Kapsel'],
    ['Kapsel, mjuk', 'Mjuk kapsel'],
    ['Enterokapsel, hård', 'Enterokapsel'],
    ['Munsönderfallande tablett', 'Munsönderfallande'],
    ['Oral lösning', 'Oral lösning'],
    ['Pulver till injektions-/infusionsvätska, lösning', 'Injektionsvätska'],
    ['Infusionsvätska, lösning', 'Infusionsvätska'],
    ['Injektionsvätska, lösning i förfylld injektionspenna', 'Injektionspenna'],
    ['Ögondroppar, lösning', 'Ögondroppar'],
    ['Kräm', 'Kräm'],
    ['Munhålelösning', 'Munhålelösning'],
    ['', 'Tablett'],
  ])('%s → %s', (form, expected) => expect(displayForm(form)).toBe(expected));
});

describe('buildDrugEntries', () => {
  const product = (over: Partial<Product>): Product => ({
    nplId: '20000101000011', tradeName: 'Alfa', atcCode: 'N02BE01', doseForm: 'Tablett', strength: '500 mg',
    narcoticClass: null, unit: 'st', notCalculable: false, packageSizes: [20, 100], ...over,
  });

  it('en post per förpackningsstorlek, med kompakta fält', () => {
    expect(buildDrugEntries([product({})])).toEqual([
      { n: 'Alfa 500 mg', p: 20, f: 'Tablett', i: '20000101000011', a: 'N02BE01' },
      { n: 'Alfa 500 mg', p: 100, f: 'Tablett', i: '20000101000011', a: 'N02BE01' },
    ]);
  });
  it('enhet, beräkningsbarhet och narkotikaklass anges bara när de avviker', () => {
    const [e] = buildDrugEntries([product({ unit: 'ml', notCalculable: true, narcoticClass: 'II', packageSizes: [5] })]);
    expect(e).toMatchObject({ u: 'ml', c: true, r: 'II' });
  });
  it('hoppar över förpackningar med 1 enhet och dubbletter av namn/storlek/form', () => {
    const out = buildDrugEntries([
      product({ packageSizes: [1, 30] }),
      product({ nplId: '20000101000028', packageSizes: [30] }), // parallellimport med samma namn
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].i).toBe('20000101000011');
  });
  it('deterministisk: samma produkter i annan ordning ger samma lista', () => {
    const ps = [
      product({ nplId: '20000101000011', tradeName: 'Beta', atcCode: 'C09AA02' }),
      product({ nplId: '20000101000028', tradeName: 'Alfa', atcCode: 'N06AB06' }),
      product({ nplId: '20000101000035', tradeName: 'Ärta', atcCode: 'N06AB06' }),
      product({ nplId: '20000101000042', tradeName: 'Zeta', atcCode: 'N06AB06' }),
    ];
    const a = buildDrugEntries(ps);
    expect(buildDrugEntries([...ps].reverse())).toEqual(a);
    // Sorteras på grupp ("ACE-hämmare" före "Antidepressiva"), sedan namn i svensk ordning (Ä efter Z).
    expect(a.map((e) => e.n.split(' ')[0])).toEqual(['Beta', 'Beta', 'Alfa', 'Alfa', 'Zeta', 'Zeta', 'Ärta', 'Ärta']);
    expect(validateDrugEntries(a)).toEqual([]);
  });
  it('grupperna för sortering', () => {
    expect(groupLabel('N06AB06')).toBe('Antidepressiva (SSRI/SNRI/TCA/övriga)');
    expect(groupLabel('C09DA04')).toBe('ACE-hämmare / ARB');
    expect(groupLabel('V03AB15')).toBe('V03');
  });
});
