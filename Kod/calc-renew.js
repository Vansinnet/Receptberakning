const OVERUSE_THRESHOLD = 1.10;
const EARLY_RENEWAL_THRESHOLD = 0.20;
const OVERUSE_SUPPRESSION_DAYS = 7;
const OVERUSE_MIN_RECEPT_DAYS = 14;
const VERY_HIGH_CONSUMPTION_MULTIPLIER = 2.5;

function validateDateField(val) {
  if (!val) return { valid: true, error: '' };
  const pDate = parseDateUTC(val);
  if (!pDate) return { valid: false, error: 'Ogiltigt datum.' };
  if (pDate > getToday()) return { valid: false, error: 'Datumet är satt i framtiden.' };
  return { valid: true, error: '', pDate };
}

function validateValues(medRaw, dateVal, doseRaw, amtRaw, refRaw, leftRaw, doseIntervalRaw, doseUnitRaw, notCalculable) {
  const fieldErrors = { medInput: '', dateInput: '', doseInput: '', amtInput: '', refInput: '', leftInput: '' };

  if (medRaw.length > 100) {
    fieldErrors.medInput = 'Läkemedelsnamnet får inte överstiga 100 tecken.';
  }
  if (dateVal.length > 10) {
    fieldErrors.dateInput = 'Ogiltigt datum.';
  }

  const amt = parseInt(amtRaw, 10);
  const amtIsInvalid = amtRaw !== '' && (isNaN(amt) || amt <= 0 || amt > 10000 || !Number.isInteger(Number(amtRaw)));
  if (amtIsInvalid) fieldErrors.amtInput = 'Ange ett heltal mellan 1 och 10 000.';

  const dose = parseFloat(doseRaw.replace(',', '.'));
  const doseIsInvalid = doseRaw !== '' && (isNaN(dose) || dose < 0.1 || dose > 50);
  if (doseIsInvalid) fieldErrors.doseInput = 'Ange ett tal mellan 0,1 och 50.';

  const refNum = Number(refRaw);
  const refIsInvalid  = refRaw !== '' && (!Number.isFinite(refNum) || !Number.isInteger(refNum) || refNum < 1 || refNum > 12);
  const refOutOfRange = Number.isFinite(refNum) && Number.isInteger(refNum) && refNum > 12;
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
  const remaining = leftRaw !== '' ? parseFloat(leftRaw) : null;
  const leftIsInvalid = leftRaw !== '' && (
    isNaN(remaining) || remaining < 0 ||
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

  const s = states[activeMedIdx] || {};

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

  if (totalDays > 3650) {
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
  const isOveruse  = avgNum > effectiveDailyDose * OVERUSE_THRESHOLD && (daysRemaining > OVERUSE_SUPPRESSION_DAYS || daysToPrescribedEnd > OVERUSE_MIN_RECEPT_DAYS);
  // isTooEarly baseras alltid på receptperiodens kvarvarande dagar, inte faktiska dosdagar.
  const isTooEarly = !isOveruse && daysToPrescribedEnd > Math.round(totalDays * EARLY_RENEWAL_THRESHOLD);

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
    : `OK – t.o.m ${prescribedEndDateStr}`;

  const metrics = [
    { label: 'Totalt förskrivet', value: `${total} ${doseUnit}`, cls: '', tooltip: `Mängd per uttag × antal uttag. Den totala förskrivna mängden på receptet.` },
    { label: 'Räcker t.o.m.', value: (() => {
        const note = daysToPrescribedEnd > 0 ? ` (${daysToPrescribedEnd} dagar kvar)`
          : daysToPrescribedEnd === 0 ? ' (tar slut idag)'
          : ` (slut sedan ${Math.abs(daysToPrescribedEnd)} dagar)`;
        return prescribedEndDateStr + note;
      })(), cls: endCls, tooltip: `Beräknat datum då receptet tar slut vid ordinerad dos. Kvarvarande mängd används enbart för att beräkna snittförbrukning.` },
    { label: 'Snittförbrukning', value: displayAvg, cls: isOveruse ? 'danger' : '', tooltip: `Genomsnittlig förbrukning per ${intervalLabel} sedan receptet utfärdades. Mer än 10% över ordination kräver klinisk bedömning om mer än 7 dagsmotsvarigheter återstår eller receptperioden har mer än 14 dagar kvar.` },
  ];

  let verdictTitle, verdictSub;
  if (isOveruse && earlyRenewalDecision === 'yes') {
    verdictTitle = 'OK – Förnya recept';
    verdictSub   = 'Klinisk bedömning: förnyelse trots förhöjd förbrukning.';
  } else if (isOveruse) {
    verdictTitle = 'För tidig förnyelse – bedömning krävs';
    verdictSub   = `Snitt ${avgPerInterval.toFixed(2)} ${doseUnitLabel} överstiger ordination med >10%.`;
  } else if (isTooEarly && earlyRenewalDecision === 'yes') {
    verdictTitle = 'OK – Förnya recept';
    verdictSub   = `Klinisk bedömning: förnyelse trots ${daysToPrescribedEnd} dagar kvar av receptperioden.`;
  } else if (isTooEarly) {
    verdictTitle = `För tidigt – ${daysToPrescribedEnd} dagar kvar`;
    verdictSub   = 'Förbrukning OK. Kontakta vården närmre slutdatumet.';
  } else {
    const consumptionPctOK = (avgNum / effectiveDailyDose) * 100;
    const consumptionNote  = `Snittförbrukning ${avgPerInterval.toFixed(2)} ${doseUnitLabel} (${consumptionPctOK.toFixed(1)}% av ordinerad dos, inom ±10%-gränsen).`;
    const remainingPct     = (daysToPrescribedEnd / totalDays * 100).toFixed(1);
    const daysNote = daysToPrescribedEnd <= 0
      ? 'Receptperioden är slut.'
      : `${daysToPrescribedEnd} dagar kvar av receptperioden (<20%-gränsen, ${remainingPct}% återstår).`;
    verdictTitle = 'OK – Förnya recept';
    verdictSub   = `${consumptionNote} ${daysNote}`;
  }

  // Alerts — byggs som strukturerade objekt, renderas via DOM (ingen innerHTML med användardata)
  const alerts = [];
  const consumptionPct         = (avgNum / effectiveDailyDose) * 100;
  const overuseSuppressedBy7day = !isOveruse && daysRemaining >= 0 && daysRemaining <= OVERUSE_SUPPRESSION_DAYS && avgNum > effectiveDailyDose * OVERUSE_THRESHOLD;
  if (overuseSuppressedBy7day) {
    alerts.push({ type: 'warn', title: 'Förhöjd förbrukning noterad', message: `Snitt ${displayAvg} överstiger ordination med >10%, men medicinen beräknas ta slut inom 7 dagar. Förnyelse godkänd — notera förbrukningstakten.` });
  } else if (avgNum === 0) {
    alerts.push({ type: 'danger', title: 'Ingen förbrukning registrerad', message: `Snitt 0 ${doseUnitLabel} – patienten verkar inte ha tagit medicinen. Klinisk bedömning krävs.` });
  } else if (consumptionPct < 80) {
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

  // Kontaktdatum (överförbrukning) respektive förnyelsedatum (för tidigt)
  let prescribedContactDateStr, prescribedContactIsPast, renewDateStr;
  if (isOveruse) {
    const contactDate = new Date(prescribedEndDate);
    contactDate.setUTCDate(contactDate.getUTCDate() - 7);
    const contactIsPast        = contactDate < getToday();
    const effectiveContactDate = contactIsPast ? getToday() : contactDate;
    prescribedContactDateStr   = fmtDate(effectiveContactDate);
    prescribedContactIsPast    = contactIsPast;
  } else if (isTooEarly) {
    const renewDate = new Date(prescribedEndDate);
    renewDate.setUTCDate(renewDate.getUTCDate() - earlyThreshold);
    renewDateStr = fmtDate(renewDate);
  }

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

function calc(i = activeMedIdx, skipGenerate = false) {
  // Ignorera föråldrade debounce-anrop om användaren bytt läkemedel under fördröjningen.
  if (i !== activeMedIdx) return;
  resetTimer();
  saveFormValues(i);
  applyMedStatePatch(i, { valid: false });

  updateFormHeader(i);
  const s = states[i];

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
    setMedUIPreference(i, 'activeTab',   states[i].activeTab || 'patient');
    setMedUIPreference(i, 'patientLang', states[i].patientLang || 'sv');
  }

  updateMedListStatuses();
  if (!skipGenerate) generateAndDistribute();
}

// === TEXTGENERERING ===

// Återanvändbar hjälpare: notering om kvarvarande mängd i journaltext.
// Returnerar tom sträng om fältet inte är ifyllt.
function remainingDosesNote(s, leading = ' ') {
  if (s.remainingDoses == null) return '';
  const u = s.doseUnit || 'st';
  return s.daysRemaining > 0
    ? `${leading}Vid förnyelse framkommer att patienten har ${s.remainingDoses} ${u} (${s.daysRemaining} dagar) kvar.`
    : `${leading}Vid förnyelse framkommer att patienten uppger att medicinen är slut.`;
}

const PATIENT_TEXT = {
  sv: {
    greeting:          'Hej,',
    closing:           'Vid frågor är du välkommen att kontakta oss via 1177.',
    multiIntro:        'Vi har tagit emot din förfrågan om receptförnyelse för följande läkemedel:',
    singleRenew:       (name, endDate) => `Vi har tagit emot din förfrågan om receptförnyelse för ${name} och kommer att förnya ditt recept inom 2–3 arbetsdagar${endDate ? ` så att läkemedlet räcker till och med ${endDate}` : ''}. Du kan därefter hämta ut din medicin på valfritt apotek.`,
    singleTooEarly:    (name, s)      => `Vi har tagit emot din förfrågan om receptförnyelse för ${name}. Enligt din ordination (${s.dose} ${s.doseUnitLabel || 'st/dag'}) beräknas medicinen räcka till den ${s.prescribedEndDateStr}. Eftersom det datumet inte ännu har passerat kan vi inte förnya receptet just nu. Vänligen hör av dig igen runt den ${s.renewDateStr} så hjälper vi dig då med nytt recept.`,
    singleOveruse:     (name, s, c)   => `Vi har tagit emot din förfrågan om receptförnyelse för ${name}. Utifrån föregående recept beräknades medicinen räcka till den ${s.prescribedEndDateStr}. Vi har granskat förfrågan och kan tyvärr inte förnya receptet vid detta tillfälle. ${c}`,
    singleOverusePast: (name, s)      => `Vi har tagit emot din förfrågan om receptförnyelse för ${name}. Utifrån föregående recept beräknades medicinen räcka till den ${s.prescribedEndDateStr}. Receptet kan nu förnyas — vänligen hör av dig igen så hjälper vi dig med nytt recept.`,
    closingEndPast:    'Receptet kan nu förnyas. Kontakta oss igen om du vill ha ett nytt recept utfärdat.',
    closingContactPast:'Medicinen beräknas ta slut inom kort — vänligen hör av dig igen så hjälper vi dig.',
    closingFuture:     (s)            => `Vänligen hör av dig igen närmre den ${s.prescribedContactDateStr} så hjälper vi dig då.`,
    multiRenew:        (name, endDate) => `${name}: Vi förnyar ditt recept inom 2–3 arbetsdagar${endDate ? ` så att läkemedlet räcker till och med ${endDate}` : ''}.`,
    multiTooEarly:     (name, s)      => `${name}: Enligt din ordination beräknas medicinen räcka till ${s.prescribedEndDateStr} — vi kan därför inte förnya receptet ännu. Hör av dig runt ${s.renewDateStr}.`,
    multiOverusePast:  (name, s)      => `${name}: Beräknades räcka till ${s.prescribedEndDateStr}. Receptet kan nu förnyas — kontakta oss igen.`,
    multiOveruseNotPast:(name, s, c)  => `${name}: Beräknades räcka till ${s.prescribedEndDateStr} — kan tyvärr inte förnyas vid detta tillfälle. ${c}`,
    multiContactPast:  'Medicinen beräknas ta slut inom kort — hör av dig igen.',
    multiFuture:       (s)            => `Hör av dig närmre ${s.prescribedContactDateStr}.`,
  },
  en: {
    greeting:          'Hello,',
    closing:           'If you have questions, please contact us through 1177.',
    multiIntro:        'We have received your prescription renewal request for the following medications:',
    singleRenew:       (name, endDate) => `We have received your prescription renewal request for ${name} and will renew your prescription within 2–3 working days${endDate ? ` so that the medication lasts until ${endDate}` : ''}. You can then collect your medication at any pharmacy.`,
    singleTooEarly:    (name, s)      => `We have received your prescription renewal request for ${name}. Based on your prescription (${s.dose} ${s.doseUnitLabel || 'st/dag'}), your medication is estimated to last until ${s.prescribedEndDateStr}. Please contact us again around ${s.renewDateStr} and we will help you then.`,
    singleOveruse:     (name, s, c)   => `We have received your prescription renewal request for ${name}. Based on the previous prescription, the medication was estimated to last until ${s.prescribedEndDateStr}. We have reviewed your request and are unfortunately unable to renew the prescription at this time. ${c}`,
    singleOverusePast: (name, s)      => `We have received your prescription renewal request for ${name}. Based on the previous prescription, the medication was estimated to last until ${s.prescribedEndDateStr}. The prescription can now be renewed — please contact us again for a new prescription.`,
    closingEndPast:    'Your prescription can now be renewed. Please contact us again if you would like a new prescription.',
    closingContactPast:'Your medication is expected to run out shortly — please contact us again and we will help you.',
    closingFuture:     (s)            => `Please contact us again closer to ${s.prescribedContactDateStr}.`,
    multiRenew:        (name, endDate) => `${name}: We will renew your prescription within 2–3 working days${endDate ? ` so that the medication lasts until ${endDate}` : ''}.`,
    multiTooEarly:     (name, s)      => `${name}: Based on your prescription, the medication is estimated to last until ${s.prescribedEndDateStr} — it is therefore too early to renew. Please contact us around ${s.renewDateStr}.`,
    multiOverusePast:  (name, s)      => `${name}: Based on the previous prescription, the medication was estimated to last until ${s.prescribedEndDateStr}. The prescription can now be renewed — please contact us again.`,
    multiOveruseNotPast:(name, s, c)  => `${name}: Based on the previous prescription, the medication was estimated to last until ${s.prescribedEndDateStr} — we are unfortunately unable to renew it at this time. ${c}`,
    multiContactPast:  'The medication is expected to run out shortly — please contact us again.',
    multiFuture:       (s)            => `Please contact us again closer to ${s.prescribedContactDateStr}.`,
  },
};

function buildPatientText(lang, toRenew, tooEarly, overuse, validCount, prescribeEnds = {}) {
  const t = PATIENT_TEXT[lang] || PATIENT_TEXT.sv;
  const lines = [t.greeting, ''];

  if (validCount === 1) {
    if (toRenew.length === 1) {
      lines.push(t.singleRenew(toRenew[0].name, prescribeEnds[toRenew[0].i]), '', t.closing);
    } else if (tooEarly.length === 1) {
      const s = states[tooEarly[0].i];
      lines.push(t.singleTooEarly(tooEarly[0].name, s), '', t.closing);
    } else if (overuse.length === 1) {
      const s = states[overuse[0].i];
      const prescribedEndPast = parseDateUTC(s.prescribedEndDateStr) < getToday();
      if (prescribedEndPast) {
        lines.push(t.singleOverusePast(overuse[0].name, s), '', t.closing);
      } else {
        const closing = s.prescribedContactIsPast ? t.closingContactPast : t.closingFuture(s);
        lines.push(t.singleOveruse(overuse[0].name, s, closing), '', t.closing);
      }
    }
  } else {
    lines.push(t.multiIntro, '');
    for (const { name, i } of toRenew) {
      lines.push(t.multiRenew(name, prescribeEnds[i]));
    }
    for (const { name, i } of tooEarly) {
      lines.push(t.multiTooEarly(name, states[i]));
    }
    for (const { name, i } of overuse) {
      const s = states[i];
      const epast = parseDateUTC(s.prescribedEndDateStr) < getToday();
      if (epast) {
        lines.push(t.multiOverusePast(name, s));
      } else {
        const c = s.prescribedContactIsPast ? t.multiContactPast : t.multiFuture(s);
        lines.push(t.multiOveruseNotPast(name, s, c));
      }
    }
    lines.push('', t.closing);
  }

  return lines.join('\n');
}

function buildJournalText(toRenew, tooEarly, overuse, validCount, prescribeEnds = {}) {
  const lines = [];

  if (validCount === 1) {
    if (toRenew.length === 1) {
      const s = states[toRenew[0].i];
      const endSuffix = prescribeEnds[toRenew[0].i] ? ` (räcker t.o.m. ${prescribeEnds[toRenew[0].i]})` : '';

      if (toRenew[0].earlyRenewal === 'overuse') {
        lines.push(
          'Kontaktorsak: Receptförnyelse via 1177.', '',
          `Bedömning: Patienten begär förnyelse av ${toRenew[0].name}. Senaste receptet utfärdades ${s.pDateStr} (totalt ${s.total} ${s.doseUnit || 'st'}, ordination ${s.dose} ${s.doseUnitLabel || 'st/dag'}) och borde räcka till ${s.prescribedEndDateStr}.${remainingDosesNote(s)}`,
          `Beräknad snittförbrukning: ${s.displayAvgStr} ${s.avgNote} — överstiger ordination. Receptet förnyas på klinisk indikation efter individuell bedömning.`,
          '', `Åtgärd: Nytt recept utfärdat${endSuffix}. Svar skickat till patient via 1177.`
        );
      } else {
        const earlyNote = toRenew[0].earlyRenewal === 'tooEarly'
          ? ` Receptet förnyas på klinisk indikation efter individuell bedömning trots att receptperioden löper ut ${s.prescribedEndDateStr} (${s.daysToPrescribedEnd} dagar kvar).`
          : '';
        lines.push(
          'Kontaktorsak: Receptförnyelse via 1177.', '',
          `Bedömning: Patienten begär förnyelse av ${toRenew[0].name}. Senaste receptet utfärdades ${s.pDateStr} (totalt ${s.total} ${s.doseUnit || 'st'}, ordination ${s.dose} ${s.doseUnitLabel || 'st/dag'}) och beräknas räcka till ${s.prescribedEndDateStr}.${remainingDosesNote(s)}${earlyNote}`,
          `Förbrukning bedöms vara enligt ordination (snittförbrukning: ${s.displayAvgStr} ${s.avgNote}).`,
          '', `Åtgärd: Nytt recept utfärdat${endSuffix}. Svar skickat till patient via 1177.`
        );
      }
    } else if (tooEarly.length === 1) {
      const s = states[tooEarly[0].i];
      lines.push(
        'Kontaktorsak: Receptförnyelse via 1177.', '',
        `Bedömning: Patienten begär förnyelse av ${tooEarly[0].name}. Senaste receptet utfärdades ${s.pDateStr} (totalt ${s.total} ${s.doseUnit || 'st'}, ordination ${s.dose} ${s.doseUnitLabel || 'st/dag'}) och beräknas räcka till ${s.prescribedEndDateStr} (${s.daysToPrescribedEnd} dagar kvar).${remainingDosesNote(s)}`,
        `Förbrukning bedöms vara enligt ordination (snittförbrukning: ${s.displayAvgStr} ${s.avgNote}).`,
        '', 'Åtgärd: Ej förnyat — för tidigt. Svar skickat till patient via 1177.'
      );
    } else if (overuse.length === 1) {
      const s = states[overuse[0].i];
      // Statusnot skiljer sig från remainingDosesNote: om kvarvarande saknas används
      // receptperiodens återstående dagar som fallback istället för tom sträng.
      const u1 = s.doseUnit || 'st';
      const sn = s.remainingDoses != null
        ? (s.daysRemaining > 0
            ? `Vid förnyelse framkommer att patienten har ${s.remainingDoses} ${u1} (${s.daysRemaining} dagar) kvar.`
            : 'Vid förnyelse framkommer att patienten uppger att medicinen är slut.')
        : (s.daysRemaining > 0
            ? `Aktuell förskrivning beräknas räcka ytterligare ${s.daysRemaining} dagar.`
            : 'Aktuell förskrivning är slut.');
      const atgard = s.earlyRenewalDecision === 'no'
        ? 'Åtgärd: Ej förnyat efter klinisk, individuell bedömning.'
        : 'Åtgärd: [Nytt recept utfärdat / Ej utfärdat — motivering]';
      lines.push(
        'Kontaktorsak: Receptförnyelse via 1177.', '',
        `Bedömning: Patienten begär förnyelse av ${overuse[0].name}. Senaste receptet utfärdades ${s.pDateStr} (totalt ${s.total} ${s.doseUnit || 'st'}, ordination ${s.dose} ${s.doseUnitLabel || 'st/dag'}) och borde räcka till ${s.prescribedEndDateStr}. ${sn} Beräknad snittförbrukning: ${s.displayAvgStr} ${s.avgNote}.`,
        '', atgard
      );
    }
  } else {
    lines.push('Kontaktorsak: Receptförnyelse via 1177 (flera läkemedel).', '');
    for (const { name, i, earlyRenewal } of toRenew) {
      const s = states[i];
      const atgardText = earlyRenewal === 'overuse'
        ? 'Åtgärd: Förnyat efter klinisk, individuell bedömning.'
        : earlyRenewal === 'tooEarly'
          ? `Åtgärd: Förnyat efter klinisk, individuell bedömning (${s.daysToPrescribedEnd}d kvar av receptperiod).`
          : 'Åtgärd: Förnyat.';
      // Överförbrukningsfall ger ingen dosnotering — receptperioden är redan avvikande
      const remNote = earlyRenewal !== 'overuse' ? remainingDosesNote(s) : '';
      const endInfo = earlyRenewal === 'overuse'
        ? `Borde räcka t.o.m. ${s.prescribedEndDateStr}. Snitt: ${s.displayAvgStr} — överstiger ordination.`
        : `Räcker t.o.m. ${s.prescribedEndDateStr}.${remNote} Snitt: ${s.displayAvgStr}.`;
      lines.push(`${name}: Utfärdat ${s.pDateStr} (${s.total} ${s.doseUnit || 'st'}, ${s.dose} ${s.doseUnitLabel || 'st/dag'}). ${endInfo} ${atgardText}`, '');
    }
    for (const { name, i } of tooEarly) {
      const s = states[i];
      lines.push(`${name}: Utfärdat ${s.pDateStr} (${s.total} ${s.doseUnit || 'st'}, ${s.dose} ${s.doseUnitLabel || 'st/dag'}). Räcker t.o.m. ${s.prescribedEndDateStr} (${s.daysToPrescribedEnd} dagar kvar). Snitt: ${s.displayAvgStr}. Åtgärd: Ej förnyat — för tidigt.`, '');
    }
    for (const { name, i } of overuse) {
      const s = states[i];
      const u2 = s.doseUnit || 'st';
      const sn2 = s.remainingDoses != null
        ? (s.daysRemaining > 0
            ? `Vid förnyelse framkommer att patienten har ${s.remainingDoses} ${u2} (${s.daysRemaining} dagar) kvar.`
            : 'Vid förnyelse framkommer att patienten uppger att medicinen är slut.')
        : (s.daysRemaining > 0
            ? `Räcker ytterligare ${s.daysRemaining} dagar.`
            : 'Förskrivningen är slut.');
      const atgard = s.earlyRenewalDecision === 'no'
        ? 'Åtgärd: Ej förnyat efter klinisk, individuell bedömning.'
        : 'Åtgärd: [Nytt recept utfärdat / Ej utfärdat — motivering]';
      lines.push(`${name}: Utfärdat ${s.pDateStr} (${s.total} ${s.doseUnit || 'st'}, ${s.dose} ${s.doseUnitLabel || 'st/dag'}). Borde räcka t.o.m. ${s.prescribedEndDateStr}. ${sn2} Snitt: ${s.displayAvgStr}. ${atgard}`, '');
    }
    lines.push(
      toRenew.length > 0
        ? `Recept utfärdat för: ${toRenew.map(x => {
            const ed = prescribeEnds[x.i];
            return ed ? `${x.name} fram till och med ${ed}` : x.name;
          }).join(', ')}. Svar skickat via 1177.`
        : 'Inga recept utfärdade. Svar skickat via 1177.'
    );
  }

  return lines.join('\n');
}

function buildNurseJournalText() {
  const allMeds = [];
  let hasOutsideLimits = false;

  for (let i = 0; i < states.length; i++) {
    const s = states[i];
    if (!s || !s.valid || s.calculable === false) continue;
    const name = s.medNameStripped || s.medRaw || `Läkemedel ${i + 1}`;
    const isOutside = (s.isOveruse || s.isTooEarly) && s.earlyRenewalDecision !== 'yes';
    if (isOutside) hasOutsideLimits = true;
    allMeds.push({ name, i, endDate: s.prescribedEndDateStr || '' });
  }

  if (allMeds.length === 0) return '';

  const lines = [];
  lines.push(`Patient önskar förnyelse av ${allMeds.map(m => m.name).join(', ')}.`);

  if (allMeds.length === 1) {
    const endStr = allMeds[0].endDate ? ` till och med ${allMeds[0].endDate}` : '';
    const suffix = hasOutsideLimits ? ' utifrån tidigare förskrivning' : '';
    lines.push(`Vid bedömningen bedöms patientens nuvarande ${allMeds[0].name} räcka${endStr}${suffix}.`);
  } else {
    const endParts = allMeds.map(m => {
      const endStr = m.endDate ? ` till och med ${m.endDate}` : '';
      return `${m.name} räcka${endStr}`;
    });
    const suffix = hasOutsideLimits ? ' utifrån tidigare förskrivning' : '';
    lines.push(`Vid bedömningen bedöms patientens nuvarande ${endParts.join(' och ')}${suffix}.`);
  }

  const isType1 = !hasOutsideLimits && nurseVitalNormal && nurseFollowUpAdequate;

  const missing = [];
  if (!nurseVitalNormal) missing.push('vitalparametrar');
  if (!nurseFollowUpAdequate) missing.push('medicinska uppföljning');

  if (missing.length === 0) {
    // AKTIVT VAL: "adekvata" skrivs alltid när båda är iklickade, oavsett
    // hasOutsideLimits — sjuksköterskans bedömning ska dokumenteras separat
    // från läkemedelstidpunkten. Annars utelämnas raden helt när ett läkemedel
    // är utanför gränserna men parametrarna är normala.
    lines.push('Patientens vitalparametrar och medicinska uppföljning bedöms adekvata.');
  } else if (missing.length === 2) {
    lines.push('Patientens vitalparametrar och medicinska uppföljning bedöms vara avvikande.');
  } else {
    const prefix = missing[0] === 'vitalparametrar' ? 'Patientens vitalparametrar' : 'Patientens medicinska uppföljning';
    lines.push(`${prefix} bedöms vara avvikande.`);
  }

  lines.push('Lägger receptärendet till läkare för slutlig bedömning.');
  return lines.join('\n');
}

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
    if      (s.isOveruse  && s.earlyRenewalDecision === 'yes') toRenew.push({ name, i, earlyRenewal: 'overuse' });
    else if (s.isOveruse)                                      overuse.push({ name, i });
    else if (s.isTooEarly && s.earlyRenewalDecision === 'yes') toRenew.push({ name, i, earlyRenewal: 'tooEarly' });
    else if (s.isTooEarly)                                     tooEarly.push({ name, i });
    else                                                       toRenew.push({ name, i });
  }

  if (nurseViewActive) {
    const journalText = buildNurseJournalText();
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
