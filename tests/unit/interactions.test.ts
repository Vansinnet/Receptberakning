// Interaktionskontrollen i appen, med konstruerad data (oberoende av månadens Janusmed-data).
// Kontroller mot den riktiga datan finns i data.test.ts.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkInteractions, setInteractionData } from '../../src/lib/interactions';
import type { InteractionData } from '../../src/lib/interaction-data';

// Profiler: 0 sertralin, 1 citalopram, 2 tramadol, 3 kombination (tramadol + paracetamol), 4 paracetamol
const DATA: InteractionData = {
  format: 1,
  janusmedUpdated: '2026-09-25',
  substances: ['citalopram', 'paracetamol', 'sertralin', 'tramadol'],
  profiles: 5,
  products: {
    '20000000000001': 0, '20000000000002': 0, // två sertralinprodukter, samma profil
    '20000000000011': 1,
    '20000000000021': 2,
    '20000000000031': 3,
    '20000000000041': 4,
  },
  interactions: [
    [0, 1, 2, 0, 'D0'], // sertralin – citalopram
    [0, 2, 2, 3, 'C1'], // sertralin – tramadol
    [0, 3, 2, 3, 'C1'], // sertralin – tramadol (i kombinationen)
    [1, 2, 0, 3, 'C1'], // citalopram – tramadol
    [1, 3, 0, 3, 'C1'],
    [2, 3, 3, 1, 'B0'], // påhittad, för att testa flera rader
  ],
};

const e = (label: string, nplId: string | null) => ({ label, nplId });
const SERT = e('Sertralin 50 mg', '20000000000001');
const SERT2 = e('Zoloft 100 mg', '20000000000002');
const CIT = e('Citalopram 20 mg', '20000000000011');
const TRAM = e('Tramadol 50 mg', '20000000000021');
const COMBO = e('Tramadol/Paracetamol', '20000000000031');
const PCM = e('Paracetamol 500 mg', '20000000000041');

beforeEach(() => setInteractionData(DATA));

describe('checkInteractions', () => {
  it('inga läkemedel eller ett läkemedel → inga varningar', () => {
    expect(checkInteractions([])).toEqual({ warnings: [], unchecked: [] });
    expect(checkInteractions([SERT])).toEqual({ warnings: [], unchecked: [] });
  });

  it('sertralin + citalopram → klass D, röd varning', () => {
    const { warnings } = checkInteractions([SERT, CIT]);
    expect(warnings).toEqual([{
      drugs: ['Sertralin 50 mg', 'Citalopram 20 mg'], cls: 'D0', severity: 'danger',
      pairs: [{ a: 'sertralin', b: 'citalopram', cls: 'D0' }],
    }]);
  });

  it('ordningen spelar ingen roll, men substanserna följer läkemedlen', () => {
    const [w] = checkInteractions([CIT, SERT]).warnings;
    expect(w.drugs).toEqual(['Citalopram 20 mg', 'Sertralin 50 mg']);
    expect(w.pairs).toEqual([{ a: 'citalopram', b: 'sertralin', cls: 'D0' }]);
  });

  it('klass C → gul varning', () => {
    const [w] = checkInteractions([SERT, TRAM]).warnings;
    expect(w).toMatchObject({ cls: 'C1', severity: 'warn' });
  });

  it('varningarna sorteras med den allvarligaste först', () => {
    expect(checkInteractions([TRAM, COMBO]).warnings.map((x) => x.cls)).toEqual(['B0']);
    expect(checkInteractions([TRAM, SERT, CIT]).warnings.map((x) => x.cls)).toEqual(['D0', 'C1', 'C1']);
  });

  it('samma profil (två sertralinprodukter) → ingen interaktionsvarning', () => {
    expect(checkInteractions([SERT, SERT2]).warnings).toEqual([]);
  });

  it('par utan interaktion → ingen varning', () => {
    expect(checkInteractions([SERT, PCM]).warnings).toEqual([]);
  });

  it('handskrivna och okända läkemedel rapporteras som ej kontrollerade', () => {
    const r = checkInteractions([SERT, e('Egen blandning', null), e('Okänd', '29999999999999'), CIT]);
    expect(r.unchecked).toEqual(['Egen blandning', 'Okänd']);
    expect(r.warnings).toHaveLength(1);
  });
});

describe('innan datan har laddats', () => {
  it('allt rapporteras som ej kontrollerat, aldrig ett falskt "inga interaktioner"', async () => {
    vi.resetModules();
    const fresh = await import('../../src/lib/interactions');
    expect(fresh.interactionsLoaded()).toBe(false);
    expect(fresh.checkInteractions([SERT, CIT])).toEqual({ warnings: [], unchecked: ['Sertralin 50 mg', 'Citalopram 20 mg'] });
  });
});
