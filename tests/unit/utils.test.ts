import { describe, it, expect } from 'vitest';
import { extractDoseUnit, stripManufacturer, pctClass, fmtDate, parseDateUTC, getDaysDiff } from '../../src/lib/utils';
import { setMockNow } from '../../src/lib/clock';

const MOCK_NOW = new Date('2025-05-20T00:00:00Z').getTime();
setMockNow(MOCK_NOW);

// =====================================================
describe('extractDoseUnit', () => {
  it('parsar mg från läkemedelsnamn', () => {
    expect(extractDoseUnit('Metformin 500 mg')).toEqual({ amount: 500, unit: 'mg' });
  });
  it('parsar mg från Sertralin', () => {
    expect(extractDoseUnit('Sertralin 50 mg')).toEqual({ amount: 50, unit: 'mg' });
  });
  it('parsar decimal mg (0.5 mg)', () => {
    expect(extractDoseUnit('Levaxin 0.5 mg')).toEqual({ amount: 0.5, unit: 'mg' });
  });
  it('parsar decimal mg med komma (0,25 mg)', () => {
    expect(extractDoseUnit('Digoxin 0,25 mg')).toEqual({ amount: 0.25, unit: 'mg' });
  });
  it('parsar µg', () => {
    expect(extractDoseUnit('Levaxin 100 µg')).toEqual({ amount: 100, unit: 'µg' });
  });
  it('parsar μg (grekiskt tecken)', () => {
    expect(extractDoseUnit('Levaxin 100 μg')).toEqual({ amount: 100, unit: 'μg' });
  });
  it('parsar mikrogram (normaliseras till µg)', () => {
    expect(extractDoseUnit('Levaxin 100 mikrogram')).toEqual({ amount: 100, unit: 'µg' });
  });
  it('parsar mikrog (normaliseras till µg)', () => {
    expect(extractDoseUnit('Cyanokobalamin 1 mikrog')).toEqual({ amount: 1, unit: 'µg' });
  });
  it('parsar mcg (normaliseras till µg)', () => {
    expect(extractDoseUnit('B12 1000 mcg')).toEqual({ amount: 1000, unit: 'µg' });
  });
  it('parsar microgram (normaliseras till µg)', () => {
    expect(extractDoseUnit('Vitamin D 20 microgram')).toEqual({ amount: 20, unit: 'µg' });
  });
  it('parsar IE', () => {
    expect(extractDoseUnit('Insulin 100 IE')).toEqual({ amount: 100, unit: 'IE' });
  });
  it('parsar IU (normaliseras till IE)', () => {
    expect(extractDoseUnit('Vitamin D 800 IU')).toEqual({ amount: 800, unit: 'IE' });
  });
  it('parsar mmol', () => {
    expect(extractDoseUnit('Kaliumklorid 20 mmol')).toEqual({ amount: 20, unit: 'mmol' });
  });
  it('parsar ng', () => {
    expect(extractDoseUnit('Kalciferol 50 ng')).toEqual({ amount: 50, unit: 'ng' });
  });
  it('parsar nanogram (normaliseras till ng)', () => {
    expect(extractDoseUnit('Hormon 10 nanogram')).toEqual({ amount: 10, unit: 'ng' });
  });
  it('parsar gram (normaliseras till g)', () => {
    expect(extractDoseUnit('Kräm 30 gram')).toEqual({ amount: 30, unit: 'g' });
  });
  it('parsar g (kortform)', () => {
    expect(extractDoseUnit('Salva 5 g')).toEqual({ amount: 5, unit: 'g' });
  });
  it('parsar ml', () => {
    expect(extractDoseUnit('Mixtur 150 ml')).toEqual({ amount: 150, unit: 'ml' });
  });
  it('returnerar null för namn utan dosenhet', () => {
    expect(extractDoseUnit('Alvedon')).toBeNull();
  });
  it('returnerar null för tom sträng', () => {
    expect(extractDoseUnit('')).toBeNull();
  });
  it('case-insensitive för enheter (normaliseras till lower)', () => {
    expect(extractDoseUnit('Test 100 MG')).toEqual({ amount: 100, unit: 'mg' });
  });
});

// =====================================================
describe('stripManufacturer', () => {
  it('rensar STADA', () => {
    expect(stripManufacturer('Metformin STADA 500 mg')).toBe('Metformin 500 mg');
  });
  it('rensar Sandoz', () => {
    expect(stripManufacturer('Atorvastatin Sandoz 20 mg')).toBe('Atorvastatin 20 mg');
  });
  it('rensar Teva', () => {
    expect(stripManufacturer('Sertralin Teva 50 mg')).toBe('Sertralin 50 mg');
  });
  it('rensar Krka', () => {
    expect(stripManufacturer('Losartan Krka 50 mg')).toBe('Losartan 50 mg');
  });
  it('rensar Orion', () => {
    expect(stripManufacturer('Metformin Orion 500 mg')).toBe('Metformin 500 mg');
  });
  it('rensar Accord', () => {
    expect(stripManufacturer('Omeprazol Accord 20 mg')).toBe('Omeprazol 20 mg');
  });
  it('rensar Accordpharma', () => {
    expect(stripManufacturer('Omeprazol Accordpharma 20 mg')).toBe('Omeprazol 20 mg');
  });
  it('rensar Bluefish', () => {
    expect(stripManufacturer('Paracetamol Bluefish 500 mg')).toBe('Paracetamol 500 mg');
  });
  it('rensar Mylan', () => {
    expect(stripManufacturer('Amlodipin Mylan 5 mg')).toBe('Amlodipin 5 mg');
  });
  it('rensar Pfizer', () => {
    expect(stripManufacturer('Atorvastatin Pfizer 20 mg')).toBe('Atorvastatin 20 mg');
  });
  it('rensar Evolan', () => {
    expect(stripManufacturer('Alvedon Evolan 500 mg')).toBe('Alvedon 500 mg');
  });
  it('rensar Orifarm', () => {
    expect(stripManufacturer('Metformin Orifarm 500 mg')).toBe('Metformin 500 mg');
  });
  it('rensar 2care4 (börjar med siffra)', () => {
    expect(stripManufacturer('Laktulos 2care4 670 mg/ml')).toBe('Laktulos 670 mg/ml');
  });
  it('rensar Medical Valley (flerordig)', () => {
    expect(stripManufacturer('Kreatin Medical Valley 500 mg')).toBe('Kreatin 500 mg');
  });
  it('rensar Abacus Medicine (flerordig)', () => {
    expect(stripManufacturer('Metformin Abacus Medicine 500 mg')).toBe('Metformin 500 mg');
  });
  it('rensar 1A Farma', () => {
    expect(stripManufacturer('Ibuprofen 1A Farma 400 mg')).toBe('Ibuprofen 400 mg');
  });
  it('behåller okända tillverkare', () => {
    expect(stripManufacturer('Metformin Okänd 500 mg')).toBe('Metformin Okänd 500 mg');
  });
  it('hanterar tom sträng', () => {
    expect(stripManufacturer('')).toBe('');
  });
});

// =====================================================
describe('pctClass', () => {
  it('0 → w0', () => { expect(pctClass(0, 'w')).toBe('w0'); });
  it('2 → w0 (avrundas ned)', () => { expect(pctClass(2, 'w')).toBe('w0'); });
  it('3 → w5 (avrundas upp)', () => { expect(pctClass(3, 'w')).toBe('w5'); });
  it('5 → w5', () => { expect(pctClass(5, 'w')).toBe('w5'); });
  it('7 → w5 (avrundas ned)', () => { expect(pctClass(7, 'w')).toBe('w5'); });
  it('8 → w10 (avrundas upp)', () => { expect(pctClass(8, 'w')).toBe('w10'); });
  it('50 → w50', () => { expect(pctClass(50, 'w')).toBe('w50'); });
  it('97 → w95 (avrundas ned)', () => { expect(pctClass(97, 'w')).toBe('w95'); });
  it('98 → w100 (avrundas upp)', () => { expect(pctClass(98, 'w')).toBe('w100'); });
  it('100 → w100', () => { expect(pctClass(100, 'w')).toBe('w100'); });
  it('105 → w100 (klampad)', () => { expect(pctClass(105, 'w')).toBe('w100'); });
  it('negativt → w0', () => { expect(pctClass(-10, 'w')).toBe('w0'); });
  it('annat prefix', () => { expect(pctClass(50, 'x')).toBe('x50'); });
});

// =====================================================
describe('fmtDate', () => {
  it('formaterar datum korrekt', () => {
    expect(fmtDate(new Date(Date.UTC(2025, 0, 1)))).toBe('2025-01-01');
  });
  it('formaterar 31 december', () => {
    expect(fmtDate(new Date(Date.UTC(2024, 11, 31)))).toBe('2024-12-31');
  });
  it('padDate med nolla för ensiffrig månad', () => {
    expect(fmtDate(new Date(Date.UTC(2025, 0, 5)))).toBe('2025-01-05');
  });
  it('padDate med nolla för ensiffrig dag', () => {
    expect(fmtDate(new Date(Date.UTC(2025, 10, 3)))).toBe('2025-11-03');
  });
});

// =====================================================
describe('parseDateUTC', () => {
  it('parsar giltigt datum', () => {
    const d = parseDateUTC('2025-01-15');
    expect(d).not.toBeNull();
    expect(d!.getUTCFullYear()).toBe(2025);
    expect(d!.getUTCMonth()).toBe(0);
    expect(d!.getUTCDate()).toBe(15);
  });
  it('parsar skottdag (2024-02-29)', () => {
    const d = parseDateUTC('2024-02-29');
    expect(d).not.toBeNull();
    expect(d!.getUTCDate()).toBe(29);
  });
  it('returnerar null för ogiltig skottdag (2025-02-29)', () => {
    expect(parseDateUTC('2025-02-29')).toBeNull();
  });
  it('returnerar null för månad=13', () => {
    expect(parseDateUTC('2025-13-01')).toBeNull();
  });
  it('returnerar null för dag=32', () => {
    expect(parseDateUTC('2025-01-32')).toBeNull();
  });
  it('returnerar null för månad=0', () => {
    expect(parseDateUTC('2025-00-01')).toBeNull();
  });
  it('returnerar null för dag=0', () => {
    expect(parseDateUTC('2025-01-00')).toBeNull();
  });
  it('returnerar null för år före 1950', () => {
    expect(parseDateUTC('1949-12-31')).toBeNull();
  });
  it('accepterar år 1950 (MIN_VALID_YEAR)', () => {
    expect(parseDateUTC('1950-01-01')).not.toBeNull();
  });
  it('accepterar år 2100 (MAX_VALID_YEAR)', () => {
    expect(parseDateUTC('2100-12-31')).not.toBeNull();
  });
  it('returnerar null för år efter 2100', () => {
    expect(parseDateUTC('2101-01-01')).toBeNull();
  });
  it('returnerar null för tom sträng', () => {
    expect(parseDateUTC('')).toBeNull();
  });
  it('returnerar null för fel format (endast år)', () => {
    expect(parseDateUTC('2025')).toBeNull();
  });
  it('returnerar null för fel format (text)', () => {
    expect(parseDateUTC('abc-def-ghi')).toBeNull();
  });
  it('returnerar null för NaN i komponenter', () => {
    expect(parseDateUTC('xxxx-01-15')).toBeNull();
  });
});

// =====================================================
describe('getDaysDiff', () => {
  it('beräknar dagsskillnad positiv', () => {
    const d1 = new Date(Date.UTC(2025, 0, 10));
    const d2 = new Date(Date.UTC(2025, 0, 1));
    expect(getDaysDiff(d1, d2)).toBe(9);
  });
  it('beräknar dagsskillnad negativ', () => {
    const d1 = new Date(Date.UTC(2025, 0, 1));
    const d2 = new Date(Date.UTC(2025, 0, 10));
    expect(getDaysDiff(d1, d2)).toBe(-9);
  });
  it('samma datum → 0', () => {
    const d = new Date(Date.UTC(2025, 0, 1));
    expect(getDaysDiff(d, d)).toBe(0);
  });
  it('över månadsgräns', () => {
    const d1 = new Date(Date.UTC(2025, 1, 1));
    const d2 = new Date(Date.UTC(2025, 0, 31));
    expect(getDaysDiff(d1, d2)).toBe(1);
  });
});
