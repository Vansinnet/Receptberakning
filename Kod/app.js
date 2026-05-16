
let warnTimer, clearTimer, countdownInt;

const calcDebounced = new Map();
function ensureDebounce(cardId) {
  if (calcDebounced.has(cardId)) return;
  calcDebounced.set(cardId, debounce(function() {
    const idx = _findCardIdx(cardId);
    if (idx === -1 || idx !== activeMedIdx) return;
    calc(idx);
  }, CALC_DEBOUNCE_MS));
}
function _findCardIdx(cardId) {
  for (let i = 0; i < states.length; i++) {
    if (states[i]._cardId === cardId) return i;
  }
  return -1;
}
const calcLongtermDebounced = debounce(() => calcLongterm(), LONGTERM_DEBOUNCE_MS);

// AKTIVT VAL: ATC-kodsrensning vid manuell inmatning — prefix-matchning mot
// det senast valda autocomplete-läkemedlet. Om användaren redigerar namnet så
// att det inte längre är ett prefix av autocomplete-valet, nollställs alla
// läkemedelsspecifika fält (atcCode, doseUnit, notCalculable, nplId).
// Detta förhindrar att interaktionskontrollen körs mot fel ATC-kod.
function shouldClearDrugMatch(inputVal, acDrugName) {
  if (!inputVal) return true;
  if (!acDrugName) return false;
  var lowerVal = inputVal.toLowerCase();
  var acPrefix = acDrugName.toLowerCase().substring(0, lowerVal.length);
  return lowerVal !== acPrefix;
}

// === TEMA ===
function getBaseTheme() {
  let t;
  try { t = localStorage.getItem('baseTheme'); } catch(e) {}
  return VALID_THEMES.has(t) ? t : 'klinisk';
}
function applyTheme(t, isUserAction) {
  if (isUserAction) {
    try { localStorage.setItem('baseTheme', t); } catch(e) {}
  }
  const baseTheme = getBaseTheme();
  const effectiveTheme = isUserAction ? t : baseTheme;
  const safeTheme = VALID_THEMES.has(effectiveTheme) ? effectiveTheme : 'klinisk';
  document.documentElement.setAttribute('data-theme', safeTheme);
  const sel = getEl('themeSelect');
  if (sel) sel.value = VALID_THEMES.has(baseTheme) ? baseTheme : 'klinisk';
  try { localStorage.setItem('theme', safeTheme); } catch(e) {}
  const ann = getEl('a11y-announce');
  if (ann) {
    ann.textContent = safeTheme === 'dark' ? 'Mörkt tema valt' : safeTheme === 'sakura' ? 'Körsbärstema valt' : 'Kliniskt tema valt';
  }
}

// === FLIK-HANTERING (huvud) ===
function switchMainTab(tab) {
  ['renew','longterm'].forEach(t => {
    const panel = getEl('panel-'+t);
    if (panel) panel.classList.toggle('active', t===tab);
  });
  document.querySelectorAll('.main-tab').forEach(btn => {
    const isActive = btn.dataset.tab === tab;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive);
  });
}

// === INAKTIVITETSTIMER ===
let lastActivityReset = 0;
function resetTimer(isUserEvent=false) {
  const now = Date.now();
  if (isUserEvent && now-lastActivityReset < ACTIVITY_RESET_DEBOUNCE_MS) return;
  lastActivityReset = now;
  clearTimeout(warnTimer); clearTimeout(clearTimer); clearInterval(countdownInt);
  const toast = getEl('toast'), toastCount = getEl('toastCount');
  if (toast) toast.classList.remove('visible');
  const WARN_MS = INACTIVITY_WARN_MS;
  const CLEAR_MS = INACTIVITY_CLEAR_MS;
  const COUNTDOWN_SEC = INACTIVITY_COUNTDOWN_SEC;
  warnTimer = setTimeout(() => {
    let s = COUNTDOWN_SEC;
    if (!toast||!toastCount) return;
    toastCount.textContent = String(s); toast.classList.add('visible');
    countdownInt = setInterval(() => {
      s--; if (toastCount) toastCount.textContent = String(s);
      if (s<=0) clearInterval(countdownInt);
    }, COUNTDOWN_TICK_MS);
  }, WARN_MS);
  clearTimer = setTimeout(() => {
    clearInterval(countdownInt); if (toast) toast.classList.remove('visible');
    confirmClearAll(true);
  }, CLEAR_MS);
}

/* Lägg till / ta bort läkemedel */
let _addMedLocked = false;
let _clearCardLocked = false;
function addMedCard() {
  if (_addMedLocked) return;
  if (states.length >= MAX_MED_CARDS) { showToast('Max 8 läkemedel kan hanteras samtidigt.'); return; }
  _addMedLocked = true;
  setTimeout(() => { _addMedLocked = false; }, ADD_MED_LOCK_MS);

  const cardId = pushMedCard();
  const newIdx = states.length - 1;
  ensureDebounce(cardId);
  setActiveMed(newIdx);
  buildMedList();
  renderFormForMed(activeMedIdx);
  renderResultForMed(activeMedIdx);
}

function clearCurrentCard() {
  if (_clearCardLocked) return;
  _clearCardLocked = true;
  setTimeout(() => { _clearCardLocked = false; }, CLEAR_CARD_LOCK_MS);

  const i = activeMedIdx;

  if (states.length > 1) {
    const cardId = states[i]._cardId;
    calcDebounced.get(cardId)?.cancel();
    calcDebounced.delete(cardId);
    spliceMedCard(i);

    setActiveMed(Math.min(i, states.length - 1));
    resetPrescribePanel();
    resetMetricsCache();
    buildMedList();
    renderFormForMed(activeMedIdx);
    renderResultForMed(activeMedIdx);
    checkAllInteractions();
    generateAndDistribute();
    return;
  }

  // Enda kvarvarande läkemedel — nollställ formuläret
  var cardId = states[i]._cardId;
  calcDebounced.get(cardId)?.cancel();
  calcDebounced.delete(cardId);
  setMedState(i, { activeTab:'patient', patientLang:'sv' });
  initPrescribeState(i, null);
  resetPrescribePanel();
  resetMetricsCache();
  buildMedList();
  renderFormForMed(i);
  renderResultForMed(i);
  ['medInput','doseInput','amtInput','refInput','leftInput'].forEach(id => {
    const inputEl=getEl(id); if (inputEl) inputEl.value='';
    setFieldError(id, '');
  });
  const dateEl = getEl('dateInput'); if (dateEl) dateEl.value=todayStr();
  setFieldError('dateInput', '');
  checkAllInteractions();
  generateAndDistribute();
}

/* Beslut: tidig förnyelse / överförbrukning */
function setEarlyDecision(decision) {
  const i = activeMedIdx;
  const s = states[i];
  if (!s || (!s.isTooEarly && !s.isOveruse)) return;
  const patch = { earlyRenewalDecision: decision };
  if (s.isOveruse) {
    patch.statusText   = decision === 'yes' ? 'OK – förnyas (klinisk bed.)' : 'För tidig förnyelse';
    patch.verdictTitle = decision === 'yes' ? 'OK – Förnya recept' : 'För tidig förnyelse – bedömning krävs';
    patch.verdictSub   = decision === 'yes'
      ? 'Klinisk bedömning: förnyelse trots förhöjd förbrukning.'
      : `Snitt ${s.displayAvgStr} överstiger ordination med >10%.`;
  } else {
    patch.statusText   = decision === 'yes' ? 'OK – förnyas tidigt' : `För tidigt — ${s.daysToPrescribedEnd}d kvar`;
    patch.verdictTitle = decision === 'yes' ? 'OK – Förnya recept' : `För tidigt – ${s.daysToPrescribedEnd} dagar kvar`;
    patch.verdictSub   = decision === 'yes'
      ? `Klinisk bedömning: förnyelse trots ${s.daysToPrescribedEnd} dagar kvar av receptperioden.`
      : 'Förbrukning OK. Kontakta vården närmre slutdatumet.';
  }
  applyMedStatePatch(i, patch);
  updateMedListStatuses();
  generateAndDistribute();
}

/* Ny patient */
let _newPatientModalTrigger = null;
function confirmClearAll(force=false) {
  if (force) { executeClearAll(); return; }
  const m = getEl('newPatientModal');
  if (!m) return;
  _newPatientModalTrigger = document.activeElement;
  m.classList.add('visible');
  const btn = getEl('executeNewPatientBtn');
  if (btn) btn.focus();
}
function closeNewPatientModal() {
  const m = getEl('newPatientModal');
  if (m) m.classList.remove('visible');
  if (_newPatientModalTrigger && typeof _newPatientModalTrigger.focus === 'function') {
    _newPatientModalTrigger.focus();
    _newPatientModalTrigger = null;
  }
}
function executeClearAll() {
  for (const fn of calcDebounced.values()) fn?.cancel();
  calcDebounced.clear();
  calcLongtermDebounced.cancel();
  resetAllMedState();
  resetPrescribePanel();
  resetMetricsCache();
  const pi = getEl('prescribeInner'); if (pi) pi.textContent = '';
  const ps = getEl('prescribeSummary'); if (ps) { ps.textContent = ''; ps.style.display = 'none'; }
  const pd = getEl('prescribeDuration'); if (pd) pd.textContent = '';
  const nt = getEl('nurseViewToggle'); if (nt) { nt.textContent = '🩺 Sjuksköterskevy'; nt.setAttribute('aria-pressed', 'false'); }
  const nv = getEl('nurseVitalCheck'); if (nv) nv.checked = false;
  const nf = getEl('nurseFollowUpCheck'); if (nf) nf.checked = false;
  buildMedList();
  renderFormForMed(0);
  renderResultForMed(0);
  clearLongterm();
  resetProdCounter();
  closeNewPatientModal();
  const medInput = getEl('medInput');
  if (medInput) medInput.focus();
  const ann = getEl('a11y-announce');
  if (ann) ann.textContent = 'All data har rensats. Redo för ny patient.';
}

/* Kopiering */
function copyResultText() {
  copyTextToClipboard('copyBodyResult', 'copyBtnResult', 'result');
}

// === PRODUKTIONSRÄKNARE ===
var _prodCounted = new Set();
var _prodToday = 0;
var _prodTotal = 0;

function initProdCounter() {
  try {
    var today = getToday();
    var savedDate = localStorage.getItem('prodDate');
    var savedTotal = localStorage.getItem('prodTotal');
    var savedToday = localStorage.getItem('prodToday');
    _prodTotal = savedTotal ? Math.max(0, parseInt(savedTotal, 10) || 0) : 0;
    _prodToday = (savedDate === today && savedToday) ? Math.max(0, parseInt(savedToday, 10) || 0) : 0;
  } catch(e) { _prodTotal = 0; _prodToday = 0; }
  updateProdDisplay();
}

function incrementProdCounter(cardId) {
  if (cardId == null || _prodCounted.has(cardId)) return;
  _prodCounted.add(cardId);
  _prodToday++;
  _prodTotal++;
  updateProdDisplay();
  try {
    localStorage.setItem('prodToday', String(_prodToday));
    localStorage.setItem('prodTotal', String(_prodTotal));
    localStorage.setItem('prodDate', getToday());
  } catch(e) {}
}

function updateProdDisplay() {
  var todayEl = getEl('prodToday');
  var totalEl = getEl('prodTotal');
  if (todayEl) todayEl.textContent = String(_prodToday);
  if (totalEl) totalEl.textContent = String(_prodTotal);
}

function resetProdCounter() {
  _prodCounted = new Set();
}

// === INITIERING ===
try { applyTheme(null, false); }
catch(e) { applyTheme('klinisk', false); }
initProdCounter();

buildMedList();
renderFormForMed(0);
renderResultForMed(0);
buildPeriodContainer();

// Förladda läkemedelsdata vid första fokus på medInput — datan är stor (~800 KB)
// och laddas asynkront från IndexedDB eller nätverk för att inte blockera sidan.
var medInputEl = getEl('medInput');
if (medInputEl) {
  medInputEl.addEventListener('focus', function() { loadDrugs(); }, { once: true });
}

// Event delegation: formulärinput
const formPanel = getEl('formPanel');
if (formPanel) {
  formPanel.addEventListener('input', async function(e) {
    if (e.target.id === 'medInput') {
      var v = e.target.value;
      if (v && v[0] !== v[0].toUpperCase()) {
        var pos = e.target.selectionStart;
        e.target.value = v[0].toUpperCase() + v.slice(1);
        e.target.setSelectionRange(pos, pos);
      }
      await handleAcInput();
      var inputVal = e.target.value.trim();
      var s = getState(activeMedIdx);
      if (shouldClearDrugMatch(inputVal, s._acDrugName)) {
        applyMedStatePatch(activeMedIdx, { atcCode: null, _acDrugName: null, doseUnit: null, notCalculable: null, nplId: null });
        checkAllInteractions();
      }
    }
    if (e.target.id === 'dateInput') {
      autoFormatDate(e.target);
      const val = e.target.value;
      if (val.length === 10) {
        const res = validateDateField(val);
        setFieldError('dateInput', res.error);
      } else {
        setFieldError('dateInput', '');
      }
    }
    saveFormValues(activeMedIdx);
    const cardId = states[activeMedIdx]._cardId;
    ensureDebounce(cardId); calcDebounced.get(cardId)();
  });
  formPanel.addEventListener('blur', e => {
    // Sanera dygnsdos vid fältutträde: byt komma mot punkt så att värdet
    // matchar det som beräkningarna faktiskt använder.
    if (e.target.id === 'doseInput') {
      const sanitized = e.target.value.replace(',', '.');
      if (sanitized !== e.target.value) {
        e.target.value = sanitized;
        saveFormValues(activeMedIdx);
      }
    }
    if (e.target.id === 'dateInput') {
      const res = validateDateField(e.target.value);
      setFieldError('dateInput', res.error);
    }
  }, true); // capture=true eftersom blur inte bubblar
  document.addEventListener('click', function(e) {
    const medInput = getEl('medInput');
    const dropdown = getEl('autocompleteDropdown');
    if (medInput && !medInput.contains(e.target) && dropdown && !dropdown.contains(e.target)) {
      hideAutocomplete();
    }
  });
  formPanel.addEventListener('keydown', e => {
    if (e.target.id !== 'medInput') return;
    if (e.key === 'ArrowDown') { e.preventDefault(); navigateAutocomplete(1); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); navigateAutocomplete(-1); return; }
    if (e.key === 'Escape')    { hideAutocomplete(); return; }
    if (e.key === 'Enter' && _acState && _acState.visible && _acState.selectedIdx >= 0) {
      e.preventDefault();
      selectAutocompleteItem(_acState.selectedIdx);
    }
  });
  formPanel.addEventListener('change', e => {
    if (e.target.id==='dateInput') calc();
  });
}

// Sidebar: knappar
const clearCardBtn = getEl('clearCardBtn'); if (clearCardBtn) clearCardBtn.addEventListener('click', clearCurrentCard);
const addMedBtn = getEl('addMedBtn'); if (addMedBtn) addMedBtn.addEventListener('click', addMedCard);

// Topbar
const themeSelect = getEl('themeSelect'); if (themeSelect) themeSelect.addEventListener('change', e => applyTheme(e.target.value, true));
const newPatientBtn = getEl('newPatientBtn'); if (newPatientBtn) newPatientBtn.addEventListener('click', () => confirmClearAll());
document.querySelectorAll('.main-tab').forEach(btn => btn.addEventListener('click', () => switchMainTab(btn.dataset.tab)));

// Sjuksköterskevy-toggle
const nurseToggle = getEl('nurseViewToggle');
function _toggleNurseView() {
  setNurseView(!nurseViewActive);
  if (nurseToggle) {
    nurseToggle.textContent = nurseViewActive ? '👨‍⚕️ Läkarvy' : '🩺 Sjuksköterskevy';
    nurseToggle.setAttribute('aria-pressed', String(nurseViewActive));
  }
  // När sjuksköterskevy stängs av: återställ alla korts aktiva flik till 'patient'.
  // switchResultTab skriver 'journal' i activeTab på varje kort som besöks under
  // nurse-läget — utan nollställning av samtliga kort kvarstår journalfliken när
  // läkaren byter till ett kort som besöktes i nurse-läget.
  if (!nurseViewActive) {
    for (let _i = 0; _i < states.length; _i++) setMedUIPreference(_i, 'activeTab', 'patient');
  }
  generateAndDistribute();
}
if (nurseToggle) nurseToggle.addEventListener('click', _toggleNurseView);

// Sjuksköterskebedömning-checkboxes
const nurseVitalEl = getEl('nurseVitalCheck');
if (nurseVitalEl) nurseVitalEl.addEventListener('change', () => {
  setNurseVitalNormal(nurseVitalEl.checked);
  generateAndDistribute();
});
const nurseFollowUpEl = getEl('nurseFollowUpCheck');
if (nurseFollowUpEl) nurseFollowUpEl.addEventListener('change', () => {
  setNurseFollowUpAdequate(nurseFollowUpEl.checked);
  generateAndDistribute();
});

// Resultat-knappar
const copyBtnResult = getEl('copyBtnResult'); if (copyBtnResult) copyBtnResult.addEventListener('click', copyResultText);
const langBtnResult = getEl('langBtnResult'); if (langBtnResult) langBtnResult.addEventListener('click', togglePatientLangResult);
document.querySelectorAll('#copySection .copy-tab').forEach(btn => btn.addEventListener('click', () => switchResultTab(btn.dataset.tab)));

// Långvarig förbrukning
const periodsContainer = getEl('lt-periods-container');
if (periodsContainer) {
  periodsContainer.addEventListener('input', e => {
    if (e.target.matches('input[type="text"]')) autoFormatDate(e.target);
    // Håll ltPeriods[] synkat med DOM — det är källan för sanning, inte DOM:en
    const m = e.target.id && e.target.id.match(/^lt-(start|total|end)-(\d+)$/);
    if (m) setLtPeriodField(+m[2], m[1], e.target.value);
    calcLongtermDebounced();
  });
  periodsContainer.addEventListener('change', e => { if (e.target.matches('input[type="text"]')) calcLongterm(); });
  periodsContainer.addEventListener('click', e => { const btn=e.target.closest('[data-action="remove-period"]'); if(btn){const idx=parseInt(btn.dataset.idx,10);if(!isNaN(idx))removePeriod(idx);} });
}
const ltMedEl=getEl('lt-med'); if(ltMedEl) ltMedEl.addEventListener('input',e=>{if(e.target.value&&e.target.value[0]!==e.target.value[0].toUpperCase()){const p=e.target.selectionStart;e.target.value=e.target.value[0].toUpperCase()+e.target.value.slice(1);e.target.setSelectionRange(p,p);}calcLongtermDebounced();});
const ltDoseEl=getEl('lt-dose'); if(ltDoseEl) ltDoseEl.addEventListener('input',calcLongtermDebounced);
const addPeriodBtn=getEl('addPeriodBtn'); if(addPeriodBtn) addPeriodBtn.addEventListener('click',addPeriod);
const clearLongtermBtn=getEl('clearLongtermBtn'); if(clearLongtermBtn) clearLongtermBtn.addEventListener('click',clearLongterm);
const ltCopyBtn=getEl('ltCopyBtn'); if(ltCopyBtn) ltCopyBtn.addEventListener('click',copyLtText);

// Beslutsknappar: tidig förnyelse
const earlyYesBtn = getEl('earlyDecisionYes'); if (earlyYesBtn) earlyYesBtn.addEventListener('click', () => setEarlyDecision('yes'));
const earlyNoBtn  = getEl('earlyDecisionNo');  if (earlyNoBtn)  earlyNoBtn.addEventListener('click',  () => setEarlyDecision('no'));

// Modal: knappar, ESC-tangent och focustrap
const closeNewPatientModalBtn=getEl('closeNewPatientModalBtn'); if(closeNewPatientModalBtn) closeNewPatientModalBtn.addEventListener('click',closeNewPatientModal);
const executeNewPatientBtn=getEl('executeNewPatientBtn'); if(executeNewPatientBtn) executeNewPatientBtn.addEventListener('click',executeClearAll);
document.addEventListener('keydown', e => {
  const m = getEl('newPatientModal');
  if (!m || !m.classList.contains('visible')) return;
  if (e.key === 'Escape') { e.preventDefault(); closeNewPatientModal(); return; }
  if (e.key === 'Tab') {
    const focusable = [getEl('executeNewPatientBtn'), getEl('closeNewPatientModalBtn')].filter(Boolean);
    if (focusable.length < 2) return;
    if (e.shiftKey && document.activeElement === focusable[0]) {
      e.preventDefault(); focusable[focusable.length - 1].focus();
    } else if (!e.shiftKey && document.activeElement === focusable[focusable.length - 1]) {
      e.preventDefault(); focusable[0].focus();
    }
  }
});

// Inaktivitetstimer
const continueSessionBtn=getEl('continueSessionBtn'); if(continueSessionBtn) continueSessionBtn.addEventListener('click',resetTimer);
['click','keydown','touchstart'].forEach(e => document.addEventListener(e,()=>resetTimer(true),{passive:true}));

// Datum-cache och omräkning vid fönsterfokus
function recalcOnDateChange() {
  _todayCache=null; _todayCacheKey='';
  calc(activeMedIdx, true);
  for (let i = 0; i < states.length; i++) {
    if (i === activeMedIdx) continue;
    const s = states[i];
    // Hoppa inte över calculable===false — daysSince===0-kort ska kunna räknas om
    // vid datumomslag. Övriga fall är inte datumkänsliga men kostnaden är försumbar.
    if (!s || !s.valid) continue;
    let inputData;
    if (s.calculable === true) {
      // Återanvänd redan validerade värden — endast dagens datum har ändrats.
      // calcCore läser getToday() internt, inte via inputData.
      const pDate = parseDateUTC(s.dateVal);
      if (!pDate || !s.medRaw) continue;
      inputData = {
        valid: true, fieldErrors: {},
        medRaw: s.medRaw, dateVal: s.dateVal,
        pDate,
        amt: s.amt, dose: s.dose,
        ref: s.refRaw ? parseInt(s.refRaw, 10) : (s.total && s.amt ? Math.round(s.total / s.amt) : 1),
        remaining: s.remainingDoses,
        doseRaw: s.doseRaw, amtRaw: s.amtRaw,
        refRaw: s.refRaw, leftRaw: s.leftRaw || '',
        doseInterval: s.doseInterval || 1,
        doseUnit:     s.doseUnit     || 'st',
        notCalculable: s.notCalculable || false,
      };
    } else {
      inputData = validateValues(
        s.medRaw || '', s.dateVal || '', s.doseRaw || '',
        s.amtRaw || '', s.refRaw || '', s.leftRaw || '',
        String(s.doseInterval || 1),
        s.doseUnit || 'st',
        s.notCalculable || false
      );
    }
    if (!inputData.valid) continue;
    const prev = {
      isOveruse: s.isOveruse || false,
      isTooEarly: s.isTooEarly || false,
      earlyRenewalDecision: s.earlyRenewalDecision || null,
    };
    try {
      applyMedStatePatch(i, calcCore(inputData, prev));
    } catch (err) {
      console.error('[calcCore] oväntat fel:', err.message || err);
    }
  }
  generateAndDistribute();
  const doseEl = getEl('lt-dose');
  if (doseEl && doseEl.value) calcLongterm();
}
const _recalcOnDate = debounce(recalcOnDateChange, RECALC_ON_DATE_DEBOUNCE_MS);
document.addEventListener('visibilitychange',()=>{ if(!document.hidden) { _recalcOnDate(); applyTheme(null, false); } });
window.addEventListener('focus',_recalcOnDate);

// Rensa vid pagehide (bfcache-säkerhet)
window.addEventListener('pagehide',()=>{
  for (const fn of calcDebounced.values()) fn?.cancel();
  _recalcOnDate.cancel();
  calcLongtermDebounced.cancel();
  const ltPeriodCount = ltPeriods.length;
  clearAllMedStateData();
  resetPrescribePanel();
  resetMetricsCache();
  ['medInput','doseInput','amtInput','refInput','leftInput'].forEach(id=>{ const e=getEl(id);if(e)e.value=''; });
  const d=getEl('dateInput');if(d)d.value=todayStr();
  const b=getEl('copyBodyResult');if(b)b.textContent='';
  const lm=getEl('lt-med');if(lm)lm.value='';
  const ld=getEl('lt-dose');if(ld)ld.value='';
  const lc=getEl('lt-copyBody');if(lc)lc.textContent='';
  ['lt-result','lt-copySection','lt-bar-section','lt-period-table-section'].forEach(id=>{
    const e=getEl(id);if(e)e.style.display='none';
  });
  const pi=getEl('prescribeInner');if(pi)pi.textContent='';
  const ps=getEl('prescribeSummary');if(ps){ps.textContent='';ps.style.display='none';}
  const pd=getEl('prescribeDuration');if(pd)pd.textContent='';
  const nt=getEl('nurseViewToggle');if(nt){nt.textContent='🩺 Sjuksköterskevy';nt.setAttribute('aria-pressed','false');}
  const nv=getEl('nurseVitalCheck');if(nv)nv.checked=false;
  const nf=getEl('nurseFollowUpCheck');if(nf)nf.checked=false;
  for (let i = 0; i < ltPeriodCount; i++) {
    const se = getEl('lt-start-' + i); if (se) se.value = '';
    const te = getEl('lt-total-' + i); if (te) te.value = '';
    const ee = getEl('lt-end-'   + i); if (ee) ee.value = '';
  }
});
window.addEventListener('pageshow',e=>{
  if(!e.persisted)return;
  applyTheme(null, false);
  _recalcOnDate.cancel();
  calcDebounced.clear();
  _todayCache=null;
  _addMedLocked=false;
  _clearCardLocked=false;
  resetDomCache();
  resetTimer();
  buildMedList();
  renderFormForMed(activeMedIdx);
  renderResultForMed(activeMedIdx);
  buildPeriodContainer();
});

resetTimer();

(function() {
  const bubble = document.getElementById('tooltipBubble');
  if (!bubble) return;
  const position = e => {
    bubble.style.left = (e.clientX + TOOLTIP_OFFSET_X) + 'px';
    bubble.style.top  = (e.clientY - TOOLTIP_OFFSET_Y) + 'px';
  };
  document.addEventListener('mouseover', e => {
    const tooltipTarget = e.target.closest('[data-tooltip]');
    if (!tooltipTarget) return;
    bubble.textContent = tooltipTarget.dataset.tooltip;
    bubble.classList.add('visible');
    position(e);
  });
  document.addEventListener('mousemove', e => {
    if (bubble.classList.contains('visible')) position(e);
  });
  document.addEventListener('mouseout', e => {
    if (!e.relatedTarget || !e.relatedTarget.closest('[data-tooltip]'))
      bubble.classList.remove('visible');
  });
  document.addEventListener('click', () => bubble.classList.remove('visible'));
  document.addEventListener('scroll', () => {
    if (bubble.classList.contains('visible')) bubble.classList.remove('visible');
  }, true);
  document.addEventListener('focusin', e => {
    const tooltipTarget = e.target.closest('[data-tooltip]');
    if (!tooltipTarget) { bubble.classList.remove('visible'); return; }
    const rect = tooltipTarget.getBoundingClientRect();
    bubble.textContent = tooltipTarget.dataset.tooltip;
    bubble.classList.add('visible');
    position({ clientX: rect.left + rect.width / 2, clientY: rect.top });
  });
  document.addEventListener('focusout', e => {
    if (!e.relatedTarget || !e.relatedTarget.closest('[data-tooltip]'))
      bubble.classList.remove('visible');
  });
}());