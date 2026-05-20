import type { LTCardPeriod, LTResult } from './types';
import { getToday, getDaysDiff, fmtDate, parseDateUTC, extractDoseUnit, getFassUrl, stripManufacturer } from './utils';
import {
  MAX_PERIOD_SPAN_DAYS,
  LT_OVER,
  LT_UNDER,
  LT_BAR_MAX_PCT,
} from './constants';

export function calcLongtermCore(
  medRaw: string,
  ordDose: number,
  rawPeriods: LTCardPeriod[],
  nplId?: string | null
): LTResult {
  const today = getToday();
  const periodErrors: LTResult['periodErrors'] = [];
  const periods: Array<{
    startDate: Date;
    endDate: Date;
    total: number;
    days: number;
    avgPerDay: number;
    classification?: string;
  }> = [];

  for (let i = 0; i < rawPeriods.length; i++) {
    const p         = rawPeriods[i];
    const startDate = parseDateUTC(p.start);
    const endDate   = parseDateUTC(p.end);
    const totalVal  = p.total;

    periodErrors.push({
      id:         i,
      startError: !!(p.start !== '' && (!startDate || startDate > today)),
      endError:   !!(p.end   !== '' && (!endDate   || endDate > today || !startDate || endDate <= startDate)),
      totalError: !!(p.total > 0 && !Number.isInteger(p.total)),
      spanError:  false,
    });

    if (startDate && endDate && endDate <= today && totalVal > 0 && Number.isInteger(totalVal) && startDate < endDate) {
      const days = getDaysDiff(endDate, startDate);
      if (days <= 0 || days > MAX_PERIOD_SPAN_DAYS) {
        periodErrors.at(-1)!.spanError = true;
        continue;
      }
      periods.push({ startDate, endDate, total: totalVal, days, avgPerDay: totalVal / days });
    }
  }

  if (isNaN(ordDose) || ordDose <= 0 || periods.length === 0) {
    return { valid: false, periodErrors, periods: [] };
  }

  periods.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

  let hasOverlap = false;
  for (let i = 0; i < periods.length - 1; i++) {
    if (periods[i].endDate > periods[i + 1].startDate) { hasOverlap = true; break; }
  }

  const totalTablets = periods.reduce((s, p) => s + p.total, 0);

  let totalDays: number;
  if (hasOverlap) {
    const merged: Array<{ start: Date; end: Date }> = [];
    for (const p of periods) {
      if (merged.length === 0 || p.startDate >= merged[merged.length - 1].end) {
        merged.push({ start: p.startDate, end: p.endDate });
      } else if (p.endDate > merged[merged.length - 1].end) {
        merged[merged.length - 1].end = p.endDate;
      }
    }
    totalDays = merged.reduce((s, r) => s + getDaysDiff(r.end, r.start), 0);
  } else {
    totalDays = periods.reduce((s, p) => s + p.days, 0);
  }

  if (totalDays === 0) return { valid: false, periodErrors, periods: [] };

  const overallAvg     = totalTablets / totalDays;
  const consumptionPct = (overallAvg / ordDose) * 100;
  const doseUnit       = extractDoseUnit(medRaw);
  let avgStr = `${overallAvg.toFixed(2)} enheter/dag`;
  if (doseUnit) avgStr += ` (${(overallAvg * doseUnit.amount).toFixed(1)} ${doseUnit.unit}/dag)`;

  periods.forEach(p => {
    p.classification = p.avgPerDay > ordDose * LT_OVER  ? 'over'
                     : p.avgPerDay < ordDose * LT_UNDER ? 'under'
                     : 'ok';
  });

  let overallStatus: LTResult['overallStatus'];
  let alertType: LTResult['alertType'];
  let alertTitle: string;
  let alertMsg: string;
  if (overallAvg > ordDose * LT_OVER) {
    overallStatus = 'over'; alertType = 'danger';
    alertTitle = 'Förbrukning överstiger ordination';
    alertMsg   = `Snitt ${avgStr} är ${(consumptionPct - 100).toFixed(1)}% över ordinerad dos (${ordDose} enheter/dag). Gör en individuell klinisk bedömning.`;
  } else if (overallAvg < ordDose * LT_UNDER) {
    overallStatus = 'under'; alertType = 'warn';
    alertTitle = 'Låg förbrukning';
    alertMsg   = `Snitt ${avgStr} är ${(100 - consumptionPct).toFixed(1)}% under ordinerad dos (${ordDose} enheter/dag). Överväg om patienten tar medicinen som ordinerat.`;
  } else {
    overallStatus = 'ok'; alertType = 'ok';
    alertTitle = 'Förbrukning enligt ordination';
    alertMsg   = `Snitt ${avgStr} är i linje med ordinerad dos (${ordDose} enheter/dag), avvikelse ${Math.abs(consumptionPct - 100).toFixed(1)}%.`;
  }

  const periodSummary = periods.map(p =>
    `  ${fmtDate(p.startDate)}–${fmtDate(p.endDate)} (${p.days} dagar, ${p.total} enheter, snitt ${p.avgPerDay.toFixed(2)} enheter/dag)`
  ).join('\n');

  const resultPeriods = periods.map(p => ({
    start: fmtDate(p.startDate),
    end: fmtDate(p.endDate),
    days: p.days,
    total: p.total,
    avg: p.avgPerDay,
    consumptionPct: (p.avgPerDay / ordDose) * 100,
    classification: p.classification as 'ok' | 'over' | 'under',
  }));

  return {
    valid: true,
    periodErrors,
    periods: resultPeriods,
    totalTablets,
    totalDays,
    overallAvg,
    consumptionPct,
    overallStatus,
    alertType,
    alertTitle,
    alertMsg,
    hasOverlap,
    barPct:      Math.min(LT_BAR_MAX_PCT, Math.max(0, consumptionPct)),
    fassUrl:     getFassUrl(medRaw, nplId),
    journalText: `Aktuellt: Förbrukningsanalys av ${stripManufacturer(medRaw)}.\n\nOrdinerad dos: ${ordDose} enheter/dag.\nAnalysperiod: ${periods.length} period(er), totalt ${totalDays} dagar.\n\nPerioder:\n${periodSummary}\n\nSammanlagd snittförbrukning: ${avgStr} (${consumptionPct.toFixed(1)}% av ordinerad dos).\n\nBedömning: [fyll i här]`,
  };
}
