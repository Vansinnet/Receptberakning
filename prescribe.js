// === NY FÖRSKRIVNING ===

function canRenewMed(i) {
  const s = states[i] || {};
  return s.valid && s.calculable !== false &&
    ((!s.isOveruse && !s.isTooEarly) || s.earlyRenewalDecision === 'yes');
}

/* Beräkna resultat utan att röra DOM */
function calcPrescribeResult(i) {
  const s  = states[i] || {};
  const ps = prescribeState[i];
  if (!ps) return null;

  const today         = getToday();
  const prescribedEnd = parseDateUTC(s.prescribedEndDateStr);

  // AKTIVT VAL: Ny förskrivning startar när nuvarande recept löper ut, inte idag.
  // Skäl: Om patienten har läkemedel hemma ska läkaren inte förskriva mer än nödvändigt —
  // kvarvarande täckning räknas in i den begärda perioden (t.ex. "3 månader" inkluderar
  // de 25 dagar som nuvarande recept täcker, och nya tabletter förskrivs bara för resten).
  const startDate          = (prescribedEnd && prescribedEnd > today) ? prescribedEnd : today;
  const startDateStr       = fmtDate(startDate);
  const daysAlreadyCovered = (prescribedEnd && prescribedEnd > today) ? getDaysDiff(prescribedEnd, today) : 0;

  let endDate = null, totalDays = 0;
  if (ps.mode === 'months' && ps.months > 0) {
    // Måldatum = idag + önskade månader; befintlig täckning räknas in (se ovan).
    // Clampa dagen till sista dagen i målmånaden för att undvika rullover:
    // t.ex. 31 jan + 1 mån ska ge 28 feb, inte 3 mars.
    const tYear  = today.getUTCFullYear();
    const tMonth = today.getUTCMonth() + ps.months;
    const tDay   = today.getUTCDate();
    const lastDayOfTargetMonth = new Date(Date.UTC(tYear, tMonth + 1, 0)).getUTCDate();
    const targetEnd = new Date(Date.UTC(tYear, tMonth, Math.min(tDay, lastDayOfTargetMonth)));
    totalDays = getDaysDiff(targetEnd, startDate);
    if (totalDays <= 0) {
      return { startDate, startDateStr, daysAlreadyCovered, endDate: null, totalDays: 0, totalTablets: 0, packages: 0 };
    }
    endDate = targetEnd;
  } else if (ps.mode === 'date' && ps.endDate) {
    const ed = parseDateUTC(ps.endDate);
    if (ed && ed > startDate) { endDate = ed; totalDays = getDaysDiff(ed, startDate); }
  }

  const dose        = s.dose || 0;
  const packageSize = parseFloat(ps.packageSize) || 0;

  if (!totalDays || !dose || packageSize <= 0) {
    return { startDate, startDateStr, daysAlreadyCovered, endDate: null, totalDays: 0, totalTablets: 0, packages: 0 };
  }

  const totalTablets = Math.ceil(totalDays * dose);
  const packages     = Math.ceil(totalTablets / packageSize);
  return { startDate, startDateStr, daysAlreadyCovered, endDate, endDateStr: fmtDate(endDate), totalDays, totalTablets, packages, packageSize, dose };
}

// Ren valideringsfunktion — returnerar { type, msg } eller null.
// Anropas av updatePrescribeResult för att avgöra vad som ska visas när
// calcPrescribeResult inte kan producera ett resultat.
// field-nyckeln anger vilket inmatningsfält som är felaktigt ('pkg' eller 'date')
// så att updatePrescribeResult kan applicera toggleError på rätt element.
function prescribeValidationHint(i, ps) {
  if (!ps) return null;

  const pkgVal = ps.packageSize;
  const pkgNum = parseFloat(pkgVal) || 0;
  if (pkgNum <= 0) {
    // Tomt fält = läkaren har inte fyllt i än; ogiltigt värde = aktivt fel
    return pkgVal !== ''
      ? { type: 'warn', field: 'pkg',  msg: 'Förpackningsstorleken måste vara ett heltal om minst 1.' }
      : { type: 'info', field: 'pkg',  msg: 'Ange förpackningsstorlek för att beräkna antal förpackningar.' };
  }

  if (ps.mode === 'date' && ps.endDate) {
    const today    = getToday();
    const s        = states[i] || {};
    const prescEnd = parseDateUTC(s.prescribedEndDateStr);
    const start    = (prescEnd && prescEnd > today) ? prescEnd : today;
    const ed       = parseDateUTC(ps.endDate);
    if (!ed)         return { type: 'warn', field: 'date', msg: 'Ange ett giltigt datum (ÅÅÅÅ-MM-DD).' };
    if (ed <= start) return { type: 'warn', field: 'date', msg: `Slutdatumet måste vara efter ${fmtDate(start)}.` };
  }

  return null;
}

/* Uppdatera enbart resultatrutan (bevarar fokus i inmatningsfält) */
function updatePrescribeResult(i) {
  const box = getEl('ps-result-' + i);
  if (!box) return;

  // Återställ fältmarkeringar inför ny utvärdering
  toggleError(getEl('ps-pkg-'     + i), false);
  toggleError(getEl('ps-enddate-' + i), false);

  let res;
  try {
    res = calcPrescribeResult(i);
  } catch (err) {
    console.error('updatePrescribeResult:', err.message);
    box.textContent = '';
    box.appendChild(buildAlertEl('warn', null, 'Beräkningen kunde inte genomföras. Kontrollera inmatningsfälten.'));
    renderPrescribeSummary();
    return;
  }

  box.textContent = '';

  // Befintligt recept täcker redan hela perioden — inget nytt behöver förskrivas
  if (res && res.packages === 0 && res.totalDays === 0 && res.daysAlreadyCovered > 0) {
    const name = (states[i] || {}).medRaw || `Läkemedel ${i + 1}`;
    box.appendChild(el('div', { cls: 'prescribe-result-covered', text: `Nuvarande recept för ${name} täcker redan hela perioden.` }));
    renderPrescribeSummary();
    return;
  }

  if (res && res.packages) {
    const numRow = el('div', { cls: 'prescribe-result-num-row' });
    numRow.appendChild(el('div', { cls: 'prescribe-result-packages', text: String(res.packages) }));
    numRow.appendChild(el('div', { cls: 'prescribe-result-unit', text: res.packageSize > 0 ? `förp.  à ${res.packageSize} st` : 'förp.' }));

    const wrap = el('div', { cls: 'prescribe-result' });
    wrap.appendChild(el('div', { cls: 'prescribe-result-label',   text: 'Antal förpackningar att förskriva' }));
    wrap.appendChild(numRow);
    wrap.appendChild(el('div', { cls: 'prescribe-result-details', text: `${res.totalTablets} tabletter ÷ ${res.packageSize} st/förp.` }));
    wrap.appendChild(el('div', { cls: 'prescribe-result-period',  text: `${res.startDateStr} – ${res.endDateStr}` }));
    wrap.appendChild(el('div', { cls: 'prescribe-result-days',    text: `${res.totalDays} dagar` }));
    box.appendChild(wrap);
    renderPrescribeSummary();
    return;
  }

  // Inget beräkningsresultat — visa kontextuell vägledning om indata är ofullständiga
  const hint = prescribeValidationHint(i, prescribeState[i]);
  if (hint) {
    box.appendChild(buildAlertEl(hint.type, null, hint.msg));
    if (hint.type === 'warn') {
      if (hint.field === 'pkg')  toggleError(getEl('ps-pkg-'     + i), true);
      if (hint.field === 'date') toggleError(getEl('ps-enddate-' + i), true);
    }
    renderPrescribeSummary();
  }
}

/* Bygg hela panelens innehåll (anropas vid initiering och lägesbyte) */
function buildPrescribeInner(i) {
  const inner = getEl('prescribeInner');
  if (!inner) return;
  const s  = states[i] || {};
  const ps = prescribeState[i];
  if (!ps) return;

  try {
  inner.textContent = '';

  inner.appendChild(el('div', { cls: 'prescribe-med-name', text: s.medRaw || `Läkemedel ${i+1}` }));

  const pkgInp = el('input', {
    attrs: { type: 'number', id: 'ps-pkg-' + i, min: '1', placeholder: 'T.ex. 30' },
    value: ps.packageSize || '',
  });
  pkgInp.addEventListener('input', () => { applyPrescribeStatePatch(i, { packageSize: pkgInp.value }); updatePrescribeResult(i); });
  const pkgDiv = el('div', { cls: 'field', style: 'margin-top:10px' });
  pkgDiv.appendChild(el('label', { text: 'Förpackningsstorlek (st)', attrs: { for: 'ps-pkg-' + i } }));
  pkgDiv.appendChild(pkgInp);
  inner.appendChild(pkgDiv);

  const res     = calcPrescribeResult(i);
  const infoDiv = el('div', { cls: 'prescribe-info-row' });
  infoDiv.appendChild(el('div', { cls: 'prescribe-info-label', text: 'Förskrivning fr.o.m.' }));
  infoDiv.appendChild(el('div', { cls: 'prescribe-info-val',   text: res ? res.startDateStr : '—' }));
  if (res && res.daysAlreadyCovered > 0) {
    infoDiv.appendChild(el('div', { cls: 'prescribe-info-sub', text: `Nuv. recept täcker ${res.daysAlreadyCovered} dagar` }));
  }
  inner.appendChild(infoDiv);

  const toggleDiv = el('div', { cls: 'prescribe-mode-toggle' });
  ['months', 'date'].forEach(mode => {
    const btn = el('button', {
      cls:   'prescribe-mode-btn' + (ps.mode === mode ? ' active' : ''),
      text:  mode === 'months' ? 'Månader' : 'Datum',
      attrs: { type: 'button' },
    });
    btn.addEventListener('click', () => { applyPrescribeStatePatch(i, { mode }); buildPrescribeInner(i); });
    toggleDiv.appendChild(btn);
  });
  inner.appendChild(toggleDiv);

  const durDiv = el('div', { cls: 'field' });
  if (ps.mode === 'months') {
    durDiv.appendChild(el('label', { text: 'Förskriva i antal månader', attrs: { for: 'ps-months-' + i } }));
    const durSel = el('select', { cls: 'prescribe-select', attrs: { id: 'ps-months-' + i } });
    for (let m = 1; m <= 12; m++) {
      const opt = el('option', { text: m === 1 ? '1 månad' : `${m} månader`, value: String(m) });
      if (m === ps.months) opt.selected = true;
      durSel.appendChild(opt);
    }
    durSel.addEventListener('change', () => { applyPrescribeStatePatch(i, { months: parseInt(durSel.value, 10) }); updatePrescribeResult(i); });
    durDiv.appendChild(durSel);
  } else {
    durDiv.appendChild(el('label', { text: 'Förskriva t.o.m.', attrs: { for: 'ps-enddate-' + i } }));
    const durInp = el('input', {
      attrs: { type: 'text', id: 'ps-enddate-' + i, inputmode: 'numeric',
               placeholder: 'ÅÅÅÅ-MM-DD', maxlength: '10', autocomplete: 'off' },
      value: ps.endDate || '',
    });
    durInp.addEventListener('input', () => {
      autoFormatDate(durInp);
      applyPrescribeStatePatch(i, { endDate: durInp.value });
      updatePrescribeResult(i);
    });
    durDiv.appendChild(durInp);
  }
  inner.appendChild(durDiv);

  inner.appendChild(el('div', { attrs: { id: 'ps-result-' + i } }));
  updatePrescribeResult(i);
  } catch (err) {
    console.error('buildPrescribeInner:', err.message);
    inner.textContent = '';
    inner.appendChild(buildAlertEl('warn', null, 'Förskrivningspanelen kunde inte visas. Försök igen.'));
  }
}

/* Uppdatera sammanfattningslistan högst upp i panelen */
function renderPrescribeSummary() {
  const box = getEl('prescribeSummary');
  if (!box) return;

  try {
  const items = [];
  for (let i = 0; i < states.length; i++) {
    const s = states[i] || {};
    const ps = prescribeState[i];
    if (!ps || !canRenewMed(i)) continue;
    const res = calcPrescribeResult(i);
    items.push({ i, name: s.medRaw || `Läkemedel ${i + 1}`, packages: res ? res.packages : 0, pkgSize: parseFloat(ps.packageSize) || 0 });
  }

  box.textContent = '';
  if (items.length < 2) { box.style.display = 'none'; return; }
  box.style.display = 'block';

  const list = el('div', { cls: 'prescribe-summary-list' });
  items.forEach(({ i, name, packages, pkgSize }) => {
    const rightEl = el('span', { cls: 'prescribe-summary-right' });
    rightEl.appendChild(el('span', { cls: 'prescribe-summary-pkg', text: packages ? `${packages} förp.` : '—' }));
    if (pkgSize > 0) rightEl.appendChild(el('span', { cls: 'prescribe-summary-size', text: `à ${pkgSize} st` }));

    const row = el('button', {
      cls:   'prescribe-summary-row' + (i === activeMedIdx ? ' active' : ''),
      attrs: { type: 'button' },
    });
    row.appendChild(el('span', { cls: 'prescribe-summary-name', text: name }));
    row.appendChild(rightEl);
    row.addEventListener('click', () => selectMed(i));
    list.appendChild(row);
  });

  const wrap = el('div', { cls: 'prescribe-summary-wrap' });
  wrap.appendChild(el('div', { cls: 'prescribe-summary-header', text: 'Sammanställning av läkemedel att förskriva' }));
  wrap.appendChild(list);
  box.appendChild(wrap);
  } catch (err) {
    console.error('renderPrescribeSummary:', err.message);
  }
}

// Håller koll på vilket index panelen senast byggdes för, så att vi
// slipper riva och återbygga DOM:en (och tappa fokus) vid varje debounce-cykel.
let _prescribePanelBuiltFor = null;

/* Visa/dölj och initiera panelen för givet läkemedelsindex */
function renderPrescribePanel(i) {
  const panel = getEl('prescribePanel');
  if (!panel) return;
  const s = states[i] || {};

  if (!canRenewMed(i)) {
    panel.classList.add('is-hidden');
    _prescribePanelBuiltFor = null;
    return;
  }
  panel.classList.remove('is-hidden');

  if (!prescribeState[i]) {
    initPrescribeState(i, { mode: 'months', months: 7, endDate: '', packageSize: String(s.amt || '') });
  } else {
    // AKTIVT VAL: packageSize synkas inte automatiskt när amtInput ändras i huvudformuläret.
    // Skäl: Förpackningsstorleken på det nya receptet kan avsiktligt skilja sig från det
    // föregående — läkaren väljer själv storlek i högerpanelen och beräkningen visar hur
    // många förpackningar av den storleken som krävs. Automatisk överskrivning skulle
    // förstöra ett pågående val utan att läkaren märker det.
    // Fältet förfylls bara om det är tomt (t.ex. vid första öppning efter byte av läkemedel).
    if (!prescribeState[i].packageSize) {
      applyPrescribeStatePatch(i, { packageSize: String(s.amt || '') });
    }
  }

  // Bygg bara om DOM:en om vi byter läkemedel. Annars räcker det att
  // uppdatera resultatsiffran, så att fokus i datuminmatningen bevaras.
  if (_prescribePanelBuiltFor !== i) {
    buildPrescribeInner(i);
    _prescribePanelBuiltFor = i;
  } else {
    updatePrescribeResult(i);
  }
}
