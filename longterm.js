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
  if (ltPeriods.length >= 10) return;
  ltPeriods.push({ start: '', total: '', end: '' });
  buildPeriodContainer();
  calcLongterm();
}

function removePeriod(idx) {
  if (ltPeriods.length <= 1) return;
  ltPeriods.splice(idx, 1);
  buildPeriodContainer();
  calcLongterm();
}

function clearLongterm() {
  const m = getEl('lt-med'); if (m) m.value = '';
  const d = getEl('lt-dose'); if (d) { d.value = ''; toggleError(d, false); }
  ltPeriods = [{ start: oneYearAgoStr(), total: '', end: todayStr() }];
  buildPeriodContainer();
  ['lt-alerts', 'lt-overlap-alert', 'lt-resGrid', 'lt-period-rows'].forEach(id => {
    const e = getEl(id); if (e) e.textContent = '';
  });
  showEl('lt-result', false); showEl('lt-copySection', false); showEl('lt-fassBtn', false);
  showEl('lt-bar-section', false); showEl('lt-period-table-section', false);
}

function calcLongterm() {
  resetTimer();
  const medEl = getEl('lt-med'), doseEl = getEl('lt-dose');
  if (!medEl || !doseEl) return;
  const medRaw   = medEl.value.trim();
  const doseRaw  = doseEl.value;
  const ordDose  = parseFloat(doseRaw.replace(',', '.'));
  const doseIsInvalid = doseRaw !== '' && (isNaN(ordDose) || ordDose < 0.1 || ordDose > 50);
  toggleError(doseEl, doseIsInvalid);

  const today   = getToday();
  const periods = [];

  for (let i = 0; i < ltPeriods.length; i++) {
    const period    = ltPeriods[i];
    const startDate = parseDateUTC(period.start);
    const endDate   = parseDateUTC(period.end);
    const totalVal  = parseFloat(period.total);

    // Felen visas i DOM men datat läses från ltPeriods (källan för sanning)
    toggleError(getEl('lt-start-' + i), !!(period.start !== '' && (!startDate || startDate > today)));
    toggleError(getEl('lt-end-'   + i), !!(period.end   !== '' && (!endDate   || (startDate && endDate <= startDate))));
    toggleError(getEl('lt-total-' + i), !!(period.total !== '' && (isNaN(totalVal) || totalVal <= 0)));

    if (startDate && endDate && !isNaN(totalVal) && totalVal > 0 && startDate < endDate) {
      const days = getDaysDiff(endDate, startDate);
      if (days === 0 || days > 365 * 50) continue;
      periods.push({ startDate, endDate, total: totalVal, days, avgPerDay: totalVal / days });
    }
  }

  if (!medRaw || doseIsInvalid || isNaN(ordDose) || periods.length === 0) {
    showEl('lt-result', false);
    return;
  }

  periods.sort((a, b) => a.startDate - b.startDate);
  showEl('lt-result', true, 'flex');

  const ltAlerts  = getEl('lt-alerts');       if (ltAlerts)  ltAlerts.textContent  = '';
  const ltOverlap = getEl('lt-overlap-alert'); if (ltOverlap) ltOverlap.textContent = '';

  if (periods.length > 1) {
    for (let i = 0; i < periods.length - 1; i++) {
      if (periods[i].endDate > periods[i + 1].startDate) {
        renderAlert('lt-overlap-alert', 'warn', 'Överlappande perioder', 'Tidsperioderna överlappar varandra. Kontrollera att alla perioder är disjunkta.');
        break;
      }
    }
  }

  const totalTablets   = periods.reduce((s, p) => s + p.total, 0);
  const totalDays      = periods.reduce((s, p) => s + p.days,  0);
  if (totalDays === 0) { showEl('lt-result', false); return; }

  const overallAvg     = totalTablets / totalDays;
  const consumptionPct = (overallAvg / ordDose) * 100;
  const doseUnit       = extractDoseUnit(medRaw);
  let avgStr = `${overallAvg.toFixed(2)} st/dag`;
  if (doseUnit) avgStr += ` (${(overallAvg * doseUnit.amount).toFixed(1)} ${doseUnit.unit}/dag)`;

  const resGridEl = getEl('lt-resGrid');
  if (resGridEl) {
    resGridEl.textContent = '';
    const frag = document.createDocumentFragment();
    buildResultRow(frag, 'Analyserade perioder',       `${periods.length} st`);
    buildResultRow(frag, 'Total analyslängd',          `${totalDays} dagar`);
    buildResultRow(frag, 'Totalt uttagna tabletter',   `${totalTablets} st`);
    frag.appendChild(el('hr', { cls: 'divider' }));
    buildResultRow(frag, 'Ordinerad dos',    `${ordDose} st/dag`);
    buildResultRow(frag, 'Snittförbrukning', avgStr);
    buildResultRow(frag, 'Relativt ordination', `${consumptionPct.toFixed(1)}%`);
    resGridEl.appendChild(frag);
  }

  const OVER = 1.10, UNDER = 0.80;
  let overallStatus, alertType, alertTitle, alertMsg;
  if (overallAvg > ordDose * OVER) {
    overallStatus = 'over'; alertType = 'danger';
    alertTitle = 'Förbrukning överstiger ordination';
    alertMsg   = `Snitt ${avgStr} är ${(consumptionPct - 100).toFixed(1)}% över ordinerad dos (${ordDose} st/dag). Gör en individuell klinisk bedömning.`;
  } else if (overallAvg < ordDose * UNDER) {
    overallStatus = 'under'; alertType = 'warn';
    alertTitle = 'Låg förbrukning';
    alertMsg   = `Snitt ${avgStr} är ${(100 - consumptionPct).toFixed(1)}% under ordinerad dos (${ordDose} st/dag). Överväg om patienten tar medicinen som ordinerat.`;
  } else {
    overallStatus = 'ok'; alertType = 'ok';
    alertTitle = 'Förbrukning enligt ordination';
    alertMsg   = `Snitt ${avgStr} är i linje med ordinerad dos (${ordDose} st/dag), avvikelse ${Math.abs(consumptionPct - 100).toFixed(1)}%.`;
  }
  renderAlert('lt-alerts', alertType, alertTitle, alertMsg);

  const barPct = Math.min(150, Math.max(0, consumptionPct));
  const barEl  = getEl('lt-bar');
  if (barEl) {
    barEl.style.width = `${(barPct / 150) * 100}%`;
    barEl.className   = `consumption-bar ${overallStatus}`;
    barEl.textContent = barPct > 20 ? `${consumptionPct.toFixed(0)}%` : '';
  }
  showEl('lt-bar-section', true);

  const rowsContainer = getEl('lt-period-rows');
  if (rowsContainer) {
    rowsContainer.textContent = '';
    const frag = document.createDocumentFragment();
    periods.forEach(p => {
      const pPct = (p.avgPerDay / ordDose) * 100;
      let badgeClass, badgeText;
      if (p.avgPerDay > ordDose * OVER)       { badgeClass = 'badge-over';  badgeText = 'Över'; }
      else if (p.avgPerDay < ordDose * UNDER)  { badgeClass = 'badge-under'; badgeText = 'Under'; }
      else                                     { badgeClass = 'badge-ok';   badgeText = 'OK'; }

      const row = el('div', { cls: 'period-row' });
      row.appendChild(el('span', { cls: 'period-cell',          text: `${fmtDate(p.startDate)} – ${fmtDate(p.endDate)} (${p.days}d)` }));
      row.appendChild(el('span', { cls: 'period-cell mono ph-avg', text: `${p.avgPerDay.toFixed(2)} st/dag` }));
      row.appendChild(el('span', { cls: 'period-cell mono',     text: `${pPct >= 100 ? '+' : ''}${(pPct - 100).toFixed(1)}%` }));
      const c4 = el('span', { cls: 'period-cell' });
      c4.appendChild(el('span', { cls: `badge ${badgeClass}`, text: badgeText }));
      row.appendChild(c4);
      frag.appendChild(row);
    });
    rowsContainer.appendChild(frag);
  }
  showEl('lt-period-table-section', true);

  if (medRaw) {
    const lb = getEl('lt-fassBtn');
    if (lb) { lb.href = getFassUrl(medRaw); showEl('lt-fassBtn', true, 'inline-flex'); }
  }

  const periodSummary = periods.map((p, idx) =>
    `  Period ${idx + 1}: ${fmtDate(p.startDate)}–${fmtDate(p.endDate)} (${p.days} dagar, ${p.total} tabletter, snitt ${p.avgPerDay.toFixed(2)} st/dag)`
  ).join('\n');
  const journalText = `Aktuellt: Förbrukningsanalys av ${medRaw}.\n\nOrdinerad dos: ${ordDose} st/dag.\nAnalysperiod: ${periods.length} period(er), totalt ${totalDays} dagar.\n\nPerioder:\n${periodSummary}\n\nSammanlagd snittförbrukning: ${avgStr} (${consumptionPct.toFixed(1)}% av ordinerad dos).\n\nBedömning: [fyll i här]`;
  const copyBody = getEl('lt-copyBody'); if (copyBody) copyBody.textContent = journalText;
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
