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
  it('mg-läget: styrkorna räknas ihop och uttaget visas per styrka', () => {
    const r = calcLongterm([
      { startRaw: '2026-01-01', endRaw: '2026-03-31', totalRaw: '', countsRaw: ['30', '30'] },
      { startRaw: '2026-04-01', endRaw: '2026-06-30', totalRaw: '', countsRaw: ['', '90'] },
    ], '7,5', TODAY, ['5', '7,5']);
    const t = buildLongtermText('Imovane', '7,5', r);
    expect(t).toContain('Ordinerad dos: 7,5 mg/dag.');
    expect(t).toContain('Uttag i styrkorna 5 mg och 7,5 mg, räknat i mg.');
    expect(t).toContain('  2026-01-01 – 2026-03-31 (90 dagar, 30 × 5 mg + 30 × 7,5 mg = 375 mg, snitt 4,17 mg/dag, 55,6 %)');
    expect(t).toContain('  2026-04-01 – 2026-06-30 (91 dagar, 90 × 7,5 mg = 675 mg, snitt 7,42 mg/dag, 98,9 %)');
    expect(t).toContain('Sammanlagd snittförbrukning: 5,80 mg/dag (77,3 % av ordinerad dos).');
  });
  it('sammanfattar perioderna', () => {
    const r = calcLongterm([{ startRaw: '2026-01-01', endRaw: '2026-03-31', totalRaw: '90' }], '1', TODAY);
    const t = buildLongtermText('Metylfenidat 36 mg', '1', r);
    expect(t).toContain('Analysperiod: 1 period, totalt 90 dagar (2026-01-01 – 2026-03-31).');
    expect(t).toContain('Sammanlagd snittförbrukning: 1,00 enheter/dag (100 % av ordinerad dos).');
  });
});


describe('Texter — fler kombinationer (porterat från 4.0)', () => {
  it('flera läkemedel där ett avslås med påminnelsedatum', () => {
    const t = buildPatientText('sv', [item('A 1 mg', {}, 'yes'), item('B 2 mg', { dateRaw: '2026-08-12' }, 'no')]);
    expect(t).toContain('  B 2 mg: Nuvarande recept beräknas räcka t.o.m. 2027-06-07. Hör av dig närmare 2027-05-31. Vi kan tyvärr inte förnya');
  });
  it('avslag på engelska, recept redan slut', () => {
    const t = buildPatientText('en', [item('Melatonin 2 mg', { dateRaw: '2026-06-01', packageRaw: '30', refillsRaw: '1' }, 'no')]);
    expect(t).toContain('The current prescription was expected to last until 2026-06-30.');
    expect(t).toContain('unable to renew the prescription');
    expect(t).not.toContain('Please contact us again');
  });
  it('avslag av ej beräkningsbar beredning i flerläkemedelstext saknar datum', () => {
    const t = buildPatientText('sv', [item('A 1 mg', {}, 'yes'), item('Kräm 1 %', { notCalculable: true }, 'no')]);
    expect(t).toContain('  Kräm 1 %: Kan tyvärr inte förnyas efter klinisk individuell bedömning av läkare.');
  });
  it('journal: bedömning pågår och manuell bedömning', () => {
    const t = buildJournalText([item('A 1 mg', {}, null), item('Kräm 1 %', { notCalculable: true }, 'yes')]);
    expect(t).toContain('Åtgärd: Bedömning pågår.');
    expect(t).toContain('Kräm 1 %: Beredningsformen lämpar sig inte för beräkning. Manuell bedömning.');
    expect(t).toContain('Åtgärd: Förnyat.');
  });
  it('journal: recept som tagit slut skrivs "Beräknades"', () => {
    const t = buildJournalText([item('A 1 mg', { dateRaw: '2025-06-01' }, null)]);
    expect(t).toMatch(/Beräknades räcka t\.o\.m\. 2026-03-27 \(slut sedan 188 dagar\)/);
  });
  it('sjuksköterska: avvikande i båda', () => {
    const t = buildNurseText([item('A 1 mg', {}, null)], 'deviating', 'deviating');
    expect(t).toContain('Vitalparametrar bedöms avvikande. Medicinsk uppföljning bedöms avvikande.');
  });
});

describe('Dosuttryck i texterna', () => {
  it('journalen visar talet, inte uttrycket', () => {
    const t = buildJournalText([item('Sertralin 50 mg', { doseRaw: '1x2', packageRaw: '100', refillsRaw: '3' }, null)]);
    expect(t).toContain('ordination 2 st/dag');
    expect(t).not.toContain('1x2');
  });
});
