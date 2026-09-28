// REFERENSFACIT ("golden master")
// 300 fasta fall med sina frysta resultat i tests/fixtures/golden.json. Ändras en enda siffra
// i någon beräkning faller testet och visar exakt vilka fall som ändrats.
//
// Är ändringen AVSIKTLIG och godkänd: uppdatera facit med `npm run test:golden:update`
// och granska diffen i git innan commit. Är den inte avsiktlig: rätta koden.
import { describe, it, expect } from 'vitest';
import { calcRenewal, isRenewalOk } from '../../src/lib/domain/renewal';
import { calcPrescription } from '../../src/lib/domain/prescribe';
import { calcLongterm } from '../../src/lib/domain/longterm';
import { addDays, fmtDate } from '../../src/lib/utils';
import type { DoseInterval, DoseUnit, MedForm } from '../../src/lib/types';

const TODAY = new Date(Date.UTC(2026, 9, 1));

// Deterministisk slump (mulberry32) — samma fall varje körning, på alla datorer.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r = rng(20260927);
const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
const round = (n: number) => Math.round(n * 1e6) / 1e6;

function renewalCases() {
  const out = [];
  for (let i = 0; i < 300; i++) {
    const unit = pick(['st', 'st', 'ml', 'dos'] as const satisfies readonly DoseUnit[]);
    const interval = pick([1, 1, 1, 7, 30] as const satisfies readonly DoseInterval[]);
    const dose = pick(['0,5', '1', '1', '1,5', '2', '3', '4', '10']);
    const f: MedForm = {
      name: `Fall ${i + 1}`, atcCode: null, nplId: null, doseForm: '', regulation: null, notCalculable: false,
      unit, interval, doseRaw: dose,
      dateRaw: fmtDate(addDays(TODAY, -int(0, 900))),
      packageRaw: String(pick([1, 4, 10, 28, 30, 50, 98, 100, 200, 250, 500])),
      refillsRaw: String(int(1, 12)),
    };
    const res = calcRenewal(f, TODAY);
    const row: Record<string, unknown> = { input: `${f.dateRaw} ${f.doseRaw} ${f.unit}/${interval}d ${f.packageRaw}×${f.refillsRaw}`, kind: res.kind };
    if (isRenewalOk(res)) {
      const months = int(1, 12);
      const p = calcPrescription(res, { period: months, endDateRaw: '', packageRaw: null, fromToday: r() < 0.3 }, TODAY);
      Object.assign(row, {
        endDate: fmtDate(res.endDate), daysLeft: res.daysLeft, expectedLeft: round(res.expectedLeft),
        status: res.status, pct: res.consumption ? round(res.consumption.pct) : null, tone: res.consumption?.tone ?? null,
        prescribe: { months, kind: p.kind, start: fmtDate(p.start), ...(p.kind === 'ok' ? { days: p.days, units: p.units, packages: p.packages } : {}) },
      });
    }
    out.push(row);
  }
  return out;
}

function longtermCases() {
  const out = [];
  for (let i = 0; i < 60; i++) {
    const n = int(1, 5);
    const rows = Array.from({ length: n }, () => {
      const start = int(20, 700), len = int(1, 120);
      return { startRaw: fmtDate(addDays(TODAY, -start)), endRaw: fmtDate(addDays(TODAY, -start + len - 1)), totalRaw: String(int(1, 200)) };
    });
    const dose = pick(['0,5', '1', '2', '3']);
    const res = calcLongterm(rows, dose, TODAY);
    out.push({
      input: rows.map((x) => `${x.startRaw}–${x.endRaw}:${x.totalRaw}`).join(' ') + ` dos ${dose}`,
      ...(res.kind === 'ok'
        ? { unionDays: res.unionDays, total: res.total, pct: round(res.pct), cls: res.cls, overlap: res.overlap, periods: res.periods.map((p) => p.cls) }
        : { kind: res.kind }),
    });
  }
  return out;
}

describe('Referensfacit', () => {
  it('förnyelse och nyförskrivning, 300 fall', async () => {
    await expect(JSON.stringify(renewalCases(), null, 1)).toMatchFileSnapshot('../fixtures/golden-renewal.json');
  });
  it('långtidsanalys, 60 fall', async () => {
    await expect(JSON.stringify(longtermCases(), null, 1)).toMatchFileSnapshot('../fixtures/golden-longterm.json');
  });
});
