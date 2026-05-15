// === TEXTGENERERING ===
// Centraliserad patientbrev-, journalantecknings- och sjukskötersketextgenerering.
// Extraherad från calc-renew.js.
// Beroenden: utils.js (parseDateUTC, getToday), state.js (states[], nurseVitalNormal, nurseFollowUpAdequate)
// states[] används endast som fallback när item.state saknas — primärvägen är parameterbaserad.

// Resolverar state-objekt från post: item.state (primärväg) eller states[item.i] (fallback).
function _s(item) { return item.state || states[item.i]; }

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
    singleTooEarly:    (name, s)      => `We have received your prescription renewal request for ${name}. Based on your prescription (${s.dose} ${s.doseUnitLabel || 'units/day'}), your medication is estimated to last until ${s.prescribedEndDateStr}. Please contact us again around ${s.renewDateStr} and we will help you then.`,
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
      const s = _s(tooEarly[0]);
      lines.push(t.singleTooEarly(tooEarly[0].name, s), '', t.closing);
    } else if (overuse.length === 1) {
      const s = _s(overuse[0]);
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
    for (const item of tooEarly) {
      lines.push(t.multiTooEarly(item.name, _s(item)));
    }
    for (const item of overuse) {
      const s = _s(item);
      const epast = parseDateUTC(s.prescribedEndDateStr) < getToday();
      if (epast) {
        lines.push(t.multiOverusePast(item.name, s));
      } else {
        const c = s.prescribedContactIsPast ? t.multiContactPast : t.multiFuture(s);
        lines.push(t.multiOveruseNotPast(item.name, s, c));
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
      const s = _s(toRenew[0]);
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
      const s = _s(tooEarly[0]);
      lines.push(
        'Kontaktorsak: Receptförnyelse via 1177.', '',
        `Bedömning: Patienten begär förnyelse av ${tooEarly[0].name}. Senaste receptet utfärdades ${s.pDateStr} (totalt ${s.total} ${s.doseUnit || 'st'}, ordination ${s.dose} ${s.doseUnitLabel || 'st/dag'}) och beräknas räcka till ${s.prescribedEndDateStr} (${s.daysToPrescribedEnd} dagar kvar).${remainingDosesNote(s)}`,
        `Förbrukning bedöms vara enligt ordination (snittförbrukning: ${s.displayAvgStr} ${s.avgNote}).`,
        '', 'Åtgärd: Ej förnyat — för tidigt. Svar skickat till patient via 1177.'
      );
    } else if (overuse.length === 1) {
      const s = _s(overuse[0]);
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
    for (const item of toRenew) {
      const s = _s(item);
      const atgardText = item.earlyRenewal === 'overuse'
        ? 'Åtgärd: Förnyat efter klinisk, individuell bedömning.'
        : item.earlyRenewal === 'tooEarly'
          ? `Åtgärd: Förnyat efter klinisk, individuell bedömning (${s.daysToPrescribedEnd}d kvar av receptperiod).`
          : 'Åtgärd: Förnyat.';
      const remNote = item.earlyRenewal !== 'overuse' ? remainingDosesNote(s) : '';
      const endInfo = item.earlyRenewal === 'overuse'
        ? `Borde räcka t.o.m. ${s.prescribedEndDateStr}. Snitt: ${s.displayAvgStr} — överstiger ordination.`
        : `Räcker t.o.m. ${s.prescribedEndDateStr}.${remNote} Snitt: ${s.displayAvgStr}.`;
      lines.push(`${item.name}: Utfärdat ${s.pDateStr} (${s.total} ${s.doseUnit || 'st'}, ${s.dose} ${s.doseUnitLabel || 'st/dag'}). ${endInfo} ${atgardText}`, '');
    }
    for (const item of tooEarly) {
      const s = _s(item);
      lines.push(`${item.name}: Utfärdat ${s.pDateStr} (${s.total} ${s.doseUnit || 'st'}, ${s.dose} ${s.doseUnitLabel || 'st/dag'}). Räcker t.o.m. ${s.prescribedEndDateStr} (${s.daysToPrescribedEnd} dagar kvar). Snitt: ${s.displayAvgStr}. Åtgärd: Ej förnyat — för tidigt.`, '');
    }
    for (const item of overuse) {
      const s = _s(item);
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
      lines.push(`${item.name}: Utfärdat ${s.pDateStr} (${s.total} ${s.doseUnit || 'st'}, ${s.dose} ${s.doseUnitLabel || 'st/dag'}). Borde räcka t.o.m. ${s.prescribedEndDateStr}. ${sn2} Snitt: ${s.displayAvgStr}. ${atgard}`, '');
    }
    lines.push(
      toRenew.length > 0
        ? `Recept utfärdat för: ${toRenew.map(item => {
            const ed = prescribeEnds[item.i];
            return ed ? `${item.name} fram till och med ${ed}` : item.name;
          }).join(', ')}. Svar skickat via 1177.`
        : 'Inga recept utfärdade. Svar skickat via 1177.'
    );
  }

  return lines.join('\n');
}

function buildNurseJournalText(states) {
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
