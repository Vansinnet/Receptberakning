// Krympningsspärren: stoppar publicering om något nyckeltal minskar med 20 % eller mer.
import { describe, it, expect } from 'vitest';
import { checkShrink, drugMetrics, formatGuardTable, interactionMetrics, MAX_SHRINK } from '../../../scripts/data/guard';
import { jsonLines } from '../../../scripts/data/lib/files';

describe('checkShrink', () => {
  it('tillåter tillväxt och små minskningar', () => {
    expect(checkShrink({ a: 100, b: 100 }, { a: 250, b: 81 }).ok).toBe(true);
  });
  it('spärrar vid exakt 20 % minskning och mer', () => {
    expect(MAX_SHRINK).toBe(0.2);
    const r = checkShrink({ a: 100, b: 100 }, { a: 80, b: 100 });
    expect(r.ok).toBe(false);
    expect(r.metrics.find((m) => m.name === 'a')).toMatchObject({ blocked: true, change: -0.2 });
    expect(checkShrink({ a: 100 }, { a: 81 }).ok).toBe(true);
  });
  it('spärrar när en källa plötsligt ger nästan ingenting', () => {
    expect(checkShrink({ a: 8000 }, { a: 12 }).ok).toBe(false);
  });
  it('första körningen (ingen tidigare data) spärras aldrig', () => {
    expect(checkShrink(null, { a: 1 }).ok).toBe(true);
  });
  it('tabell för rapporten markerar spärrade rader', () => {
    const t = formatGuardTable([checkShrink({ a: 100 }, { a: 50 }), checkShrink(null, { b: 3 })]);
    expect(t).toContain('| a | 100 | 50 | -50.0 % ⛔ |');
    expect(t).toContain('| b | – | 3 | ny |');
  });
});

describe('nyckeltal', () => {
  it('läkemedel', () => {
    expect(drugMetrics([
      { n: 'A', i: '20000101000011', a: 'N02BE01', p: 20 },
      { n: 'A', i: '20000101000011', a: 'N02BE01', p: 100 },
      { n: 'B', i: '20000101000028', a: 'N06AB06', p: 30 },
    ])).toEqual({ 'Läkemedel (poster)': 3, 'Läkemedel (unika NPL-id)': 2, 'Läkemedel (unika ATC-koder)': 2 });
  });
  it('interaktioner', () => {
    expect(interactionMetrics({
      format: 1, janusmedUpdated: null, substances: ['a', 'b', 'c'], profiles: 3,
      products: { '20000101000011': 0, '20000101000028': 1 },
      interactions: [[0, 1, 0, 1, 'D0'], [0, 1, 0, 2, 'C1'], [1, 2, 1, 2, 'B2']],
    })).toEqual({
      'Interaktioner (profilpar)': 2, 'Interaktioner klass D (profilpar)': 1,
      'Interaktioner (substanser)': 3, 'Produkter kända i Janusmed': 2,
    });
  });
});

describe('jsonLines', () => {
  it('en post per rad och giltig JSON', () => {
    const text = jsonLines([{ a: 1 }, { b: 2 }]);
    expect(text).toBe('[\n{"a":1},\n{"b":2}\n]\n');
    expect(JSON.parse(text)).toEqual([{ a: 1 }, { b: 2 }]);
  });
  it('valda nycklar radvis i ett objekt', () => {
    const v = { format: 1, products: { x: 1, y: 2 }, rows: [[1, 2], [3, 4]] };
    const text = jsonLines(v, ['products', 'rows']);
    expect(text.split('\n')).toHaveLength(12);
    expect(JSON.parse(text)).toEqual(v);
  });
});
