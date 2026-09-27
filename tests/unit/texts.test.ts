import { describe, it, expect } from 'vitest';
import { calcRenewal, isRenewalOk } from '../../src/lib/domain/renewal';
import { calcPrescription } from '../../src/lib/domain/prescribe';
import { calcLongterm } from '../../src/lib/domain/longterm';
import { buildJournalText, buildLongtermText, buildNurseText, buildPatientText, type TextItem } from '../../src/lib/domain/texts';
import type { Decision, MedForm } from '../../src/lib/types';

const TODAY = new Date(Date.UTC(2026, 9, 1));

function item(name: string, o: Partial<MedForm>, decision: Decision, period = 6): TextItem {
  const f: MedForm = {
    name, atcCode: null, nplId: null, doseForm: '', regulation: null, notCalculable: false, unit: 'st',
    dateRaw: '2025-12-10', doseRaw: '1', interval: 1, packageRaw: '100', refillsRaw: '3', ...o,
  };
  const r = calcRenewal(f, TODAY);
  const renewal = isRenewalOk(r) ? r : null;
  const prescription = renewal && decision === 'yes'
    ? calcPrescription(renewal, { period, endDateRaw: '', packageRaw: null, fromToday: false }, TODAY) : null;
  return { name, unit: f.unit, interval: f.interval, doseRaw: f.doseRaw, dateRaw: f.dateRaw, decision, renewal, prescription };
}

describe('Patientsvar', () => {
  it('ett läkemedel, förnyas', () => {
    const t = buildPatientText('sv', [item('Sertralin 50 mg', {}, 'yes')]);
    expect(t).toBe('Hej,\n\nVi har tagit emot din förfrågan om receptförnyelse för Sertralin 50 mg. Vi förnyar ditt recept så att det räcker till 2027-04-01.\nDu kan inom 2–3 arbetsdagar hämta ut det på valfritt apotek.\n\nVid frågor är du välkommen att kontakta oss via 1177.');
  });
  it('avslag med påminnelse när minst 14 dagar återstår', () => {
    const t = buildPatientText('sv', [item('Sertralin 50 mg', { dateRaw: '2026-08-12' }, 'no')]);
    expect(t).toContain('Nuvarande recept beräknas räcka t.o.m. 2027-06-07. Hör av dig närmare 2027-05-31.');
    expect(t).toContain('Vi kan tyvärr inte förnya receptet');
  });
  it('avslag när receptet redan är slut: "beräknades", ingen påminnelse', () => {
    const t = buildPatientText('sv', [item('Melatonin 2 mg', { dateRaw: '2026-06-01', packageRaw: '30', refillsRaw: '1' }, 'no')]);
    expect(t).toContain('Nuvarande recept beräknades räcka t.o.m. 2026-06-30.');
    expect(t).not.toContain('Hör av dig');
  });
  it('flera läkemedel, engelska', () => {
    const t = buildPatientText('en', [item('A 1 mg', {}, 'yes'), item('B 2 mg', {}, null)]);
    expect(t).toContain('the following medications: A 1 mg, B 2 mg.');
    expect(t).toContain('  A 1 mg: We will renew your prescription to last until 2027-04-01.');
    expect(t).toContain('  B 2 mg: Your request is currently being assessed.');
  });
  it('ej beräkningsbar beredning kan förnyas utan datum (T23)', () => {
    const t = buildPatientText('sv', [item('Kräm 1 %', { notCalculable: true }, 'yes')]);
    expect(t).toContain('Vi förnyar ditt recept.');
  });
  it('tomt ärende ger tom text', () => {
    expect(buildPatientText('sv', [])).toBe('');
  });
});

describe('Journalanteckning', () => {
  it('innehåller underlag, jämförelse och åtgärd', () => {
    const t = buildJournalText([item('Metylfenidat 36 mg', { dateRaw: '2026-08-12', packageRaw: '30' }, 'yes', 3)]);
    expect(t).toContain('Metylfenidat 36 mg: Senaste recept 2026-08-12, 30 st × 3 uttag = 90 st, ordination 1 st/dag.');
    expect(t).toContain('Beräknas räcka t.o.m. 2026-11-09 (39 dagar kvar). Borde finnas kvar idag: 40 st.');
    expect(t).toContain('Åtgärd: Förnyat, 2 förp. à 30 st (53 st), räcker till 2027-01-01.');
  });
});

describe('Sjuksköterskans text', () => {
  it('ej valt läge skrivs som "har inte bedömts", aldrig som avvikande', () => {
    const t = buildNurseText([item('Sertralin 50 mg', {}, null)], null, 'normal');
    expect(t).toContain('Vitalparametrar har inte bedömts. Medicinsk uppföljning bedöms adekvat.');
    expect(t).not.toContain('avvikande');
  });
});

describe('Långtidsanalysens text', () => {
  it('sammanfattar perioderna', () => {
    const r = calcLongterm([{ startRaw: '2026-01-01', endRaw: '2026-03-31', totalRaw: '90' }], '1', TODAY);
    const t = buildLongtermText('Metylfenidat 36 mg', '1', r);
    expect(t).toContain('Analysperiod: 1 period, totalt 90 dagar (2026-01-01 – 2026-03-31).');
    expect(t).toContain('Sammanlagd snittförbrukning: 1,00 enheter/dag (100 % av ordinerad dos).');
  });
});

