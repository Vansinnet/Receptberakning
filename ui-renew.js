const _dom = {};
function _el(id) { return _dom[id] || (_dom[id] = document.getElementById(id)); }

let _lastMetricsKey = '';

function resetMetricsCache() {
  _lastMetricsKey = '';
}

function resetDomCache() {
  Object.keys(_dom).forEach(k => delete _dom[k]);
}

function updateMedListStatuses() {
  const list = _el('medList');
  if (!list) return;
  list.querySelectorAll('.med-item').forEach(btn => {
    const i = parseInt(btn.dataset.idx, 10);
    const s = states[i] || {};
    const isActive   = i === activeMedIdx;
    const isWarnDot  = (s.isOveruse || s.isTooEarly) && s.earlyRenewalDecision !== 'yes';

    if (isActive) {
      btn.classList.add('active');
      btn.setAttribute('aria-current', 'true');
    } else {
      btn.classList.remove('active');
      btn.removeAttribute('aria-current');
    }

    const dot = btn.querySelector('.status-dot');
    if (dot) {
      dot.className = 'status-dot' + (s.valid ? (isWarnDot ? ' warn' : ' ok') : '');
      const sr = dot.querySelector('.sr-only');
      if (sr) sr.textContent = s.valid ? (isWarnDot ? 'Åtgärd krävs' : 'OK att förnya') : '';
    }

    const status = btn.querySelector('.med-item-status');
    if (status) status.textContent = s.statusText || 'Ej ifyllt';

    const name = btn.querySelector('.med-item-name');
    if (name) name.textContent = s.medName || `Läkemedel ${i + 1}`;
  });
}

function buildMedList() {
  const list = _el('medList'); if (!list) return;
  list.textContent = '';
  // Inaktivera knappen när taket nås så att läkaren ser gränsen direkt
  const addBtn = _el('addMedBtn');
  if (addBtn) addBtn.disabled = states.length >= 8;
  for (let i = 0; i < states.length; i++) {
    const s = states[i] || {};
    const isWarnDot = (s.isOveruse || s.isTooEarly) && s.earlyRenewalDecision !== 'yes';

    const dot    = el('span', { cls: 'status-dot' + (s.valid ? (isWarnDot ? ' warn' : ' ok') : '') });
    if (s.valid) dot.appendChild(el('span', { cls: 'sr-only', text: isWarnDot ? 'Åtgärd krävs' : 'OK att förnya' }));
    const name   = el('div',  { cls: 'med-item-name',   text: s.medName    || `Läkemedel ${i + 1}` });
    const status = el('div',  { cls: 'med-item-status', text: s.statusText || 'Ej ifyllt' });
    const info   = el('div',  { cls: 'med-item-info' });
    info.appendChild(name); info.appendChild(status);

    const btn = el('button', {
      cls:     'med-item' + (i === activeMedIdx ? ' active' : ''),
      dataset: { idx: String(i) },
      attrs:   i === activeMedIdx ? { 'aria-current': 'true' } : {},
    });
    btn.appendChild(dot); btn.appendChild(info);
    btn.addEventListener('click', () => selectMed(i));
    const li = el('div', { attrs: { role: 'listitem' } });
    li.appendChild(btn);
    list.appendChild(li);
  }
}

function selectMed(i) {
  setActiveMed(i);
  buildMedList();
  renderFormForMed(i);
  renderResultForMed(i);
  // Flytta fokus till första formulärfältet så att tangentbordsanvändare
  // slipper tabba genom hela sidopanelen för att börja fylla i läkemedlet.
  const medInput = _el('medInput');
  if (medInput) medInput.focus();
}

function updateFormHeader(i) {
  const s = states[i] || {};
  const nameEl = _el('formMedName');
  if (nameEl) nameEl.textContent = s.medName || `Läkemedel ${i + 1}`;
  const fassBtn = _el('fassBtnForm');
  const narcBtn = _el('narcBtnForm');
  let narcClass = '', nplId = s.nplId;
  if (s.medRaw) {
    const raw = s.medRaw.toLowerCase();
    for (let d = 0; d < DRUG_LIST.length; d++) {
      if (DRUG_LIST[d].name.toLowerCase().trim() === raw) {
        narcClass = DRUG_LIST[d].narc;
        nplId = DRUG_LIST[d].nplId || nplId;
        break;
      }
    }
  }
  if (fassBtn) {
    if (s.medRaw) { fassBtn.href = getFassUrl(s.medRaw, nplId); fassBtn.classList.remove('is-hidden'); }
    else fassBtn.classList.add('is-hidden');
  }
  if (narcBtn) {
    if (narcClass) {
      narcBtn.textContent = 'Narkotika klass ' + narcClass;
      narcBtn.classList.remove('is-hidden');
    } else {
      narcBtn.classList.add('is-hidden');
    }
  }
}

function renderFormForMed(i) {
  const s = states[i] || {};
  const emptyState  = _el('formEmptyState');
  const formContent = _el('formContent');
  if (emptyState)  emptyState.classList.add('is-hidden');
  if (formContent) { formContent.classList.remove('is-hidden'); fadeIn(formContent); }

  updateFormHeader(i);

  const medInput           = _el('medInput');           if (medInput)           medInput.value           = s.medRaw  || '';
  const dateInput          = _el('dateInput');          if (dateInput)          dateInput.value          = s.dateVal || todayStr();
  const doseInput          = _el('doseInput');          if (doseInput)          doseInput.value          = s.doseRaw || '';
  const amtInput           = _el('amtInput');           if (amtInput)           amtInput.value           = s.amtRaw  || '';
  const refInput           = _el('refInput');           if (refInput)           refInput.value           = s.refRaw  || '';
  const leftInput          = _el('leftInput');          if (leftInput)          leftInput.value          = s.leftRaw || '';
  const doseIntervalSelect = _el('doseIntervalSelect'); if (doseIntervalSelect) doseIntervalSelect.value = String(s.doseInterval || 1);

  ['medInput', 'dateInput', 'doseInput', 'amtInput', 'refInput', 'leftInput'].forEach(id => {
    setFieldError(id, '');
  });
  hideAutocomplete();
}

function saveFormValues(i) {
  const medInputEl           = _el('medInput');
  const dateInputEl          = _el('dateInput');
  const doseInputEl          = _el('doseInput');
  const amtInputEl           = _el('amtInput');
  const refInputEl           = _el('refInput');
  const leftInputEl          = _el('leftInput');
  const doseIntervalSelectEl = _el('doseIntervalSelect');
  if (!medInputEl || !dateInputEl || !doseInputEl || !amtInputEl || !refInputEl) return;
  const medRaw = medInputEl.value.trim();
  const parsedInterval = parseInt(doseIntervalSelectEl ? doseIntervalSelectEl.value : '1', 10);
  const doseInterval = [1, 7, 30].includes(parsedInterval) ? parsedInterval : 1;
  applyMedStatePatch(i, {
    medRaw,
    dateVal:      dateInputEl.value || todayStr(),
    doseRaw:      doseInputEl.value,
    amtRaw:       amtInputEl.value,
    refRaw:       refInputEl.value,
    leftRaw:      leftInputEl ? leftInputEl.value : '',
    doseInterval,
    medName: medRaw || `Läkemedel ${i + 1}`,
  });
}

// === RESULTAT — högerkolumn ===
function renderResultForMed(i) {
  const s             = states[i] || {};
  const emptyState    = _el('resultEmptyState');
  const resultContent = _el('resultContent');

  /* Sjuksköterskebedömning — hanteras tidigt eftersom boxen ligger utanför resultContent */
  const nurseCol = _el('nurseCol');
  if (nurseCol) {
    if (nurseViewActive) {
      nurseCol.classList.remove('is-hidden'); fadeIn(nurseCol);
      const vitalCheck = _el('nurseVitalCheck');
      const followUpCheck = _el('nurseFollowUpCheck');
      if (vitalCheck) vitalCheck.checked = nurseVitalNormal;
      if (followUpCheck) followUpCheck.checked = nurseFollowUpAdequate;
      const nurseBox = _el('nurseAssessmentBox');
      if (nurseBox) nurseBox.classList.toggle('done', nurseVitalNormal && nurseFollowUpAdequate);
    } else {
      nurseCol.classList.add('is-hidden');
    }
  }

  /* Tomtillståndstext anpassas per vy */
  const emptyText = _el('resultEmptyText');
  if (emptyText) {
    emptyText.textContent = nurseViewActive
      ? 'Fyll i läkemedelsuppgifterna för att generera journaltexten.'
      : 'Resultatet visas här';
  }

  if (!s.valid) {
    if (emptyState)    emptyState.classList.remove('is-hidden');
    if (resultContent) resultContent.classList.add('is-hidden');
    renderPrescribePanel(i);
    return;
  }

  if (emptyState)    emptyState.classList.add('is-hidden');
  if (resultContent) { resultContent.classList.remove('is-hidden'); fadeIn(resultContent); }

  /* Verdict */
  const vBox   = _el('verdictBox');
  const vIcon  = _el('verdictIcon');
  const vTitle = _el('verdictTitle');
  const vSub   = _el('verdictSub');
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

  /* Tidslinje */
  const tlFill  = _el('tlFill');
  const tlStart = _el('tlStart');
  const tlEnd   = _el('tlEnd');
  if (s.calculable === true && s.tlPct !== undefined) {
    if (tlFill) {
      tlFill.style.width = Math.min(100, s.tlPct) + '%';
      tlFill.className   = 'tl-fill tl-fill-' + (s.isOveruse ? 'danger' : s.isTooEarly ? 'warn' : 'ok');
      tlFill.setAttribute('aria-valuenow', String(Math.round(Math.min(100, s.tlPct))));
    }
    if (tlStart) tlStart.textContent = s.tlStart || '—';
    if (tlEnd)   tlEnd.textContent   = s.tlEnd   || '—';
  } else {
    if (tlFill) { tlFill.style.width = '0%'; tlFill.className = 'tl-fill'; tlFill.setAttribute('aria-valuenow', '0'); }
    if (tlStart) tlStart.textContent = '—';
    if (tlEnd)   tlEnd.textContent   = '—';
  }

  /* Mätvärden — jämför före omritning */
  const metricsGrid = _el('metricsGrid');
  if (metricsGrid && s.metrics) {
    const key = s.metrics.map(m => m.value + '|' + (m.cls || '')).join(',');
    if (key !== _lastMetricsKey) {
      _lastMetricsKey = key;
      metricsGrid.textContent = '';
      s.metrics.forEach(m => {
        const div = el('div', { cls: 'metric' });
        if (m.tooltip) div.dataset.tooltip = m.tooltip;
        div.appendChild(el('div', { cls: 'metric-lbl', text: m.label }));
        div.appendChild(el('div', { cls: 'metric-val' + (m.cls ? ' ' + m.cls : ''), text: m.value }));
        metricsGrid.appendChild(div);
      });
    }
  }

  /* Alerts */
  const alertsEl = _el('resultAlerts');
  if (alertsEl) {
    alertsEl.textContent = '';
    if (s.alerts && s.alerts.length) {
      s.alerts.forEach(a => alertsEl.appendChild(buildAlertEl(a.type, a.title, a.message)));
    }
  }

  /* Beslutsfråga för tidig förnyelse */
  const earlyBox = _el('earlyDecisionBox');
  if (earlyBox) {
    if (nurseViewActive || (!s.isOveruse && !s.isTooEarly)) {
      earlyBox.classList.add('is-hidden');
    } else {
      earlyBox.classList.remove('is-hidden'); fadeIn(earlyBox);
      const yBtn = _el('earlyDecisionYes');
      const nBtn = _el('earlyDecisionNo');
      if (yBtn) yBtn.classList.toggle('selected', s.earlyRenewalDecision === 'yes');
      if (nBtn) nBtn.classList.toggle('selected', s.earlyRenewalDecision === 'no');
    }
  }

  /* Journalfliksetikett anpassas per vy */
  const journalTab = document.querySelector('#copySection .copy-tab[data-tab="journal"]');
  if (journalTab) {
    journalTab.textContent = nurseViewActive ? 'Underlag till läkare' : 'Journalanteckning (förslag)';
  }

  /* Copy-sektion */
  const copySection = _el('copySection');
  const copyBtn = _el('copyBtnResult');
  if (copySection) {
    const patientTab = copySection.querySelector('.copy-tab[data-tab="patient"]');
    if (patientTab) patientTab.classList.toggle('is-hidden', nurseViewActive);
    const hasCopy = !!(s.patientText || s.journalText);
    copySection.style.display       = hasCopy ? 'flex' : 'none';
    if (hasCopy) fadeIn(copySection);
    copySection.style.flexDirection = hasCopy ? 'column' : '';
    if (copyBtn) {
      copyBtn.classList.toggle('is-hidden', nurseViewActive && !s.journalText);
      copyBtn.disabled = !!(nurseViewActive && !s.journalText);
    }
    const allMedsLabel = _el('nurseAllMedsLabel');
    if (allMedsLabel) {
      // Visas i båda vyerna när flera läkemedel hanteras — texten är samlad
      // och distribueras identiskt till alla kort, så etiketten är lika relevant
      // för läkaren som för sjuksköterskan.
      allMedsLabel.classList.toggle('is-hidden', states.length <= 1 || !hasCopy);
    }
  }

  switchResultTab(nurseViewActive ? 'journal' : (states[i].activeTab || 'patient'));
  renderPrescribePanel(i);
}

// Modulnivå-cache för språkflagg-SVG:er — byggs en gång, klonas vid varje växling.
// Flaggor är statisk grafik, inga patientdata.
let _svFlag = null, _enFlag = null;
function _ensureFlags() {
  if (_svFlag) return;
  const NS = 'http://www.w3.org/2000/svg';
  const mkEl = (tag, attrs) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };
  const mkSvg = (...children) => {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 22 14');
    svg.setAttribute('width', '20');
    svg.setAttribute('height', '13');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'vertical-align:middle;margin-right:5px;border-radius:2px;display:inline-block';
    children.forEach(c => svg.appendChild(c));
    return svg;
  };
  _svFlag = mkSvg(
    mkEl('rect', { width: '22', height: '14', fill: '#006AA7' }),
    mkEl('rect', { x: '6', width: '3', height: '14', fill: '#FECC02' }),
    mkEl('rect', { y: '5.5', width: '22', height: '3', fill: '#FECC02' })
  );
  _enFlag = mkSvg(
    mkEl('rect',  { width: '22', height: '14', fill: '#012169' }),
    mkEl('line',  { x1: '0', y1: '0',  x2: '22', y2: '14', stroke: '#FFFFFF', 'stroke-width': '4.5' }),
    mkEl('line',  { x1: '22', y1: '0', x2: '0',  y2: '14', stroke: '#FFFFFF', 'stroke-width': '4.5' }),
    mkEl('line',  { x1: '0', y1: '0',  x2: '22', y2: '14', stroke: '#C8102E', 'stroke-width': '2' }),
    mkEl('line',  { x1: '22', y1: '0', x2: '0',  y2: '14', stroke: '#C8102E', 'stroke-width': '2' }),
    mkEl('rect',  { x: '8',   width: '6', height: '14', fill: '#FFFFFF' }),
    mkEl('rect',  { y: '4',   width: '22', height: '6',  fill: '#FFFFFF' }),
    mkEl('rect',  { x: '9.5', width: '3', height: '14', fill: '#C8102E' }),
    mkEl('rect',  { y: '5.5', width: '22', height: '3',  fill: '#C8102E' })
  );
}

function switchResultTab(tab) {
  if (!states[activeMedIdx]) return;
  setMedUIPreference(activeMedIdx, 'activeTab', tab);
  document.querySelectorAll('#copySection .copy-tab').forEach(btn => {
    const isActive = btn.dataset.tab === tab;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
  });
  const body    = _el('copyBodyResult');
  const langBtn = _el('langBtnResult');
  const s = states[activeMedIdx];
  if (tab === 'patient') {
    const isEn = s.patientLang === 'en';
    if (body) body.textContent = isEn ? (s.patientTextEn || s.patientText || '') : (s.patientText || '');
    if (langBtn) {
      langBtn.classList.remove('is-hidden');
      langBtn.textContent = '';
      _ensureFlags();
      langBtn.appendChild((isEn ? _svFlag : _enFlag).cloneNode(true));
      langBtn.appendChild(document.createTextNode(isEn ? 'Svenska' : 'English'));
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

var _acState = { container: null, items: [], selectedIdx: -1, visible: false };

function _ensureAcContainer() {
  if (_acState.container) return _acState.container;
  var medInput = _el('medInput');
  if (!medInput) return null;
  var container = el('div', { cls: 'autocomplete-dropdown is-hidden' });
  container.id = 'autocompleteDropdown';
  medInput.parentNode.insertBefore(container, medInput.nextSibling);
  _acState.container = container;
  return container;
}

function renderAutocomplete(results) {
  var container = _ensureAcContainer();
  if (!container) return;
  container.textContent = '';
  if (!results.length) { container.classList.add('is-hidden'); _acState.visible = false; return; }

  _acState.items = results;
  _acState.selectedIdx = -1;
  for (var r = 0; r < results.length; r++) {
    (function(idx) {
      var drug = results[idx];
      var item = el('div', { cls: 'autocomplete-item', dataset: { idx: String(idx) } });
      item.appendChild(el('span', { cls: 'ac-drug-name', text: drug.name }));
      const unitDisplay = drug.notCalculable ? '\u26a0 ej ber\u00e4kningsbar' : (drug.pkg + ' ' + (drug.unit || 'st') + ' \u00b7 ' + drug.form);
      item.appendChild(el('span', { cls: 'ac-drug-meta', text: unitDisplay }));
      item.addEventListener('mousedown', function(e) {
        e.preventDefault();
        selectAutocompleteItem(idx);
      });
      container.appendChild(item);
    })(r);
  }
  container.classList.remove('is-hidden');
  _acState.visible = true;
}

function hideAutocomplete() {
  if (_acState.container) {
    _acState.container.classList.add('is-hidden');
  }
  _acState.items = [];
  _acState.selectedIdx = -1;
  _acState.visible = false;
}

function selectAutocompleteItem(idx) {
  if (idx < 0 || idx >= _acState.items.length) return;
  var drug     = _acState.items[idx];
  var medInput = _el('medInput');
  var amtInput = _el('amtInput');
  if (medInput) medInput.value = drug.name;
  if (amtInput) amtInput.value = String(drug.pkg);
  hideAutocomplete();
  saveFormValues(activeMedIdx);
  // Sätt beredningsspecifika egenskaper från läkemedelsdatabasen i state.
  // notCalculable = sant för beredningar som inte kan kvantifieras automatiskt.
  // doseUnit påverkar validering av kvarvarande mängd och textgenerering.
  applyMedStatePatch(activeMedIdx, {
    nplId:         drug.nplId         || null,
    doseUnit:      drug.unit          || 'st',
    notCalculable: drug.notCalculable || false,
  });
  ensureDebounce(activeMedIdx); calcDebounced[activeMedIdx]();
}

function navigateAutocomplete(dir) {
  if (!_acState.visible || !_acState.items.length) return;
  var container = _acState.container;
  if (!container) return;
  _acState.selectedIdx = Math.max(-1, Math.min(_acState.items.length - 1, _acState.selectedIdx + dir));
  var items = container.querySelectorAll('.autocomplete-item');
  for (var i = 0; i < items.length; i++) {
    items[i].classList.toggle('active', i === _acState.selectedIdx);
  }
}

function handleAcInput() {
  var medInput = _el('medInput');
  if (!medInput) return;
  var q = medInput.value.trim();
  var results = searchDrugs(q);
  if (results.length > 0) {
    renderAutocomplete(results);
  } else {
    hideAutocomplete();
  }
}