/*
   STORAGE POLICY (GDPR)
   localStorage: endast 'theme'
   Klinisk data: endast i minnet (states[])
 */

/* State */
let states        = [{}];   // ett objekt per läkemedel
let medCardCount  = 1;
let activeMedIdx  = 0;      // vilket läkemedel som visas i mitten/höger
let warnTimer, clearTimer, countdownInt;
let ltPeriods = [{ start: oneYearAgoStr(), total: '', end: todayStr() }];
let prescribeState = {}; // per-läkemedelsindex: { mode, months, endDate, packageSize }

/* Debounce-instanser per läkemedelsindex */
const calcDebounced = [];
function ensureDebounce(i) {
  if (calcDebounced[i]) return;
  while (calcDebounced.length <= i) {
    const idx = calcDebounced.length;
    calcDebounced.push(debounce(() => calc(idx), 120));
  }
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
  warnTimer = setTimeout(() => {
    let s = 60;
    if (!toast||!toastCount) return;
    toastCount.textContent = String(s); toast.classList.add('visible');
    countdownInt = setInterval(() => {
      s--; if (toastCount) toastCount.textContent = String(s);
      if (s<=0) clearInterval(countdownInt);
    }, 1000);
  }, 4*60*1000);
  clearTimer = setTimeout(() => {
    clearInterval(countdownInt); if (toast) toast.classList.remove('visible');
    confirmClearAll(true);
  }, 5*60*1000);
}

/* Lägg till / ta bort läkemedel */
function addMedCard() {
  if (medCardCount >= 8) { showToast('Max 8 läkemedel kan hanteras samtidigt.'); return; }
  states.push({});
  medCardCount++;
  ensureDebounce(medCardCount-1);
  activeMedIdx = medCardCount-1;
  buildMedList();
  renderFormForMed(activeMedIdx);
  renderResultForMed(activeMedIdx);
}

function clearCurrentCard() {
  const i = activeMedIdx;

  if (medCardCount > 1) {
    // Ta bort kortet helt — kompaktera states och prescribeState
    states.splice(i, 1);

    const newPS = {};
    for (let j = 0; j < medCardCount - 1; j++) {
      newPS[j] = prescribeState[j >= i ? j + 1 : j] ?? null;
    }
    prescribeState = newPS;

    // calcDebounced-closures innehåller fasta idx-värden — bygg om från grunden
    calcDebounced.length = 0;
    medCardCount--;
    for (let j = 0; j < medCardCount; j++) ensureDebounce(j);

    activeMedIdx = Math.min(i, medCardCount - 1);
    _prescribePanelBuiltFor = null;
    buildMedList();
    renderFormForMed(activeMedIdx);
    renderResultForMed(activeMedIdx);
    generateAndDistribute();
    return;
  }

  // Enda kvarvarande läkemedel — nollställ formuläret
  states[i] = { activeTab:'patient', patientLang:'sv' };
  prescribeState[i] = null;
  _prescribePanelBuiltFor = null;
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
  s.earlyRenewalDecision = decision;
  if (s.isOveruse) {
    s.statusText   = decision === 'yes' ? 'OK – förnyas (klinisk bed.)' : 'För tidig förnyelse';
    s.verdictTitle = decision === 'yes' ? 'OK – Förnya recept' : 'För tidig förnyelse – bedömning krävs';
    s.verdictSub   = decision === 'yes'
      ? 'Klinisk bedömning: förnyelse trots förhöjd förbrukning.'
      : `Snitt ${s.displayAvgStr} överstiger ordination med >10%.`;
  } else {
    s.statusText   = decision === 'yes' ? 'OK – förnyas tidigt' : `För tidigt — ${s.daysToPrescribedEnd}d kvar`;
    s.verdictTitle = decision === 'yes' ? 'OK – Förnya recept' : `För tidigt – ${s.daysToPrescribedEnd} dagar kvar`;
    s.verdictSub   = decision === 'yes'
      ? `Klinisk bedömning: förnyelse trots ${s.daysToPrescribedEnd} dagar kvar av receptperioden.`
      : 'Förbrukning OK. Kontakta vården närmre slutdatumet.';
  }
  buildMedList();
  generateAndDistribute();
}

/* Rensa allt */
function confirmClearAll(force=false) {
  if (force) executeClearAll();
  else { const m=getEl('clearModal'); if (m) m.classList.add('visible'); }
}
function closeClearModal() { const m=getEl('clearModal'); if (m) m.classList.remove('visible'); }
function executeClearAll() {
  states = [{}]; medCardCount=1; activeMedIdx=0;
  prescribeState = {};
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
    if (e.target.id==='dateInput') autoFormatDate(e.target);
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
    if (m && ltPeriods[+m[2]]) ltPeriods[+m[2]][m[1]] = e.target.value;
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

// Modal
const closeClearModalBtn=getEl('closeClearModalBtn'); if(closeClearModalBtn) closeClearModalBtn.addEventListener('click',closeClearModal);
const executeClearAllBtn=getEl('executeClearAllBtn'); if(executeClearAllBtn) executeClearAllBtn.addEventListener('click',executeClearAll);

// Inaktivitetstimer
const continueSessionBtn=getEl('continueSessionBtn'); if(continueSessionBtn) continueSessionBtn.addEventListener('click',resetTimer);
['click','keydown','touchstart'].forEach(e => document.addEventListener(e,()=>resetTimer(true),{passive:true}));

// Datum-cache och omräkning vid fönsterfokus
function recalcOnDateChange() {
  _todayCache=null; _todayCacheKey='';
  if (states[activeMedIdx]&&states[activeMedIdx].valid) calc();
  if (ltPeriods.length > 0) calcLongterm();
}
document.addEventListener('visibilitychange',()=>{ if(!document.hidden) recalcOnDateChange(); });
window.addEventListener('focus',recalcOnDateChange);

// Rensa vid pagehide (bfcache-säkerhet)
window.addEventListener('pagehide',()=>{
  states=states.map(()=>({}));
  ['medInput','doseInput','amtInput','refInput','leftInput'].forEach(id=>{ const e=getEl(id);if(e)e.value=''; });
  const d=getEl('dateInput');if(d)d.value=todayStr();
  const b=getEl('copyBodyResult');if(b)b.textContent='';
  const lm=getEl('lt-med');if(lm)lm.value='';
  const ld=getEl('lt-dose');if(ld)ld.value='';
  const lc=getEl('lt-copyBody');if(lc)lc.textContent='';
  for (let i = 0; i < ltPeriods.length; i++) {
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
  const bubble = document.createElement('div');
  bubble.className = 'tooltip-bubble';
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
    const el = e.target.closest('[data-tooltip]');
    if (!el) return;
    bubble.textContent = el.dataset.tooltip;
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
