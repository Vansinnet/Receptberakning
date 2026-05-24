import { describe, it, expect, beforeAll } from 'vitest';
import { atcMatches, CHECK_INTERACTIONS, loadInteractions } from '../../src/lib/interactions';

beforeAll(async () => {
  await loadInteractions();
});

// =====================================================
// atcMatches — prefix-matchning
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

  it('ATC-kod matchar sin 5-char ATC5-grupp', () => {
    expect(atcMatches('A10BA02', 'A10BA')).toBe(true);
  });

  it('ATC-kod matchar sin 4-char ATC-grupp', () => {
    expect(atcMatches('C09AA02', 'C09A')).toBe(true);
  });
});

// =====================================================
// CHECK_INTERACTIONS — tomma / ogiltiga indata
// =====================================================

describe('CHECK_INTERACTIONS — tomma indata', () => {
  it('tom array → tomt resultat', () => {
    const result = CHECK_INTERACTIONS([]);
    expect(result).toEqual([]);
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
// CHECK_INTERACTIONS — matchning
// =====================================================

describe('CHECK_INTERACTIONS — matchning', () => {
  it('dubbelriktad: ordning spelar ingen roll', () => {
    const r1 = CHECK_INTERACTIONS([
      { i: '0', a: 'C09AA02' },
      { i: '1', a: 'C03DA01' },
    ]);
    const r2 = CHECK_INTERACTIONS([
      { i: '0', a: 'C03DA01' },
      { i: '1', a: 'C09AA02' },
    ]);
    expect(r1.length).toBeGreaterThanOrEqual(1);
    expect(r1.length).toBe(r2.length);
  });

  it('två identiska ATC-koder → ingen självinteraktion', () => {
    const result = CHECK_INTERACTIONS([
      { i: 'a', a: 'N05AN01' },
      { i: 'b', a: 'N05AN01' },
    ]);
    expect(result.length).toBe(0);
  });

  it('paracetamol + kalcium → ingen förväntad varning', () => {
    const result = CHECK_INTERACTIONS([
      { i: '0', a: 'N02BE01' },
      { i: '1', a: 'A12AA04' },
    ]);
    expect(result.length).toBe(0);
  });
});

// =====================================================
// CHECK_INTERACTIONS — output-struktur
// =====================================================

describe('CHECK_INTERACTIONS — output-struktur', () => {
  it('varningsobjekt har korrekt struktur', () => {
    const result = CHECK_INTERACTIONS([
      { i: '0', a: 'C09AA02' },
      { i: '1', a: 'C03DA01' },
    ]);
    expect(result.length).toBeGreaterThanOrEqual(1);
    const w = result[0];
    expect(w).toBeDefined();
    expect(['danger', 'warn']).toContain(w.severity);
    expect(typeof w.title).toBe('string');
    expect(w.title.length).toBeGreaterThan(0);
    expect(typeof w.description).toBe('string');
    expect(typeof w.recommendation).toBe('string');
    expect(Array.isArray(w.drugs)).toBe(true);
    expect(w.drugs.length).toBe(2);
    expect(w.drugs[0]).toBe('0');
    expect(w.drugs[1]).toBe('1');
  });
});

// =====================================================
// CHECK_INTERACTIONS — deduplicering
// =====================================================

describe('CHECK_INTERACTIONS — deduplicering', () => {
  it('samma titel + olika läkemedelspar → två separata varningar', () => {
    const result = CHECK_INTERACTIONS([
      { i: '0', a: 'C09AA02' },
      { i: '1', a: 'M01AE01' },
      { i: '2', a: 'N02BA01' },
    ]);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });
});

// =====================================================
// CHECK_INTERACTIONS — kliniskt verifierade interaktioner
// Verifierar att ATC5-scrapad Janusmed-data täcker kända interaktioner.
// Om någon fallerar: Janusmed saknar data för just det paret.
// =====================================================

describe('CHECK_INTERACTIONS — kliniskt verifierade', () => {
  it('ACE-hämmare + kaliumsparande diuretika → interaktion finns', () => {
    const result = CHECK_INTERACTIONS([
      { i: '0', a: 'C09AA02' },
      { i: '1', a: 'C03DA01' },
    ]);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('warfarin + NSAID → interaktion finns', () => {
    const result = CHECK_INTERACTIONS([
      { i: '0', a: 'B01AA03' },
      { i: '1', a: 'M01AE01' },
    ]);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('SSRI + MAO-hämmare → interaktion finns', () => {
    const result = CHECK_INTERACTIONS([
      { i: '0', a: 'N06AB04' },
      { i: '1', a: 'N06AF05' },
    ]);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('tramadol + SSRI → serotonerg interaktion finns', () => {
    const result = CHECK_INTERACTIONS([
      { i: '0', a: 'N02AX02' },
      { i: '1', a: 'N06AB04' },
    ]);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('litium + NSAID → interaktion finns', () => {
    const result = CHECK_INTERACTIONS([
      { i: '0', a: 'N05AN01' },
      { i: '1', a: 'M01AE01' },
    ]);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});
