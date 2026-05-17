import { describe, it, expect } from 'vitest';
import { atcMatches, CHECK_INTERACTIONS } from '../../src/lib/interactions';

// =====================================================
// atcMatches
// =====================================================

describe('atcMatches', () => {
  it('exakt prefix-match (N06AB04 startswith N06AB)', () => {
    expect(atcMatches('N06AB04', 'N06AB')).toBe(true);
  });

  it('ingen match (N06AX börjar inte med N06AB)', () => {
    expect(atcMatches('N06AX16', 'N06AB')).toBe(false);
  });

  it('null ATC returnerar false', () => {
    expect(atcMatches(null, 'N06AB')).toBe(false);
  });

  it('undefined ATC returnerar false', () => {
    expect(atcMatches(undefined, 'N06AB')).toBe(false);
  });

  it('hela ATC-koden matchar sig själv', () => {
    expect(atcMatches('B01AA03', 'B01AA03')).toBe(true);
  });
});

// =====================================================
// CHECK_INTERACTIONS — tomma indata
// =====================================================

describe('CHECK_INTERACTIONS — tomma indata', () => {
  it('tom array → tomt resultat', () => {
    const result = CHECK_INTERACTIONS([]);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it('ett läkemedel → tomt (inget par att kontrollera)', () => {
    const result = CHECK_INTERACTIONS([{ i: '0', a: 'N06AB04' }]);
    expect(result.length).toBe(0);
  });

  it('två läkemedel utan ATC → tomt', () => {
    const result = CHECK_INTERACTIONS([{ i: '0', a: '' }, { i: '1', a: '' }]);
    expect(result.length).toBe(0);
  });

  it('ett med ATC, ett utan → tomt', () => {
    const result = CHECK_INTERACTIONS([{ i: '0', a: 'N06AB04' }, { i: '1', a: '' }]);
    expect(result.length).toBe(0);
  });
});

// =====================================================
// CHECK_INTERACTIONS — kända interaktioner
// =====================================================

describe('CHECK_INTERACTIONS — kända interaktioner', () => {
  it('SSRI + MAO-hämmare → danger', () => {
    const result = CHECK_INTERACTIONS([
      { i: '0', a: 'N06AB04' },
      { i: '1', a: 'N06AF05' },
    ]);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].s).toBe('danger');
    expect(result[0].drugs[0]).toBe('0');
    expect(result[0].drugs[1]).toBe('1');
  });

  it('warfarin + NSAID → danger', () => {
    const result = CHECK_INTERACTIONS([
      { i: '0', a: 'B01AA03' },
      { i: '1', a: 'M01AE01' },
    ]);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].s).toBe('danger');
  });

  it('ACE-hämmare + kaliumsparande diuretika → danger', () => {
    const result = CHECK_INTERACTIONS([
      { i: '0', a: 'C09AA02' },
      { i: '1', a: 'C03DA01' },
    ]);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].s).toBe('danger');
  });

  it('paracetamol + kalcium → ingen varning', () => {
    const result = CHECK_INTERACTIONS([
      { i: '0', a: 'N02BE01' },
      { i: '1', a: 'A12AA04' },
    ]);
    expect(result.length).toBe(0);
  });

  it('dubbelriktad matchning (ordning spelar ingen roll)', () => {
    const r1 = CHECK_INTERACTIONS([
      { i: '0', a: 'N06AB04' },
      { i: '1', a: 'N02AX02' },
    ]);
    const r2 = CHECK_INTERACTIONS([
      { i: '0', a: 'N02AX02' },
      { i: '1', a: 'N06AB04' },
    ]);
    expect(r1.length).toBeGreaterThanOrEqual(1);
    expect(r2.length).toBeGreaterThanOrEqual(1);
    expect(r1[0].t).toBe(r2[0].t);
  });

  it('prefix-matchning (ATC-kod startswith mönster)', () => {
    const result = CHECK_INTERACTIONS([
      { i: '0', a: 'N06AB10' },
      { i: '1', a: 'N02AX02' },
    ]);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});

// =====================================================
// Tier 1 — nya interaktioner
// =====================================================

describe('Tier 1 — nya interaktioner', () => {
  it('NSAID + SSRI → ökad blödningsrisk', () => {
    const result = CHECK_INTERACTIONS([
      { i: '0', a: 'M01AE01' },
      { i: '1', a: 'N06AB04' },
    ]);
    const found = result.some(w => w.t === 'Ökad blödningsrisk' && w.s === 'warn');
    expect(found).toBe(true);
  });

  it('warfarin + metronidazol → danger', () => {
    const result = CHECK_INTERACTIONS([
      { i: '0', a: 'B01AA03' },
      { i: '1', a: 'J01XD01' },
    ]);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].s).toBe('danger');
  });

  it('warfarin + flukonazol → danger', () => {
    const result = CHECK_INTERACTIONS([
      { i: '0', a: 'B01AA03' },
      { i: '1', a: 'J02AC01' },
    ]);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].s).toBe('danger');
  });

  it('warfarin + ciprofloxacin → danger', () => {
    const result = CHECK_INTERACTIONS([
      { i: '0', a: 'B01AA03' },
      { i: '1', a: 'J01MA02' },
    ]);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].s).toBe('danger');
  });

  it('metotrexat + penicillin → danger', () => {
    const result = CHECK_INTERACTIONS([
      { i: '0', a: 'L04AX03' },
      { i: '1', a: 'J01CE02' },
    ]);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].s).toBe('danger');
    expect(result[0].t).toBe('Ökad metotrexattoxicitet');
  });

  it('simvastatin + amlodipin → warn', () => {
    const result = CHECK_INTERACTIONS([
      { i: '0', a: 'C10AA01' },
      { i: '1', a: 'C08CA01' },
    ]);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].s).toBe('warn');
    expect(result[0].t.indexOf('statinkoncentration')).toBeGreaterThanOrEqual(0);
  });

  it('NSAID + ACE-hämmare → warn', () => {
    const result = CHECK_INTERACTIONS([
      { i: '0', a: 'M01AE01' },
      { i: '1', a: 'C09AA02' },
    ]);
    const found = result.some(w => w.t === 'Minskad antihypertensiv effekt och njurpåverkan' && w.drugs[0] === '0' && w.drugs[1] === '1');
    expect(found).toBe(true);
  });

  it('NSAID + ARB → warn', () => {
    const result = CHECK_INTERACTIONS([
      { i: '0', a: 'M01AE01' },
      { i: '1', a: 'C09CA01' },
    ]);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].s).toBe('warn');
  });

  it('NSAID + tiazid → warn', () => {
    const result = CHECK_INTERACTIONS([
      { i: '0', a: 'M01AE01' },
      { i: '1', a: 'C03AA03' },
    ]);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].s).toBe('warn');
  });

  it('NSAID + loopdiuretika → warn', () => {
    const result = CHECK_INTERACTIONS([
      { i: '0', a: 'M01AE01' },
      { i: '1', a: 'C03CA01' },
    ]);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].s).toBe('warn');
  });

  it('fluorokinoloner + NSAID → warn (kramptröskel)', () => {
    const result = CHECK_INTERACTIONS([
      { i: '0', a: 'J01MA12' },
      { i: '1', a: 'M01AE01' },
    ]);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].s).toBe('warn');
    expect(result[0].t.indexOf('kramptröskel')).toBeGreaterThanOrEqual(0);
  });
});

// =====================================================
// FAS 1–3 — kliniskt viktiga interaktioner
// =====================================================

describe('FAS 1–3 — kliniskt viktiga interaktioner', () => {
  it('karbamazepin + warfarin → danger (minskad warfarineffekt)', () => {
    const result = CHECK_INTERACTIONS([
      { i: '0', a: 'N03AF01' },
      { i: '1', a: 'B01AA03' },
    ]);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].s).toBe('danger');
    expect(result[0].t.indexOf('warfarin')).toBeGreaterThanOrEqual(0);
  });

  it('karbamazepin + DOAC (rivaroxaban) → danger', () => {
    const result = CHECK_INTERACTIONS([
      { i: '0', a: 'N03AF01' },
      { i: '1', a: 'B01AF01' },
    ]);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].s).toBe('danger');
    expect(result[0].t.indexOf('DOAC')).toBeGreaterThanOrEqual(0);
  });

  it('amiodaron + betablockerare → danger (bradykardi/AV-block)', () => {
    const result = CHECK_INTERACTIONS([
      { i: '0', a: 'C01BD01' },
      { i: '1', a: 'C07AA05' },
    ]);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].s).toBe('danger');
  });

  it('amiodaron + simvastatin → danger (rabdomyolysrisk)', () => {
    const result = CHECK_INTERACTIONS([
      { i: '0', a: 'C01BD01' },
      { i: '1', a: 'C10AA01' },
    ]);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].s).toBe('danger');
    expect(result[0].t.indexOf('rabdomyolys')).toBeGreaterThanOrEqual(0);
  });

  it('metformin + jodkontrast → danger (laktatacidos)', () => {
    const result = CHECK_INTERACTIONS([
      { i: '0', a: 'A10BA02' },
      { i: '1', a: 'V08AB02' },
    ]);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].s).toBe('danger');
    expect(result[0].t.indexOf('laktatacidos')).toBeGreaterThanOrEqual(0);
  });

  it('valproat + karbapenem (meropenem) → danger (recidivrisk)', () => {
    const result = CHECK_INTERACTIONS([
      { i: '0', a: 'N03AG01' },
      { i: '1', a: 'J01DH02' },
    ]);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].s).toBe('danger');
    expect(result[0].t.indexOf('recidiv')).toBeGreaterThanOrEqual(0);
  });

  it('makrolider (klaritromycin) + warfarin → danger (INR-stegring)', () => {
    const result = CHECK_INTERACTIONS([
      { i: '0', a: 'J01FA09' },
      { i: '1', a: 'B01AA03' },
    ]);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].s).toBe('danger');
    expect(result[0].t.indexOf('INR')).toBeGreaterThanOrEqual(0);
  });

  it('klopidogrel + omeprazol → warn (minskad effekt)', () => {
    const result = CHECK_INTERACTIONS([
      { i: '0', a: 'B01AC04' },
      { i: '1', a: 'A02BC01' },
    ]);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].s).toBe('warn');
    expect(result[0].t.indexOf('klopidogrel')).toBeGreaterThanOrEqual(0);
  });

  it('litium + NSAID → danger (intoxikationsrisk)', () => {
    const result = CHECK_INTERACTIONS([
      { i: '0', a: 'N05AN01' },
      { i: '1', a: 'M01AE01' },
    ]);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].s).toBe('danger');
    expect(result[0].t.indexOf('litium')).toBeGreaterThanOrEqual(0);
  });

  it('tamoxifen + paroxetin → danger (recidivrisk bröstcancer)', () => {
    const result = CHECK_INTERACTIONS([
      { i: '0', a: 'L02BA01' },
      { i: '1', a: 'N06AB05' },
    ]);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].s).toBe('danger');
    expect(result[0].t.indexOf('tamoxifen')).toBeGreaterThanOrEqual(0);
  });
});

// =====================================================
// Deduplicering
// =====================================================

describe('Deduplicering', () => {
  it('samma titel + samma läkemedelspar → endast en varning', () => {
    const result = CHECK_INTERACTIONS([
      { i: '0', a: 'B01AA03' },
      { i: '1', a: 'M01AE01' },
    ]);
    expect(result.length).toBe(1);
  });

  it('samma titel + olika läkemedelspar → två separata varningar', () => {
    const result = CHECK_INTERACTIONS([
      { i: '0', a: 'C09AA02' },
      { i: '1', a: 'M01AE01' },
      { i: '2', a: 'N02BA01' },
    ]);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('ingen duplicering när ATC-koder byter plats', () => {
    const result = CHECK_INTERACTIONS([
      { i: '0', a: 'N06AB04' },
      { i: '1', a: 'N06AF05' },
    ]);
    expect(result.length).toBe(1);
  });
});

// =====================================================
// Output-struktur
// =====================================================

describe('Output-struktur', () => {
  it('varningsobjekt innehåller alla fält (s, t, d, r, drugs)', () => {
    const result = CHECK_INTERACTIONS([
      { i: '0', a: 'N06AB04' },
      { i: '1', a: 'N06AF05' },
    ]);
    const w = result[0];
    expect(typeof w.s).toBe('string');
    expect(typeof w.t).toBe('string');
    expect(typeof w.d).toBe('string');
    expect(typeof w.r).toBe('string');
    expect(Array.isArray(w.drugs)).toBe(true);
    expect(w.drugs.length).toBe(2);
    expect(typeof w.drugs[0]).toBe('string');
    expect(typeof w.drugs[1]).toBe('string');
  });

  it('tre läkemedel med flera interaktioner → flera varningar', () => {
    const result = CHECK_INTERACTIONS([
      { i: '0', a: 'B01AA03' },
      { i: '1', a: 'M01AE01' },
      { i: '2', a: 'N06AB04' },
    ]);
    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it('första läkemedlet saknar ATC → hoppar över det paret', () => {
    const result = CHECK_INTERACTIONS([
      { i: '0', a: '' },
      { i: '1', a: 'N06AB04' },
      { i: '2', a: 'N06AF05' },
    ]);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});
