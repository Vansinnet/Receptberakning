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

function _validateMedName(medRaw: string): string {
  return medRaw.length > MAX_MED_NAME_LENGTH
    ? `Läkemedelsnamnet får inte överstiga ${MAX_MED_NAME_LENGTH} tecken.`
    : '';
}

function _validateDate(dateVal: string, pDate: Date | null, today: Date): { error: string; invalidDate: boolean } {
  if (dateVal.length > MAX_DATE_LENGTH) return { error: 'Ogiltigt datum.', invalidDate: true };
  if (dateVal && !pDate) return { error: 'Ogiltigt datum.', invalidDate: true };
  if (pDate && pDate > today) return { error: 'Datumet är satt i framtiden.', invalidDate: true };
  return { error: '', invalidDate: false };
}

function _validateAmt(safeAmtRaw: string, amt: number): string {
  if (safeAmtRaw === '') return '';
  const invalid = isNaN(amt) || amt <= 0 || amt > MAX_AMT_VALUE || !Number.isInteger(Number(safeAmtRaw));
  return invalid ? `Ange ett heltal mellan 1 och ${MAX_AMT_VALUE}.` : '';
}

function _validateDose(doseRaw: string, dose: number): string {
  if (doseRaw === '') return '';
  const invalid = isNaN(dose) || dose < MIN_DOSE_VALUE || dose > MAX_DOSE_VALUE;
  return invalid ? `Ange ett tal mellan ${MIN_DOSE_VALUE} och ${MAX_DOSE_VALUE}.` : '';
}

function _validateRef(safeRefRaw: string, refNum: number): { error: string; outOfRange: boolean } {
  if (safeRefRaw === '') return { error: '', outOfRange: false };
  const outOfRange = Number.isFinite(refNum) && Number.isInteger(refNum) && refNum > MAX_REF_VALUE;
  if (outOfRange) return { error: `Max ${MAX_REF_VALUE} uttag stöds.`, outOfRange: true };
  const invalid = !Number.isFinite(refNum) || !Number.isInteger(refNum) || refNum < MIN_REF_VALUE;
  return { error: invalid ? `Ange ett heltal mellan ${MIN_REF_VALUE} och ${MAX_REF_VALUE}.` : '', outOfRange: false };
}

function _validateLeft(safeLeftRaw: string, remaining: number | null, isDiscreteUnit: boolean): string {
  if (remaining === null) return '';
  const invalid = isNaN(remaining) || remaining < 0 || remaining > MAX_AMT_VALUE
    || (isDiscreteUnit && !Number.isInteger(remaining));
  if (!invalid) return '';
  return isDiscreteUnit
    ? 'Ange ett heltal (0 eller fler), eller lämna tomt.'
    : 'Ange ett tal (0 eller fler), eller lämna tomt.';
}

/**
 * Validerar formulärvärden. Hanterar datumparse, dosintervall och enhetsnormalisering.
 * @returns ValidatedInput vid godkänd validering, InvalidInput annars.
 */
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
  // ── Steg 1: Sanitize ──
  const safeAmtRaw = (amtRaw == null || amtRaw === 'null') ? '' : String(amtRaw);
  const safeRefRaw = (refRaw == null || refRaw === 'null') ? '' : String(refRaw);
  const safeLeftRaw = (leftRaw == null || leftRaw === 'null') ? '' : String(leftRaw);

  // ── Steg 2: Parse ──
  const amt = parseInt(safeAmtRaw, 10);
  const dose = parseFloat(doseRaw.replace(',', '.'));
  const refNum = Number(safeRefRaw);
  const pDate = dateVal ? parseDateUTC(dateVal) : null;
  const today = getToday();
  const doseUnit: DoseUnit = (doseUnitRaw === 'st' || doseUnitRaw === 'ml' || doseUnitRaw === 'dos') ? doseUnitRaw : 'st';
  const isDiscreteUnit = (doseUnit === 'st');
  const remaining = safeLeftRaw !== '' ? parseFloat(safeLeftRaw.replace(',', '.')) : null;

  // ── Steg 3: Validate fields ──
  const fieldErrors = {
    medInput: _validateMedName(medRaw),
    dateInput: _validateDate(dateVal, pDate, today).error,
    doseInput: _validateDose(doseRaw, dose),
    amtInput: _validateAmt(safeAmtRaw, amt),
    refInput: '',
    leftInput: _validateLeft(safeLeftRaw, remaining, isDiscreteUnit),
  };

  const refValidation = _validateRef(safeRefRaw, refNum);
  fieldErrors.refInput = refValidation.error;

  // ── Steg 4: Build result ──
  if (refValidation.outOfRange) return { valid: false, reason: 'too_many_refs', fieldErrors };

  const amtIsInvalid = fieldErrors.amtInput !== '';
  const doseIsInvalid = fieldErrors.doseInput !== '';
  const refIsInvalid = fieldErrors.refInput !== '';
  const leftIsInvalid = fieldErrors.leftInput !== '';
  const refNumTooLow = !refNum || refNum < 1;

  const otherMissing = !medRaw || !dateVal || isNaN(dose) || doseIsInvalid || isNaN(amt) || amtIsInvalid || refIsInvalid || refNumTooLow;
  const hasFieldError = Object.values(fieldErrors).some(e => e !== '');
  if (otherMissing || !pDate || hasFieldError || (pDate && pDate > today) || leftIsInvalid) {
    const dateOnly = (!pDate || (pDate && pDate > today)) && dateVal && !otherMissing && !leftIsInvalid;
    const hasOtherFieldErrors = fieldErrors.medInput !== '' || fieldErrors.doseInput !== '' || fieldErrors.amtInput !== '' || fieldErrors.refInput !== '' || fieldErrors.leftInput !== '';
    const reason = (dateOnly && !hasOtherFieldErrors) ? 'invalid_date' : 'incomplete';
    return { valid: false, reason, fieldErrors };
  }

  const parsedInterval = parseInt(doseIntervalRaw ?? '', 10);
  const doseInterval = VALID_INTERVALS.includes(parsedInterval) ? parsedInterval : 1;

  return { valid: true, medRaw, dateVal, pDate, amt, dose, ref: refNum, remaining, doseRaw, amtRaw: safeAmtRaw, refRaw: safeRefRaw, leftRaw: safeLeftRaw, doseInterval: doseInterval as DoseInterval, doseUnit, notCalculable: !!notCalculable };
}

// === CALCCORE ===

const INTERVAL_LABELS: Record<DoseInterval, string> = { 1: 'dag', 7: 'vecka', 30: 'månad' };

function _buildAvgNote(hasRemaining: boolean, calcBase: number, remaining: number | null, doseUnit: string, earlyPickup: boolean): string {
  if (!hasRemaining) return `(beräknat under antagandet att alla förskrivna ${doseUnit} är förbrukade)`;
  const suffix = earlyPickup ? ' – patienten kan ha hämtat ut uttag i förväg' : '';
  return `(beräknat på faktisk förbrukning: ${calcBase - remaining!} av ${calcBase} tillgängliga ${doseUnit}${suffix})`;
}

/**
 * Beräknar läkemedelsförbrukning. DOM-fri, stateless.
 * Returnerar diskriminerad union: CalcFailure | CalcNonCalculable | CalcSuccess.
 */
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

  const doseInterval     = inputData.doseInterval || 1;
  const doseUnit: DoseUnit = inputData.doseUnit     || 'st';
  const intervalLabel    = INTERVAL_LABELS[doseInterval];
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

  let estimatedEndDate: Date, daysRemaining: number, avgNum: number, calcBase = accessibleTotal;
  let earlyPickup = false;

  if (hasRemaining) {
    const rem = remaining as number;
    if (rem > total) {
      return {
        valid: true, calculable: false,
        metrics: [], alerts: [],
        statusText: 'Orimliga värden',
        consumptionPct: 0,
      };
    }
    earlyPickup = rem > accessibleTotal;
    if (earlyPickup) {
      const minB = Math.ceil(rem / inputData.amt);
      calcBase = Math.min(minB, inputData.ref) * inputData.amt;
    } else {
      calcBase = total;
    }
    const consumed = calcBase - rem;
    if (consumed < 0) {
      return { valid: false, statusText: 'Internt fel — kontrollera inmatningen.', consumptionPct: 0 };
    }
    avgNum        = consumed / daysSince;
    daysRemaining = Math.floor(rem / effectiveDailyDose);
    daysRemaining = Math.min(daysRemaining, MAX_TOTAL_DAYS);
    estimatedEndDate = new Date(today);
    estimatedEndDate.setUTCDate(today.getUTCDate() + daysRemaining);
  } else {
    estimatedEndDate = new Date(inputData.pDate);
    estimatedEndDate.setUTCDate(estimatedEndDate.getUTCDate() + Math.round(totalDays));
    daysRemaining = getDaysDiff(estimatedEndDate, today);
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
  const avgNote = _buildAvgNote(hasRemaining, calcBase, remaining, doseUnit, earlyPickup);

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
    estimatedEndDateStr:    fmtDate(estimatedEndDate),
    prescribedEndDateStr,
    daysRemaining,
    daysToPrescribedEnd,
    displayAvgStr:        displayAvg,
    avgNote,
    consumptionPct,
  };
}

function _formatValueWithNote(prescribedEndDateStr: string, daysToPrescribedEnd: number): string {
  const note = daysToPrescribedEnd > 0 ? ` (${daysToPrescribedEnd} dagar kvar)`
    : daysToPrescribedEnd === 0 ? ' (tar slut idag)'
    : ` (slut sedan ${Math.abs(daysToPrescribedEnd)} dagar)`;
  return prescribedEndDateStr + note;
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
    { label: 'Räcker t.o.m.', value: _formatValueWithNote(prescribedEndDateStr, daysToPrescribedEnd), cls: racktillCls, tooltip: `Beräknat slutdatum. Gul markering om ≥${DAYS_REMAINING_WARN} dagar återstår.` },
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
