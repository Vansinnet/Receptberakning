import { describe, it, expect } from 'vitest';
import { calcRenewal, isRenewalOk } from '../../src/lib/domain/renewal';
import { calcPrescription } from '../../src/lib/domain/prescribe';
import { calcLongterm } from '../../src/lib/domain/longterm';
import { buildJournalText, buildLongtermText, buildNurseText, buildPatientText, type LtTextContext, type TextItem } from '../../src/lib/domain/texts';
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
  const ctx = (o: Partial<LtTextContext> = {}): LtTextContext => ({
    medName: 'Imovane 7,5 mg', regulation: 'V', noun: 'st', doseUnit: 'st', interval: 1, ...o,
  });
  const fills = (rows: [string, string, string?][]) => rows.map(([dateRaw, countRaw, strengthRaw = '7,5']) => ({ dateRaw, countRaw, strengthRaw }));
  const max = (...m: [string, string][]) => m.map(([fromRaw, doseRaw]) => ({ fromRaw, doseRaw }));
  const T34 = fills([['2026-06-01', '30'], ['2026-07-01', '30'], ['2026-07-26', '30'], ['2026-08-15', '30'], ['2026-08-30', '30']]);

  it('T34: maxdos, snitt, takten mellan uttagen, om slut idag och borde finnas kvar', () => {
    const t = buildLongtermText(ctx(), calcLongterm(T34, max(['', '1']), 'st', 1, TODAY));
    expect(t).toBe([
      'Aktuellt: Förbrukningsanalys av Imovane 7,5 mg (narkotika klass V).',
      'Maxdos enligt receptet: 1 st/dag (7,5 mg/dag).',
      'Underlag: 5 uttag 2026-06-01 – 2026-08-30 enligt uttagshistoriken, inmatade för hand.',
      'Mellan första och sista uttaget hämtades i snitt 10,00 mg/dag ut (133,3 % av maxdos).',
      'Mg per dag mellan uttagen: 7,50 – 9,00 – 11,25 – 15,00.',
      'Om patienten har slut idag: 9,22 mg/dag (123 % av maxdos).',
      'Vid senaste uttaget borde minst 30 st ha funnits kvar, räknat med maxdos.',
      'Bedömning: ',
    ].join('\n'));
  });
  it('utan maxdos: bara mg per dag, ingen procent och inget "borde finnas kvar"', () => {
    const t = buildLongtermText(ctx({ regulation: null }), calcLongterm(T34, max(['', '']), 'st', 1, TODAY));
    expect(t).toContain('Aktuellt: Förbrukningsanalys av Imovane 7,5 mg.');
    expect(t).toContain('Mellan första och sista uttaget hämtades i snitt 10,00 mg/dag ut.');
    expect(t).not.toContain('maxdos');
  });
  it('två styrkor och maxdos i mg', () => {
    const r = calcLongterm(fills([['2026-08-01', '30', '7,5'], ['2026-08-31', '30', '5'], ['2026-09-20', '30', '7,5']]), max(['', '7,5']), 'mg', 1, TODAY);
    const t = buildLongtermText(ctx({ medName: 'Imovane', doseUnit: 'mg' }), r);
    expect(t).toContain('Maxdos enligt receptet: 7,5 mg/dag.');
    expect(t).toContain('Uttag i styrkorna 5 mg och 7,5 mg, räknat i mg.');
    expect(t).toContain('Vid senaste uttaget borde inget ha funnits kvar, räknat med maxdos.');
  });
  it('ändrad maxdos (T39)', () => {
    const r = calcLongterm(fills([['2026-06-01', '30'], ['2026-07-01', '60'], ['2026-07-31', '60']]), max(['', '1'], ['2026-07-01', '2']), 'st', 1, TODAY);
    expect(buildLongtermText(ctx(), r)).toContain('Maxdos enligt receptet: 1 st/dag (7,5 mg/dag), från 2026-07-01 2 st/dag (15 mg/dag).');
  });
  it('plåster per vecka (T41)', () => {
    const r = calcLongterm(fills([['2026-08-01', '4', ''], ['2026-08-29', '4', '']]), max(['', '1']), 'st', 7, TODAY);
    const t = buildLongtermText(ctx({ medName: 'Norspan 10 mikrog/timme', regulation: 'IV', noun: 'plåster', interval: 7 }), r);
    expect(t).toContain('Maxdos enligt receptet: 1 plåster/vecka.');
    expect(t).toContain('Mellan första och sista uttaget hämtades i snitt 1,00 plåster/vecka ut (100 % av maxdos).');
    expect(t).toContain('Plåster per vecka mellan uttagen: 1,00.');
    expect(t).toContain('Om patienten har slut idag: 0,92 plåster/vecka (91,8 % av maxdos).');
  });
  it('ett uttag: inget snitt och ingen takt mellan uttagen', () => {
    const t = buildLongtermText(ctx(), calcLongterm(fills([['2026-09-01', '30']]), max(['', '1']), 'st', 1, TODAY));
    expect(t).toContain('Underlag: 1 uttag 2026-09-01 enligt uttagshistoriken, inmatade för hand.');
    expect(t).not.toContain('Mellan första');
    expect(t).not.toContain('mellan uttagen');
    expect(t).toContain('Om patienten har slut idag: 7,50 mg/dag (100 % av maxdos).');
  });
  it('ingen text så länge en rad inte räknas eller maxdosen är fel', () => {
    expect(buildLongtermText(ctx(), calcLongterm(fills([['2026-09-01', '30'], ['2026-09-20', '']]), max(['', '1']), 'st', 1, TODAY))).toBe('');
    expect(buildLongtermText(ctx(), calcLongterm(fills([['2026-09-01', '30']]), max(['', '0']), 'st', 1, TODAY))).toBe('');
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
