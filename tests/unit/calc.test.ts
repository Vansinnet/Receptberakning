import { describe, it, expect } from 'vitest';
import { calcCore, validateValues } from '../../src/lib/calc';
import { calcLongtermCore } from '../../src/lib/calc-longterm';
import { calcPrescribeResult, canRenewMed, prescribeValidationHint } from '../../src/lib/prescribe-calc';
import { buildPatientText, buildJournalText, buildNurseJournalText } from '../../src/lib/text-gen';
import { setMockNow } from '../../src/lib/clock';

const MOCK_NOW = new Date('2025-05-20T00:00:00Z').getTime();
setMockNow(MOCK_NOW);

function makeInput(overrides: any = {}) {
  return {
    medRaw: overrides.medRaw ?? 'Sertralin 50 mg',
    dateVal: overrides.dateVal ?? '2024-08-13',
    doseRaw: overrides.doseRaw ?? String(overrides.dose ?? 1),
    amtRaw: overrides.amtRaw ?? String(overrides.amt ?? 100),
    refRaw: overrides.refRaw ?? String(overrides.ref ?? 3),
    leftRaw: overrides.leftRaw ?? (overrides.remaining != null ? String(overrides.remaining) : ''),
    doseInterval: overrides.doseInterval ?? 1,
    doseUnit: 'st' as const,
    notCalculable: overrides.notCalculable ?? false,
  };
}

function v(inp: any) {
  const r = validateValues(inp.medRaw, inp.dateVal, inp.doseRaw, inp.amtRaw, inp.refRaw, inp.leftRaw, String(inp.doseInterval), inp.doseUnit, inp.notCalculable);
  if (!r.valid) throw new Error('Expected valid input');
  return r;
}

// =====================================================
describe('validateValues', () => {
  it('empty → invalid', () => { expect(validateValues('','','','','','').valid).toBe(false); });
  it('only drug name → invalid', () => { expect(validateValues('Sertralin','','','','','').valid).toBe(false); });
  it('full input → valid', () => { expect(validateValues('Sertralin 50 mg','2024-08-13','1','100','3','').valid).toBe(true); });
  it('bad date → invalid_date', () => {
    const r = validateValues('Sertralin','2025-13-01','1','100','3','');
    expect(r.valid).toBe(false); if (!r.valid) expect(r.reason).toBe('invalid_date');
  });
  it('ref=13 → too_many_refs', () => {
    const r = validateValues('Sertralin 50 mg','2024-08-13','1','100','13','');
    expect(r.valid).toBe(false); if (!r.valid) expect(r.reason).toBe('too_many_refs');
  });
  it('dose<0.1 → invalid', () => {
    const r = validateValues('Sertralin','2024-08-13','0.05','100','3','');
    expect(r.valid).toBe(false);
  });
  it('amt<=0 → invalid', () => {
    const r = validateValues('Sertralin','2024-08-13','1','0','3','');
    expect(r.valid).toBe(false);
  });
  it('ref<1 → invalid', () => {
    expect(validateValues('Sertralin','2024-08-13','1','100','0','').valid).toBe(false);
  });
  it('doseInterval=7 → valid', () => {
    expect(validateValues('Sertralin 50 mg','2024-08-13','1','100','3','','7','st').valid).toBe(true);
  });
  it('doseInterval=30 → valid', () => {
    expect(validateValues('Sertralin 50 mg','2024-08-13','1','100','3','','30','st').valid).toBe(true);
  });

  // regression: trailing nollor
  it('dos med trailing zero (1.0) → valid', () => {
    expect(validateValues('Test 50 mg','2024-08-13','1.0','100','3','').valid).toBe(true);
  });
  it('dos med trailing zero (1.50) → valid', () => {
    expect(validateValues('Test 50 mg','2024-08-13','1.50','100','3','').valid).toBe(true);
  });
  it('dos med trailing zero (2.00) → valid', () => {
    expect(validateValues('Test 50 mg','2024-08-13','2.00','100','3','').valid).toBe(true);
  });
});

// =====================================================
describe('calcCore (v3)', () => {
  it('invalid input → valid:false', () => {
    expect(calcCore({valid:false,reason:'incomplete'}).valid).toBe(false);
  });
  it('invalid_date → valid:false', () => {
    expect(calcCore({valid:false,reason:'invalid_date'}).statusText).toBe('Ogiltigt datum');
  });
  it('too_many_refs → calculable:false + danger', () => {
    const r = calcCore({valid:false,reason:'too_many_refs'});
    expect(r.calculable).toBe(false);
    expect(r.alerts?.[0].type).toBe('danger');
  });
  it('notCalculable → calculable:false', () => {
    expect(calcCore({valid:true,notCalculable:true} as any).calculable).toBe(false);
  });
  it('consumptionPct=100 for normal use', () => {
    const r = calcCore(v(makeInput({dose:1,amt:100,ref:3})));
    expect(r.consumptionPct).toBeGreaterThan(90);
    expect(r.consumptionPct).toBeLessThan(115);
  });
  it('snitt cls=ok at 80-110%', () => {
    const r = calcCore(v(makeInput({dose:1,amt:100,ref:3})));
    expect(r.metrics![2].cls).toBe('ok');
  });
  it('>110% → snitt cls=warn', () => {
    const r = calcCore(v(makeInput({dose:2,amt:100,ref:1})));
    expect(r.metrics![2].cls).toBe('warn');
  });
  it('>14d kvar → racketill cls=warn', () => {
    const r = calcCore(v(makeInput({dose:1,amt:100,ref:3,remaining:270,dateVal:'2025-04-20'})));
    expect(r.metrics![1].cls).toBe('warn');
  });
  it('metrics length=3', () => {
    const r = calcCore(v(makeInput({dose:1,amt:100,ref:3})));
    expect(r.metrics).toHaveLength(3);
  });
  it('total=amt×ref', () => {
    const r = calcCore(v(makeInput({dose:2,amt:150,ref:4})));
    expect(r.total).toBe(600);
  });
  it('mg/dag display', () => {
    const r = calcCore(v(makeInput({dose:0.5,amt:100,ref:1,medRaw:'Depåtablett 5 mg'})));
    expect(r.displayAvgStr).toContain('mg/dag');
  });
  it('st/vecka display', () => {
    const inp = makeInput({dose:1,doseInterval:7,amt:30,ref:1,remaining:5,dateVal:'2024-12-01'});
    expect(calcCore(v(inp)).displayAvgStr).toContain('st/vecka');
  });
  it('st/månad display', () => {
    const inp = makeInput({dose:1,doseInterval:30,amt:30,ref:1,remaining:28,dateVal:'2025-04-01'});
    expect(calcCore(v(inp)).displayAvgStr).toContain('st/månad');
  });
  it('tlPct in [0,100]', () => {
    const r = calcCore(v(makeInput({dose:1,amt:100,ref:3})));
    expect(r.tlPct!).toBeGreaterThanOrEqual(0);
    expect(r.tlPct!).toBeLessThanOrEqual(100);
  });
  it('date format', () => {
    expect(calcCore(v(makeInput())).prescribedEndDateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('avgNote differs with/without remaining', () => {
    const w = calcCore(v(makeInput({dose:1,amt:100,ref:1,remaining:40})));
    const wo = calcCore(v(makeInput({dose:1,amt:100,ref:1})));
    expect(w.avgNote).toContain('faktisk');
    expect(wo.avgNote).toContain('alla');
  });
  it('day types are numbers', () => {
    const r = calcCore(v(makeInput({dose:1,amt:100,ref:3})));
    expect(typeof r.daysRemaining).toBe('number');
    expect(typeof r.daysToPrescribedEnd).toBe('number');
  });
  it('statusText has %', () => {
    expect(calcCore(v(makeInput())).statusText).toContain('%');
  });
  it('hasRemaining endDateStr', () => {
    const inp = makeInput({dose:1,amt:100,ref:1,remaining:50,dateVal:'2025-05-19'});
    expect(calcCore(v(inp)).estimatedEndDateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('zero use → alert', () => {
    const inp = makeInput({dose:1,amt:100,ref:1,remaining:100});
    expect(calcCore(v(inp)).alerts?.some(a=>a.title?.includes('förbrukning'))).toBe(true);
  });
  it('datakontroll >2.5x', () => {
    const inp = makeInput({dose:1,amt:100,ref:1,remaining:60,dateVal:'2025-05-01'});
    const r = calcCore(v(inp));
    if (r.consumptionPct > 250) {
      expect(r.alerts?.some(a=>a.title==='Datakontroll')).toBe(true);
    }
  });
  it('daysSince=0 → not calculable', () => {
    const inp = makeInput({dateVal:'2025-05-20'});
    expect(calcCore(v(inp)).calculable).toBe(false);
  });
});

// =====================================================
describe('calcLongtermCore', () => {
  const d = (n:number) => { const dt = new Date(Date.UTC(2025,4,20)); dt.setUTCDate(dt.getUTCDate()-n); return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,'0')}-${String(dt.getUTCDate()).padStart(2,'0')}`; };
  it('empty→false',()=>{expect(calcLongtermCore('',0,[]).valid).toBe(false);});
  it('one period',()=>{const r=calcLongtermCore('Metformin',1,[{start:d(90),end:d(0),total:90}]);expect(r.valid).toBe(true);expect(r.totalDays).toBe(90);});
  it('two periods',()=>{const r=calcLongtermCore('Metformin',1,[{start:d(180),end:d(90),total:90},{start:d(90),end:d(0),total:90}]);expect(r.totalDays).toBe(180);});
  it('overlap',()=>{const r=calcLongtermCore('Metformin',1,[{start:d(120),end:d(30),total:90},{start:d(100),end:d(0),total:100}]);expect(r.hasOverlap).toBe(true);});
  it('future start→error',()=>{expect(calcLongtermCore('Metformin',1,[{start:'2099-01-01',end:d(0),total:90}]).periodErrors[0].startError).toBe(true);});
  it('periods length',()=>{expect(calcLongtermCore('Metformin',1,[{start:d(180),end:d(90),total:90},{start:d(90),end:d(0),total:90}]).periods).toHaveLength(2);});
});

// =====================================================
describe('calcPrescribeResult', () => {
  it('null→null',()=>{expect(calcPrescribeResult({_cardId:1,dose:1,prescribedEndDateStr:'2025-06-01'} as any,null)).toBeNull();});
  it('months→packages>0',()=>{const r=calcPrescribeResult({_cardId:1,dose:1,doseInterval:1,doseUnit:'st',prescribedEndDateStr:'2025-01-01'} as any,{packageSize:'30',mode:'months',months:3});expect(r!.packages).toBeGreaterThan(0);});
  it('date mode',()=>{const r=calcPrescribeResult({_cardId:1,dose:1,doseInterval:1,doseUnit:'st',prescribedEndDateStr:'2025-01-01'} as any,{packageSize:'30',mode:'date',endDate:'2025-09-20'});expect(r!.packages).toBeGreaterThan(0);});
  it('startFromToday→starts today',()=>{const r=calcPrescribeResult({_cardId:1,dose:1,doseInterval:1,doseUnit:'st',prescribedEndDateStr:'2025-09-20'} as any,{packageSize:'30',mode:'months',months:3,startFromToday:true});expect(r!.startDateStr).toBe('2025-05-20');});
  it('dose=0→null',()=>{expect(calcPrescribeResult({_cardId:1,dose:0} as any,{packageSize:'30',mode:'months',months:1})).toBeNull();});

  // regression Bug 36: månadsläge med kvarvarande receptdagar
  it('framtida slutdatum, månader → packages baserat på startDate',()=>{
    const r=calcPrescribeResult({_cardId:1,dose:1,doseInterval:1,doseUnit:'st',prescribedEndDateStr:'2025-07-20'} as any,{packageSize:'30',mode:'months',months:3});
    expect(r).not.toBeNull();
    expect(r!.totalDays).toBeGreaterThan(30); // ~31 dagar (today+3mån - startDate)
    expect(r!.packages).toBeGreaterThanOrEqual(2); // ceil(31/30) = 2
  });
});

// =====================================================
describe('canRenewMed', () => {
  it('valid+calculable→true',()=>{expect(canRenewMed({_cardId:1,valid:true,calculable:true} as any)).toBe(true);});
  it('valid:false→false',()=>{expect(canRenewMed({_cardId:1,valid:false,calculable:true} as any)).toBe(false);});
  it('calculable:false→false',()=>{expect(canRenewMed({_cardId:1,valid:true,calculable:false} as any)).toBe(false);});
  it('decision:no→false',()=>{expect(canRenewMed({_cardId:1,valid:true,calculable:true,decision:'no'} as any)).toBe(false);});
  it('decision:yes→true',()=>{expect(canRenewMed({_cardId:1,valid:true,calculable:true,decision:'yes'} as any)).toBe(true);});
});

// =====================================================
describe('buildPatientText (v3)', () => {
  it('yes→"Vi förnyar"',()=>{expect(buildPatientText('sv',[{name:'Sertralin',decision:'yes'}])).toContain('Vi förnyar');});
  it('no→"kan tyvärr inte"',()=>{expect(buildPatientText('sv',[{name:'Sertralin',decision:'no'}])).toContain('kan tyvärr inte');});
  it('no has date',()=>{expect(buildPatientText('sv',[{name:'Sertralin',decision:'no',prescribedEndDateStr:'2026-03-31'}])).toContain('2026-03-31');});
  it('no days<0→"beräknades"',()=>{expect(buildPatientText('sv',[{name:'Sertralin',decision:'no',prescribedEndDateStr:'2026-03-31',daysToPrescribedEnd:-50}])).toContain('beräknades');});
  it('no days>=14+contact→"Hör av dig"',()=>{expect(buildPatientText('sv',[{name:'Sertralin',decision:'no',prescribedEndDateStr:'2026-12-31',daysToPrescribedEnd:200,contactDateStr:'2026-12-24'}])).toContain('Hör av dig');});
  it('null→"bedömning"',()=>{expect(buildPatientText('sv',[{name:'Sertralin',decision:null}])).toContain('bedömning');});
  it('yes+prescribeEnd→date',()=>{expect(buildPatientText('sv',[{name:'Sertralin',decision:'yes',prescribeEnd:'2026-06-15'}])).toContain('2026-06-15');});
  it('en yes→"We will renew"',()=>{expect(buildPatientText('en',[{name:'Sertralin',decision:'yes'}])).toContain('We will renew');});
  it('en no',()=>{expect(buildPatientText('en',[{name:'Sertralin',decision:'no'}])).toContain('unable to renew');});
  it('multi',()=>{const t=buildPatientText('sv',[{name:'A',decision:'yes'},{name:'B',decision:'no'}]);expect(t).toContain('A');expect(t).toContain('B');});
  it('multi with null→"bedömning"',()=>{const t=buildPatientText('sv',[{name:'A',decision:'yes'},{name:'B',decision:null}]);expect(t).toContain('bedömning');});
  it('lang fallback',()=>{expect(buildPatientText('sv',[{name:'X',decision:'yes'}])).toBe(buildPatientText('xx',[{name:'X',decision:'yes'}]));});
});

// =====================================================
describe('buildJournalText (v3)', () => {
  const c=(o:any={})=>({name:'Sertralin',i:0,dose:1,doseUnitLabel:'st/dag',doseUnit:'st',total:300,pDateStr:'2025-01-15',prescribedEndDateStr:'2025-11-12',displayAvgStr:'1.00 st/dag',avgNote:'(test)',daysToPrescribedEnd:180,consumptionPct:100,decision:'yes'as any,...o});
  it('yes+prescribeEnd→date in action',()=>{expect(buildJournalText([c()],{0:'2026-06-15'})).toContain('räcker till 2026-06-15');});
  it('yes no prescribeEnd',()=>{expect(buildJournalText([c()])).toContain('Åtgärd: Förnyat.');});
  it('no',()=>{expect(buildJournalText([c({decision:'no'})])).toContain('Ej förnyat');});
  it('null',()=>{expect(buildJournalText([c({decision:null})])).toContain('Klinisk bedömning krävs');});
  it('days<0→beräknades',()=>{expect(buildJournalText([c({daysToPrescribedEnd:-50,prescribedEndDateStr:'2026-03-31'})])).toContain('beräknades räcka');});
  it('days>=0→beräknas',()=>{expect(buildJournalText([c({daysToPrescribedEnd:30})])).toContain('beräknas räcka');});
  it('consumptionPct in text',()=>{expect(buildJournalText([c({consumptionPct:85.5})])).toContain('85.5%');});
});

// =====================================================
describe('buildNurseJournalText', () => {
  it('empty→""',()=>{expect(buildNurseJournalText([])).toBe('');});
  it('valid card→text',()=>{expect(buildNurseJournalText([{_cardId:1,medRaw:'Sertralin',valid:true,calculable:true,prescribedEndDateStr:'2025-11-12',daysToPrescribedEnd:180}])).toContain('Sertralin');});
  it('days<0→beräknades',()=>{expect(buildNurseJournalText([{_cardId:1,medRaw:'Sertralin',valid:true,calculable:true,prescribedEndDateStr:'2026-03-31',daysToPrescribedEnd:-50}])).toContain('beräknades');});
  it('invalid→excluded',()=>{expect(buildNurseJournalText([{_cardId:1,medRaw:'Sertralin',valid:false,calculable:false}])).toBe('');});
  it('vitals ok→adekvata',()=>{expect(buildNurseJournalText([{_cardId:1,medRaw:'Sertralin',valid:true,calculable:true,prescribedEndDateStr:'2025-11-12',daysToPrescribedEnd:180}],true,true)).toContain('adekvata');});
  it('vitals no→avvikande',()=>{expect(buildNurseJournalText([{_cardId:1,medRaw:'Sertralin',valid:true,calculable:true,prescribedEndDateStr:'2025-11-12',daysToPrescribedEnd:180}],false,false)).toContain('avvikande');});
  it('endast en parameter saknas → singular text', () => {
    const t = buildNurseJournalText([{_cardId:1,medRaw:'Sertralin',valid:true,calculable:true,prescribedEndDateStr:'2025-11-12',daysToPrescribedEnd:180}],true,false);
    expect(t).toContain('medicinska uppföljning');
    expect(t).not.toContain('vitalparametrar');
  });
});

// =====================================================
describe('buildPatientText — 3+ läkemedel', () => {
  it('3 läkemedel med blandade beslut', () => {
    const t = buildPatientText('sv', [
      { name: 'Metformin', decision: 'yes', prescribedEndDateStr: '2026-01-01', daysToPrescribedEnd: 200, prescribeEnd: '2026-06-15' },
      { name: 'Atorvastatin', decision: 'no', prescribedEndDateStr: '2026-03-31', daysToPrescribedEnd: -50 },
      { name: 'Losartan', decision: null, prescribedEndDateStr: '2025-12-31', daysToPrescribedEnd: 100 },
    ]);
    expect(t).toContain('Metformin');
    expect(t).toContain('Atorvastatin');
    expect(t).toContain('Losartan');
    expect(t).toContain('klinisk individuell bedömning av läkare');
  });
  it('multi no med datum → klinisk motivering syns', () => {
    const t = buildPatientText('sv', [
      { name: 'Sertralin', decision: 'no', prescribedEndDateStr: '2026-01-30', daysToPrescribedEnd: -50 },
      { name: 'Concerta', decision: 'no', prescribedEndDateStr: '2026-01-30', daysToPrescribedEnd: -50 },
    ]);
    expect(t).toContain('klinisk individuell bedömning av läkare');
  });
  it('multi no en → clinical assessment syns', () => {
    const t = buildPatientText('en', [
      { name: 'Sertralin', decision: 'no', prescribedEndDateStr: '2026-01-30', daysToPrescribedEnd: -50 },
      { name: 'Concerta', decision: 'no', prescribedEndDateStr: '2026-01-30', daysToPrescribedEnd: -50 },
    ]);
    expect(t).toContain('clinical assessment');
  });
  it('multi no med 14+ dagar → klinisk motivering + kontakt syns', () => {
    const t = buildPatientText('sv', [
      { name: 'Sertralin', decision: 'no', prescribedEndDateStr: '2026-12-31', daysToPrescribedEnd: 200, contactDateStr: '2026-12-24' },
    ]);
    expect(t).toContain('klinisk individuell bedömning av läkare');
    expect(t).toContain('Hör av dig');
  });
  it('single no → klinisk motivering syns (redan befintligt)', () => {
    const t = buildPatientText('sv', [
      { name: 'Sertralin', decision: 'no', prescribedEndDateStr: '2026-01-30', daysToPrescribedEnd: -50 },
    ]);
    expect(t).toContain('klinisk individuell bedömning av läkare');
  });
});

// =====================================================
describe('validateValues — gränsfall', () => {
  it('amt=3.5 (decimal) → invalid', () => {
    const r = validateValues('Sertralin 50 mg', '2024-08-13', '1', '3.5', '3', '');
    expect(r.valid).toBe(false);
  });
  it('dose>50 → invalid', () => {
    const r = validateValues('Sertralin 50 mg', '2024-08-13', '51', '100', '3', '');
    expect(r.valid).toBe(false);
  });
  it('dose=50 (gräns) → valid', () => {
    expect(validateValues('Sertralin 50 mg', '2024-08-13', '50', '100', '3', '').valid).toBe(true);
  });
  it('ref=1.5 (decimal) → invalid', () => {
    const r = validateValues('Sertralin 50 mg', '2024-08-13', '1', '100', '1.5', '');
    expect(r.valid).toBe(false);
  });
  it('ref=1 (min) → valid', () => {
    expect(validateValues('Sertralin 50 mg', '2024-08-13', '1', '100', '1', '').valid).toBe(true);
  });
  it('ref=12 (max) → valid', () => {
    expect(validateValues('Sertralin 50 mg', '2024-08-13', '1', '100', '12', '').valid).toBe(true);
  });
  it('left negative → invalid (negativt kvarvarande avvisas)', () => {
    expect(validateValues('Sertralin 50 mg', '2024-08-13', '1', '100', '3', '-5').valid).toBe(false);
  });
  it('left=kvarvarande > amt*ref → valid', () => {
    expect(validateValues('Sertralin 50 mg', '2024-08-13', '1', '100', '3', '50').valid).toBe(true);
  });
  it('medraw >100 tecken → invalid', () => {
    const long = 'A'.repeat(101);
    expect(validateValues(long, '2024-08-13', '1', '100', '3', '').valid).toBe(false);
  });
  it('medraw =100 tecken → valid', () => {
    const max = 'A'.repeat(100);
    expect(validateValues(max, '2024-08-13', '1', '100', '3', '').valid).toBe(true);
  });
  it('date outside 1950-2100 → invalid_date', () => {
    const r = validateValues('Sertralin 50 mg', '1949-12-31', '1', '100', '3', '');
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe('invalid_date');
  });
  it('doseInterval=14 fallback till 1 (ogiltiga intervall avvisas ej, faller tillbaka)', () => {
    const r = validateValues('Sertralin 50 mg', '2024-08-13', '1', '100', '3', '', '14', 'st');
    expect(r.valid).toBe(true);
  });
});

// =====================================================
describe('calcCore — _formatValueWithNote gränser', () => {
  it('daysToPrescribedEnd>0 → "(X dagar kvar)"', () => {
    const inp = makeInput({ dose: 1, amt: 100, ref: 3, dateVal: '2025-01-01' });
    const r = calcCore(v(inp));
    expect(r.metrics![1].value).toContain('dagar kvar');
  });
  it('daysToPrescribedEnd<0 → "slut sedan X dagar"', () => {
    const inp = makeInput({ dose: 2, amt: 100, ref: 3, dateVal: '2024-08-13' });
    const r = calcCore(v(inp));
    expect(r.metrics![1].value).toContain('slut sedan');
  });
});

// =====================================================
describe('calcLongtermCore — periodvalidering', () => {
  const d = (n: number) => {
    const dt = new Date(Date.UTC(2025, 4, 20));
    dt.setUTCDate(dt.getUTCDate() - n);
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
  };
  it('totalError: decimal total (30.5) → totalError=true', () => {
    const r = calcLongtermCore('Metformin', 1, [{ start: d(90), end: d(0), total: 30.5 }]);
    expect(r.periodErrors[0].totalError).toBe(true);
  });
  it('totalError: heltal total=30 → totalError=false', () => {
    const r = calcLongtermCore('Metformin', 1, [{ start: d(90), end: d(0), total: 30 }]);
    expect(r.periodErrors[0].totalError).toBe(false);
  });
  it('endError: endDate <= startDate', () => {
    const r = calcLongtermCore('Metformin', 1, [{ start: d(90), end: d(100), total: 30 }]);
    expect(r.periodErrors[0].endError).toBe(true);
  });
  it('endError: endDate > startDate → endError=false', () => {
    const r = calcLongtermCore('Metformin', 1, [{ start: d(90), end: d(0), total: 30 }]);
    expect(r.periodErrors[0].endError).toBe(false);
  });
  it('spanError: period > MAX_PERIOD_SPAN_DAYS (18250)', () => {
    const far = '1950-01-01';
    const r = calcLongtermCore('Metformin', 1, [{ start: far, end: d(0), total: 1000 }]);
    expect(r.periodErrors[0].spanError).toBe(true);
    expect(r.valid).toBe(false);
  });
  it('overallStatus=under vid låg förbrukning', () => {
    const r = calcLongtermCore('Metformin', 1, [{ start: d(90), end: d(0), total: 50 }]);
    expect(r.valid).toBe(true);
    expect(r.overallStatus).toBe('under');
  });
  it('overallStatus=ok vid normal förbrukning', () => {
    const r = calcLongtermCore('Metformin', 1, [{ start: d(90), end: d(0), total: 90 }]);
    expect(r.overallStatus).toBe('ok');
  });
  it('overallStatus=over vid hög förbrukning', () => {
    const r = calcLongtermCore('Metformin', 1, [{ start: d(90), end: d(0), total: 120 }]);
    expect(r.overallStatus).toBe('over');
  });
  it('två perioder med överlapp → hasOverlap=true', () => {
    const r = calcLongtermCore('Metformin', 1, [
      { start: d(180), end: d(60), total: 120 },
      { start: d(90), end: d(0), total: 90 },
    ]);
    expect(r.hasOverlap).toBe(true);
  });
});

// =====================================================
describe('calcPrescribeResult — utökade tester', () => {
  it('doseUnit=ml → unitLabelShort=ml', () => {
    const r = calcPrescribeResult(
      { _cardId: 1, dose: 5, doseInterval: 1, doseUnit: 'ml', prescribedEndDateStr: '2025-01-01' } as any,
      { packageSize: '100', mode: 'months', months: 3 },
    );
    expect(r!.doseUnit).toBe('ml');
    expect(r!.unitLabelShort).toBe('ml');
  });
  it('doseUnit=dos → unitLabelShort=dos', () => {
    const r = calcPrescribeResult(
      { _cardId: 1, dose: 2, doseInterval: 1, doseUnit: 'dos', prescribedEndDateStr: '2025-01-01' } as any,
      { packageSize: '30', mode: 'months', months: 3 },
    );
    expect(r!.doseUnit).toBe('dos');
    expect(r!.unitLabelShort).toBe('dos');
  });
  it('doseInterval=7 → effektiv dos / 7', () => {
    const r = calcPrescribeResult(
      { _cardId: 1, dose: 1, doseInterval: 7, doseUnit: 'st', prescribedEndDateStr: '2025-01-01' } as any,
      { packageSize: '30', mode: 'months', months: 3 },
    );
    expect(r).not.toBeNull();
    expect(r!.totalTablets).toBeLessThan(20); // 91 dagar / 7 ≈ 13 tabletter
  });
  it('doseInterval=30 → effektiv dos / 30', () => {
    const r = calcPrescribeResult(
      { _cardId: 1, dose: 1, doseInterval: 30, doseUnit: 'st', prescribedEndDateStr: '2025-01-01' } as any,
      { packageSize: '30', mode: 'months', months: 3 },
    );
    expect(r).not.toBeNull();
    expect(r!.totalTablets).toBeLessThan(5); // 91 dagar / 30 ≈ 4 tabletter
  });
  it('date mode: endDate före startDate → null', () => {
    const r = calcPrescribeResult(
      { _cardId: 1, dose: 1, doseUnit: 'st', prescribedEndDateStr: '2025-12-01' } as any,
      { packageSize: '30', mode: 'date', endDate: '2024-01-01' },
    );
    expect(r).toBeNull();
  });
  it('date mode: ogiltig endDate → null', () => {
    const r = calcPrescribeResult(
      { _cardId: 1, dose: 1, doseUnit: 'st', prescribedEndDateStr: '2025-01-01' } as any,
      { packageSize: '30', mode: 'date', endDate: 'ogiltigt' },
    );
    expect(r).toBeNull();
  });
});

// =====================================================
describe('prescribeValidationHint', () => {
  const si: any = { _cardId: 1, dose: 1, doseInterval: 1, doseUnit: 'st', prescribedEndDateStr: '2025-01-01' };

  it('null ps → tom lista', () => {
    expect(prescribeValidationHint(si, null)).toEqual([]);
  });
  it('tom packageSize → info', () => {
    const h = prescribeValidationHint(si, { packageSize: '' });
    expect(h).toHaveLength(1);
    expect(h[0].type).toBe('info');
    expect(h[0].field).toBe('pkg');
    expect(h[0].msg).toContain('Ange förpackningsstorlek');
  });
  it('packageSize=0 → warn', () => {
    const h = prescribeValidationHint(si, { packageSize: '0' });
    expect(h[0].type).toBe('warn');
  });
  it('packageSize negativt → warn', () => {
    const h = prescribeValidationHint(si, { packageSize: '-5' });
    expect(h[0].type).toBe('warn');
  });
  it('packageSize=30 (heltal) → ingen pkg-hint', () => {
    const h = prescribeValidationHint(si, { packageSize: '30' });
    expect(h.filter(x => x.field === 'pkg')).toHaveLength(0);
  });
  it('packageSize=1.5 (decimal) → warn om heltal', () => {
    const h = prescribeValidationHint(si, { packageSize: '1.5' });
    expect(h).toHaveLength(1);
    expect(h[0].type).toBe('warn');
    expect(h[0].msg).toContain('heltal');
  });
  it('date mode: tomt endDate → info', () => {
    const h = prescribeValidationHint(si, { packageSize: '30', mode: 'date', endDate: '' });
    const dateHints = h.filter(x => x.field === 'date');
    expect(dateHints).toHaveLength(1);
    expect(dateHints[0].type).toBe('info');
    expect(dateHints[0].msg).toContain('Ange ett slutdatum');
  });
  it('date mode: ogiltigt endDate → warn', () => {
    const h = prescribeValidationHint(si, { packageSize: '30', mode: 'date', endDate: 'ogiltigt' });
    const dateHints = h.filter(x => x.field === 'date');
    expect(dateHints).toHaveLength(1);
    expect(dateHints[0].type).toBe('warn');
    expect(dateHints[0].msg).toContain('giltigt datum');
  });
  it('date mode: endDate <= startDate → warn', () => {
    const h = prescribeValidationHint(si, { packageSize: '30', mode: 'date', endDate: '2024-12-31' });
    const dateHints = h.filter(x => x.field === 'date');
    expect(dateHints).toHaveLength(1);
    expect(dateHints[0].type).toBe('warn');
    expect(dateHints[0].msg).toContain('måste vara efter');
  });
  it('date mode: giltigt endDate > startDate → ingen date-hint', () => {
    const h = prescribeValidationHint(si, { packageSize: '30', mode: 'date', endDate: '2025-09-20' });
    expect(h.filter(x => x.field === 'date')).toHaveLength(0);
  });
  it('months mode: ingen date-hint (mode != date)', () => {
    const h = prescribeValidationHint(si, { packageSize: '30', mode: 'months', months: 3 });
    expect(h.filter(x => x.field === 'date')).toHaveLength(0);
  });
  it('både pkg och date hint samtidigt', () => {
    const h = prescribeValidationHint(si, { packageSize: '', mode: 'date', endDate: '' });
    expect(h).toHaveLength(2);
  });
});
