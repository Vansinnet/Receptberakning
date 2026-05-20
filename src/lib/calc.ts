import type { CalcInput, CalcResult, CalcAlert, CalcMetric, DoseUnit, DoseInterval, ValidatedInput, InvalidInput } from './types';
import { getToday, getDaysDiff, fmtDate, extractDoseUnit, parseDateUTC } from './utils';
import {
  MAX_MED_NAME_LENGTH,
  MAX_DATE_LENGTH,
  MAX_AMT_VALUE,
  MIN_DOSE_VALUE,
  MAX_DOSE_VALUE,
  MIN_REF_VALUE,
  MAX_REF_VALUE,
  VALID_INTERVALS,
  MAX_TOTAL_DAYS,
  CONSUMPTION_NORMAL_LOW,
  CONSUMPTION_NORMAL_HIGH,
  DAYS_REMAINING_WARN,
  VERY_HIGH_CONSUMPTION_MULTIPLIER,
} from './constants';

// === VALIDATEVALUES ===

export function validateValues(
  medRaw: string,
  dateVal: string,
  doseRaw: string,
  amtRaw: string,
  refRaw: string,
  leftRaw: string,
  doseIntervalRaw?: string,
  doseUnitRaw?: string,
  notCalculable?: boolean
): CalcInput {
  const fieldErrors = { medInput: '', dateInput: '', doseInput: '', amtInput: '', refInput: '', leftInput: '' };

  const safeAmtRaw = (amtRaw == null || amtRaw === 'null') ? '' : String(amtRaw);
  const safeRefRaw = (refRaw == null || refRaw === 'null') ? '' : String(refRaw);
  const safeLeftRaw = (leftRaw == null || leftRaw === 'null') ? '' : String(leftRaw);

  if (medRaw.length > MAX_MED_NAME_LENGTH) {
    fieldErrors.medInput = `Läkemedelsnamnet får inte överstiga ${MAX_MED_NAME_LENGTH} tecken.`;
  }
  if (dateVal.length > MAX_DATE_LENGTH) {
    fieldErrors.dateInput = 'Ogiltigt datum.';
  }

  const amt = parseInt(safeAmtRaw, 10);
  const amtIsInvalid = safeAmtRaw !== '' && (isNaN(amt) || amt <= 0 || amt > MAX_AMT_VALUE || !Number.isInteger(Number(safeAmtRaw)));
  if (amtIsInvalid) fieldErrors.amtInput = `Ange ett heltal mellan 1 och ${MAX_AMT_VALUE}.`;

  const dose = parseFloat(doseRaw.replace(',', '.'));
  const doseIsInvalid = doseRaw !== '' && (isNaN(dose) || dose < MIN_DOSE_VALUE || dose > MAX_DOSE_VALUE);
  if (doseIsInvalid) fieldErrors.doseInput = `Ange ett tal mellan ${MIN_DOSE_VALUE} och ${MAX_DOSE_VALUE}.`;

  const refNum = Number(safeRefRaw);
  const refIsInvalid  = safeRefRaw !== '' && (!Number.isFinite(refNum) || !Number.isInteger(refNum) || refNum < MIN_REF_VALUE || refNum > MAX_REF_VALUE);
  const refOutOfRange = Number.isFinite(refNum) && Number.isInteger(refNum) && refNum > MAX_REF_VALUE;
  if (refOutOfRange)    fieldErrors.refInput = `Max ${MAX_REF_VALUE} uttag stöds.`;
  else if (refIsInvalid) fieldErrors.refInput = `Ange ett heltal mellan ${MIN_REF_VALUE} och ${MAX_REF_VALUE}.`;

  const pDate = dateVal ? parseDateUTC(dateVal) : null;
  if (dateVal && !pDate) fieldErrors.dateInput = 'Ogiltigt datum.';

  const today = getToday();
  if (pDate && pDate > today) {
    fieldErrors.dateInput = 'Datumet är satt i framtiden.';
  }

  const doseUnit: DoseUnit = (doseUnitRaw === 'st' || doseUnitRaw === 'ml' || doseUnitRaw === 'dos') ? doseUnitRaw : 'st';
  const isDiscreteUnit = (doseUnit === 'st');
  const remaining = safeLeftRaw !== '' ? parseFloat(safeLeftRaw.replace(',', '.')) : null;
  const leftIsInvalid = safeLeftRaw !== '' && (
    isNaN(remaining!) || remaining! < 0 ||
    remaining! > MAX_AMT_VALUE ||
    (isDiscreteUnit && !Number.isInteger(remaining!))
  );
  if (leftIsInvalid) {
    fieldErrors.leftInput = isDiscreteUnit
      ? 'Ange ett heltal (0 eller fler), eller lämna tomt.'
      : 'Ange ett tal (0 eller fler), eller lämna tomt.';
  }

  if (refOutOfRange) return { valid: false, reason: 'too_many_refs', fieldErrors };

  const otherMissing = !medRaw || !dateVal || isNaN(dose) || doseIsInvalid || isNaN(amt) || amtIsInvalid || refIsInvalid || !refNum || refNum < 1;
  const hasFieldError = Object.values(fieldErrors).some(e => e !== '');
  if (otherMissing || !pDate || hasFieldError || (pDate && pDate > today) || leftIsInvalid) {
    const dateOnly = (!pDate || (pDate && pDate > today)) && dateVal && !otherMissing && !leftIsInvalid;
    const hasOtherFieldErrors = fieldErrors.medInput !== '' || fieldErrors.doseInput !== '' || fieldErrors.amtInput !== '' || fieldErrors.refInput !== '' || fieldErrors.leftInput !== '';
    const reason = (dateOnly && !hasOtherFieldErrors) ? 'invalid_date' : 'incomplete';
    return { valid: false, reason, fieldErrors };
  }

  const parsedInterval = parseInt(doseIntervalRaw || '', 10);
  const doseInterval = VALID_INTERVALS.includes(parsedInterval) ? parsedInterval : 1;

  const ref = refNum;

  return { valid: true, medRaw, dateVal, pDate, amt, dose, ref, remaining, doseRaw, amtRaw: safeAmtRaw, refRaw: safeRefRaw, leftRaw: safeLeftRaw, doseInterval: doseInterval as DoseInterval, doseUnit, notCalculable: !!notCalculable };
}

// === CALCCORE ===

export function calcCore(inputData: CalcInput): CalcResult {
  if (!inputData.valid) {
    if (inputData.reason === 'too_many_refs') {
      return {
        valid: true, calculable: false,
        metrics: [],
        alerts:  [{ type: 'danger', title: 'Ogiltigt antal uttag', message: 'Max 12 uttag stöds.' }],
        statusText: 'Ogiltigt antal',
        consumptionPct: 0,
      };
    }
    return {
      valid: false,
      statusText: inputData.reason === 'invalid_date' ? 'Ogiltigt datum' : 'Ej ifyllt',
      consumptionPct: 0,
    };
  }

  if (inputData.notCalculable) {
    return {
      valid: true, calculable: false,
      metrics: [],
      alerts:  [{ type: 'info', title: 'Manuell bedömning', message: 'Beredningsformen (t.ex. kräm, lösning för dialys) lämpar sig inte för automatisk förbrukningsberäkning.' }],
      statusText: 'Ej tillämplig',
      consumptionPct: 0,
    };
  }

  const INTERVAL_LABELS: Record<DoseInterval, string> = { 1: 'dag', 7: 'vecka', 30: 'månad' };
  const doseInterval     = inputData.doseInterval || 1;
  const doseUnit: DoseUnit = inputData.doseUnit     || 'st';
  const intervalLabel    = INTERVAL_LABELS[doseInterval] || 'dag';
  const doseUnitLabel    = `${doseUnit}/${intervalLabel}`;
  const effectiveDailyDose = inputData.dose / doseInterval;

  const today     = getToday();
  const daysSince = getDaysDiff(today, inputData.pDate);

  if (daysSince <= 0) {
    return {
      valid: true, calculable: false,
      metrics: [], alerts: [],
      statusText: 'Kan ej beräknas',
      consumptionPct: 0,
    };
  }

  const total     = inputData.amt * inputData.ref;
  const totalDays = total / effectiveDailyDose;

  if (totalDays > MAX_TOTAL_DAYS) {
    return {
      valid: true, calculable: false,
      metrics: [],
      alerts:  [{ type: 'danger', title: 'Orimlig tid', message: 'Kontrollera inmatade värden.' }],
      statusText: 'Orimliga värden',
      consumptionPct: 0,
    };
  }

  const { remaining } = inputData;
  const hasRemaining   = remaining !== null && remaining !== undefined;
  const batchDuration    = inputData.amt / effectiveDailyDose;
  const batchesDispensed = Math.min(inputData.ref, Math.floor(daysSince / batchDuration) + 1);
  const accessibleTotal  = Math.min(total, batchesDispensed * inputData.amt);

  let endDate: Date, daysRemaining: number, avgNum: number, earlyPickup = false, calcBase = accessibleTotal;

  if (hasRemaining) {
    if (remaining! > total) {
      return {
        valid: true, calculable: false,
        metrics: [], alerts: [],
        statusText: 'Orimliga värden',
        consumptionPct: 0,
      };
    }
    earlyPickup = remaining! > accessibleTotal;
    if (earlyPickup) {
      const minB = Math.ceil(remaining! / inputData.amt);
      calcBase = Math.min(minB, inputData.ref) * inputData.amt;
    } else {
      calcBase = total;
    }
    const consumed = calcBase - remaining!;
    if (consumed < 0) {
      return { valid: false, statusText: 'Internt fel — kontrollera inmatningen.', consumptionPct: 0 };
    }
    avgNum        = consumed / daysSince;
    daysRemaining = Math.floor(remaining! / effectiveDailyDose);
    daysRemaining = Math.min(daysRemaining, MAX_TOTAL_DAYS);
    endDate = new Date(today);
    endDate.setUTCDate(today.getUTCDate() + daysRemaining);
  } else {
    endDate = new Date(inputData.pDate);
    endDate.setUTCDate(endDate.getUTCDate() + Math.round(totalDays));
    daysRemaining = getDaysDiff(endDate, today);
    avgNum = total / daysSince;
  }

  const prescribedEndDate = new Date(inputData.pDate);
  prescribedEndDate.setUTCDate(prescribedEndDate.getUTCDate() + Math.round(totalDays));
  const daysToPrescribedEnd = getDaysDiff(prescribedEndDate, today);
  const prescribedEndDateStr = fmtDate(prescribedEndDate);
  const pDateStr = fmtDate(inputData.pDate);

  const avgPerInterval  = avgNum * doseInterval;
  const mgUnit          = extractDoseUnit(inputData.medRaw);
  let displayAvg = `${avgPerInterval.toFixed(2)} ${doseUnitLabel}`;
  if (mgUnit) displayAvg += ` (${(avgPerInterval * mgUnit.amount).toFixed(1)} ${mgUnit.unit}/${intervalLabel})`;
  const avgNote = hasRemaining
    ? `(beräknat på faktisk förbrukning: ${calcBase - remaining!} av ${calcBase} tillgängliga ${doseUnit}${earlyPickup ? ' – patienten kan ha hämtat ut uttag i förväg' : ''})`
    : `(beräknat under antagandet att alla förskrivna ${doseUnit} är förbrukade)`;

  const consumptionPct = (avgNum / effectiveDailyDose) * 100;
  const tlPct  = Math.min(100, Math.max(0, (daysSince / totalDays) * 100));

  const snittCls   = consumptionPct >= CONSUMPTION_NORMAL_LOW && consumptionPct <= CONSUMPTION_NORMAL_HIGH ? 'ok' : 'warn';
  const racktillCls = daysToPrescribedEnd < DAYS_REMAINING_WARN ? 'ok' : 'warn';

  const statusText = `Snittförbrukning ${consumptionPct.toFixed(1)}% av ordinerad dos`;

  const metrics = _buildMetrics(total, doseUnit, prescribedEndDateStr, daysToPrescribedEnd, racktillCls, displayAvg, snittCls, intervalLabel);

  const alerts = _buildAlerts(avgNum, effectiveDailyDose, displayAvg, doseUnitLabel, avgPerInterval, consumptionPct, earlyPickup);

  return {
    valid: true, calculable: true,
    statusText,
    metrics, alerts,
    tlPct, tlStart: pDateStr, tlEnd: prescribedEndDateStr,
    medRaw:               inputData.medRaw,
    amt:                  inputData.amt,
    dose:                 inputData.dose,
    doseInterval,
    doseUnit,
    doseUnitLabel,
    pDateStr,
    total,
    remainingDoses:       hasRemaining ? remaining : null,
    endDateStr:           fmtDate(endDate),
    prescribedEndDateStr,
    daysRemaining,
    daysToPrescribedEnd,
    displayAvgStr:        displayAvg,
    avgNote,
    consumptionPct,
  };
}

function _buildMetrics(
  total: number,
  doseUnit: string,
  prescribedEndDateStr: string,
  daysToPrescribedEnd: number,
  racktillCls: string,
  displayAvg: string,
  snittCls: string,
  intervalLabel: string
): CalcMetric[] {
  return [
    { label: 'Totalt förskrivet', value: `${total} ${doseUnit}`, cls: '', tooltip: `Mängd per uttag × antal uttag.` },
    { label: 'Räcker t.o.m.', value: (function() {
        const note = daysToPrescribedEnd > 0 ? ` (${daysToPrescribedEnd} dagar kvar)`
          : daysToPrescribedEnd === 0 ? ' (tar slut idag)'
          : ` (slut sedan ${Math.abs(daysToPrescribedEnd)} dagar)`;
        return prescribedEndDateStr + note;
      })(), cls: racktillCls, tooltip: `Beräknat slutdatum. Gul markering om ≥${DAYS_REMAINING_WARN} dagar återstår.` },
    { label: 'Snittförbrukning', value: displayAvg, cls: snittCls, tooltip: `Genomsnittlig förbrukning per ${intervalLabel}. Grön om 80–110% av ordination, gul annars.` },
  ];
}

function _buildAlerts(
  avgNum: number,
  effectiveDailyDose: number,
  displayAvg: string,
  doseUnitLabel: string,
  avgPerInterval: number,
  consumptionPct: number,
  earlyPickup: boolean
): CalcAlert[] {
  let alerts: CalcAlert[] = [];
  if (avgNum === 0) {
    alerts.push({ type: 'warn', title: 'Ingen förbrukning registrerad', message: `Snitt 0 ${doseUnitLabel} – patienten verkar inte ha tagit medicinen. Klinisk bedömning krävs.` });
  }
  if (avgNum > effectiveDailyDose * VERY_HIGH_CONSUMPTION_MULTIPLIER) {
    alerts.push({ type: 'warn', title: 'Datakontroll', message: `Snitt ${avgPerInterval.toFixed(2)} ${doseUnitLabel} är mycket högt. Kontrollera kvarvarande mängd.` });
  }
  if (earlyPickup) {
    alerts.push({ type: 'info', title: 'Tidig uthämtning', message: 'Kvarvarande doser överstiger modellens förväntade tillgängliga mängd. Beräknas från minsta möjliga antal uttag.' });
  }
  return alerts;
}
