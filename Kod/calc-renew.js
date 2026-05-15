function validateDateField(val) {
  if (!val) return { valid: true, error: '' };
  const pDate = parseDateUTC(val);
  if (!pDate) return { valid: false, error: 'Ogiltigt datum.' };
  if (pDate > getToday()) return { valid: false, error: 'Datumet är satt i framtiden.' };
  return { valid: true, error: '', pDate };
}

function validateValues(medRaw, dateVal, doseRaw, amtRaw, refRaw, leftRaw, doseIntervalRaw, doseUnitRaw, notCalculable) {
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

  // Kvarvarande mängd: heltal för diskreta enheter (st), decimaler tillåtna för volymer (ml, dos)
  const doseUnit = doseUnitRaw || 'st';
  const isDiscreteUnit = (doseUnit === 'st');
  const remaining = leftRaw !== '' ? parseFloat(leftRaw.replace(',', '.')) : null;
  const leftIsInvalid = leftRaw !== '' && (
    isNaN(remaining) || remaining < 0 ||
    remaining > MAX_AMT_VALUE ||
    (isDiscreteUnit && !Number.isInteger(remaining))
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
    // Bevara 'invalid_date' som reason om ENBART datumet är ogiltigt (övriga fält OK).
    const dateOnly = (!pDate || (pDate && pDate > today)) && dateVal && !otherMissing && !leftIsInvalid;
    const hasOtherFieldErrors = fieldErrors.medInput !== '' || fieldErrors.doseInput !== '' || fieldErrors.amtInput !== '' || fieldErrors.refInput !== '' || fieldErrors.leftInput !== '';
    const reason = (dateOnly && !hasOtherFieldErrors) ? 'invalid_date' : 'incomplete';
    return { valid: false, reason, fieldErrors };
  }

  const parsedInterval = parseInt(doseIntervalRaw, 10);
  const doseInterval = VALID_INTERVALS.includes(parsedInterval) ? parsedInterval : 1;

  const ref = refNum;

  return { valid: true, fieldErrors, medRaw, dateVal, pDate, amt, dose, ref, remaining, doseRaw, amtRaw, refRaw, leftRaw, doseInterval, doseUnit, notCalculable: !!notCalculable };
}

function validateInputs() {
  const medInput           = getEl('medInput');
  const dateInput          = getEl('dateInput');
  const amtInput           = getEl('amtInput');
  const doseInput          = getEl('doseInput');
  const refInput           = getEl('refInput');
  const leftInput          = getEl('leftInput');
  const doseIntervalSelect = getEl('doseIntervalSelect');
  if (!medInput || !dateInput || !amtInput || !doseInput || !refInput)
    return { valid: false, reason: 'incomplete' };

  const s = getState(activeMedIdx);

  const result = validateValues(
    medInput.value.trim(),
    dateInput.value,
    doseInput.value,
    amtInput.value,
    refInput.value.trim(),
    leftInput ? leftInput.value.trim() : '',
    doseIntervalSelect ? doseIntervalSelect.value : '1',
    s.doseUnit || 'st',
    s.notCalculable || false
  );

  for (const [id, msg] of Object.entries(result.fieldErrors)) setFieldError(id, msg);
  return result;
}

function calcCore(inputData, prev) {
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

  // Beräkna enhetsbeteckning för dos — används i displaytexter och journaltext.
  const INTERVAL_LABELS = { 1: 'dag', 7: 'vecka', 30: 'månad' };
  const doseInterval     = inputData.doseInterval || 1;
  const doseUnit         = inputData.doseUnit     || 'st';
  const intervalLabel    = INTERVAL_LABELS[doseInterval] || 'dag';
  // doseUnitLabel = t.ex. "st/dag", "ml/dag", "st/vecka", "dos/månad"
  const doseUnitLabel    = `${doseUnit}/${intervalLabel}`;
  // Effektiv dygnsdos = förskriven dos normaliserad till per-dag-basis
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

  let endDate, daysRemaining, avgNum, earlyPickup = false, calcBase = accessibleTotal;

  if (hasRemaining) {
    if (remaining > total) {
      return {
        valid: true, calculable: false, isOveruse: false, isTooEarly: false,
        verdictTitle: 'Orimligt värde',
        verdictSub:   `Kvarvarande (${remaining}) kan inte överstiga totalt förskrivet (${total}).`,
        metrics: [], alerts: [],
        patientText: '', patientTextEn: '', journalText: '',
        statusText: 'Orimliga värden',
      };
    }
    earlyPickup = remaining > accessibleTotal;
    if (earlyPickup) {
      const minB = Math.ceil(remaining / inputData.amt);
      calcBase = Math.min(minB, inputData.ref) * inputData.amt;
    } else {
      calcBase = accessibleTotal;
    }
    const consumed = calcBase - remaining;
    if (consumed < 0) {
      // Kontrollflödet borde aldrig nå hit — consumed < 0 är logiskt uteslutet av
      // earlyPickup-logiken ovan. Om det ändå sker är det ett programmeringsfel.
      console.error('[calcCore] consumed < 0 — oväntat tillstånd. Kontrollera inmatningen.');
      return { valid: false, isOveruse: false, isTooEarly: false, statusText: 'Internt fel — kontrollera inmatningen.' };
    }
    avgNum        = consumed / daysSince;
    daysRemaining = Math.floor(remaining / effectiveDailyDose);
    endDate = new Date(today);
    endDate.setUTCDate(today.getUTCDate() + daysRemaining);
  } else {
    endDate = new Date(inputData.pDate);
    endDate.setUTCDate(endDate.getUTCDate() + Math.round(totalDays));
    daysRemaining = getDaysDiff(endDate, today);
    // Utan uppgift om kvarvarande mängd räknas på total (amt × ref), inte accessibleTotal:
    // uttagsintervallet är inte alltid känt. Antagandet att alla förpackningar är uthämtade
    // undviker underskattning av förbrukningstakten (patientsäkerhet). Falskt positiva
    // "överförbrukning"-varningar tidigt i receptperioden hanteras via klinisk bedömning.
    avgNum = total / daysSince;
  }

  const prescribedEndDate = new Date(inputData.pDate);
  prescribedEndDate.setUTCDate(prescribedEndDate.getUTCDate() + Math.round(totalDays));
  const daysToPrescribedEnd = getDaysDiff(prescribedEndDate, today);
  const prescribedEndDateStr = fmtDate(prescribedEndDate);
  const pDateStr = fmtDate(inputData.pDate);
  // AKTIVT VAL: daysToPrescribedEnd > 14 krävs för hasRemaining-fallet där daysRemaining
  // = faktiska dosdagar (kan vara < 7) men ordinationen fortfarande har > 14 dagar kvar.
  // Utan denna gren missar vi patienter som hämtat ut i förtid och förbrukat för snabbt.
  // Vid !hasRemaining är daysRemaining === daysToPrescribedEnd och klausulen är redundant
  // men bevaras för konsistens och tydlighet.
  // AKTIVT VAL: isOveruse jämför avgNum (per dag) mot effectiveDailyDose, inte rådos.
  // Vid vecko-/månadsintervall är effectiveDailyDose bråkdelen dos/interval,
  // vilket ger samma proportionella 10%-gräns oavsett vald tidsperiod.
  const isOveruse  = _detectOveruse(avgNum, effectiveDailyDose, daysRemaining, daysToPrescribedEnd);
  const isTooEarly = _detectTooEarly(isOveruse, daysToPrescribedEnd, totalDays);

  // Omräkna daglig snittförbrukning till vald tidsperiod för display
  const avgPerInterval  = avgNum * doseInterval;
  const mgUnit          = extractDoseUnit(inputData.medRaw);
  let displayAvg = `${avgPerInterval.toFixed(2)} ${doseUnitLabel}`;
  if (mgUnit) displayAvg += ` (${(avgPerInterval * mgUnit.amount).toFixed(1)} ${mgUnit.unit}/${intervalLabel})`;
  const avgNote = hasRemaining
    ? `(beräknat på faktisk förbrukning: ${calcBase - remaining} av ${calcBase} tillgängliga ${doseUnit}${earlyPickup ? ' – patienten kan ha hämtat ut uttag i förväg' : ''})`
    : `(beräknat under antagandet att alla hittills tillgängliga ${doseUnit} är förbrukade)`;

  // Återställ beslut om kliniska flaggor har ändrats sedan förra beräkningen
  const flagsChanged         = prev.isOveruse !== isOveruse || prev.isTooEarly !== isTooEarly;
  const earlyRenewalDecision = flagsChanged ? null : (prev.earlyRenewalDecision || null);

  const earlyThreshold = Math.round(totalDays * EARLY_RENEWAL_THRESHOLD);
  const tlPct  = Math.min(100, Math.max(0, (daysSince / totalDays) * 100));
  // endCls och "Räcker t.o.m." baseras alltid på prescribedEndDate (ordinerad takt),
  // oavsett om läkaren fyllt i faktiska kvarvarande doser.
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

  // Alerts — byggs som strukturerade objekt, renderas via DOM (ingen innerHTML med användardata)
  const alerts = _buildAlerts(avgNum, effectiveDailyDose, daysRemaining, isOveruse, displayAvg, doseUnitLabel, avgPerInterval, consumptionPct, isTooEarly, daysToPrescribedEnd, prescribedEndDateStr, earlyPickup);

  // Kontaktdatum (överförbrukning) respektive förnyelsedatum (för tidigt)
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

function _detectOveruse(avgNum, effectiveDailyDose, daysRemaining, daysToPrescribedEnd) {
  return avgNum > effectiveDailyDose * OVERUSE_THRESHOLD && (daysRemaining > OVERUSE_SUPPRESSION_DAYS || daysToPrescribedEnd > OVERUSE_MIN_RECEPT_DAYS);
}

function _detectTooEarly(isOveruse, daysToPrescribedEnd, totalDays) {
  return !isOveruse && daysToPrescribedEnd > Math.round(totalDays * EARLY_RENEWAL_THRESHOLD);
}

function _buildMetrics(total, doseUnit, prescribedEndDateStr, daysToPrescribedEnd, endCls, displayAvg, isOveruse, intervalLabel) {
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

function _buildVerdict(isOveruse, isTooEarly, earlyRenewalDecision, avgPerInterval, doseUnitLabel, daysToPrescribedEnd, consumptionPct, totalDays) {
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

function _buildAlerts(avgNum, effectiveDailyDose, daysRemaining, isOveruse, displayAvg, doseUnitLabel, avgPerInterval, consumptionPct, isTooEarly, daysToPrescribedEnd, prescribedEndDateStr, earlyPickup) {
  var alerts = [];
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

function _computeContactDates(isOveruse, isTooEarly, prescribedEndDate, earlyThreshold) {
  var prescribedContactDateStr, prescribedContactIsPast, renewDateStr;
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

function calc(i = activeMedIdx, skipGenerate = false) {
  // Ignorera föråldrade debounce-anrop om användaren bytt läkemedel under fördröjningen.
  if (i !== activeMedIdx) return;
  resetTimer();
  saveFormValues(i);
  applyMedStatePatch(i, { valid: false });

  updateFormHeader(i);
  const s = getState(i);

  const inputData = validateInputs();
  const prev = {
    isOveruse:            s.isOveruse            || false,
    isTooEarly:           s.isTooEarly           || false,
    earlyRenewalDecision: s.earlyRenewalDecision || null,
  };

  let derived;
  try {
    derived = calcCore(inputData, prev);
  } catch (err) {
    // Loggar aldrig inputData/prev — de innehåller kliniska uppgifter
    console.error('[calcCore] oväntat fel:', err.message || err);
    derived = { valid: false, statusText: 'Internt fel — kontrollera inmatningen.' };
  }

  applyMedStatePatch(i, derived);
  if (inputData.medRaw) { applyMedStatePatch(i, { medNameStripped: stripManufacturer(inputData.medRaw) || inputData.medRaw }); }

  // UI-preferenser sätts efter en fullständig lyckad beräkning
  if (derived.valid && derived.calculable !== false) {
    setMedUIPreference(i, 'activeTab',   getState(i).activeTab || 'patient');
    setMedUIPreference(i, 'patientLang', getState(i).patientLang || 'sv');
  }

  updateMedListStatuses();
  if (!skipGenerate) generateAndDistribute();
}

// Textgenereringsfunktioner har extraherats till text-gen.js:
// remainingDosesNote, PATIENT_TEXT, buildPatientText, buildJournalText, buildNurseJournalText

/* Samlad text för alla läkemedel */
function generateAndDistribute() {
  const validCount = states.filter(s => s.valid && s.calculable !== false).length;
  if (validCount === 0) {
    for (let i = 0; i < states.length; i++) {
      if (states[i]) applyMedStatePatch(i, { patientText: '', patientTextEn: '', journalText: '' });
    }
    renderResultForMed(activeMedIdx); return;
  }

  const toRenew = [], tooEarly = [], overuse = [];
  for (let i = 0; i < states.length; i++) {
    const s = states[i]; if (!s || !s.valid || s.calculable === false) continue;
    const name = s.medNameStripped || s.medRaw || `Läkemedel ${i+1}`;
    if      (s.isOveruse  && s.earlyRenewalDecision === 'yes') toRenew.push({ name, state: s, i, earlyRenewal: 'overuse' });
    else if (s.isOveruse)                                      overuse.push({ name, state: s, i });
    else if (s.isTooEarly && s.earlyRenewalDecision === 'yes') toRenew.push({ name, state: s, i, earlyRenewal: 'tooEarly' });
    else if (s.isTooEarly)                                     tooEarly.push({ name, state: s, i });
    else                                                       toRenew.push({ name, state: s, i });
  }

  if (nurseViewActive) {
    const journalText = buildNurseJournalText(states);
    for (let i = 0; i < states.length; i++) {
      const s = states[i]; if (!s || !s.valid || s.calculable === false) continue;
      applyMedStatePatch(i, {
        patientText: '',
        patientTextEn: '',
        patientLang: s.patientLang || 'sv',
        journalText,
      });
    }
    renderResultForMed(activeMedIdx);
    return;
  }

  const prescribeEnds = {};
  for (const { i } of toRenew) {
    try {
      const pr = calcPrescribeResult(i);
      if (pr && pr.endDateStr) prescribeEnds[i] = pr.endDateStr;
    } catch (err) {
      console.error('[calcPrescribeResult]', err.message || err);
    }
  }

  const patientText   = buildPatientText('sv', toRenew, tooEarly, overuse, validCount, prescribeEnds);
  const patientTextEn = buildPatientText('en', toRenew, tooEarly, overuse, validCount, prescribeEnds);
  const journalText   = buildJournalText(toRenew, tooEarly, overuse, validCount, prescribeEnds);

  for (let i = 0; i < states.length; i++) {
    const s = states[i]; if (!s || !s.valid || s.calculable === false) continue;
    applyMedStatePatch(i, {
      patientText,
      patientTextEn,
      patientLang: s.patientLang || 'sv',
      journalText,
    });
  }
  renderResultForMed(activeMedIdx);
}
