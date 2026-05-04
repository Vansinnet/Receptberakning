// === LÄKEMEDELSLISTA — sidebar ===
function buildMedList() {
  const list = getEl('medList'); if (!list) return;
  list.textContent = '';
  // Inaktivera knappen när taket nås så att läkaren ser gränsen direkt
  const addBtn = getEl('addMedBtn');
  if (addBtn) addBtn.disabled = states.length >= 8;
  for (let i = 0; i < states.length; i++) {
    const s = states[i] || {};
    const isWarnDot = (s.isOveruse || s.isTooEarly) && s.earlyRenewalDecision !== 'yes';

    const dot    = el('span', { cls: 'status-dot' + (s.valid ? (isWarnDot ? ' warn' : ' ok') : '') });
    const name   = el('div',  { cls: 'med-item-name',   text: s.medName    || `Läkemedel ${i + 1}` });
    const status = el('div',  { cls: 'med-item-status', text: s.statusText || 'Ej ifyllt' });
    const info   = el('div',  { cls: 'med-item-info' });
    info.appendChild(name); info.appendChild(status);

    const btn = el('button', {
      cls:     'med-item' + (i === activeMedIdx ? ' active' : ''),
      attrs:   { role: 'listitem' },
      dataset: { idx: String(i) },
    });
    btn.appendChild(dot); btn.appendChild(info);
    btn.addEventListener('click', () => selectMed(i));
    list.appendChild(btn);
  }
}

function selectMed(i) {
  setActiveMed(i);
  buildMedList();
  renderFormForMed(i);
  renderResultForMed(i);
}

// === FORMULÄR — mittenkolumn ===
function renderFormForMed(i) {
  const s = states[i] || {};
  const emptyState  = getEl('formEmptyState');
  const formContent = getEl('formContent');
  if (emptyState)  emptyState.classList.add('is-hidden');
  if (formContent) formContent.classList.remove('is-hidden');

  const nameEl = getEl('formMedName');
  if (nameEl) nameEl.textContent = s.medName || `Läkemedel ${i + 1}`;

  const medInput  = getEl('medInput');  if (medInput)  medInput.value  = s.medRaw  || '';
  const dateInput = getEl('dateInput'); if (dateInput) dateInput.value = s.dateVal || todayStr();
  const doseInput = getEl('doseInput'); if (doseInput) doseInput.value = s.doseRaw || '';
  const amtInput  = getEl('amtInput');  if (amtInput)  amtInput.value  = s.amtRaw  || '';
  const refInput  = getEl('refInput');  if (refInput)  refInput.value  = s.refRaw  || '';
  const leftInput = getEl('leftInput'); if (leftInput) leftInput.value = s.leftRaw || '';

  const fassBtn = getEl('fassBtnForm');
  if (fassBtn) {
    if (s.medRaw) { fassBtn.href = getFassUrl(s.medRaw); fassBtn.classList.remove('is-hidden'); }
    else fassBtn.classList.add('is-hidden');
  }

  ['medInput', 'dateInput', 'doseInput', 'amtInput', 'refInput', 'leftInput'].forEach(id => {
    setFieldError(id, '');
  });
}

function saveFormValues(i) {
  const medRaw = (getEl('medInput') || {}).value || '';
  applyMedStatePatch(i, {
    medRaw,
    dateVal: (getEl('dateInput') || {}).value || todayStr(),
    doseRaw: (getEl('doseInput') || {}).value || '',
    amtRaw:  (getEl('amtInput')  || {}).value || '',
    refRaw:  (getEl('refInput')  || {}).value || '',
    leftRaw: (getEl('leftInput') || {}).value || '',
    medName: medRaw || `Läkemedel ${i + 1}`,
  });
}

// === RESULTAT — högerkolumn ===
function renderResultForMed(i) {
  const s             = states[i] || {};
  const emptyState    = getEl('resultEmptyState');
  const resultContent = getEl('resultContent');

  if (!s.valid) {
    if (emptyState)    emptyState.classList.remove('is-hidden');
    if (resultContent) resultContent.classList.add('is-hidden');
    renderPrescribePanel(i);
    return;
  }

  if (emptyState)    emptyState.classList.add('is-hidden');
  if (resultContent) resultContent.classList.remove('is-hidden');

  /* Verdict */
  const vBox   = getEl('verdictBox');
  const vIcon  = getEl('verdictIcon');
  const vTitle = getEl('verdictTitle');
  const vSub   = getEl('verdictSub');
  if (vBox) {
    const decidedYes = s.earlyRenewalDecision === 'yes';
    const vType = (s.isOveruse || s.isTooEarly) && decidedYes ? 'ok'
      : s.isOveruse  ? 'danger'
      : s.isTooEarly ? 'warn'
      : 'ok';
    vBox.className = 'verdict verdict-' + vType;
    if (vIcon)  vIcon.textContent  = vType === 'ok' ? '✓' : vType === 'danger' ? '⚠' : '!';
    if (vTitle) vTitle.textContent = s.verdictTitle || '—';
    if (vSub)   vSub.textContent   = s.verdictSub   || '';
  }

  /* Tidslinje — renderas bara vid fullständig beräkning (calculable:true).
     Partiella returer (daysSince=0, orimliga värden m.m.) saknar tlPct
     och ska inte lämna gammal data synlig. */
  const tlFill  = getEl('tlFill');
  const tlStart = getEl('tlStart');
  const tlEnd   = getEl('tlEnd');
  if (s.calculable === true && s.tlPct !== undefined) {
    if (tlFill) {
      tlFill.style.width = Math.min(100, s.tlPct) + '%';
      tlFill.className   = 'tl-fill tl-fill-' + (s.isOveruse ? 'danger' : s.isTooEarly ? 'warn' : 'ok');
    }
    if (tlStart) tlStart.textContent = s.tlStart || '—';
    if (tlEnd)   tlEnd.textContent   = s.tlEnd   || '—';
  } else {
    if (tlFill) { tlFill.style.width = '0%'; tlFill.className = 'tl-fill'; }
    if (tlStart) tlStart.textContent = '—';
    if (tlEnd)   tlEnd.textContent   = '—';
  }

  /* Mätvärden */
  const metricsGrid = getEl('metricsGrid');
  if (metricsGrid && s.metrics) {
    metricsGrid.textContent = '';
    s.metrics.forEach(m => {
      const div = el('div', { cls: 'metric' });
      if (m.tooltip) div.dataset.tooltip = m.tooltip;
      div.appendChild(el('div', { cls: 'metric-lbl', text: m.label }));
      div.appendChild(el('div', { cls: 'metric-val' + (m.cls ? ' ' + m.cls : ''), text: m.value }));
      metricsGrid.appendChild(div);
    });
  }

  /* Alerts */
  const alertsEl = getEl('resultAlerts');
  if (alertsEl) {
    alertsEl.textContent = '';
    if (s.alerts && s.alerts.length) {
      s.alerts.forEach(a => alertsEl.appendChild(buildAlertEl(a.type, a.title, a.message)));
    }
  }

  /* Beslutsfråga för tidig förnyelse */
  const earlyBox = getEl('earlyDecisionBox');
  if (earlyBox) {
    if (s.isOveruse || s.isTooEarly) {
      earlyBox.classList.remove('is-hidden');
      const yBtn = getEl('earlyDecisionYes');
      const nBtn = getEl('earlyDecisionNo');
      if (yBtn) yBtn.classList.toggle('selected', s.earlyRenewalDecision === 'yes');
      if (nBtn) nBtn.classList.toggle('selected', s.earlyRenewalDecision === 'no');
    } else {
      earlyBox.classList.add('is-hidden');
    }
  }

  /* Copy-sektion */
  const copySection = getEl('copySection');
  if (copySection) {
    const hasCopy = !!(s.patientText || s.journalText);
    copySection.style.display       = hasCopy ? 'flex' : 'none';
    copySection.style.flexDirection = hasCopy ? 'column' : '';
  }

  switchResultTab(states[i].activeTab || 'patient');
  renderPrescribePanel(i);
}

function switchResultTab(tab) {
  if (!states[activeMedIdx]) return;
  setMedUIPreference(activeMedIdx, 'activeTab', tab);
  document.querySelectorAll('#copySection .copy-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  const body    = getEl('copyBodyResult');
  const langBtn = getEl('langBtnResult');
  const s = states[activeMedIdx];
  if (tab === 'patient') {
    const isEn = s.patientLang === 'en';
    if (body) body.textContent = isEn ? (s.patientTextEn || s.patientText || '') : (s.patientText || '');
    if (langBtn) {
      langBtn.classList.remove('is-hidden');
      langBtn.textContent = isEn ? '🇸🇪 Svenska' : '🌐 English';
    }
  } else {
    if (body) body.textContent = s.journalText || '';
    if (langBtn) langBtn.classList.add('is-hidden');
  }
}

function togglePatientLangResult() {
  const s = states[activeMedIdx];
  if (!s || !s.patientTextEn) return;
  setMedUIPreference(activeMedIdx, 'patientLang', s.patientLang === 'en' ? 'sv' : 'en');
  switchResultTab('patient');
}
