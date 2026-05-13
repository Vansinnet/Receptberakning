function canRenewMed(i) {
  const s = states[i] || {};
  return s.valid && s.calculable !== false &&
    ((!s.isOveruse && !s.isTooEarly) || s.earlyRenewalDecision === 'yes');
}

function calcPrescribeResult(i) {
  const s  = states[i] || {};
  const ps = prescribeState[i];
  if (!ps) return null;

  const today         = getToday();
  const prescribedEnd = parseDateUTC(s.prescribedEndDateStr);

  // Ny förskrivning startar när nuvarande recept löper ut, inte idag:
  // kvarvarande täckning räknas in i den begärda perioden (t.ex. "3 månader" inkluderar
  // de 25 dagar som nuvarande recept täcker, och nya tabletter förskrivs bara för resten).
  const startDate          = (prescribedEnd && prescribedEnd > today) ? prescribedEnd : today;
  const startDateStr       = fmtDate(startDate);
  const daysAlreadyCovered = (prescribedEnd && prescribedEnd > today) ? getDaysDiff(prescribedEnd, today) : 0;

  let endDate = null, totalDays = 0;
  if (_prescribeMode === 'months' && _prescribeMonths > 0) {
    // Måldatum = idag + önskade månader; befintlig täckning räknas in (se ovan).
    // Clampa dagen till sista dagen i målmånaden för att undvika rullover:
    // t.ex. 31 jan + 1 mån ska ge 28 feb, inte 3 mars.
    const tYear  = today.getUTCFullYear();
    const tMonth = today.getUTCMonth() + _prescribeMonths;
    const tDay   = today.getUTCDate();
    const lastDayOfTargetMonth = new Date(Date.UTC(tYear, tMonth + 1, 0)).getUTCDate();
    const targetEnd = new Date(Date.UTC(tYear, tMonth, Math.min(tDay, lastDayOfTargetMonth)));
    totalDays = getDaysDiff(targetEnd, startDate);
    if (totalDays <= 0) {
      return { startDate, startDateStr, daysAlreadyCovered, endDate: null, totalDays: 0, totalTablets: 0, packages: 0 };
    }
    endDate = targetEnd;
  } else if (_prescribeMode === 'date' && _prescribeEndDate) {
    const ed = parseDateUTC(_prescribeEndDate);
    if (ed && ed > startDate) { endDate = ed; totalDays = getDaysDiff(ed, startDate); }
  }

  const dose        = s.dose || 0;
  const packageSize = parseFloat(ps.packageSize) || 0;

  if (!totalDays || !dose || packageSize <= 0) {
    return { startDate, startDateStr, daysAlreadyCovered, endDate: null, totalDays: 0, totalTablets: 0, packages: 0 };
  }

  const totalTablets = Math.ceil(totalDays * dose);
  const packages     = Math.ceil(totalTablets / packageSize);
  const doseUnitVal  = s.doseUnit || 'st';
  const ds           = UNIT_DISPLAY[doseUnitVal] || UNIT_DISPLAY.st;
  const unitLabelLong  = ds.long;
  const unitLabelShort = ds.short;
  return { startDate, startDateStr, daysAlreadyCovered, endDate, endDateStr: fmtDate(endDate), totalDays, totalTablets, packages, packageSize, dose, doseUnit: doseUnitVal, unitLabelLong, unitLabelShort };
}

function prescribeValidationHint(i, ps) {
  if (!ps) return [];

  let pkgHint = null, dateHint = null;

  const pkgVal = ps.packageSize;
  const pkgNum = parseFloat(pkgVal) || 0;
  if (!pkgVal || pkgNum <= 0) {
    pkgHint = pkgVal !== ''
      ? { type: 'warn', field: 'pkg', msg: 'Förpackningsstorleken måste vara ett heltal om minst 1.' }
      : { type: 'info', field: 'pkg', msg: 'Ange förpackningsstorlek för att beräkna antal förpackningar.' };
  } else if (!Number.isInteger(pkgNum)) {
    pkgHint = { type: 'warn', field: 'pkg', msg: 'Förpackningsstorleken måste vara ett heltal.' };
  }

  if (_prescribeMode === 'date') {
    if (!_prescribeEndDate) {
      dateHint = { type: 'info', field: 'date', msg: 'Ange ett slutdatum för att beräkna antal förpackningar.' };
    } else {
      const today    = getToday();
      const s        = states[i] || {};
      const prescEnd = parseDateUTC(s.prescribedEndDateStr);
      const start    = (prescEnd && prescEnd > today) ? prescEnd : today;
      const ed       = parseDateUTC(_prescribeEndDate);
      if (!ed)          dateHint = { type: 'warn', field: 'date', msg: 'Ange ett giltigt datum (ÅÅÅÅ-MM-DD).' };
      else if (ed <= start) dateHint = { type: 'warn', field: 'date', msg: `Slutdatumet måste vara efter ${fmtDate(start)}.` };
    }
  }

  const hints = [];
  if (pkgHint)  hints.push(pkgHint);
  if (dateHint) hints.push(dateHint);
  return hints;
}

/* Uppdatera enbart resultatrutan (bevarar fokus i inmatningsfält) */
function updatePrescribeResult(i) {
  const box = getEl('ps-result-' + i);
  if (!box) return;

  // Återställ fältmarkeringar inför ny utvärdering
  toggleError(getEl('ps-pkg-'     + i), false);
  toggleError(getEl('ps-global-enddate'), false);

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

  // Uppdatera info-raden (startdatum, täckning) — även vid samma-index-optimering
  // då buildPrescribeInner inte körs.
  const infoVal = getEl('ps-info-val-' + i);
  const infoSub = getEl('ps-info-sub-' + i);
  if (infoVal) infoVal.textContent = res ? res.startDateStr : '—';
  if (infoSub) {
    if (res && res.daysAlreadyCovered > 0) {
      infoSub.textContent = `Nuv. recept täcker ${res.daysAlreadyCovered} dagar`;
      infoSub.classList.remove('is-hidden');
    } else {
      infoSub.classList.add('is-hidden');
    }
  }

  const nameEl = getEl('ps-med-name-' + i);
  if (nameEl) nameEl.textContent = (states[i] || {}).medRaw || `Läkemedel ${i + 1}`;

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
    numRow.appendChild(el('div', { cls: 'prescribe-result-unit', text: res.packageSize > 0 ? `förp.  à ${res.packageSize} ${res.unitLabelShort}` : 'förp.' }));

    const wrap = el('div', { cls: 'prescribe-result' });
    wrap.appendChild(el('div', { cls: 'prescribe-result-label',   text: 'Antal förpackningar att förskriva',
      attrs: { 'data-tooltip': 'Antal förpackningar som krävs för att täcka den angivna perioden med den ordinerade dosen. Avrundas uppåt till hela förpackningar.' } }));
    wrap.appendChild(numRow);
    wrap.appendChild(el('div', { cls: 'prescribe-result-details', text: `${res.totalTablets} ${res.unitLabelLong} ÷ ${res.packageSize} ${res.unitLabelShort}/förp.`,
      attrs: { 'data-tooltip': 'Totalt antal enheter dividerat med förpackningsstorlek.' } }));
    wrap.appendChild(el('div', { cls: 'prescribe-result-period',  text: `${res.startDateStr} – ${res.endDateStr}`,
      attrs: { 'data-tooltip': 'Period som den nya förskrivningen täcker.' } }));
    wrap.appendChild(el('div', { cls: 'prescribe-result-days',    text: `${res.totalDays} dagar`,
      attrs: { 'data-tooltip': 'Totalt antal dagar från förskrivningsstart till slutdatum.' } }));
    box.appendChild(wrap);
    renderPrescribeSummary();
    return;
  }

  // Inget beräkningsresultat — visa kontextuell vägledning om indata är ofullständiga
  const hints = prescribeValidationHint(i, prescribeState[i]);
  if (hints.length > 0) {
    hints.forEach(hint => {
      box.appendChild(buildAlertEl(hint.type, null, hint.msg));
      if (hint.type === 'warn') {
        if (hint.field === 'pkg')  toggleError(getEl('ps-pkg-'          + i), true);
        if (hint.field === 'date') toggleError(getEl('ps-global-enddate'),     true);
      }
    });
    renderPrescribeSummary();
  }
}

/* Bygger endast durationsfältet (månader-select eller datum-input) — används av både
   buildPrescribeInner (initialt) och lägesväxling (inkrementellt). */
function _buildDurationInner() {
  const durDiv = el('div', { cls: 'field', attrs: { id: 'ps-dur' } });
  if (_prescribeMode === 'months') {
    durDiv.appendChild(el('label', { text: 'Förskriva i antal månader', attrs: { for: 'ps-global-months', 'data-tooltip': 'Antal månader som den nya förskrivningen ska täcka — gäller alla läkemedel. Tid som nuvarande recept täcker räknas av automatiskt.' } }));
    const durSel = el('select', { cls: 'prescribe-select', attrs: { id: 'ps-global-months' } });
    for (let m = 1; m <= 12; m++) {
      const opt = el('option', { text: m === 1 ? '1 månad' : `${m} månader`, value: String(m) });
      if (m === _prescribeMonths) opt.selected = true;
      durSel.appendChild(opt);
    }
    durSel.addEventListener('change', () => { _prescribeMonths = parseInt(durSel.value, 10); updateAllPrescribeResults(); });
    durDiv.appendChild(durSel);
  } else {
    durDiv.appendChild(el('label', { text: 'Förskriva t.o.m.', attrs: { for: 'ps-global-enddate', 'data-tooltip': 'Sista datum som den nya förskrivningen ska täcka — gäller alla läkemedel. Måste vara efter nuvarande recepts slutdatum.' } }));
    const durInp = el('input', {
      attrs: { type: 'text', id: 'ps-global-enddate', inputmode: 'numeric',
               placeholder: 'ÅÅÅÅ-MM-DD', maxlength: '10', autocomplete: 'off' },
      value: _prescribeEndDate || '',
    });
    durInp.addEventListener('input', () => {
      autoFormatDate(durInp);
      _prescribeEndDate = durInp.value;
      updateAllPrescribeResults();
    });
    durDiv.appendChild(durInp);
  }
  return durDiv;
}

function buildPrescribeDuration() {
  const container = getEl('prescribeDuration');
  if (!container) return;
  container.textContent = '';

  const toggleDiv = el('div', { cls: 'prescribe-mode-toggle' });
  ['months', 'date'].forEach(mode => {
    const btn = el('button', {
      cls:   'prescribe-mode-btn' + (_prescribeMode === mode ? ' active' : ''),
      text:  mode === 'months' ? 'Månader' : 'Datum',
      attrs: { type: 'button' },
      dataset: { mode },
    });
    btn.addEventListener('click', () => {
      _prescribeMode = mode;
      toggleDiv.querySelectorAll('.prescribe-mode-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === mode);
      });
      const durEl = getEl('ps-dur');
      if (durEl) durEl.replaceWith(_buildDurationInner());
      updateAllPrescribeResults();
    });
    toggleDiv.appendChild(btn);
  });
  container.appendChild(toggleDiv);
  container.appendChild(_buildDurationInner());
}

function updateAllPrescribeResults() {
  if (_prescribePanelBuiltFor !== null) updatePrescribeResult(_prescribePanelBuiltFor);
  renderPrescribeSummary();
}

/* Bygg hela panelens innehåll (anropas vid initiering, ej vid lägesbyte) */
function buildPrescribeInner(i) {
  const inner = getEl('prescribeInner');
  if (!inner) return;
  const s  = states[i] || {};
  const ps = prescribeState[i];
  if (!ps) return;

  try {
    inner.textContent = '';

    inner.appendChild(el('div', { cls: 'prescribe-med-name', text: s.medRaw || `Läkemedel ${i+1}`, attrs: { id: 'ps-med-name-' + i } }));

    const pkgInp = el('input', {
      attrs: { type: 'number', id: 'ps-pkg-' + i, min: '1', step: '1', placeholder: 'T.ex. 30' },
      value: ps.packageSize || '',
    });
    pkgInp.addEventListener('input', () => { applyPrescribeStatePatch(i, { packageSize: pkgInp.value }); updatePrescribeResult(i); });
    const ds         = UNIT_DISPLAY[s.doseUnit] || UNIT_DISPLAY.st;
    const pkgLabelLong = ds.long;
    const pkgDiv = el('div', { cls: 'field', style: 'margin-top:10px' });
    pkgDiv.appendChild(el('label', { text: `Förpackningsstorlek (${pkgLabelLong})`, attrs: { for: 'ps-pkg-' + i, 'data-tooltip': `Antal ${pkgLabelLong} per förpackning. Beräkningen dividerar totalt antal ${pkgLabelLong} med förpackningsstorleken för att bestämma hur många förpackningar som ska förskrivas.` } }));
    pkgDiv.appendChild(pkgInp);
    inner.appendChild(pkgDiv);

    const res     = calcPrescribeResult(i);
    const infoDiv = el('div', { cls: 'prescribe-info-row' });
    infoDiv.appendChild(el('div', { cls: 'prescribe-info-label', text: 'Förskrivning fr.o.m.', attrs: { 'data-tooltip': 'Förskrivningen startar när nuvarande recept löper ut för att undvika dubbel täckning.' } }));
    infoDiv.appendChild(el('div', { cls: 'prescribe-info-val',   text: res ? res.startDateStr : '—', attrs: { id: 'ps-info-val-' + i } }));
    if (res && res.daysAlreadyCovered > 0) {
      infoDiv.appendChild(el('div', { cls: 'prescribe-info-sub', text: `Nuv. recept täcker ${res.daysAlreadyCovered} dagar`, attrs: { id: 'ps-info-sub-' + i } }));
    } else {
      // Skapa platshållare så att updatePrescribeResult kan uppdatera den vid behov
      infoDiv.appendChild(el('div', { cls: 'prescribe-info-sub is-hidden', attrs: { id: 'ps-info-sub-' + i } }));
    }
    inner.appendChild(infoDiv);

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
  let summaryKey = '';
  for (let i = 0; i < states.length; i++) {
    const s = states[i] || {};
    const ps = prescribeState[i];
    if (!ps || !canRenewMed(i)) continue;
    const res = calcPrescribeResult(i);
    const pkgs = res ? res.packages : 0;
    items.push({ i, name: s.medRaw || `Läkemedel ${i + 1}`, packages: pkgs, pkgSize: parseFloat(ps.packageSize) || 0, unitLabelShort: (res ? res.unitLabelShort : 'st') });
    summaryKey += `${i}:${pkgs}:${ps.packageSize}:${_prescribeMonths}:${_prescribeEndDate}:${s.amt}:${s.dose}:${s.prescribedEndDateStr}:${activeMedIdx}|`;
  }

  if (items.length < 2) {
    box.style.display = 'none';
    box.textContent = '';
    _lastSummaryKey = summaryKey;
    return;
  }
  if (summaryKey === _lastSummaryKey) return;
  _lastSummaryKey = summaryKey;
  box.textContent = '';
  box.style.display = 'block';

  const list = el('div', { cls: 'prescribe-summary-list' });
  items.forEach(({ i, name, packages, pkgSize, unitLabelShort }) => {
    const rightEl = el('span', { cls: 'prescribe-summary-right' });
    const calcDone = pkgSize > 0;
    rightEl.appendChild(el('span', { cls: 'prescribe-summary-pkg', text: calcDone ? `${packages} förp.` : '—' }));
    if (pkgSize > 0) rightEl.appendChild(el('span', { cls: 'prescribe-summary-size', text: `à ${pkgSize} ${unitLabelShort}` }));

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
    box.textContent = '';
    box.appendChild(buildAlertEl('warn', null, 'Sammanställningen kunde inte visas.'));
    box.style.display = 'block';
  }
}

const UNIT_DISPLAY = { st: { short: 'st', long: 'tabletter' }, ml: { short: 'ml', long: 'ml' }, dos: { short: 'dos', long: 'doser' } };

// Håller koll på vilket index panelen senast byggdes för, så att vi
// slipper riva och återbygga DOM:en (och tappa fokus) vid varje debounce-cykel.
let _prescribePanelBuiltFor = null;
let _lastSummaryKey = '';
let _prescribeMode = 'months';
let _prescribeMonths = 7;
let _prescribeEndDate = '';

function resetPrescribePanel() {
  _prescribePanelBuiltFor = null;
  _lastSummaryKey = '';
  _prescribeMode = 'months';
  _prescribeMonths = 7;
  _prescribeEndDate = '';
  const pd = getEl('prescribeDuration');
  if (pd) pd.textContent = '';
}

/* Visa/dölj och initiera panelen för givet läkemedelsindex */
function renderPrescribePanel(i) {
  const panel = getEl('prescribePanel');
  if (!panel) return;
  if (nurseViewActive) { panel.classList.add('is-hidden'); return; }
  const s = states[i] || {};
  const activeEligible = canRenewMed(i);

  // AKTIVT VAL: Envägsspegel amt → packageSize. Skrivs över varje gång amt ändras.
  // Läkarens manuella värde i förskrivningspanelen är temporärt — nästa
  // gång Mängd per uttag ändras speglas det nya värdet in.
  // Att "skydda" manuell inmatning skulle bryta envägsspegeln och ge inaktuella
  // paketstorlekar som grund för förskrivningsberäkningen.
  const currentAmt = String(s.amt || '');
  if (!prescribeState[i]) {
    initPrescribeState(i, { packageSize: currentAmt, _lastAmt: currentAmt });
  } else {
    if (prescribeState[i]._lastAmt !== currentAmt && currentAmt !== '') {
      applyPrescribeStatePatch(i, { _lastAmt: currentAmt, packageSize: currentAmt });
    } else if (prescribeState[i].packageSize === '') {
      applyPrescribeStatePatch(i, { packageSize: currentAmt });
    }
  }

  const pkgEl = getEl('ps-pkg-' + i);
  if (pkgEl && prescribeState[i] && pkgEl.value !== prescribeState[i].packageSize) {
    pkgEl.value = prescribeState[i].packageSize;
  }

  renderPrescribeSummary();

  const summary = getEl('prescribeSummary');
  const hasSummary = summary && summary.style.display !== 'none';

  if (!activeEligible && !hasSummary) {
    panel.classList.add('is-hidden');
    _prescribePanelBuiltFor = null;
    const inner = getEl('prescribeInner');
    if (inner) inner.textContent = '';
    return;
  }

  const durContainer = getEl('prescribeDuration');
  if (durContainer && durContainer.children.length === 0) buildPrescribeDuration();

  panel.classList.remove('is-hidden');

  if (!activeEligible) {
    _prescribePanelBuiltFor = null;
    const inner = getEl('prescribeInner');
    if (inner) inner.textContent = '';
    return;
 }

  if (_prescribePanelBuiltFor !== i) {
    _prescribePanelBuiltFor = i;
    buildPrescribeInner(i);
  } else {
    updatePrescribeResult(i);
  }
}
