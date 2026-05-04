// === FLIK 2: LÅNGVARIG FÖRBRUKNING ===
function buildPeriodContainer() {
  const container = getEl('lt-periods-container');
  if (!container) return;
  container.textContent = '';

  ltPeriods.forEach((period, i) => {
    const wrap = el('div', { attrs: { id: `lt-period-wrap-${i}` } });
    wrap.appendChild(el('div', { cls: 'section-label', text: `Period ${i + 1}` }));

    const row = el('div', { cls: 'form-row-3', attrs: { id: `lt-period-${i}` } });

    // Skapar ett formulärfält med label och input — återanvänds för alla tre kolumner
    function makeField(forId, labelText, tooltip, inputAttrs, inputValue) {
      const field = el('div', { cls: 'field' });
      field.appendChild(el('label', { attrs: { for: forId, 'data-tooltip': tooltip }, text: labelText }));
      field.appendChild(el('input', { attrs: { id: forId, ...inputAttrs }, value: inputValue }));
      return field;
    }

    row.appendChild(makeField(
      `lt-start-${i}`, 'Startdatum',
      'Startdatum för perioden — vanligen förskrivnings- eller uthämtningsdatum.',
      { type: 'text', inputmode: 'numeric', placeholder: 'ÅÅÅÅ-MM-DD',
        pattern: '\\d{4}-\\d{2}-\\d{2}', maxlength: '10', autocomplete: 'off' },
      period.start
    ));

    row.appendChild(makeField(
      `lt-total-${i}`, 'Antal uttagna tabletter',
      'Totalt antal tabletter eller kapslar uttagna under perioden. Hämtas från apotekskvitto eller journaldokumentation.',
      { type: 'number', placeholder: '100', min: '1' },
      period.total
    ));

    row.appendChild(makeField(
      `lt-end-${i}`, 'Slutdatum',
      'Slutdatum för perioden — när medicinen tog slut eller nästa recept utfärdades.',
      { type: 'text', inputmode: 'numeric', placeholder: 'ÅÅÅÅ-MM-DD',
        pattern: '\\d{4}-\\d{2}-\\d{2}', maxlength: '10', autocomplete: 'off' },
      period.end
    ));

    wrap.appendChild(row);

    if (i > 0) {
      wrap.appendChild(el('button', {
        cls:   'btn btn-ghost',
        style: 'font-size:11px;margin-bottom:8px',
        text:  `✕ Ta bort period ${i + 1}`,
        attrs: { type: 'button', 'data-action': 'remove-period', 'data-idx': String(i) },
      }));
    }

    container.appendChild(wrap);
  });
}

function addPeriod() {
  if (!pushLtPeriod()) return;
  buildPeriodContainer();
  calcLongterm();
}

function removePeriod(idx) {
  if (!spliceLtPeriod(idx)) return;
  buildPeriodContainer();
  calcLongterm();
}

function clearLongterm() {
  const m = getEl('lt-med'); if (m) m.value = '';
  const d = getEl('lt-dose'); if (d) { d.value = ''; toggleError(d, false); }
  resetLtPeriods();
  buildPeriodContainer();
  ['lt-alerts', 'lt-overlap-alert', 'lt-resGrid', 'lt-period-rows'].forEach(id => {
    const e = getEl(id); if (e) e.textContent = '';
  });
  showEl('lt-result', false); showEl('lt-copySection', false); showEl('lt-fassBtn', false);
  showEl('lt-bar-section', false); showEl('lt-period-table-section', false);
}

// Gränsvärden för förbrukningsbedömning — används av både kärna och UI
const LT_OVER  = 1.10;
const LT_UNDER = 0.80;

/* Ren beräkningsfunktion — ingen DOM.
   Returnerar alltid periodErrors så att UI:t kan markera ogiltiga fält
   även när dos eller läkemedel saknas. */
function calcLongtermCore(medRaw, ordDose, rawPeriods) {
  const today = getToday();
  const periodErrors = [];
  const periods      = [];

  for (let i = 0; i < rawPeriods.length; i++) {
    const p         = rawPeriods[i];
    const startDate = parseDateUTC(p.start);
    const endDate   = parseDateUTC(p.end);
    const totalVal  = parseFloat(p.total);

    periodErrors.push({
      idx:        i,
      startError: !!(p.start !== '' && (!startDate || startDate > today)),
      endError:   !!(p.end   !== '' && (!endDate   || (startDate && endDate <= startDate))),
      totalError: !!(p.total !== '' && (isNaN(totalVal) || totalVal <= 0)),
    });

    if (startDate && endDate && !isNaN(totalVal) && totalVal > 0 && startDate < endDate) {
      const days = getDaysDiff(endDate, startDate);
      if (days === 0 || days > 365 * 50) continue;
      periods.push({ startDate, endDate, total: totalVal, days, avgPerDay: totalVal / days });
    }
  }

  if (isNaN(ordDose) || ordDose <= 0 || periods.length === 0) {
    return { valid: false, periodErrors };
  }

  periods.sort((a, b) => a.startDate - b.startDate);

  let hasOverlap = false;
  for (let i = 0; i < periods.length - 1; i++) {
    if (periods[i].endDate > periods[i + 1].startDate) { hasOverlap = true; break; }
  }

  const totalTablets = periods.reduce((s, p) => s + p.total, 0);

  // AKTIVT VAL: Vid överlapp används unionen av datumintervall som nämnare.
  // Tabletterna räknas alltid i sin helhet (de är faktiskt uttagna), men överlappande
  // dagar dubbelräknas inte — annars underskattas overallAvg och är kliniskt missvisande.
  let totalDays;
  if (hasOverlap) {
    const merged = [];
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

  if (totalDays === 0) return { valid: false, periodErrors };

  const overallAvg     = totalTablets / totalDays;
  const consumptionPct = (overallAvg / ordDose) * 100;
  const doseUnit       = extractDoseUnit(medRaw);
  let avgStr = `${overallAvg.toFixed(2)} st/dag`;
  if (doseUnit) avgStr += ` (${(overallAvg * doseUnit.amount).toFixed(1)} ${doseUnit.unit}/dag)`;

  // Per-period klassificering beräknas här så att UI:t slipper upprepa logiken
  periods.forEach(p => {
    p.classification = p.avgPerDay > ordDose * LT_OVER  ? 'over'
                     : p.avgPerDay < ordDose * LT_UNDER ? 'under'
                     : 'ok';
  });

  let overallStatus, alertType, alertTitle, alertMsg;
  if (overallAvg > ordDose * LT_OVER) {
    overallStatus = 'over'; alertType = 'danger';
    alertTitle = 'Förbrukning överstiger ordination';
    alertMsg   = `Snitt ${avgStr} är ${(consumptionPct - 100).toFixed(1)}% över ordinerad dos (${ordDose} st/dag). Gör en individuell klinisk bedömning.`;
  } else if (overallAvg < ordDose * LT_UNDER) {
    overallStatus = 'under'; alertType = 'warn';
    alertTitle = 'Låg förbrukning';
    alertMsg   = `Snitt ${avgStr} är ${(100 - consumptionPct).toFixed(1)}% under ordinerad dos (${ordDose} st/dag). Överväg om patienten tar medicinen som ordinerat.`;
  } else {
    overallStatus = 'ok'; alertType = 'ok';
    alertTitle = 'Förbrukning enligt ordination';
    alertMsg   = `Snitt ${avgStr} är i linje med ordinerad dos (${ordDose} st/dag), avvikelse ${Math.abs(consumptionPct - 100).toFixed(1)}%.`;
  }

  const periodSummary = periods.map((p, idx) =>
    `  Period ${idx + 1}: ${fmtDate(p.startDate)}–${fmtDate(p.endDate)} (${p.days} dagar, ${p.total} tabletter, snitt ${p.avgPerDay.toFixed(2)} st/dag)`
  ).join('\n');

  return {
    valid: true,
    periodErrors,
    periods,
    totalTablets,
    totalDays,
    overallAvg,
    consumptionPct,
    avgStr,
    ordDose,
    overallStatus,
    alertType,
    alertTitle,
    alertMsg,
    hasOverlap,
    barPct:      Math.min(150, Math.max(0, consumptionPct)),
    fassUrl:     getFassUrl(medRaw),
    journalText: `Aktuellt: Förbrukningsanalys av ${medRaw}.\n\nOrdinerad dos: ${ordDose} st/dag.\nAnalysperiod: ${periods.length} period(er), totalt ${totalDays} dagar.\n\nPerioder:\n${periodSummary}\n\nSammanlagd snittförbrukning: ${avgStr} (${consumptionPct.toFixed(1)}% av ordinerad dos).\n\nBedömning: [fyll i här]`,
  };
}

/* DOM-skal — läser fält, anropar kärnan, renderar resultatet */
function calcLongterm() {
  resetTimer();
  const medEl = getEl('lt-med'), doseEl = getEl('lt-dose');
  if (!medEl || !doseEl) return;

  const medRaw  = medEl.value.trim();
  const doseRaw = doseEl.value;
  const ordDose = parseFloat(doseRaw.replace(',', '.'));
  const doseIsInvalid = doseRaw !== '' && (isNaN(ordDose) || ordDose < 0.1 || ordDose > 50);
  toggleError(doseEl, doseIsInvalid);

  let result;
  try {
    result = calcLongtermCore(medRaw, ordDose, ltPeriods);
  } catch (err) {
    console.error('calcLongtermCore:', err.message);
    showEl('lt-result', false);
    return;
  }

  // Periodfältsfel appliceras alltid, oavsett om övriga fält är giltiga
  result.periodErrors.forEach(({ idx, startError, endError, totalError }) => {
    toggleError(getEl(`lt-start-${idx}`), startError);
    toggleError(getEl(`lt-end-${idx}`),   endError);
    toggleError(getEl(`lt-total-${idx}`), totalError);
  });

  const ltOverlap = getEl('lt-overlap-alert');
  if (ltOverlap) ltOverlap.textContent = '';
  if (result.hasOverlap) {
    renderAlert('lt-overlap-alert', 'warn', 'Överlappande perioder', 'Tidsperioderna överlappar varandra. Beräkningen använder union av datumintervall — överlappande dagar räknas inte dubbelt.');
  }

  if (!medRaw || doseIsInvalid || isNaN(ordDose) || !result.valid) {
    showEl('lt-result', false);
    return;
  }

  showEl('lt-result', true, 'flex');

  const resGridEl = getEl('lt-resGrid');
  if (resGridEl) {
    resGridEl.textContent = '';
    const frag = document.createDocumentFragment();
    buildResultRow(frag, 'Analyserade perioder',     `${result.periods.length} st`);
    buildResultRow(frag, 'Total analyslängd',        `${result.totalDays} dagar`);
    buildResultRow(frag, 'Totalt uttagna tabletter', `${result.totalTablets} st`);
    frag.appendChild(el('hr', { cls: 'divider' }));
    buildResultRow(frag, 'Ordinerad dos',       `${result.ordDose} st/dag`);
    buildResultRow(frag, 'Snittförbrukning',    result.avgStr);
    buildResultRow(frag, 'Relativt ordination', `${result.consumptionPct.toFixed(1)}%`);
    resGridEl.appendChild(frag);
  }

  renderAlert('lt-alerts', result.alertType, result.alertTitle, result.alertMsg);

  const barEl = getEl('lt-bar');
  if (barEl) {
    barEl.style.width = `${(result.barPct / 150) * 100}%`;
    barEl.className   = `consumption-bar ${result.overallStatus}`;
    barEl.textContent = result.barPct > 20 ? `${result.consumptionPct.toFixed(0)}%` : '';
  }
  showEl('lt-bar-section', true);

  const rowsContainer = getEl('lt-period-rows');
  if (rowsContainer) {
    rowsContainer.textContent = '';
    const frag = document.createDocumentFragment();
    result.periods.forEach(p => {
      const pPct      = (p.avgPerDay / result.ordDose) * 100;
      const badgeClass = `badge-${p.classification}`;
      const badgeText  = p.classification === 'over' ? 'Över' : p.classification === 'under' ? 'Under' : 'OK';

      const row = el('div', { cls: 'period-row' });
      row.appendChild(el('span', { cls: 'period-cell',             text: `${fmtDate(p.startDate)} – ${fmtDate(p.endDate)} (${p.days}d)` }));
      row.appendChild(el('span', { cls: 'period-cell mono ph-avg', text: `${p.avgPerDay.toFixed(2)} st/dag` }));
      row.appendChild(el('span', { cls: 'period-cell mono',        text: `${pPct >= 100 ? '+' : ''}${(pPct - 100).toFixed(1)}%` }));
      const c4 = el('span', { cls: 'period-cell' });
      c4.appendChild(el('span', { cls: `badge ${badgeClass}`, text: badgeText }));
      row.appendChild(c4);
      frag.appendChild(row);
    });
    rowsContainer.appendChild(frag);
  }
  showEl('lt-period-table-section', true);

  const lb = getEl('lt-fassBtn');
  if (lb) { lb.href = result.fassUrl; showEl('lt-fassBtn', true, 'inline-flex'); }

  const copyBody = getEl('lt-copyBody');
  if (copyBody) copyBody.textContent = result.journalText;
  showEl('lt-copySection', true);
}

const ltCopyTimers = new Map();
function copyLtText() {
  const body = getEl('lt-copyBody'), text = body ? body.textContent : '';
  const btn  = getEl('ltCopyBtn');
  navigator.clipboard.writeText(text).then(() => {
    if (!btn) return;
    const orig = btn.dataset.origLabel || btn.textContent;
    btn.dataset.origLabel = orig;
    btn.textContent = '✅ Kopierat!';
    if (ltCopyTimers.has(btn)) clearTimeout(ltCopyTimers.get(btn));
    const t = setTimeout(() => { btn.textContent = orig; delete btn.dataset.origLabel; ltCopyTimers.delete(btn); }, 1800);
    ltCopyTimers.set(btn, t);
  }).catch(() => { if (btn) btn.textContent = '⚠️ Kopiera manuellt'; });
}
