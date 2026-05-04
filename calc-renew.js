// === VALIDERING + BERÄKNING ===

// Ren valideringsfunktion utan DOM-beroende.
// Returnerar alltid fieldErrors så att anroparen kan applicera dem på valfritt sätt.
function validateValues(medRaw, dateVal, doseRaw, amtRaw, refRaw, leftRaw) {
  const fieldErrors = { medInput: '', dateInput: '', doseInput: '', amtInput: '', refInput: '', leftInput: '' };

  if (medRaw.length > 100) return { valid: false, reason: 'incomplete', fieldErrors };
  if (dateVal.length > 10)  return { valid: false, reason: 'invalid_date', fieldErrors };

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

  if (refOutOfRange) return { valid: false, reason: 'too_many_refs', fieldErrors };

  // Datumvalidering sker före inkomplettkontrollen — annars rensas datumfelet
  // av den tidiga returnen när övriga fält (dos, uttag) fortfarande är tomma.
  const pDate = dateVal ? parseDateUTC(dateVal) : null;
  if (dateVal && !pDate) fieldErrors.dateInput = 'Ogiltigt datum.';

  const otherMissing = !medRaw || !dateVal || isNaN(dose) || doseIsInvalid || isNaN(amt) || amtIsInvalid || refIsInvalid || !refNum || refNum < 1;
  if (otherMissing || !pDate) {
    // Bevara 'invalid_date' som reason om ENBART datumet är ogiltigt (övriga fält OK).
    const reason = (!pDate && dateVal && !otherMissing) ? 'invalid_date' : 'incomplete';
    return { valid: false, reason, fieldErrors };
  }

  const ref   = refNum;
  const today = getToday();
  if (pDate > today) {
    fieldErrors.dateInput = 'Datumet är satt i framtiden.';
    return { valid: false, reason: 'invalid_date', fieldErrors };
  }

  const remaining    = leftRaw !== '' ? parseInt(leftRaw, 10) : null;
  const leftIsInvalid = leftRaw !== '' && (isNaN(remaining) || remaining < 0 || !Number.isInteger(Number(leftRaw)));
  if (leftIsInvalid) fieldErrors.leftInput = 'Ange ett heltal (0 eller fler), eller lämna tomt.';
  if (leftIsInvalid) return { valid: false, reason: 'incomplete', fieldErrors };

  return { valid: true, fieldErrors, medRaw, dateVal, pDate, amt, dose, ref, remaining, doseRaw, amtRaw, refRaw, leftRaw };
}

// DOM-skal: läser fältvärden, delegerar till validateValues, applicerar felmeddelanden.
function validateInputs() {
  const medInput  = getEl('medInput');
  const dateInput = getEl('dateInput');
  const amtInput  = getEl('amtInput');
  const doseInput = getEl('doseInput');
  const refInput  = getEl('refInput');
  const leftInput = getEl('leftInput');
  if (!medInput || !dateInput || !amtInput || !doseInput || !refInput)
    return { valid: false, reason: 'incomplete' };

  const result = validateValues(
    medInput.value.trim(),
    dateInput.value,
    doseInput.value,
    amtInput.value,
    refInput.value.trim(),
    leftInput ? leftInput.value.trim() : ''
  );

  for (const [id, msg] of Object.entries(result.fieldErrors)) setFieldError(id, msg);
  return result;
}

// Ren beräkningsfunktion utan DOM-beroende.
// inputData: output från validateValues (eller validateInputs).
// prev: { isOveruse, isTooEarly, earlyRenewalDecision } från föregående beräkningscykel.
// Returnerar ett state-patch-objekt som appliceras på states[i] via Object.assign i calc().
function calcCore(inputData, prev) {
  if (!inputData.valid) {
    if (inputData.reason === 'too_many_refs') {
      return {
        valid: true, isOveruse: false, isTooEarly: false,
        verdictTitle: 'Ogiltigt antal uttag',
        verdictSub:   'Max 12 uttag stöds.',
        metrics: [],
        alerts:  [{ type: 'danger', title: 'Ogiltigt antal uttag', message: 'Max 12 uttag stöds.' }],
        statusText: 'Ogiltigt antal',
      };
    }
    return {
      valid: false,
      statusText: inputData.reason === 'invalid_date' ? 'Ogiltigt datum' : 'Ej ifyllt',
    };
  }

  const today     = getToday();
  const daysSince = getDaysDiff(today, inputData.pDate);

  if (daysSince === 0) {
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
  const totalDays = total / inputData.dose;

  if (totalDays > 3650) {
    return {
      valid: true, isOveruse: false, isTooEarly: false,
      verdictTitle: 'Orimliga värden',
      verdictSub:   'Beräknad tid överstiger 10 år.',
      metrics: [],
      alerts:  [{ type: 'danger', title: 'Orimlig tid', message: 'Kontrollera inmatade värden.' }],
      statusText: 'Orimliga värden',
    };
  }

  const { remaining } = inputData;
  const hasRemaining   = remaining !== null && remaining !== undefined;
  const batchDuration    = inputData.amt / inputData.dose;
  const batchesDispensed = Math.min(inputData.ref, Math.floor(daysSince / batchDuration) + 1);
  const accessibleTotal  = Math.min(total, batchesDispensed * inputData.amt);

  let endDate, daysRemaining, avgNum, earlyPickup = false, calcBase = accessibleTotal;

  if (hasRemaining) {
    if (remaining > total) {
      return {
        valid: true, isOveruse: false, isTooEarly: false,
        verdictTitle: 'Orimligt värde',
        verdictSub:   `Kvarvarande (${remaining}) kan inte överstiga totalt förskrivet (${total}).`,
        metrics: [], alerts: [],
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
      return { valid: false, statusText: 'Orimliga värden' };
    }
    avgNum        = consumed / daysSince;
    daysRemaining = Math.floor(remaining / inputData.dose);
    endDate = new Date(today);
    endDate.setUTCDate(today.getUTCDate() + daysRemaining);
  } else {
    endDate = new Date(inputData.pDate);
    endDate.setUTCDate(endDate.getUTCDate() + Math.round(totalDays));
    daysRemaining = getDaysDiff(endDate, today);
    // AKTIVT VAL: Utan uppgift om kvarvarande doser räknas på total (amt × ref),
    // inte accessibleTotal. Skäl: uttagsintervallet för tidigare recept är inte alltid
    // känt — ur ett patientsäkerhetsperspektiv antas att patienten begär förnyelse
    // för att alla förpackningar är uthämtade. Att räkna på färre uttag (accessibleTotal)
    // skulle underskatta förbrukningstakten och riskera att missa en faktisk överförbrukning.
    // Konsekvens: falskt positiva "överförbrukning"-varningar kan uppstå tidigt i
    // receptperioden vid många uttag — läkaren ser detta och avgör med klinisk bedömning.
    avgNum = total / daysSince;
  }

  const prescribedEndDate = new Date(inputData.pDate);
  prescribedEndDate.setUTCDate(prescribedEndDate.getUTCDate() + Math.round(totalDays));
  const daysToPrescribedEnd = getDaysDiff(prescribedEndDate, today);
  // Överförbrukning om >10% över ordination OCH antingen mer än 7 dosdagar återstår
  // ELLER receptperioden har mer än 14 dagar kvar (patienten har tagit slut för tidigt).
  const isOveruse  = avgNum > inputData.dose * 1.10 && (daysRemaining > 7 || daysToPrescribedEnd > 14);
  // isTooEarly baseras alltid på receptperiodens kvarvarande dagar, inte faktiska dosdagar.
  const isTooEarly = !isOveruse && daysToPrescribedEnd > Math.round(totalDays * 0.20);

  const doseUnit = extractDoseUnit(inputData.medRaw);
  let displayAvg = `${avgNum.toFixed(2)} st/dag`;
  if (doseUnit) displayAvg += ` (${(avgNum * doseUnit.amount).toFixed(1)} ${doseUnit.unit}/dag)`;
  const avgNote = hasRemaining
    ? `(beräknat på faktisk förbrukning: ${calcBase - remaining} av ${calcBase} tillgängliga doser${earlyPickup ? ' – patienten kan ha hämtat ut uttag i förväg' : ''})`
    : `(beräknat under antagandet att alla hittills tillgängliga doser är förbrukade)`;

  // Återställ beslut om kliniska flaggor har ändrats sedan förra beräkningen
  const flagsChanged         = prev.isOveruse !== isOveruse || prev.isTooEarly !== isTooEarly;
  const earlyRenewalDecision = flagsChanged ? null : (prev.earlyRenewalDecision || null);

  const earlyThreshold = Math.round(totalDays * 0.20);
  const tlPct  = Math.min(100, Math.max(0, (daysSince / totalDays) * 100));
  // endCls och "Räcker t.o.m." baseras alltid på prescribedEndDate (ordinerad takt),
  // oavsett om läkaren fyllt i faktiska kvarvarande doser.
  const endCls = daysToPrescribedEnd < 0 ? 'danger' : daysToPrescribedEnd <= earlyThreshold ? 'warn' : 'ok';

  const statusText = isOveruse && earlyRenewalDecision === 'yes' ? 'OK – förnyas (klinisk bed.)'
    : isOveruse    ? 'För tidig förnyelse'
    : isTooEarly   && earlyRenewalDecision === 'yes' ? 'OK – förnyas tidigt'
    : isTooEarly   ? `För tidigt — ${daysToPrescribedEnd}d kvar`
    : `OK – t.o.m ${fmtDate(prescribedEndDate)}`;

  const metrics = [
    { label: 'Totalt förskrivet', value: `${total} st`, cls: '', tooltip: 'Mängd per uttag × antal uttag. Det totala antalet doser som förskrevs på receptet.' },
    { label: 'Räcker t.o.m.', value: (() => {
        const note = daysToPrescribedEnd > 0 ? ` (${daysToPrescribedEnd} dagar kvar)`
          : daysToPrescribedEnd === 0 ? ' (tar slut idag)'
          : ` (slut sedan ${Math.abs(daysToPrescribedEnd)} dagar)`;
        return fmtDate(prescribedEndDate) + note;
      })(), cls: endCls, tooltip: 'Beräknat datum då receptet tar slut vid ordinerad dos. Doser kvar används enbart för att beräkna snittförbrukning.' },
    { label: 'Snittförbrukning', value: displayAvg, cls: isOveruse ? 'danger' : '', tooltip: 'Genomsnittlig förbrukning per dag sedan receptet utfärdades. Mer än 10% över ordination kräver klinisk bedömning om mer än 7 dosdagar återstår eller receptperioden har mer än 14 dagar kvar.' },
  ];

  let verdictTitle, verdictSub;
  if (isOveruse) {
    verdictTitle = 'För tidig förnyelse – bedömning krävs';
    verdictSub   = `Snitt ${avgNum.toFixed(2)} st/dag överstiger ordination med >10%.`;
  } else if (isTooEarly) {
    verdictTitle = `För tidigt – ${daysToPrescribedEnd} dagar kvar`;
    verdictSub   = 'Förbrukning OK. Kontakta vården närmre slutdatumet.';
  } else {
    const consumptionPctOK = (avgNum / inputData.dose) * 100;
    const consumptionNote  = `Snittförbrukning ${avgNum.toFixed(2)} st/dag (${consumptionPctOK.toFixed(1)}% av ordinerad dos, inom ±10%-gränsen).`;
    const remainingPct     = (daysToPrescribedEnd / totalDays * 100).toFixed(1);
    const daysNote = daysToPrescribedEnd <= 0
      ? 'Receptperioden är slut.'
      : `${daysToPrescribedEnd} dagar kvar av receptperioden (<20%-gränsen, ${remainingPct}% återstår).`;
    verdictTitle = 'OK – Förnya recept';
    verdictSub   = `${consumptionNote} ${daysNote}`;
  }

  // Alerts — byggs som strukturerade objekt, renderas via DOM (ingen innerHTML med användardata)
  const alerts = [];
  const consumptionPct         = (avgNum / inputData.dose) * 100;
  const overuseSupressedBy7day = !isOveruse && daysRemaining <= 7 && avgNum > inputData.dose * 1.10;
  if (isOveruse) {
    const daysNote = daysRemaining > 0 ? ` — ${daysRemaining} dagar kvar` : ` — förskrivningen är slut`;
    alerts.push({ type: 'danger', title: 'Förbrukning överstiger ordination', message: `Snitt ${displayAvg} ${avgNote}${daysNote}. Gör en individuell bedömning.` });
  } else if (overuseSupressedBy7day) {
    alerts.push({ type: 'warn', title: 'Förhöjd förbrukning noterad', message: `Snitt ${displayAvg} överstiger ordination med >10%, men medicinen beräknas ta slut inom 7 dagar. Förnyelse godkänd — notera förbrukningstakten.` });
  } else if (avgNum === 0) {
    alerts.push({ type: 'danger', title: 'Ingen förbrukning registrerad', message: 'Snitt 0 st/dag – patienten verkar inte ha tagit medicinen. Klinisk bedömning krävs.' });
  } else if (consumptionPct < 80) {
    alerts.push({ type: 'warn', title: 'Låg förbrukning', message: `${avgNum.toFixed(2)} st/dag är ${(100 - consumptionPct).toFixed(1)}% under ordinerad dos. Överväg uppföljning.` });
    if (isTooEarly) {
      alerts.push({ type: 'info', title: 'För tidigt att förnya', message: `Receptperioden löper ut om ${daysToPrescribedEnd} dagar (t.o.m. ${fmtDate(prescribedEndDate)}). Förnyelse rekommenderas närmre slutdatumet.` });
    }
  } else if (isTooEarly) {
    alerts.push({ type: 'info', title: 'För tidigt att förnya', message: `Receptperioden löper ut om ${daysToPrescribedEnd} dagar (t.o.m. ${fmtDate(prescribedEndDate)}). Förnyelse rekommenderas närmre slutdatumet.` });
  }
  if (avgNum > inputData.dose * 2.5) {
    alerts.push({ type: 'warn', title: 'Datakontroll', message: `Snitt ${avgNum.toFixed(2)} st/dag är mycket högt. Kontrollera kvarvarande doser.` });
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
    tlPct, tlStart: fmtDate(inputData.pDate), tlEnd: fmtDate(prescribedEndDate),
    earlyThreshold,
    medRaw:               inputData.medRaw,
    amt:                  inputData.amt,
    dose:                 inputData.dose,
    pDateStr:             fmtDate(inputData.pDate),
    total,
    remainingDoses:       hasRemaining ? remaining : null,
    endDateStr:           fmtDate(endDate),
    prescribedEndDateStr: fmtDate(prescribedEndDate),
    daysRemaining,
    daysToPrescribedEnd,
    displayAvgStr:        displayAvg,
    avgNote,
    ...(isOveruse  ? { prescribedContactDateStr, prescribedContactIsPast } : {}),
    ...(isTooEarly ? { renewDateStr } : {}),
  };
}

function calc(i = activeMedIdx) {
  resetTimer();
  saveFormValues(i);
  applyMedStatePatch(i, { valid: false });

  // DOM: uppdatera FASS-länk och läkemedelsnamn i formulärhuvudet
  const s = states[i];
  const fassBtn = getEl('fassBtnForm');
  if (fassBtn) {
    if (s.medRaw) { fassBtn.href = getFassUrl(s.medRaw); fassBtn.classList.remove('is-hidden'); }
    else fassBtn.classList.add('is-hidden');
  }
  const nameEl = getEl('formMedName');
  if (nameEl) nameEl.textContent = s.medName || `Läkemedel ${i+1}`;

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

  // UI-preferenser sätts efter en fullständig lyckad beräkning
  if (derived.valid && derived.calculable !== false) {
    setMedUIPreference(i, 'activeTab',   states[i].activeTab || 'patient');
    setMedUIPreference(i, 'patientLang', 'sv');
  }

  buildMedList();
  generateAndDistribute();
}

// === TEXTGENERERING ===

// Återanvändbar hjälpare: notering om kvarvarande doser i journaltext.
// Returnerar tom sträng om fältet inte är ifyllt.
function remainingDosesNote(s, leading = ' ') {
  if (s.remainingDoses == null) return '';
  return s.daysRemaining > 0
    ? `${leading}Vid förnyelse framkommer att patienten har ${s.remainingDoses} doser (${s.daysRemaining} dagar) kvar.`
    : `${leading}Vid förnyelse framkommer att patienten uppger att medicinen är slut.`;
}

const PATIENT_TEXT = {
  sv: {
    greeting:          'Hej,',
    closing:           'Vid frågor är du välkommen att kontakta oss via 1177.',
    multiIntro:        'Vi har tagit emot din förfrågan om receptförnyelse för följande läkemedel:',
    singleRenew:       (name)         => `Vi har tagit emot din förfrågan om receptförnyelse för ${name} och kommer att förnya ditt recept inom 2–3 arbetsdagar. Du kan därefter hämta ut din medicin på valfritt apotek.`,
    singleTooEarly:    (name, s)      => `Vi har tagit emot din förfrågan om receptförnyelse för ${name}. Enligt din ordination (${s.dose} st/dag) beräknas medicinen räcka till den ${s.prescribedEndDateStr}. Eftersom det datumet inte ännu har passerat kan vi inte förnya receptet just nu. Vänligen hör av dig igen runt den ${s.renewDateStr} så hjälper vi dig då med nytt recept.`,
    singleOveruse:     (name, s, c)   => `Vi har tagit emot din förfrågan om receptförnyelse för ${name}. Utifrån föregående recept beräknades medicinen räcka till den ${s.prescribedEndDateStr}. Vi har granskat förfrågan och kan tyvärr inte förnya receptet vid detta tillfälle. ${c}`,
    closingEndPast:    'Receptet kan nu förnyas. Kontakta oss igen om du vill ha ett nytt recept utfärdat.',
    closingContactPast:'Medicinen beräknas ta slut inom kort — vänligen hör av dig igen så hjälper vi dig.',
    closingFuture:     (s)            => `Vänligen hör av dig igen närmre den ${s.prescribedContactDateStr} så hjälper vi dig då.`,
    multiRenew:        (name)         => `${name}: Vi förnyar ditt recept inom 2–3 arbetsdagar.`,
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
    singleRenew:       (name)         => `We have received your prescription renewal request for ${name} and will renew your prescription within 2–3 working days. You can then collect your medication at any pharmacy.`,
    singleTooEarly:    (name, s)      => `We have received your prescription renewal request for ${name}. Your medication is estimated to last until ${s.prescribedEndDateStr}. Please contact us again around ${s.renewDateStr} and we will help you then.`,
    singleOveruse:     (name, s, c)   => `We have received your prescription renewal request for ${name}. Based on the previous prescription, the medication was estimated to last until ${s.prescribedEndDateStr}. We have reviewed your request and are unfortunately unable to renew the prescription at this time. ${c}`,
    closingEndPast:    'Your prescription can now be renewed. Please contact us again if you would like a new prescription.',
    closingContactPast:'Your medication is expected to run out shortly — please contact us again and we will help you.',
    closingFuture:     (s)            => `Please contact us again closer to ${s.prescribedContactDateStr}.`,
    multiRenew:        (name)         => `${name}: We will renew your prescription within 2–3 working days.`,
    multiTooEarly:     (name, s)      => `${name}: Based on your prescription, the medication is estimated to last until ${s.prescribedEndDateStr} — it is therefore too early to renew. Please contact us around ${s.renewDateStr}.`,
    multiOverusePast:  (name, s)      => `${name}: Based on the previous prescription, the medication was estimated to last until ${s.prescribedEndDateStr}. The prescription can now be renewed — please contact us again.`,
    multiOveruseNotPast:(name, s, c)  => `${name}: Based on the previous prescription, the medication was estimated to last until ${s.prescribedEndDateStr} — we are unfortunately unable to renew it at this time. ${c}`,
    multiContactPast:  'The medication is expected to run out shortly — please contact us again.',
    multiFuture:       (s)            => `Please contact us again closer to ${s.prescribedContactDateStr}.`,
  },
};

function buildPatientText(lang, toRenew, tooEarly, overuse, validCount) {
  const t = PATIENT_TEXT[lang] || PATIENT_TEXT.sv;
  const lines = [t.greeting, ''];

  if (validCount === 1) {
    if (toRenew.length === 1) {
      lines.push(t.singleRenew(toRenew[0].name), '', t.closing);
    } else if (tooEarly.length === 1) {
      const s = states[tooEarly[0].i];
      lines.push(t.singleTooEarly(tooEarly[0].name, s), '', t.closing);
    } else if (overuse.length === 1) {
      const s = states[overuse[0].i];
      const prescribedEndPast = parseDateUTC(s.prescribedEndDateStr) < getToday();
      const closing = prescribedEndPast
        ? t.closingEndPast
        : s.prescribedContactIsPast
          ? t.closingContactPast
          : t.closingFuture(s);
      lines.push(t.singleOveruse(overuse[0].name, s, closing), '', t.closing);
    }
  } else {
    lines.push(t.multiIntro, '');
    for (const { name } of toRenew) {
      lines.push(t.multiRenew(name));
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

function buildJournalText(toRenew, tooEarly, overuse, validCount) {
  const lines = [];

  if (validCount === 1) {
    if (toRenew.length === 1) {
      const s = states[toRenew[0].i];
      if (toRenew[0].earlyRenewal === 'overuse') {
        lines.push(
          'Kontaktorsak: Receptförnyelse via 1177.', '',
          `Bedömning: Patienten begär förnyelse av ${toRenew[0].name}. Senaste receptet utfärdades ${s.pDateStr} (totalt ${s.total} doser, ordination ${s.dose} st/dag) och borde räcka till ${s.prescribedEndDateStr}.${remainingDosesNote(s)}`,
          `Beräknad snittförbrukning: ${s.displayAvgStr} ${s.avgNote} — överstiger ordination. Receptet förnyas på klinisk indikation efter individuell bedömning.`,
          '', 'Åtgärd: Nytt recept utfärdat. Svar skickat till patient via 1177.'
        );
      } else {
        const earlyNote = toRenew[0].earlyRenewal === 'tooEarly'
          ? ` Receptet förnyas på klinisk indikation efter individuell bedömning trots att receptperioden löper ut ${s.prescribedEndDateStr} (${s.daysToPrescribedEnd} dagar kvar).`
          : '';
        lines.push(
          'Kontaktorsak: Receptförnyelse via 1177.', '',
          `Bedömning: Patienten begär förnyelse av ${toRenew[0].name}. Senaste receptet utfärdades ${s.pDateStr} (totalt ${s.total} doser, ordination ${s.dose} st/dag) och beräknas räcka till ${s.prescribedEndDateStr}.${remainingDosesNote(s)}${earlyNote}`,
          `Förbrukning bedöms vara enligt ordination (snittförbrukning: ${s.displayAvgStr} ${s.avgNote}).`,
          '', 'Åtgärd: Nytt recept utfärdat. Svar skickat till patient via 1177.'
        );
      }
    } else if (tooEarly.length === 1) {
      const s = states[tooEarly[0].i];
      lines.push(
        'Kontaktorsak: Receptförnyelse via 1177.', '',
        `Bedömning: Patienten begär förnyelse av ${tooEarly[0].name}. Senaste receptet utfärdades ${s.pDateStr} (totalt ${s.total} doser, ordination ${s.dose} st/dag) och beräknas räcka till ${s.prescribedEndDateStr} (${s.daysToPrescribedEnd} dagar kvar).${remainingDosesNote(s)}`,
        `Förbrukning bedöms vara enligt ordination (snittförbrukning: ${s.displayAvgStr} ${s.avgNote}).`,
        '', 'Åtgärd: Ej förnyat — för tidigt. Svar skickat till patient via 1177.'
      );
    } else if (overuse.length === 1) {
      const s = states[overuse[0].i];
      // Statusnot skiljer sig från remainingDosesNote: om doser saknas används
      // receptperiodens återstående dagar som fallback istället för tom sträng.
      const sn = s.remainingDoses != null
        ? (s.daysRemaining > 0
            ? `Vid förnyelse framkommer att patienten har ${s.remainingDoses} doser (${s.daysRemaining} dagar) kvar.`
            : 'Vid förnyelse framkommer att patienten uppger att medicinen är slut.')
        : (s.daysRemaining > 0
            ? `Aktuell förskrivning beräknas räcka ytterligare ${s.daysRemaining} dagar.`
            : 'Aktuell förskrivning är slut.');
      const atgard = s.earlyRenewalDecision === 'no'
        ? 'Åtgärd: Ej förnyat efter klinisk, individuell bedömning.'
        : 'Åtgärd: [Nytt recept utfärdat / Ej utfärdat — motivering]';
      lines.push(
        'Kontaktorsak: Receptförnyelse via 1177.', '',
        `Bedömning: Patienten begär förnyelse av ${overuse[0].name}. Senaste receptet utfärdades ${s.pDateStr} (totalt ${s.total} doser, ordination ${s.dose} st/dag) och borde räcka till ${s.prescribedEndDateStr}. ${sn} Beräknad snittförbrukning: ${s.displayAvgStr} ${s.avgNote}.`,
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
      lines.push(`${name}: Utfärdat ${s.pDateStr} (${s.total} doser, ${s.dose} st/dag). ${endInfo} ${atgardText}`, '');
    }
    for (const { name, i } of tooEarly) {
      const s = states[i];
      lines.push(`${name}: Utfärdat ${s.pDateStr} (${s.total} doser, ${s.dose} st/dag). Räcker t.o.m. ${s.prescribedEndDateStr} (${s.daysToPrescribedEnd} dagar kvar). Snitt: ${s.displayAvgStr}. Åtgärd: Ej förnyat — för tidigt.`, '');
    }
    for (const { name, i } of overuse) {
      const s = states[i];
      const sn = s.remainingDoses != null
        ? (s.daysRemaining > 0
            ? `Vid förnyelse framkommer att patienten har ${s.remainingDoses} doser (${s.daysRemaining} dagar) kvar.`
            : 'Vid förnyelse framkommer att patienten uppger att medicinen är slut.')
        : (s.daysRemaining > 0
            ? `Räcker ytterligare ${s.daysRemaining} dagar.`
            : 'Förskrivningen är slut.');
      const atgard = s.earlyRenewalDecision === 'no'
        ? 'Åtgärd: Ej förnyat efter klinisk, individuell bedömning.'
        : 'Åtgärd: [Nytt recept utfärdat / Ej utfärdat — motivering]';
      lines.push(`${name}: Utfärdat ${s.pDateStr} (${s.total} doser, ${s.dose} st/dag). Borde räcka t.o.m. ${s.prescribedEndDateStr}. ${sn} Snitt: ${s.displayAvgStr}. ${atgard}`, '');
    }
    lines.push(
      toRenew.length > 0
        ? `Recept utfärdat för: ${toRenew.map(x => x.name).join(', ')}. Svar skickat via 1177.`
        : 'Inga recept utfärdade. Svar skickat via 1177.'
    );
  }

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
    const name = s.medRaw || `Läkemedel ${i+1}`;
    if      (s.isOveruse  && s.earlyRenewalDecision === 'yes') toRenew.push({ name, i, earlyRenewal: 'overuse' });
    else if (s.isOveruse)                                      overuse.push({ name, i });
    else if (s.isTooEarly && s.earlyRenewalDecision === 'yes') toRenew.push({ name, i, earlyRenewal: 'tooEarly' });
    else if (s.isTooEarly)                                     tooEarly.push({ name, i });
    else                                                       toRenew.push({ name, i });
  }

  const patientText   = buildPatientText('sv', toRenew, tooEarly, overuse, validCount);
  const patientTextEn = buildPatientText('en', toRenew, tooEarly, overuse, validCount);
  const journalText   = buildJournalText(toRenew, tooEarly, overuse, validCount);

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