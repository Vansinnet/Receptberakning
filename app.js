/*
   STORAGE POLICY (GDPR)
   localStorage: endast 'theme'
   Klinisk data: endast i minnet (states[])
 */

/* State — deklareras och ägs av state.js */
let warnTimer, clearTimer, countdownInt;

/* Debounce-instanser per läkemedelsindex */
const calcDebounced = [];
function ensureDebounce(i) {
  if (calcDebounced[i]) return;
  // Fyll luckor med null för att göra index i adresserbart utan att allokera
  // debounce-instanser för kort som inte existerar än.
  while (calcDebounced.length < i) calcDebounced.push(null);
  calcDebounced[i] = debounce(() => calc(i), 120);
}
const calcLongtermDebounced = debounce(() => calcLongterm(), 150);

// === TEMA ===
function applyTheme(t) {
  const safeTheme = VALID_THEMES.has(t) ? t : 'klinisk';
  document.documentElement.setAttribute('data-theme', safeTheme);
  const sel = getEl('themeSelect'); if (sel) sel.value = safeTheme;
  try { localStorage.setItem('theme', safeTheme); } catch(e) {}
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
  if (isUserEvent && now-lastActivityReset < 2000) return;
  lastActivityReset = now;
  clearTimeout(warnTimer); clearTimeout(clearTimer); clearInterval(countdownInt);
  const toast = getEl('toast'), toastCount = getEl('toastCount');
  if (toast) toast.classList.remove('visible');
  // AKTIVT VAL: 15 minuters inaktivitet innan sidan rensas (varning vid 14 min).
  // Läkare avbryts ofta mitt i arbetet av kollegor, telefonsamtal eller akuta situationer —
  // en kortare timer orsakar frustration och tvingar omstart av pågående bedömning.
  warnTimer = setTimeout(() => {
    let s = 60;
    if (!toast||!toastCount) return;
    toastCount.textContent = String(s); toast.classList.add('visible');
    countdownInt = setInterval(() => {
      s--; if (toastCount) toastCount.textContent = String(s);
      if (s<=0) clearInterval(countdownInt);
    }, 1000);
  }, 14*60*1000);
  clearTimer = setTimeout(() => {
    clearInterval(countdownInt); if (toast) toast.classList.remove('visible');
    confirmClearAll(true);
  }, 15*60*1000);
}

/* Lägg till / ta bort läkemedel */
function addMedCard() {
  if (states.length >= 8) { showToast('Max 8 läkemedel kan hanteras samtidigt.'); return; }
  const newIdx = pushMedCard();
  ensureDebounce(newIdx);
  setActiveMed(newIdx);
  buildMedList();
  renderFormForMed(activeMedIdx);
  renderResultForMed(activeMedIdx);
}

function clearCurrentCard() {
  const i = activeMedIdx;

  if (states.length > 1) {
    // Ta bort kortet helt — kompaktera states och prescribeState
    spliceMedCard(i);

    // calcDebounced-closures innehåller fasta idx-värden — avbryt väntande timers och bygg om från grunden
    calcDebounced.forEach(d => d && d.cancel());
    calcDebounced.length = 0;
    for (let j = 0; j < states.length; j++) ensureDebounce(j);

    setActiveMed(Math.min(i, states.length - 1));
    resetPrescribePanel();
    buildMedList();
    renderFormForMed(activeMedIdx);
    renderResultForMed(activeMedIdx);
    generateAndDistribute();
    return;
  }

  // Enda kvarvarande läkemedel — nollställ formuläret
  setMedState(i, { activeTab:'patient', patientLang:'sv' });
  initPrescribeState(i, null);
  resetPrescribePanel();
  buildMedList();
  renderFormForMed(i);
  renderResultForMed(i);
  ['medInput','doseInput','amtInput','refInput','leftInput'].forEach(id => {
    const el=getEl(id); if (el) el.value='';
    setFieldError(id, '');
  });
  const dateEl = getEl('dateInput'); if (dateEl) dateEl.value=todayStr();
  setFieldError('dateInput', '');
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
  buildMedList();
  generateAndDistribute();
}

/* Rensa allt */
let _clearModalTrigger = null;
function confirmClearAll(force=false) {
  if (force) { executeClearAll(); return; }
  const m = getEl('clearModal');
  if (!m) return;
  _clearModalTrigger = document.activeElement;
  m.classList.add('visible');
  const btn = getEl('executeClearAllBtn');
  if (btn) btn.focus();
}
function closeClearModal() {
  const m = getEl('clearModal');
  if (m) m.classList.remove('visible');
  if (_clearModalTrigger && typeof _clearModalTrigger.focus === 'function') {
    _clearModalTrigger.focus();
    _clearModalTrigger = null;
  }
}
function executeClearAll() {
  resetAllMedState();
  buildMedList();
  renderFormForMed(0);
  renderResultForMed(0); // anropar renderPrescribePanel(0) internt
  clearLongterm();
  closeClearModal();
}

/* Kopiering */
const copyFeedbackTimers = {};
function copyResultText() {
  const body = getEl('copyBodyResult');
  const text = body ? body.textContent : '';
  const btn = getEl('copyBtnResult');
  navigator.clipboard.writeText(text).then(()=>{
    if (!btn) return;
    const orig = btn.dataset.origLabel||btn.textContent; btn.dataset.origLabel=orig; btn.textContent='✅ Kopierat!';
    clearTimeout(copyFeedbackTimers['result']);
    copyFeedbackTimers['result'] = setTimeout(()=>{ btn.textContent=orig; delete btn.dataset.origLabel; },1800);
  }).catch(()=>{ if(btn) btn.textContent='⚠️ Kopiera manuellt'; });
}

// === INITIERING ===
try { applyTheme(localStorage.getItem('theme')||'klinisk'); }
catch(e) { applyTheme('klinisk'); }

buildMedList();
renderFormForMed(0);
renderResultForMed(0);
buildPeriodContainer();

// Event delegation: formulärinput
const formPanel = getEl('formPanel');
if (formPanel) {
  formPanel.addEventListener('input', e => {
    if (e.target.id === 'medInput') {
      const v = e.target.value;
      if (v && v[0] !== v[0].toUpperCase()) {
        const pos = e.target.selectionStart;
        e.target.value = v[0].toUpperCase() + v.slice(1);
        e.target.setSelectionRange(pos, pos);
      }
    }
    if (e.target.id === 'dateInput') {
      autoFormatDate(e.target);
      // Validera direkt när datumet är fullständigt (ÅÅÅÅ-MM-DD = 10 tecken).
      // Under pågående inmatning (< 10 tecken) rensas eventuellt fel så att
      // läkaren inte störs av felmarkeringar mitt i skrivandet.
      const val = e.target.value;
      if (val.length === 10) {
        const pDate = parseDateUTC(val);
        if (!pDate)          setFieldError('dateInput', 'Ogiltigt datum.');
        else if (pDate > getToday()) setFieldError('dateInput', 'Datumet är satt i framtiden.');
        else                 setFieldError('dateInput', '');
      } else {
        setFieldError('dateInput', '');
      }
    }
    saveFormValues(activeMedIdx);
    ensureDebounce(activeMedIdx); calcDebounced[activeMedIdx]();
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
    // Datumfältet valideras direkt vid blur — datumet är det enda fältet där ett
    // felaktigt värde (t.ex. "260229") ser korrekt ut visuellt men inte ger något
    // fel förrän hela calc()-cykeln kört klart.
    if (e.target.id === 'dateInput') {
      const val = e.target.value;
      if (!val) { setFieldError('dateInput', ''); return; }
      const pDate = parseDateUTC(val);
      if (!pDate) {
        setFieldError('dateInput', 'Ogiltigt datum.');
      } else if (pDate > getToday()) {
        setFieldError('dateInput', 'Datumet är satt i framtiden.');
      } else {
        setFieldError('dateInput', '');
      }
    }
  }, true); // capture=true eftersom blur inte bubblar
  formPanel.addEventListener('change', e => {
    if (e.target.id==='dateInput') calc();
  });
}

// Sidebar: knappar
const clearCardBtn = getEl('clearCardBtn'); if (clearCardBtn) clearCardBtn.addEventListener('click', clearCurrentCard);
const addMedBtn = getEl('addMedBtn'); if (addMedBtn) addMedBtn.addEventListener('click', addMedCard);

// Topbar
const themeSelect = getEl('themeSelect'); if (themeSelect) themeSelect.addEventListener('change', e => applyTheme(e.target.value));
const clearAllBtn = getEl('clearAllBtn'); if (clearAllBtn) clearAllBtn.addEventListener('click', () => confirmClearAll());
document.querySelectorAll('.main-tab').forEach(btn => btn.addEventListener('click', () => switchMainTab(btn.dataset.tab)));

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
const ltMedEl=getEl('lt-med'); if(ltMedEl) ltMedEl.addEventListener('input',calcLongtermDebounced);
const ltDoseEl=getEl('lt-dose'); if(ltDoseEl) ltDoseEl.addEventListener('input',calcLongtermDebounced);
const addPeriodBtn=getEl('addPeriodBtn'); if(addPeriodBtn) addPeriodBtn.addEventListener('click',addPeriod);
const clearLongtermBtn=getEl('clearLongtermBtn'); if(clearLongtermBtn) clearLongtermBtn.addEventListener('click',clearLongterm);
const ltCopyBtn=getEl('ltCopyBtn'); if(ltCopyBtn) ltCopyBtn.addEventListener('click',copyLtText);

// Beslutsknappar: tidig förnyelse
const earlyYesBtn = getEl('earlyDecisionYes'); if (earlyYesBtn) earlyYesBtn.addEventListener('click', () => setEarlyDecision('yes'));
const earlyNoBtn  = getEl('earlyDecisionNo');  if (earlyNoBtn)  earlyNoBtn.addEventListener('click',  () => setEarlyDecision('no'));

// Modal: knappar, ESC-tangent och focustrap
const closeClearModalBtn=getEl('closeClearModalBtn'); if(closeClearModalBtn) closeClearModalBtn.addEventListener('click',closeClearModal);
const executeClearAllBtn=getEl('executeClearAllBtn'); if(executeClearAllBtn) executeClearAllBtn.addEventListener('click',executeClearAll);
document.addEventListener('keydown', e => {
  const m = getEl('clearModal');
  if (!m || !m.classList.contains('visible')) return;
  if (e.key === 'Escape') { e.preventDefault(); closeClearModal(); return; }
  if (e.key === 'Tab') {
    const focusable = [getEl('executeClearAllBtn'), getEl('closeClearModalBtn')].filter(Boolean);
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
  if (states[activeMedIdx]&&states[activeMedIdx].valid) calc();
  // Kör bara om läkaren har börjat fylla i långtidsfliken — annars rensas ett
  // tomt formulär i onödan vid varje fönsterreaktivering.
  const ltDoseEl = getEl('lt-dose');
  if (ltDoseEl && ltDoseEl.value) calcLongterm();
}
document.addEventListener('visibilitychange',()=>{ if(!document.hidden) recalcOnDateChange(); });
window.addEventListener('focus',recalcOnDateChange);

// Rensa vid pagehide (bfcache-säkerhet)
window.addEventListener('pagehide',()=>{
  const ltPeriodCount = ltPeriods.length;
  clearAllMedStateData();
  ['medInput','doseInput','amtInput','refInput','leftInput'].forEach(id=>{ const e=getEl(id);if(e)e.value=''; });
  const d=getEl('dateInput');if(d)d.value=todayStr();
  const b=getEl('copyBodyResult');if(b)b.textContent='';
  const lm=getEl('lt-med');if(lm)lm.value='';
  const ld=getEl('lt-dose');if(ld)ld.value='';
  const lc=getEl('lt-copyBody');if(lc)lc.textContent='';
  for (let i = 0; i < ltPeriodCount; i++) {
    const se = getEl('lt-start-' + i); if (se) se.value = '';
    const te = getEl('lt-total-' + i); if (te) te.value = '';
    const ee = getEl('lt-end-'   + i); if (ee) ee.value = '';
  }
});
window.addEventListener('pageshow',e=>{ if(!e.persisted)return; _todayCache=null; resetTimer(); });

resetTimer();

/*
   TOOLTIP-SYSTEM
   Fixed-positionerat så att det aldrig klipps
   av overflow:auto på form- eller result-panel.
 */
(function () {
  const bubble = el('div', { cls: 'tooltip-bubble' });
  document.body.appendChild(bubble);

  function position(e) {
    const margin = 10, bw = bubble.offsetWidth, bh = bubble.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    let x = e.clientX - bw / 2;
    let y = e.clientY - bh - 14;
    if (y < margin) y = e.clientY + 20;
    x = Math.max(margin, Math.min(x, vw - bw - margin));
    bubble.style.left = x + 'px';
    bubble.style.top  = y + 'px';
  }

  document.addEventListener('mouseover', e => {
    const tooltipTarget = e.target.closest('[data-tooltip]');
    if (!tooltipTarget) return;
    bubble.textContent = tooltipTarget.dataset.tooltip;
    bubble.classList.add('visible');
  });
  document.addEventListener('mousemove', e => {
    if (bubble.classList.contains('visible')) position(e);
  });
  document.addEventListener('mouseout', e => {
    if (!e.relatedTarget || !e.relatedTarget.closest('[data-tooltip]'))
      bubble.classList.remove('visible');
  });
  document.addEventListener('click', () => bubble.classList.remove('visible'));
  document.addEventListener('scroll', () => bubble.classList.remove('visible'), true);
}());