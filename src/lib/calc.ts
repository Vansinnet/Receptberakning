import type { CalcInput, PrevCalcResult, CalcResult, CalcAlert, CalcMetric, DoseUnit, DoseInterval, ValidatedInput, InvalidInput } from './types';
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
  OVERUSE_THRESHOLD,
  OVERUSE_SUPPRESSION_DAYS,
  OVERUSE_MIN_RECEPT_DAYS,
  EARLY_RENEWAL_THRESHOLD,
  LOW_CONSUMPTION_PCT,
  VERY_HIGH_CONSUMPTION_MULTIPLIER,
  CONTACT_DATE_OFFSET_DAYS,
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

  if (medRaw.length > MAX_MED_NAME_LENGTH) {
    fieldErrors.medInput = 'Läkemedelsnamnet får inte överstiga 100 tecken.';
  }
  if (dateVal.length > MAX_DATE_LENGTH) {
    fieldErrors.dateInput = 'Ogiltigt datum.';
  }

  const amt = parseInt(amtRaw, 10);
  const amtIsInvalid = amtRaw !== '' && (isNaN(amt) || amt <= 0 || amt > MAX_AMT_VALUE || !Number.isInteger(Number(amtRaw)));
  if (amtIsInvalid) fieldErrors.amtInput = 'Ange ett heltal mellan 1 och 10 000.';

  const dose = parseFloat(doseRaw.replace(',', '.'));
  const doseIsInvalid = doseRaw !== '' && (isNaN(dose) || dose < MIN_DOSE_VALUE || dose > MAX_DOSE_VALUE);
  if (doseIsInvalid) fieldErrors.doseInput = 'Ange ett tal mellan 0,1 och 50.';

  const refNum = Number(refRaw);
  const refIsInvalid  = refRaw !== '' && (!Number.isFinite(refNum) || !Number.isInteger(refNum) || refNum < MIN_REF_VALUE || refNum > MAX_REF_VALUE);
  const refOutOfRange = Number.isFinite(refNum) && Number.isInteger(refNum) && refNum > MAX_REF_VALUE;
  if (refOutOfRange)    fieldErrors.refInput = 'Max 12 uttag stöds.';
  else if (refIsInvalid) fieldErrors.refInput = 'Ange ett heltal mellan 1 och 12.';

  const pDate = dateVal ? parseDateUTC(dateVal) : null;
  if (dateVal && !pDate) fieldErrors.dateInput = 'Ogiltigt datum.';

  const today = getToday();
  if (pDate && pDate > today) {
    fieldErrors.dateInput = 'Datumet är satt i framtiden.';
  }

  const doseUnit = doseUnitRaw || 'st';
  const isDiscreteUnit = (doseUnit === 'st');
  const remaining = leftRaw !== '' ? parseFloat(String(leftRaw).replace(',', '.')) : null;
  const leftIsInvalid = leftRaw !== '' && (
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

  return { valid: true, medRaw, dateVal, pDate, amt, dose, ref, remaining, doseRaw, amtRaw, refRaw, leftRaw, doseInterval: doseInterval as DoseInterval, doseUnit: doseUnit as DoseUnit, notCalculable: !!notCalculable };
}

// === CALCCORE ===

export function calcCore(inputData: CalcInput, prev: PrevCalcResult): CalcResult {
  if (!inputData.valid) {
    if (inputData.reason === 'too_many_refs') {
      return {
        valid: true, calculable: false, isOveruse: false, isTooEarly: false,
        verdictTitle: 'Ogiltigt antal uttag',
        verdictSub:   'Max 12 uttag stöds.',
        metrics: [],
        alerts:  [{ type: 'danger', title: 'Ogiltigt antal uttag', message: 'Max 12 uttag stöds.' }],
        patientText: '', patientTextEn: '', journalText: '',
        statusText: 'Ogiltigt antal',
      };
    }
    return {
      valid: false,
      statusText: inputData.reason === 'invalid_date' ? 'Ogiltigt datum' : 'Ej ifyllt',
    };
  }

  // Beredningar utan kvantifierbar dosering kan inte beräknas automatiskt.
  if (inputData.notCalculable) {
    return {
      valid: true, calculable: false, isOveruse: false, isTooEarly: false,
      verdictTitle: 'Beräkning ej tillämplig',
      verdictSub:   'Denna beredningsform kan inte kvantifieras automatiskt. Klinisk bedömning krävs.',
      metrics: [],
      alerts:  [{ type: 'info', title: 'Manuell bedömning', message: 'Beredningsformen (t.ex. kräm, lösning för dialys) lämpar sig inte för automatisk förbrukningsberäkning.' }],
      patientText: '', patientTextEn: '', journalText: '',
      statusText: 'Ej tillämplig',
    };
  }

  // Beräkna enhetsbeteckning för dos
  const INTERVAL_LABELS: Record<number, string> = { 1: 'dag', 7: 'vecka', 30: 'månad' };
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
      isOveruse: false, isTooEarly: false,
      verdictTitle: 'Kan ej beräknas idag',
      verdictSub:   'Receptet måste vara utfärdat minst en dag tillbaka.',
      metrics: [], alerts: [],
      patientText: '', patientTextEn: '', journalText: '',
      statusText: 'Kan ej beräknas',
    };
  }

  const total     = inputData.amt * inputData.ref;
  const totalDays = total / effectiveDailyDose;

  if (totalDays > MAX_TOTAL_DAYS) {
    return {
      valid: true, calculable: false, isOveruse: false, isTooEarly: false,
      verdictTitle: 'Orimliga värden',
      verdictSub:   'Beräknad tid överstiger 10 år.',
      metrics: [],
      alerts:  [{ type: 'danger', title: 'Orimlig tid', message: 'Kontrollera inmatade värden.' }],
      patientText: '', patientTextEn: '', journalText: '',
      statusText: 'Orimliga värden',
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
        valid: true, calculable: false, isOveruse: false, isTooEarly: false,
        verdictTitle: 'Orimligt värde',
        verdictSub:   `Kvarvarande (${remaining}) kan inte överstiga totalt förskrivet (${total}).`,
        metrics: [], alerts: [],
        patientText: '', patientTextEn: '', journalText: '',
        statusText: 'Orimliga värden',
      };
    }
    earlyPickup = remaining! > accessibleTotal;
    if (earlyPickup) {
      const minB = Math.ceil(remaining! / inputData.amt);
      calcBase = Math.min(minB, inputData.ref) * inputData.amt;
    } else {
      calcBase = accessibleTotal;
    }
    const consumed = calcBase - remaining!;
    if (consumed < 0) {
      console.error('[calcCore] consumed < 0 — oväntat tillstånd. Kontrollera inmatningen.');
      return { valid: false, isOveruse: false, isTooEarly: false, statusText: 'Internt fel — kontrollera inmatningen.' };
    }
    avgNum        = consumed / daysSince;
    daysRemaining = Math.floor(remaining! / effectiveDailyDose);
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

  const isOveruse  = _detectOveruse(avgNum, effectiveDailyDose, daysRemaining, daysToPrescribedEnd);
  const isTooEarly = _detectTooEarly(isOveruse, daysToPrescribedEnd, totalDays);

  const avgPerInterval  = avgNum * doseInterval;
  const mgUnit          = extractDoseUnit(inputData.medRaw);
  let displayAvg = `${avgPerInterval.toFixed(2)} ${doseUnitLabel}`;
  if (mgUnit) displayAvg += ` (${(avgPerInterval * mgUnit.amount).toFixed(1)} ${mgUnit.unit}/${intervalLabel})`;
  const avgNote = hasRemaining
    ? `(beräknat på faktisk förbrukning: ${calcBase - remaining!} av ${calcBase} tillgängliga ${doseUnit}${earlyPickup ? ' – patienten kan ha hämtat ut uttag i förväg' : ''})`
    : `(beräknat under antagandet att alla hittills tillgängliga ${doseUnit} är förbrukade)`;

  const flagsChanged         = prev.isOveruse !== isOveruse || prev.isTooEarly !== isTooEarly;
  const earlyRenewalDecision = flagsChanged ? null : (prev.earlyRenewalDecision || null);

  const earlyThreshold = Math.round(totalDays * EARLY_RENEWAL_THRESHOLD);
  const tlPct  = Math.min(100, Math.max(0, (daysSince / totalDays) * 100));
  const endCls = daysToPrescribedEnd < 0 ? 'danger' : daysToPrescribedEnd <= earlyThreshold ? 'warn' : 'ok';

  const statusText = isOveruse && earlyRenewalDecision === 'yes' ? 'OK – förnyas (klinisk bed.)'
    : isOveruse    ? 'För tidig förnyelse'
    : isTooEarly   && earlyRenewalDecision === 'yes' ? 'OK – förnyas tidigt'
    : isTooEarly   ? `För tidigt — ${daysToPrescribedEnd}d kvar`
    : `OK – t.o.m. ${prescribedEndDateStr}`;

  const metrics = _buildMetrics(total, doseUnit, prescribedEndDateStr, daysToPrescribedEnd, endCls, displayAvg, isOveruse, intervalLabel);

  const consumptionPct = (avgNum / effectiveDailyDose) * 100;
  const v = _buildVerdict(isOveruse, isTooEarly, earlyRenewalDecision, avgPerInterval, doseUnitLabel, daysToPrescribedEnd, consumptionPct, totalDays);
  const verdictTitle = v.verdictTitle;
  const verdictSub   = v.verdictSub;

  const alerts = _buildAlerts(avgNum, effectiveDailyDose, daysRemaining, isOveruse, displayAvg, doseUnitLabel, avgPerInterval, consumptionPct, isTooEarly, daysToPrescribedEnd, prescribedEndDateStr, earlyPickup);

  const contacts = _computeContactDates(isOveruse, isTooEarly, prescribedEndDate, earlyThreshold);
  const prescribedContactDateStr = contacts.prescribedContactDateStr;
  const prescribedContactIsPast  = contacts.prescribedContactIsPast;
  const renewDateStr             = contacts.renewDateStr;

  return {
    valid: true, calculable: true,
    isOveruse, isTooEarly, earlyRenewalDecision,
    statusText, verdictTitle, verdictSub,
    metrics, alerts,
    tlPct, tlStart: pDateStr, tlEnd: prescribedEndDateStr,
    earlyThreshold,
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
    ...(isOveruse  ? { prescribedContactDateStr, prescribedContactIsPast } : {}),
    ...(isTooEarly ? { renewDateStr } : {}),
  };
}

// === INTERNA HJÄLPFUNKTIONER ===

function _detectOveruse(avgNum: number, effectiveDailyDose: number, daysRemaining: number, daysToPrescribedEnd: number): boolean {
  return avgNum > effectiveDailyDose * OVERUSE_THRESHOLD && (daysRemaining > OVERUSE_SUPPRESSION_DAYS || daysToPrescribedEnd > OVERUSE_MIN_RECEPT_DAYS);
}

function _detectTooEarly(isOveruse: boolean, daysToPrescribedEnd: number, totalDays: number): boolean {
  return !isOveruse && daysToPrescribedEnd > Math.round(totalDays * EARLY_RENEWAL_THRESHOLD);
}

function _buildMetrics(
  total: number,
  doseUnit: string,
  prescribedEndDateStr: string,
  daysToPrescribedEnd: number,
  endCls: string,
  displayAvg: string,
  isOveruse: boolean,
  intervalLabel: string
): CalcMetric[] {
  return [
    { label: 'Totalt förskrivet', value: `${total} ${doseUnit}`, cls: '', tooltip: `Mängd per uttag × antal uttag. Den totala förskrivna mängden på receptet.` },
    { label: 'Räcker t.o.m.', value: (function() {
        const note = daysToPrescribedEnd > 0 ? ` (${daysToPrescribedEnd} dagar kvar)`
          : daysToPrescribedEnd === 0 ? ' (tar slut idag)'
          : ` (slut sedan ${Math.abs(daysToPrescribedEnd)} dagar)`;
        return prescribedEndDateStr + note;
      })(), cls: endCls, tooltip: `Beräknat datum då receptet tar slut vid ordinerad dos. Kvarvarande mängd används enbart för att beräkna snittförbrukning.` },
    { label: 'Snittförbrukning', value: displayAvg, cls: isOveruse ? 'danger' : '', tooltip: `Genomsnittlig förbrukning per ${intervalLabel} sedan receptet utfärdades. Mer än 10% över ordination kräver klinisk bedömning om mer än 7 dagsmotsvarigheter återstår eller receptperioden har mer än 14 dagar kvar.` },
  ];
}

function _buildVerdict(
  isOveruse: boolean,
  isTooEarly: boolean,
  earlyRenewalDecision: 'yes' | 'no' | null,
  avgPerInterval: number,
  doseUnitLabel: string,
  daysToPrescribedEnd: number,
  consumptionPct: number,
  totalDays: number
): { verdictTitle: string; verdictSub: string } {
  if (isOveruse && earlyRenewalDecision === 'yes') {
    return { verdictTitle: 'OK – Förnya recept', verdictSub: 'Klinisk bedömning: förnyelse trots förhöjd förbrukning.' };
  }
  if (isOveruse) {
    return { verdictTitle: 'För tidig förnyelse – bedömning krävs', verdictSub: `Snitt ${avgPerInterval.toFixed(2)} ${doseUnitLabel} överstiger ordination med >10%.` };
  }
  if (isTooEarly && earlyRenewalDecision === 'yes') {
    return { verdictTitle: 'OK – Förnya recept', verdictSub: `Klinisk bedömning: förnyelse trots ${daysToPrescribedEnd} dagar kvar av receptperioden.` };
  }
  if (isTooEarly) {
    return { verdictTitle: `För tidigt – ${daysToPrescribedEnd} dagar kvar`, verdictSub: 'Förbrukning OK. Kontakta vården närmre slutdatumet.' };
  }
  const consumptionNote  = `Snittförbrukning ${avgPerInterval.toFixed(2)} ${doseUnitLabel} (${consumptionPct.toFixed(1)}% av ordinerad dos, inom ±10%-gränsen).`;
  const remainingPct     = (daysToPrescribedEnd / (totalDays || 1) * 100).toFixed(1);
  const daysNote = daysToPrescribedEnd <= 0
    ? 'Receptperioden är slut.'
    : `${daysToPrescribedEnd} dagar kvar av receptperioden (<20%-gränsen, ${remainingPct}% återstår).`;
  return { verdictTitle: 'OK – Förnya recept', verdictSub: `${consumptionNote} ${daysNote}` };
}

function _buildAlerts(
  avgNum: number,
  effectiveDailyDose: number,
  daysRemaining: number,
  isOveruse: boolean,
  displayAvg: string,
  doseUnitLabel: string,
  avgPerInterval: number,
  consumptionPct: number,
  isTooEarly: boolean,
  daysToPrescribedEnd: number,
  prescribedEndDateStr: string,
  earlyPickup: boolean
): CalcAlert[] {
  let alerts: CalcAlert[] = [];
  const overuseSuppressedBy7day = !isOveruse && daysRemaining >= 0 && daysRemaining <= OVERUSE_SUPPRESSION_DAYS && avgNum > effectiveDailyDose * OVERUSE_THRESHOLD;
  if (overuseSuppressedBy7day) {
    alerts.push({ type: 'warn', title: 'Förhöjd förbrukning noterad', message: `Snitt ${displayAvg} överstiger ordination med >10%, men medicinen beräknas ta slut inom 7 dagar. Förnyelse godkänd — notera förbrukningstakten.` });
  } else if (avgNum === 0) {
    alerts.push({ type: 'danger', title: 'Ingen förbrukning registrerad', message: `Snitt 0 ${doseUnitLabel} – patienten verkar inte ha tagit medicinen. Klinisk bedömning krävs.` });
  } else if (consumptionPct < LOW_CONSUMPTION_PCT) {
    alerts.push({ type: 'warn', title: 'Låg förbrukning', message: `${avgPerInterval.toFixed(2)} ${doseUnitLabel} är ${(100 - consumptionPct).toFixed(1)}% under ordinerad dos. Överväg uppföljning.` });
    if (isTooEarly) {
      alerts.push({ type: 'info', title: 'För tidigt att förnya', message: `Receptperioden löper ut om ${daysToPrescribedEnd} dagar (t.o.m. ${prescribedEndDateStr}). Förnyelse rekommenderas närmre slutdatumet.` });
    }
  } else if (isTooEarly) {
    alerts.push({ type: 'info', title: 'För tidigt att förnya', message: `Receptperioden löper ut om ${daysToPrescribedEnd} dagar (t.o.m. ${prescribedEndDateStr}). Förnyelse rekommenderas närmre slutdatumet.` });
  }
  if (avgNum > effectiveDailyDose * VERY_HIGH_CONSUMPTION_MULTIPLIER) {
    alerts.push({ type: 'warn', title: 'Datakontroll', message: `Snitt ${avgPerInterval.toFixed(2)} ${doseUnitLabel} är mycket högt. Kontrollera kvarvarande mängd.` });
  }
  if (earlyPickup) {
    alerts.push({ type: 'info', title: 'Tidig uthämtning', message: 'Kvarvarande doser överstiger modellens förväntade tillgängliga mängd. Beräknas från minsta möjliga antal uttag.' });
  }
  return alerts;
}

function _computeContactDates(
  isOveruse: boolean,
  isTooEarly: boolean,
  prescribedEndDate: Date,
  earlyThreshold: number
): { prescribedContactDateStr?: string; prescribedContactIsPast?: boolean; renewDateStr?: string } {
  let prescribedContactDateStr: string | undefined;
  let prescribedContactIsPast: boolean | undefined;
  let renewDateStr: string | undefined;
  if (isOveruse) {
    const contactDate = new Date(prescribedEndDate);
    contactDate.setUTCDate(contactDate.getUTCDate() - CONTACT_DATE_OFFSET_DAYS);
    const contactIsPast        = contactDate < getToday();
    const effectiveContactDate = contactIsPast ? getToday() : contactDate;
    prescribedContactDateStr   = fmtDate(effectiveContactDate);
    prescribedContactIsPast    = contactIsPast;
  } else if (isTooEarly) {
    const renewDate = new Date(prescribedEndDate);
    renewDate.setUTCDate(renewDate.getUTCDate() - earlyThreshold);
    renewDateStr = fmtDate(renewDate);
  }
  return { prescribedContactDateStr, prescribedContactIsPast, renewDateStr };
}
