/*
   STORAGE POLICY (GDPR)
   localStorage: endast 'theme'
   Klinisk data: endast i minnet (states[])
 */

const VALID_THEMES     = new Set(['dark','klinisk','sakura']);
const SAFE_ALERT_TYPES = new Set(['danger','warn','info','ok']);

function escapeHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/* State */
let states        = [{}];   // ett objekt per läkemedel
let medCardCount  = 1;
let activeMedIdx  = 0;      // vilket läkemedel som visas i mitten/höger
let warnTimer, clearTimer, countdownInt;
let ltPeriodCount = 0;
let prescribeState = {}; // per-läkemedelsindex: { mode, months, endDate, packageSize }

/* Debounce */
function debounce(fn, wait = 120) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}
const calcDebounced = [];
function ensureDebounce(i) {
  if (calcDebounced[i]) return;
  while (calcDebounced.length <= i) {
    const idx = calcDebounced.length;
    calcDebounced.push(debounce(() => calc(idx), 120));
  }
}
const calcLongtermDebounced = debounce(() => calcLongterm(), 150);

/* Datumformatering */
function autoFormatDate(input) {
  const val = input.value;
  const sel = input.selectionStart;
  let raw = val.replace(/\D/g,'').substring(0,8);
  let formatted = raw;
  if (raw.length > 4) formatted = raw.substring(0,4) + '-' + raw.substring(4);
  if (raw.length > 6) formatted = raw.substring(0,4) + '-' + raw.substring(4,6) + '-' + raw.substring(6);
  if (formatted === val) return;
  input.value = formatted;
  const digitsBeforeCursor = val.substring(0,sel).replace(/\D/g,'').length;
  let newPos = 0;
  if (digitsBeforeCursor > 0) {
    let count = 0;
    for (let i = 0; i < formatted.length; i++) {
      if (/\d/.test(formatted[i])) count++;
      if (count === digitsBeforeCursor) { newPos = i + 1; break; }
    }
    if (count < digitsBeforeCursor) newPos = formatted.length;
  }
  try { input.setSelectionRange(newPos, newPos); } catch(e) {}
}

/* Hjälpfunktioner */
function getEl(id) { return document.getElementById(id); }
function toggleError(el, isInvalid) {
  if (!el) return;
  el.classList.toggle('input-error', isInvalid);
  isInvalid ? el.setAttribute('aria-invalid','true') : el.removeAttribute('aria-invalid');
}
function buildAlertEl(type, title, message) {
  const safeType = SAFE_ALERT_TYPES.has(type) ? type : 'info';
  const div = document.createElement('div'); div.className = `alert alert-${safeType}`;
  if (title) { const strong = document.createElement('strong'); strong.textContent = title; div.appendChild(strong); div.appendChild(document.createTextNode(' ')); }
  div.appendChild(document.createTextNode(message));
  return div;
}
function renderAlert(containerId, type, title, message) {
  const container = getEl(containerId); if (!container) return;
  container.textContent = '';
  const safeType = SAFE_ALERT_TYPES.has(type) ? type : 'info';
  const div = document.createElement('div'); div.className = `alert alert-${safeType}`;
  if (title) { const strong = document.createElement('strong'); strong.textContent = title; div.appendChild(strong); div.appendChild(document.createTextNode(' ')); }
  div.appendChild(document.createTextNode(message));
  container.appendChild(div);
}
function showEl(id, show, displayValue = 'block') {
  const e = getEl(id); if (e) e.style.display = show ? displayValue : 'none';
}
function todayStr() {
  const n = new Date();
  return `${n.getUTCFullYear()}-${String(n.getUTCMonth()+1).padStart(2,'0')}-${String(n.getUTCDate()).padStart(2,'0')}`;
}
function oneYearAgoStr() {
  const n = new Date();
  const d = new Date(Date.UTC(n.getUTCFullYear()-1, n.getUTCMonth(), n.getUTCDate()));
  return fmtDate(d);
}
function fmtDate(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}
let _todayCache = null, _todayCacheKey = '';
function getToday() {
  const n = new Date();
  const key = `${n.getUTCFullYear()}-${n.getUTCMonth()}-${n.getUTCDate()}`;
  if (_todayCache && _todayCacheKey === key) return _todayCache;
  _todayCache = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
  _todayCacheKey = key;
  return _todayCache;
}
function getDaysDiff(d1,d2) { return Math.round((d1-d2)/86400000); }
function extractDoseUnit(medRaw) {
  const m = medRaw.match(/(\d+(?:[.,]\d+)?)\s*(mg|ml|µg|mikrogram)/i);
  if (!m) return null;
  const amount = parseFloat(m[1].replace(',','.'));
  const rawUnit = m[2].toLowerCase();
  const unit = rawUnit === 'mikrogram' ? '\u00b5g' : rawUnit;
  return { amount, unit };
}
function getFassUrl(medRaw) {
  const url = `https://www.fass.se/LIF/result?query=${encodeURIComponent(medRaw.trim())}&userType=2`;
  // Ursprungsvalidering: säkerställ att URL:en alltid pekar på fass.se (defense-in-depth)
  return url.startsWith('https://www.fass.se/') ? url : '#';
}
function parseDateUTC(str) {
  if (!str) return null;
  const parts = str.split('-');
  if (parts.length !== 3) return null;
  const y = parseInt(parts[0],10), m = parseInt(parts[1],10), day = parseInt(parts[2],10);
  if (isNaN(y)||isNaN(m)||isNaN(day)||m<1||m>12||day<1||day>31) return null;
  if (y<1950||y>2100) return null;
  const d = new Date(Date.UTC(y,m-1,day));
  if (isNaN(d.getTime())) return null;
  if (d.getUTCFullYear()!==y||d.getUTCMonth()!==m-1||d.getUTCDate()!==day) return null;
  return d;
}

/* Narkotikaklassade läkemedel (LVFS 2011:10) */
const NARCOTICS_LIST_DATE = '2026-04-29'; // Datum då förteckningen senast kontrollerades mot LVFS 2011:10 (inkl. HSLF-FS 2025:8)
const NARCOTICS_SCHEDULES = [
  { schedule:'II', terms:['morfin','dolcontin','depolan','mst continus','oxikodon','oxycodon','oxycontin','oxynorm','targiniq','fentanyl','durogesic','matrifen','instanyl','abstral','pecfent','breakyl','recivit','vellofent','actiq','effentora','metadon','methadone','hydromorfon','hydromorphone','palladon','tapentadol','palexia','ketobemidon','ketogan','petidin','pethidine','alfentanil','rapifen','sufentanil','sufenta','dzuveo','remifentanil','ultiva','metylfenidat','methylphenidate','ritalin','concerta','medikinet','equasym','lisdexamfetamin','lisdexamphetamine','elvanse','amfetamin','amphetamine','attentin','dexamfetamin','dexamphetamine','dexedrin','natriumoxybat','xyrem','nabilon','cesamet','dronabinol','marinol','sativex','nabiximols','flunitrazepam','rohypnol']},
  { schedule:'III', terms:['kodein','citodon','panocod','kodipront','etylmorfin','cocillana','dihydrokodein','tramadol','tiparol','tradolan']},
  { schedule:'IV', terms:['diazepam','stesolid','valium','apozepam','alprazolam','xanax','xanor','klonazepam','clonazepam','rivotril','iktorivil','lorazepam','temesta','oxazepam','oxascand','sobril','nitrazepam','mogadon','apodorm','temazepam','normison','midazolam','dormicum','buccolam','epistatus','triazolam','klorazepat','tranxilium','bromazepam','lexotan','klobazam','clobazam','frisium','epaclob','zolpidem','stilnoct','zolpinox','buprenorfin','buprenorphine','temgesic','norspan','subutex','suboxone','buvidal','espranor','modafinil','modiodal','ketamin','ketamine','ketalar','esketamin','esketamine','spravato','fenobarbital','phenobarbital','fenemal','pentobarbital','amobarbital']},
  { schedule:'V', terms:['pregabalin','lyrica','brigatox','zopiklon','imovane','zoplida','klometiazol','clomethiazole','heminevrin']},
];
const NARCOTICS_RE = [];
for (const {schedule,terms} of NARCOTICS_SCHEDULES) {
  for (const term of terms) {
    NARCOTICS_RE.push({re: new RegExp(`\\b${term}\\b`,'i'), schedule});
  }
}
function getNarcSchedule(medRaw) {
  if (!medRaw || medRaw.length < 3) return null;
  const normalized = medRaw.replace(/[\d.,]+/g,' ');
  const match = NARCOTICS_RE.find(({re}) => re.test(normalized));
  return match ? match.schedule : null;
}

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
  document.querySelectorAll('.main-tab').forEach((btn,idx) => {
    const isActive = (idx===0&&tab==='renew')||(idx===1&&tab==='longterm');
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

// === LÄKEMEDELSLISTA — sidebar ===
function buildMedList() {
  const list = getEl('medList'); if (!list) return;
  list.textContent = '';
  for (let i=0; i<medCardCount; i++) {
    const s = states[i] || {};
    const btn = document.createElement('button');
    btn.className = 'med-item' + (i===activeMedIdx ? ' active' : '');
    btn.setAttribute('role','listitem');
    btn.dataset.idx = i;

    const dot = document.createElement('span');
    const isWarnDot = (s.isOveruse || s.isTooEarly) && s.earlyRenewalDecision !== 'yes';
    dot.className = 'status-dot' + (s.valid ? (isWarnDot ? ' warn' : ' ok') : '');

    const info = document.createElement('div'); info.className = 'med-item-info';
    const name = document.createElement('div'); name.className = 'med-item-name';
    name.textContent = s.medName || `Läkemedel ${i+1}`;
    const status = document.createElement('div'); status.className = 'med-item-status';
    status.textContent = s.statusText || 'Ej ifyllt';
    info.appendChild(name); info.appendChild(status);

    btn.appendChild(dot); btn.appendChild(info);
    btn.addEventListener('click', () => selectMed(i));
    list.appendChild(btn);
  }
}

function selectMed(i) {
  activeMedIdx = i;
  buildMedList();
  renderFormForMed(i);
  renderResultForMed(i);
}

// === FORMULÄR — mittenkolumn ===
function renderFormForMed(i) {
  const s = states[i] || {};
  const emptyState = getEl('formEmptyState');
  const formContent = getEl('formContent');
  if (emptyState) emptyState.classList.add('is-hidden');
  if (formContent) formContent.classList.remove('is-hidden');

  // Sätt mednamn i header
  const nameEl = getEl('formMedName');
  if (nameEl) nameEl.textContent = s.medName || `Läkemedel ${i+1}`;

  // Fyll formulärfält
  const medInput  = getEl('medInput');  if (medInput)  medInput.value  = s.medRaw || '';
  const dateInput = getEl('dateInput'); if (dateInput) dateInput.value = s.dateVal || todayStr();
  const doseInput = getEl('doseInput'); if (doseInput) doseInput.value = s.doseRaw || '';
  const amtInput  = getEl('amtInput');  if (amtInput)  amtInput.value  = s.amtRaw || '';
  const refInput  = getEl('refInput');  if (refInput)  refInput.value  = s.refRaw || '';
  const leftInput = getEl('leftInput'); if (leftInput) leftInput.value = s.leftRaw || '';

  // Narkotikabadge
  updateNarcBadge(s.medRaw || '');

  // FASS
  const fassBtn = getEl('fassBtnForm');
  if (fassBtn) {
    if (s.medRaw) { fassBtn.href = getFassUrl(s.medRaw); fassBtn.classList.remove('is-hidden'); }
    else fassBtn.classList.add('is-hidden');
  }

  // Rensa feltillstånd
  ['medInput','dateInput','doseInput','amtInput','refInput','leftInput'].forEach(id => {
    const el = getEl(id); if (el) toggleError(el, false);
  });
}

function updateNarcBadge(medRaw) {
  const badge = getEl('narcBadge'); if (!badge) return;
  const schedule = getNarcSchedule(medRaw);
  if (schedule) {
    badge.textContent = `🔒 Narkotikaklassat – Förteckning ${schedule}`;
    badge.classList.remove('is-hidden');
  } else {
    badge.textContent = ' '; // hårt mellanslag bevarar höjden → ingen layoutförskjutning
    badge.classList.add('is-hidden');
  }
}

function saveFormValues(i) {
  if (!states[i]) states[i] = {};
  const s = states[i];
  s.medRaw  = (getEl('medInput')  || {}).value || '';
  s.dateVal = (getEl('dateInput') || {}).value || todayStr();
  s.doseRaw = (getEl('doseInput') || {}).value || '';
  s.amtRaw  = (getEl('amtInput')  || {}).value || '';
  s.refRaw  = (getEl('refInput')  || {}).value || '';
  s.leftRaw = (getEl('leftInput') || {}).value || '';
  s.medName = s.medRaw || `Läkemedel ${i+1}`;
}

// === RESULTAT — högerkolumn ===
function renderResultForMed(i) {
  const s = states[i] || {};
  const emptyState   = getEl('resultEmptyState');
  const resultContent = getEl('resultContent');

  if (!s.valid) {
    if (emptyState) emptyState.classList.remove('is-hidden');
    if (resultContent) resultContent.classList.add('is-hidden');
    return;
  }

  if (emptyState) emptyState.classList.add('is-hidden');
  if (resultContent) resultContent.classList.remove('is-hidden');

  /* Verdict */
  const vBox   = getEl('verdictBox');
  const vIcon  = getEl('verdictIcon');
  const vTitle = getEl('verdictTitle');
  const vSub   = getEl('verdictSub');
  if (vBox) {
    const decidedYes = s.earlyRenewalDecision === 'yes';
    const vType = (s.isOveruse || s.isTooEarly) && decidedYes ? 'ok'
      : s.isOveruse ? 'danger'
      : s.isTooEarly ? 'warn'
      : 'ok';
    vBox.className = 'verdict verdict-' + vType;
    if (vIcon) vIcon.textContent = vType === 'ok' ? '✓' : vType === 'danger' ? '⚠' : '!';
    if (vTitle) vTitle.textContent = s.verdictTitle || '—';
    if (vSub)   vSub.textContent   = s.verdictSub   || '';
  }

  /* Tidslinje */
  const tlFill  = getEl('tlFill');
  const tlStart = getEl('tlStart');
  const tlEnd   = getEl('tlEnd');
  if (tlFill && s.tlPct !== undefined) {
    const pct = Math.min(100, s.tlPct);
    tlFill.style.width = pct + '%';
    tlFill.className = 'tl-fill tl-fill-' + (s.isOveruse?'danger':s.isTooEarly?'warn':'ok');
  }
  if (tlStart) tlStart.textContent = s.tlStart || '—';
  if (tlEnd)   tlEnd.textContent   = s.tlEnd   || '—';

  /* Mätvärden */
  const metricsGrid = getEl('metricsGrid');
  if (metricsGrid && s.metrics) {
    metricsGrid.textContent = '';
    s.metrics.forEach(m => {
      const div = document.createElement('div'); div.className = 'metric';
      if (m.tooltip) div.dataset.tooltip = m.tooltip;
      const lbl = document.createElement('div'); lbl.className = 'metric-lbl'; lbl.textContent = m.label;
      const val = document.createElement('div'); val.className = 'metric-val' + (m.cls?' '+m.cls:''); val.textContent = m.value;
      div.appendChild(lbl); div.appendChild(val);
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
    if (s.patientText || s.journalText) {
      copySection.style.display = 'flex';
      copySection.style.flexDirection = 'column';
    } else {
      copySection.style.display = 'none';
    }
  }
  switchResultTab(states[i].activeTab || 'patient');
  renderPrescribePanel(i);
}

function switchResultTab(tab) {
  if (!states[activeMedIdx]) return;
  states[activeMedIdx].activeTab = tab;
  document.querySelectorAll('#copySection .copy-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  const body    = getEl('copyBodyResult');
  const langBtn = getEl('langBtnResult');
  const s = states[activeMedIdx] || {};
  if (tab === 'patient') {
    const isEn = s.patientLang === 'en';
    if (body) body.textContent = isEn ? (s.patientTextEn||s.patientText||'') : (s.patientText||'');
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
  if (!s||!s.patientTextEn) return;
  s.patientLang = s.patientLang === 'en' ? 'sv' : 'en';
  switchResultTab('patient');
}

// === VALIDERING + BERÄKNING ===
function validateInputs() {
  const medInput  = getEl('medInput');
  const dateInput = getEl('dateInput');
  const amtInput  = getEl('amtInput');
  const doseInput = getEl('doseInput');
  const refInput  = getEl('refInput');
  if (!medInput||!dateInput||!amtInput||!doseInput||!refInput) return {valid:false,reason:'incomplete'};

  const medRaw = medInput.value.trim();
  if (medRaw.length > 100) return {valid:false,reason:'incomplete'};
  const dateVal = dateInput.value;
  if (dateVal.length > 10) return {valid:false,reason:'invalid_date'};

  const amtRaw = amtInput.value;
  const amt = parseInt(amtRaw,10);
  const amtIsInvalid = amtRaw!==''&&(isNaN(amt)||amt<=0||amt>10000||!Number.isInteger(Number(amtRaw)));
  toggleError(amtInput, amtIsInvalid);

  const doseRaw = doseInput.value;
  const dose = parseFloat(doseRaw.replace(',','.'));
  const doseIsInvalid = doseRaw!==''&&(isNaN(dose)||dose<0.1||dose>50);
  toggleError(doseInput, doseIsInvalid);

  const refRaw = refInput.value.trim();
  const refNum = Number(refRaw);
  const refIsInvalid = refRaw!==''&&(!Number.isFinite(refNum)||!Number.isInteger(refNum)||refNum<1||refNum>12);
  const refOutOfRange = Number.isFinite(refNum)&&Number.isInteger(refNum)&&refNum>12;
  toggleError(refInput, refIsInvalid);

  if (refOutOfRange) return {valid:false,reason:'too_many_refs'};
  if (!medRaw||!dateVal||isNaN(dose)||doseIsInvalid||isNaN(amt)||amtIsInvalid||refIsInvalid||!refNum||refNum<1)
    return {valid:false,reason:'incomplete'};

  const ref = refNum;
  const pDate = parseDateUTC(dateVal);
  const dateIsInvalid = !!dateVal&&!pDate;
  toggleError(dateInput, dateIsInvalid);
  if (!pDate) return {valid:false,reason:'invalid_date'};
  const today = getToday();
  if (pDate>today) { toggleError(dateInput,true); return {valid:false,reason:'invalid_date'}; }

  const leftInput = getEl('leftInput');
  const leftRaw = leftInput ? leftInput.value.trim() : '';
  const remaining = leftRaw!=='' ? parseInt(leftRaw,10) : null;
  const leftIsInvalid = leftRaw!==''&&(isNaN(remaining)||remaining<0||!Number.isInteger(Number(leftRaw)));
  if (leftInput) toggleError(leftInput, leftIsInvalid);
  if (leftIsInvalid) return {valid:false,reason:'incomplete'};

  return {valid:true,medRaw,dateVal,pDate,amt,dose,ref,remaining,doseRaw,amtRaw,refRaw,leftRaw};
}

function buildResultRow(frag, label, valueText, badgeNode=null) {
  const rk = document.createElement('span'); rk.className='rk'; rk.textContent=label;
  const rv = document.createElement('span'); rv.className='rv'; rv.textContent=valueText;
  if (badgeNode) { rv.appendChild(document.createTextNode(' ')); rv.appendChild(badgeNode); }
  frag.appendChild(rk); frag.appendChild(rv);
}

function calc() {
  const i = activeMedIdx;
  resetTimer();
  saveFormValues(i);
  if (!states[i]) states[i] = {};
  states[i].valid = false;

  // Uppdatera FASS-länk
  const s = states[i];
  const fassBtn = getEl('fassBtnForm');
  if (fassBtn) {
    if (s.medRaw) { fassBtn.href = getFassUrl(s.medRaw); fassBtn.classList.remove('is-hidden'); }
    else fassBtn.classList.add('is-hidden');
  }
  // Narkotikabadge
  updateNarcBadge(s.medRaw || '');
  // Uppdatera header-namn
  const nameEl = getEl('formMedName');
  if (nameEl) nameEl.textContent = s.medName || `Läkemedel ${i+1}`;

  const inputData = validateInputs();

  const showEmpty = () => {
    states[i].valid = false;
    states[i].statusText = 'Ej ifyllt';
    buildMedList();
    renderResultForMed(i);
  };

  if (!inputData.valid) {
    if (inputData.reason==='too_many_refs') {
      states[i].valid = true; states[i].isOveruse=false; states[i].isTooEarly=false;
      states[i].verdictTitle = 'Ogiltigt antal uttag';
      states[i].verdictSub   = 'Max 12 uttag stöds.';
      states[i].metrics = [];
      states[i].alerts = [{type:'danger', title:'Ogiltigt antal uttag', message:'Max 12 uttag stöds.'}];
      states[i].statusText = 'Ogiltigt antal'; buildMedList(); renderResultForMed(i);
    } else if (inputData.reason==='invalid_date') {
      states[i].statusText = 'Ogiltigt datum'; buildMedList(); showEmpty();
    } else {
      showEmpty();
    }
    generateAndDistribute(); return;
  }

  const today = getToday();
  const daysSince = getDaysDiff(today, inputData.pDate);

  if (daysSince===0) {
    states[i].valid=true; states[i].calculable=false;
    states[i].isOveruse=false; states[i].isTooEarly=false;
    states[i].verdictTitle='Kan ej beräknas idag';
    states[i].verdictSub='Receptet måste vara utfärdat minst en dag tillbaka.';
    states[i].metrics=[]; states[i].alerts=[];
    states[i].patientText=''; states[i].patientTextEn=''; states[i].journalText='';
    states[i].statusText='Kan ej beräknas';
    buildMedList(); renderResultForMed(i); generateAndDistribute(); return;
  }

  const total    = inputData.amt * inputData.ref;
  const totalDays = total / inputData.dose;

  if (totalDays>3650) {
    states[i].valid=true; states[i].isOveruse=false; states[i].isTooEarly=false;
    states[i].verdictTitle='Orimliga värden'; states[i].verdictSub='Beräknad tid överstiger 10 år.';
    states[i].metrics=[]; states[i].alerts=[{type:'danger', title:'Orimlig tid', message:'Kontrollera inmatade värden.'}];
    states[i].statusText='Orimliga värden'; buildMedList(); renderResultForMed(i); generateAndDistribute(); return;
  }

  const {remaining} = inputData;
  const hasRemaining = remaining!==null&&remaining!==undefined;
  const batchDuration = inputData.amt/inputData.dose;
  const batchesDispensed = Math.min(inputData.ref, Math.floor(daysSince/batchDuration)+1);
  const accessibleTotal = Math.min(total, batchesDispensed*inputData.amt);

  let endDate, daysRemaining, avgNum, earlyPickup=false, calcBase=accessibleTotal;

  if (hasRemaining) {
    if (remaining>total) {
      states[i].valid=true; states[i].isOveruse=false; states[i].isTooEarly=false;
      states[i].verdictTitle='Orimligt värde';
      states[i].verdictSub=`Kvarvarande (${remaining}) kan inte överstiga totalt förskrivet (${total}).`;
      states[i].metrics=[]; states[i].alerts=[]; states[i].statusText='Orimliga värden';
      buildMedList(); renderResultForMed(i); generateAndDistribute(); return;
    }
    earlyPickup = remaining>accessibleTotal;
    if (earlyPickup) { const minB=Math.ceil(remaining/inputData.amt); calcBase=Math.min(minB,inputData.ref)*inputData.amt; }
    else calcBase = accessibleTotal;
    const consumed = calcBase-remaining;
    if (consumed<0) { states[i].statusText='Orimliga värden'; buildMedList(); renderResultForMed(i); return; }
    avgNum = consumed/daysSince;
    daysRemaining = Math.floor(remaining/inputData.dose);
    endDate = new Date(today); endDate.setUTCDate(today.getUTCDate()+daysRemaining);
  } else {
    endDate = new Date(inputData.pDate); endDate.setUTCDate(endDate.getUTCDate()+Math.round(totalDays));
    daysRemaining = getDaysDiff(endDate,today);
    // Avsiktligt konservativt antagande: utan uppgift om kvarvarande doser antas
    // att samtliga förskrivna tabletter (total) är förbrukade. Detta inkluderar
    // uttag som ännu inte hunnit dispenseras enligt batchmodellen (accessibleTotal).
    // Syftet är att tvinga fram en klinisk bedömning vid förnyelse — läkaren ser
    // en potentiellt hög snittförbrukning och avgör själv om recept ska utfärdas.
    // Se även tooltip på "Snittförbrukning" i resultatsektionen.
    avgNum = total/daysSince;
  }

  const prescribedEndDate = new Date(inputData.pDate);
  prescribedEndDate.setUTCDate(prescribedEndDate.getUTCDate()+Math.round(totalDays));
  const daysToPrescribedEnd = getDaysDiff(prescribedEndDate, today);
  // Överförbrukning om >10% över ordination OCH antingen mer än 7 dosdagar återstår
  // ELLER receptperioden har mer än 14 dagar kvar (patienten har tagit slut för tidigt).
  const isOveruse  = avgNum > inputData.dose * 1.10 && (daysRemaining > 7 || daysToPrescribedEnd > 14);
  // isTooEarly baseras alltid på receptperiodens kvarvarande dagar, inte faktiska dosdagar.
  // Det kliniska beslutet gäller om receptet har löpt ut — inte om patienten råkar ha doser kvar.
  const isTooEarly = !isOveruse && daysToPrescribedEnd > Math.round(totalDays * 0.20);

  // Avgöranden-texter
  const doseUnit = extractDoseUnit(inputData.medRaw);
  let displayAvg = `${avgNum.toFixed(2)} st/dag`;
  if (doseUnit) displayAvg += ` (${(avgNum*doseUnit.amount).toFixed(1)} ${doseUnit.unit}/dag)`;
  const avgNote = hasRemaining
    ? `(beräknat på faktisk förbrukning: ${calcBase-remaining} av ${calcBase} tillgängliga doser${earlyPickup?' – patienten kan ha hämtat ut uttag i förväg':''})`
    : `(beräknat under antagandet att alla hittills tillgängliga doser är förbrukade)`;

  // Återställ beslut om kliniska flaggor har ändrats sedan förra beräkningen
  const prevIsOveruse  = states[i].isOveruse  || false;
  const prevIsTooEarly = states[i].isTooEarly || false;
  if (prevIsOveruse !== isOveruse || prevIsTooEarly !== isTooEarly) {
    states[i].earlyRenewalDecision = null;
  }

  // Status i sidebar
  const prevDecision = states[i].earlyRenewalDecision || null;
  const statusText = isOveruse && prevDecision === 'yes' ? 'OK – förnyas (klinisk bed.)'
    : isOveruse ? 'För tidig förnyelse'
    : isTooEarly && prevDecision === 'yes' ? 'OK – förnyas tidigt'
    : isTooEarly ? `För tidigt — ${daysToPrescribedEnd}d kvar`
    : `OK – t.o.m ${fmtDate(prescribedEndDate)}`;
  states[i].statusText = statusText;

  // Tidslinje
  const tlPct = Math.min(100, Math.max(0, (daysSince/totalDays)*100));
  states[i].tlPct   = tlPct;
  states[i].tlStart = fmtDate(inputData.pDate);
  states[i].tlEnd   = fmtDate(prescribedEndDate);

  // Mätvärden
  const earlyThreshold = Math.round(totalDays * 0.20);
  states[i].earlyThreshold = earlyThreshold;
  // endCls och "Räcker t.o.m." baseras alltid på prescribedEndDate (ordinerad takt),
  // oavsett om läkaren fyllt i faktiska kvarvarande doser. Doser kvar används enbart
  // för snittberäkning — inte för att bestämma hur länge receptet "räcker".
  const endCls = daysToPrescribedEnd < 0 ? 'danger' : daysToPrescribedEnd <= earlyThreshold ? 'warn' : 'ok';
  states[i].metrics = [
    {label:'Totalt förskrivet', value:`${total} st`, cls:'',     tooltip:'Mängd per uttag × antal uttag. Det totala antalet doser som förskrevs på receptet.'},
    {label:'Räcker t.o.m.',    value: (() => { const note = daysToPrescribedEnd > 0 ? ` (${daysToPrescribedEnd} dagar kvar)` : daysToPrescribedEnd === 0 ? ' (tar slut idag)' : ` (slut sedan ${Math.abs(daysToPrescribedEnd)} dagar)`; return fmtDate(prescribedEndDate) + note; })(), cls: endCls, tooltip:'Beräknat datum då receptet tar slut vid ordinerad dos. Doser kvar används enbart för att beräkna snittförbrukning.'},
    {label:'Snittförbrukning', value:displayAvg,    cls: isOveruse?'danger':'', tooltip:'Genomsnittlig förbrukning per dag sedan receptet utfärdades. Mer än 10% över ordination kräver klinisk bedömning om mer än 7 dosdagar återstår eller receptperioden har mer än 14 dagar kvar.'},
  ];

  // Verdict
  if (isOveruse) {
    states[i].verdictTitle = 'För tidig förnyelse – bedömning krävs';
    states[i].verdictSub   = `Snitt ${avgNum.toFixed(2)} st/dag överstiger ordination med >10%.`;
  } else if (isTooEarly) {
    states[i].verdictTitle = `För tidigt – ${daysToPrescribedEnd} dagar kvar`;
    states[i].verdictSub   = 'Förbrukning OK. Kontakta vården närmre slutdatumet.';
  } else {
    states[i].verdictTitle = 'OK – Förnya recept';
    states[i].verdictSub   = 'Förbrukning enligt ordination. Recept kan utfärdas.';
  }

  // Alerts — byggs som strukturerade objekt, renderas via DOM (ingen innerHTML med användardata)
  const alerts = [];
  const consumptionPct = (avgNum/inputData.dose)*100;
  const overuseSupressedBy7day = !isOveruse && daysRemaining <= 7 && avgNum > inputData.dose * 1.10;
  if (isOveruse) {
    const daysNote = daysRemaining>0 ? ` — ${daysRemaining} dagar kvar` : ` — förskrivningen är slut`;
    alerts.push({type:'danger', title:'Förbrukning överstiger ordination', message:`Snitt ${displayAvg} ${avgNote}${daysNote}. Gör en individuell bedömning.`});
  } else if (overuseSupressedBy7day) {
    alerts.push({type:'warn', title:'Förhöjd förbrukning noterad', message:`Snitt ${displayAvg} överstiger ordination med >10%, men medicinen beräknas ta slut inom 7 dagar. Förnyelse godkänd — notera förbrukningstakten.`});
  } else if (avgNum===0) {
    alerts.push({type:'danger', title:'Ingen förbrukning registrerad', message:'Snitt 0 st/dag – patienten verkar inte ha tagit medicinen. Klinisk bedömning krävs.'});
  } else if (consumptionPct<80) {
    alerts.push({type:'warn', title:'Låg förbrukning', message:`${avgNum.toFixed(2)} st/dag är ${(100-consumptionPct).toFixed(1)}% under ordinerad dos. Överväg uppföljning.`});
    if (isTooEarly) {
      alerts.push({type:'info', title:'För tidigt att förnya', message:`Receptperioden löper ut om ${daysToPrescribedEnd} dagar (t.o.m. ${fmtDate(prescribedEndDate)}). Förnyelse rekommenderas närmre slutdatumet.`});
    }
  } else if (isTooEarly) {
    alerts.push({type:'info', title:'För tidigt att förnya', message:`Receptperioden löper ut om ${daysToPrescribedEnd} dagar (t.o.m. ${fmtDate(prescribedEndDate)}). Förnyelse rekommenderas närmre slutdatumet.`});
  }
  if (avgNum>inputData.dose*2.5) {
    alerts.push({type:'warn', title:'Datakontroll', message:`Snitt ${avgNum.toFixed(2)} st/dag är mycket högt. Kontrollera kvarvarande doser.`});
  }
  if (earlyPickup) {
    alerts.push({type:'info', title:'Tidig uthämtning', message:'Kvarvarande doser överstiger modellens förväntade tillgängliga mängd. Beräknas från minsta möjliga antal uttag.'});
  }
  states[i].alerts = alerts;

  // Spara data för generateAndDistribute
  states[i].valid            = true;
  states[i].calculable       = true;
  states[i].isOveruse        = isOveruse;
  states[i].isTooEarly       = isTooEarly;
  states[i].medRaw           = inputData.medRaw;
  states[i].amt              = inputData.amt;
  states[i].dose             = inputData.dose;
  states[i].pDateStr         = fmtDate(inputData.pDate);
  states[i].total            = total;
  states[i].remainingDoses       = hasRemaining ? remaining : null;
  states[i].endDateStr           = fmtDate(endDate);
  states[i].prescribedEndDateStr = fmtDate(prescribedEndDate);
  states[i].daysRemaining        = daysRemaining;
  states[i].daysToPrescribedEnd  = daysToPrescribedEnd;
  states[i].displayAvgStr    = displayAvg;
  states[i].avgNote          = avgNote;
  states[i].activeTab        = states[i].activeTab || 'patient';
  states[i].patientLang      = 'sv';

  if (isOveruse) {
    const contactDate = new Date(prescribedEndDate);
    contactDate.setUTCDate(contactDate.getUTCDate()-7);
    const contactIsPast = contactDate<getToday();
    const effectiveContactDate = contactIsPast ? getToday() : contactDate;
    states[i].prescribedContactDateStr = fmtDate(effectiveContactDate);
    states[i].prescribedContactIsPast  = contactIsPast;
  } else if (isTooEarly) {
    const renewDate = new Date(prescribedEndDate);
    renewDate.setUTCDate(renewDate.getUTCDate() - earlyThreshold);
    states[i].renewDateStr = fmtDate(renewDate);
  }

  buildMedList();
  generateAndDistribute();
  renderResultForMed(i);
}

/* Samlad text för alla läkemedel */
function generateAndDistribute() {
  const validCount = states.filter(s=>s.valid && s.calculable !== false).length;
  if (validCount===0) {
    for (let i=0;i<medCardCount;i++) { if(states[i]){states[i].patientText='';states[i].patientTextEn='';states[i].journalText='';} }
    renderResultForMed(activeMedIdx); return;
  }
  const toRenew=[], tooEarly=[], overuse=[];
  for (let i=0;i<medCardCount;i++) {
    const s=states[i]; if (!s||!s.valid||s.calculable===false) continue;
    const name = s.medRaw||`Läkemedel ${i+1}`;
    if (s.isOveruse && s.earlyRenewalDecision === 'yes') toRenew.push({name,i,earlyRenewal:'overuse'});
    else if (s.isOveruse) overuse.push({name,i});
    else if (s.isTooEarly && s.earlyRenewalDecision === 'yes') toRenew.push({name,i,earlyRenewal:'tooEarly'});
    else if (s.isTooEarly) tooEarly.push({name,i});
    else toRenew.push({name,i});
  }

  /* Patient-text (sv) */
  let patLines=['Hej,',''];
  if (validCount===1) {
    if (toRenew.length===1) {
      patLines.push(`Vi har tagit emot din förfrågan om receptförnyelse för ${toRenew[0].name} och kommer att förnya ditt recept inom 2–3 arbetsdagar. Du kan därefter hämta ut din medicin på valfritt apotek.`);
      patLines.push(''); patLines.push('Vid frågor är du välkommen att kontakta oss via 1177.');
    } else if (tooEarly.length===1) {
      const s=states[tooEarly[0].i];
      patLines.push(`Vi har tagit emot din förfrågan om receptförnyelse för ${tooEarly[0].name}. Enligt din ordination (${s.dose} st/dag) beräknas medicinen räcka till den ${s.prescribedEndDateStr}. Eftersom det datumet inte ännu har passerat kan vi inte förnya receptet just nu. Vänligen hör av dig igen runt den ${s.renewDateStr} så hjälper vi dig då med nytt recept.`);
      patLines.push(''); patLines.push('Vid frågor är du välkommen att kontakta oss via 1177.');
    } else if (overuse.length===1) {
      const s=states[overuse[0].i];
      const prescribedEndPast = new Date(s.prescribedEndDateStr) < getToday();
      const closing = prescribedEndPast
        ? `Receptet kan nu förnyas. Kontakta oss igen om du vill ha ett nytt recept utfärdat.`
        : s.prescribedContactIsPast
          ? `Medicinen beräknas ta slut inom kort — vänligen hör av dig igen så hjälper vi dig.`
          : `Vänligen hör av dig igen närmre den ${s.prescribedContactDateStr} så hjälper vi dig då.`;
      patLines.push(`Vi har tagit emot din förfrågan om receptförnyelse för ${overuse[0].name}. Utifrån föregående recept beräknades medicinen räcka till den ${s.prescribedEndDateStr}. Vi har granskat förfrågan och kan tyvärr inte förnya receptet vid detta tillfälle. ${closing}`);
      patLines.push(''); patLines.push('Vid frågor är du välkommen att kontakta oss via 1177.');
    }
  } else {
    patLines.push('Vi har tagit emot din förfrågan om receptförnyelse för följande läkemedel:','');
    toRenew.forEach(({name})=>patLines.push(`${name}: Vi förnyar ditt recept inom 2–3 arbetsdagar.`));
    tooEarly.forEach(({name,i})=>{ const s=states[i]; patLines.push(`${name}: Enligt din ordination beräknas medicinen räcka till ${s.prescribedEndDateStr} — vi kan därför inte förnya receptet ännu. Hör av dig runt ${s.renewDateStr}.`); });
    overuse.forEach(({name,i})=>{ const s=states[i]; const epast=new Date(s.prescribedEndDateStr)<getToday(); if(epast){ patLines.push(`${name}: Beräknades räcka till ${s.prescribedEndDateStr}. Receptet kan nu förnyas — kontakta oss igen.`); } else { const c=s.prescribedContactIsPast?`Medicinen beräknas ta slut inom kort — hör av dig igen.`:`Hör av dig närmre ${s.prescribedContactDateStr}.`; patLines.push(`${name}: Beräknades räcka till ${s.prescribedEndDateStr} — kan tyvärr inte förnyas vid detta tillfälle. ${c}`); } });
    patLines.push('','Vid frågor är du välkommen att kontakta oss via 1177.');
  }
  const patientText = patLines.join('\n');

  /* Patient-text (en) */
  let patLinesEn=['Hello,',''];
  if (validCount===1) {
    if (toRenew.length===1) {
      patLinesEn.push(`We have received your prescription renewal request for ${toRenew[0].name} and will renew your prescription within 2–3 working days. You can then collect your medication at any pharmacy.`);
      patLinesEn.push(''); patLinesEn.push('If you have questions, please contact us through 1177.');
    } else if (tooEarly.length===1) {
      const s=states[tooEarly[0].i];
      patLinesEn.push(`We have received your prescription renewal request for ${tooEarly[0].name}. Your medication is estimated to last until ${s.prescribedEndDateStr}. Please contact us again around ${s.renewDateStr} and we will help you then.`);
      patLinesEn.push(''); patLinesEn.push('If you have questions, please contact us through 1177.');
    } else if (overuse.length===1) {
      const s=states[overuse[0].i];
      const prescribedEndPastEn = new Date(s.prescribedEndDateStr) < getToday();
      const c = prescribedEndPastEn
        ? `Your prescription can now be renewed. Please contact us again if you would like a new prescription.`
        : s.prescribedContactIsPast
          ? `Your medication is expected to run out shortly — please contact us again and we will help you.`
          : `Please contact us again closer to ${s.prescribedContactDateStr}.`;
      patLinesEn.push(`We have received your prescription renewal request for ${overuse[0].name}. Based on the previous prescription, the medication was estimated to last until ${s.prescribedEndDateStr}. We have reviewed your request and are unfortunately unable to renew the prescription at this time. ${c}`);
      patLinesEn.push(''); patLinesEn.push('If you have questions, please contact us through 1177.');
    }
  } else {
    patLinesEn.push('We have received your prescription renewal request for the following medications:','');
    toRenew.forEach(({name})=>patLinesEn.push(`${name}: We will renew your prescription within 2–3 working days.`));
    tooEarly.forEach(({name,i})=>{ const s=states[i]; patLinesEn.push(`${name}: Based on your prescription, the medication is estimated to last until ${s.prescribedEndDateStr} — it is therefore too early to renew. Please contact us around ${s.renewDateStr}.`); });
    overuse.forEach(({name,i})=>{ const s=states[i]; const epast=new Date(s.prescribedEndDateStr)<getToday(); if(epast){ patLinesEn.push(`${name}: Based on the previous prescription, the medication was estimated to last until ${s.prescribedEndDateStr}. The prescription can now be renewed — please contact us again.`); } else { const c=s.prescribedContactIsPast?`The medication is expected to run out shortly — please contact us again.`:`Please contact us again closer to ${s.prescribedContactDateStr}.`; patLinesEn.push(`${name}: Based on the previous prescription, the medication was estimated to last until ${s.prescribedEndDateStr} — we are unfortunately unable to renew it at this time. ${c}`); } });
    patLinesEn.push('','If you have questions, please contact us through 1177.');
  }
  const patientTextEn = patLinesEn.join('\n');

  /* Journal-text */
  let jLines=[];
  if (validCount===1) {
    if (toRenew.length===1) {
      const s=states[toRenew[0].i];
      if (toRenew[0].earlyRenewal === 'overuse') {
        const overuseRemNote = s.remainingDoses!=null
          ? (s.daysRemaining>0 ? ` Vid förnyelse framkommer att patienten har ${s.remainingDoses} doser (${s.daysRemaining} dagar) kvar.` : ` Vid förnyelse framkommer att patienten uppger att medicinen är slut.`)
          : '';
        jLines=['Kontaktorsak: Receptförnyelse via 1177.','',
          `Bedömning: Patienten begär förnyelse av ${toRenew[0].name}. Senaste receptet utfärdades ${s.pDateStr} (totalt ${s.total} doser, ordination ${s.dose} st/dag) och borde räcka till ${s.prescribedEndDateStr}.${overuseRemNote}`,
          `Beräknad snittförbrukning: ${s.displayAvgStr} ${s.avgNote} — överstiger ordination. Receptet förnyas på klinisk indikation efter individuell bedömning.`,
          '','Åtgärd: Nytt recept utfärdat. Svar skickat till patient via 1177.'];
      } else {
        const earlyNote = toRenew[0].earlyRenewal === 'tooEarly'
          ? ` Receptet förnyas på klinisk indikation efter individuell bedömning trots att receptperioden löper ut ${s.prescribedEndDateStr} (${s.daysToPrescribedEnd} dagar kvar).`
          : '';
        const remainingNote = s.remainingDoses!=null
          ? (s.daysRemaining>0 ? ` Vid förnyelse framkommer att patienten har ${s.remainingDoses} doser (${s.daysRemaining} dagar) kvar.` : ` Vid förnyelse framkommer att patienten uppger att medicinen är slut.`)
          : '';
        jLines=['Kontaktorsak: Receptförnyelse via 1177.','',
          `Bedömning: Patienten begär förnyelse av ${toRenew[0].name}. Senaste receptet utfärdades ${s.pDateStr} (totalt ${s.total} doser, ordination ${s.dose} st/dag) och beräknas räcka till ${s.prescribedEndDateStr}.${remainingNote}${earlyNote}`,
          `Förbrukning bedöms vara enligt ordination (snittförbrukning: ${s.displayAvgStr} ${s.avgNote}).`,
          '','Åtgärd: Nytt recept utfärdat. Svar skickat till patient via 1177.'];
      }
    } else if (tooEarly.length===1) {
      const s=states[tooEarly[0].i];
      const tooEarlyRemNote = s.remainingDoses!=null
        ? (s.daysRemaining>0 ? ` Vid förnyelse framkommer att patienten har ${s.remainingDoses} doser (${s.daysRemaining} dagar) kvar.` : ` Vid förnyelse framkommer att patienten uppger att medicinen är slut.`)
        : '';
      jLines=['Kontaktorsak: Receptförnyelse via 1177.','',`Bedömning: Patienten begär förnyelse av ${tooEarly[0].name}. Senaste receptet utfärdades ${s.pDateStr} (totalt ${s.total} doser, ordination ${s.dose} st/dag) och beräknas räcka till ${s.prescribedEndDateStr} (${s.daysToPrescribedEnd} dagar kvar).${tooEarlyRemNote}`,`Förbrukning bedöms vara enligt ordination (snittförbrukning: ${s.displayAvgStr} ${s.avgNote}).`,'',`Åtgärd: Ej förnyat — för tidigt. Svar skickat till patient via 1177.`];
    } else if (overuse.length===1) {
      const s=states[overuse[0].i];
      const sn = s.remainingDoses!=null
        ? (s.daysRemaining>0 ? `Vid förnyelse framkommer att patienten har ${s.remainingDoses} doser (${s.daysRemaining} dagar) kvar.` : `Vid förnyelse framkommer att patienten uppger att medicinen är slut.`)
        : (s.daysRemaining>0 ? `Aktuell förskrivning beräknas räcka ytterligare ${s.daysRemaining} dagar.` : `Aktuell förskrivning är slut.`);
      const overuseAtgard = s.earlyRenewalDecision==='no' ? 'Åtgärd: Ej förnyat efter klinisk, individuell bedömning.' : 'Åtgärd: [Nytt recept utfärdat / Ej utfärdat — motivering]';
      jLines=['Kontaktorsak: Receptförnyelse via 1177.','',`Bedömning: Patienten begär förnyelse av ${overuse[0].name}. Senaste receptet utfärdades ${s.pDateStr} (totalt ${s.total} doser, ordination ${s.dose} st/dag) och borde räcka till ${s.prescribedEndDateStr}. ${sn} Beräknad snittförbrukning: ${s.displayAvgStr} ${s.avgNote}.`,'',overuseAtgard];
    }
  } else {
    jLines=['Kontaktorsak: Receptförnyelse via 1177 (flera läkemedel).',''];
    toRenew.forEach(({name,i,earlyRenewal})=>{ const s=states[i]; const atgardText=earlyRenewal==='overuse'?'Åtgärd: Förnyat efter klinisk, individuell bedömning.':earlyRenewal==='tooEarly'?`Åtgärd: Förnyat efter klinisk, individuell bedömning (${s.daysToPrescribedEnd}d kvar av receptperiod).`:'Åtgärd: Förnyat.'; const remNote=earlyRenewal!=='overuse'&&s.remainingDoses!=null?(s.daysRemaining>0?` Vid förnyelse framkommer att patienten har ${s.remainingDoses} doser (${s.daysRemaining} dagar) kvar.`:` Vid förnyelse framkommer att patienten uppger att medicinen är slut.`):''; const endInfo=earlyRenewal==='overuse'?`Borde räcka t.o.m. ${s.prescribedEndDateStr}. Snitt: ${s.displayAvgStr} — överstiger ordination.`:`Räcker t.o.m. ${s.prescribedEndDateStr}.${remNote} Snitt: ${s.displayAvgStr}.`; jLines.push(`${name}: Utfärdat ${s.pDateStr} (${s.total} doser, ${s.dose} st/dag). ${endInfo} ${atgardText}`,'')});
    tooEarly.forEach(({name,i})=>{ const s=states[i]; jLines.push(`${name}: Utfärdat ${s.pDateStr} (${s.total} doser, ${s.dose} st/dag). Räcker t.o.m. ${s.prescribedEndDateStr} (${s.daysToPrescribedEnd} dagar kvar). Snitt: ${s.displayAvgStr}. Åtgärd: Ej förnyat — för tidigt.`,''); });
    overuse.forEach(({name,i})=>{ const s=states[i]; const sn=s.remainingDoses!=null?(s.daysRemaining>0?`Vid förnyelse framkommer att patienten har ${s.remainingDoses} doser (${s.daysRemaining} dagar) kvar.`:`Vid förnyelse framkommer att patienten uppger att medicinen är slut.`):(s.daysRemaining>0?`Räcker ytterligare ${s.daysRemaining} dagar.`:`Förskrivningen är slut.`); const atgard=s.earlyRenewalDecision==='no'?'Åtgärd: Ej förnyat efter klinisk, individuell bedömning.':'Åtgärd: [Nytt recept utfärdat / Ej utfärdat — motivering]'; jLines.push(`${name}: Utfärdat ${s.pDateStr} (${s.total} doser, ${s.dose} st/dag). Borde räcka t.o.m. ${s.prescribedEndDateStr}. ${sn} Snitt: ${s.displayAvgStr}. ${atgard}`,''); });
    if (toRenew.length>0) jLines.push(`Recept utfärdat för: ${toRenew.map(x=>x.name).join(', ')}. Svar skickat via 1177.`);
    else jLines.push('Inga recept utfärdade. Svar skickat via 1177.');
  }
  const journalText = jLines.join('\n');

  /* Distribuera till alla giltiga, beräkningsbara states */
  for (let i=0;i<medCardCount;i++) {
    if (!states[i]||!states[i].valid||states[i].calculable===false) continue;
    states[i].patientText   = patientText;
    states[i].patientTextEn = patientTextEn;
    states[i].patientLang   = states[i].patientLang || 'sv';
    states[i].journalText   = journalText;
  }
  renderResultForMed(activeMedIdx);
}

// === NY FÖRSKRIVNING ===

/* Beräkna resultat utan att röra DOM */
function calcPrescribeResult(i) {
  const s  = states[i] || {};
  const ps = prescribeState[i];
  if (!ps) return null;

  const today        = getToday();
  const prescribedEnd = parseDateUTC(s.prescribedEndDateStr);

  // Startdatum: om nuvarande recept löper ut i framtiden, börja därifrån
  const startDate        = (prescribedEnd && prescribedEnd > today) ? prescribedEnd : today;
  const startDateStr     = fmtDate(startDate);
  const daysAlreadyCovered = (prescribedEnd && prescribedEnd > today) ? getDaysDiff(prescribedEnd, today) : 0;

  let endDate = null, totalDays = 0;
  if (ps.mode === 'months' && ps.months > 0) {
    // Måldatum = idag + önskade månader (befintligt recept räknas in).
    // Clampa dagen till sista dagen i målmånaden för att undvika rullover:
    // t.ex. 31 jan + 1 mån ska ge 28 feb, inte 3 mars.
    // Date.UTC(år, månad+1, 0) returnerar sista dagen i den aktuella månaden.
    const tYear  = today.getUTCFullYear();
    const tMonth = today.getUTCMonth() + ps.months;
    const tDay   = today.getUTCDate();
    const lastDayOfTargetMonth = new Date(Date.UTC(tYear, tMonth + 1, 0)).getUTCDate();
    const targetEnd = new Date(Date.UTC(tYear, tMonth, Math.min(tDay, lastDayOfTargetMonth)));
    totalDays = getDaysDiff(targetEnd, startDate);
    if (totalDays <= 0) {
      // Befintligt recept täcker redan hela perioden — inget nytt behövs
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

/* Uppdatera enbart resultatrutan (bevarar fokus i inmatningsfält) */
function updatePrescribeResult(i) {
  const box = getEl('ps-result-' + i);
  if (!box) return;
  const res = calcPrescribeResult(i);
  box.textContent = '';
  if (!res || !res.packages) return;

  const wrap   = document.createElement('div'); wrap.className = 'prescribe-result';
  const lbl    = document.createElement('div'); lbl.className  = 'prescribe-result-label'; lbl.textContent = 'Antal förpackningar att förskriva';
  const numRow = document.createElement('div'); numRow.className = 'prescribe-result-num-row';
  const numEl  = document.createElement('div'); numEl.className  = 'prescribe-result-packages'; numEl.textContent = String(res.packages);
  const unitEl = document.createElement('div'); unitEl.className = 'prescribe-result-unit';
  unitEl.textContent = res.packageSize > 0 ? `förp.  à ${res.packageSize} st` : 'förp.';
  numRow.appendChild(numEl); numRow.appendChild(unitEl);

  const det    = document.createElement('div'); det.className  = 'prescribe-result-details';
  det.textContent = `${res.totalTablets} tabletter ÷ ${res.packageSize} st/förp.`;

  const period = document.createElement('div'); period.className = 'prescribe-result-period';
  period.textContent = `${res.startDateStr} – ${res.endDateStr}`;

  const days   = document.createElement('div'); days.className = 'prescribe-result-days';
  days.textContent = `${res.totalDays} dagar`;

  wrap.appendChild(lbl); wrap.appendChild(numRow); wrap.appendChild(det);
  wrap.appendChild(period); wrap.appendChild(days);
  box.appendChild(wrap);
  renderPrescribeSummary();
}

/* Bygg hela panelens innehåll (anropas vid initiering och lägesbyte) */
function buildPrescribeInner(i) {
  const inner = getEl('prescribeInner');
  if (!inner) return;
  const s  = states[i] || {};
  const ps = prescribeState[i];
  if (!ps) return;
  inner.textContent = '';

  // Läkemedelsnamn
  const nameDiv = document.createElement('div');
  nameDiv.className = 'prescribe-med-name';
  nameDiv.textContent = s.medRaw || `Läkemedel ${i+1}`;
  inner.appendChild(nameDiv);

  // Förpackningsstorlek
  const pkgDiv = document.createElement('div'); pkgDiv.className = 'field'; pkgDiv.style.marginTop = '10px';
  const pkgLbl = document.createElement('label'); pkgLbl.textContent = 'Förpackningsstorlek (st)'; pkgLbl.setAttribute('for', 'ps-pkg-' + i);
  const pkgInp = document.createElement('input');
  pkgInp.type = 'number'; pkgInp.id = 'ps-pkg-' + i; pkgInp.min = '1';
  pkgInp.placeholder = 'T.ex. 30'; pkgInp.value = ps.packageSize || '';
  pkgInp.addEventListener('input', () => { prescribeState[i].packageSize = pkgInp.value; updatePrescribeResult(i); });
  pkgDiv.appendChild(pkgLbl); pkgDiv.appendChild(pkgInp);
  inner.appendChild(pkgDiv);

  // Fr.o.m.-info
  const res      = calcPrescribeResult(i);
  const infoDiv  = document.createElement('div'); infoDiv.className = 'prescribe-info-row';
  const iLbl     = document.createElement('div'); iLbl.className = 'prescribe-info-label'; iLbl.textContent = 'Förskrivning fr.o.m.';
  const iVal     = document.createElement('div'); iVal.className = 'prescribe-info-val'; iVal.textContent = res ? res.startDateStr : '—';
  infoDiv.appendChild(iLbl); infoDiv.appendChild(iVal);
  if (res && res.daysAlreadyCovered > 0) {
    const iSub = document.createElement('div'); iSub.className = 'prescribe-info-sub';
    iSub.textContent = `Nuv. recept täcker ${res.daysAlreadyCovered} dagar`;
    infoDiv.appendChild(iSub);
  }
  inner.appendChild(infoDiv);

  // Läge-växlare: Månader / Datum
  const toggleDiv = document.createElement('div'); toggleDiv.className = 'prescribe-mode-toggle';
  ['months','date'].forEach(mode => {
    const btn = document.createElement('button'); btn.type = 'button';
    btn.className = 'prescribe-mode-btn' + (ps.mode === mode ? ' active' : '');
    btn.textContent = mode === 'months' ? 'Månader' : 'Datum';
    btn.addEventListener('click', () => { prescribeState[i].mode = mode; buildPrescribeInner(i); });
    toggleDiv.appendChild(btn);
  });
  inner.appendChild(toggleDiv);

  // Varaktighet — månader eller slutdatum
  const durDiv = document.createElement('div'); durDiv.className = 'field';
  if (ps.mode === 'months') {
    const durLbl = document.createElement('label'); durLbl.textContent = 'Förskriva i antal månader'; durLbl.setAttribute('for', 'ps-months-' + i);
    const durSel = document.createElement('select'); durSel.id = 'ps-months-' + i; durSel.className = 'prescribe-select';
    [1,2,3,4,5,6,7,8,9,10,11,12].forEach(m => {
      const opt = document.createElement('option'); opt.value = String(m);
      opt.textContent = m === 1 ? '1 månad' : `${m} månader`;
      if (m === ps.months) opt.selected = true;
      durSel.appendChild(opt);
    });
    durSel.addEventListener('change', () => { prescribeState[i].months = parseInt(durSel.value, 10); updatePrescribeResult(i); });
    durDiv.appendChild(durLbl); durDiv.appendChild(durSel);
  } else {
    const durLbl = document.createElement('label'); durLbl.textContent = 'Förskriva t.o.m.'; durLbl.setAttribute('for', 'ps-enddate-' + i);
    const durInp = document.createElement('input');
    durInp.type = 'text'; durInp.id = 'ps-enddate-' + i; durInp.inputMode = 'numeric';
    durInp.placeholder = 'ÅÅÅÅ-MM-DD'; durInp.maxLength = 10; durInp.value = ps.endDate || '';
    durInp.setAttribute('autocomplete','off');
    durInp.addEventListener('input', () => {
      autoFormatDate(durInp);
      prescribeState[i].endDate = durInp.value;
      updatePrescribeResult(i);
    });
    durDiv.appendChild(durLbl); durDiv.appendChild(durInp);
  }
  inner.appendChild(durDiv);

  // Platshållare för resultatruta (updatePrescribeResult fyller den)
  const resultBox = document.createElement('div'); resultBox.id = 'ps-result-' + i;
  inner.appendChild(resultBox);
  updatePrescribeResult(i);
}

/* Uppdatera sammanfattningslistan högst upp i panelen */
function renderPrescribeSummary() {
  const box = getEl('prescribeSummary');
  if (!box) return;

  // Samla alla läkemedel som kan förnyas och har prescribeState
  const items = [];
  for (let i = 0; i < medCardCount; i++) {
    const s = states[i] || {};
    const ps = prescribeState[i];
    if (!ps) continue;
    const canRenew = s.valid && s.calculable !== false &&
      ((!s.isOveruse && !s.isTooEarly) ||
       ((s.isOveruse || s.isTooEarly) && s.earlyRenewalDecision === 'yes'));
    if (!canRenew) continue;
    const res = calcPrescribeResult(i);
    const pkgSize = parseFloat(ps.packageSize) || 0;
    items.push({ i, name: s.medRaw || `Läkemedel ${i + 1}`, packages: res ? res.packages : 0, pkgSize });
  }

  box.textContent = '';
  if (items.length < 2) { box.style.display = 'none'; return; }
  box.style.display = 'block';

  const wrap = document.createElement('div');
  wrap.className = 'prescribe-summary-wrap';

  const hdr = document.createElement('div');
  hdr.className = 'prescribe-summary-header';
  hdr.textContent = 'Sammanställning av läkemedel att förskriva';
  wrap.appendChild(hdr);

  const list = document.createElement('div');
  list.className = 'prescribe-summary-list';

  items.forEach(({ i, name, packages, pkgSize }) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'prescribe-summary-row' + (i === activeMedIdx ? ' active' : '');

    const nameEl = document.createElement('span');
    nameEl.className = 'prescribe-summary-name';
    nameEl.textContent = name;

    const rightEl = document.createElement('span');
    rightEl.className = 'prescribe-summary-right';

    const pkgEl = document.createElement('span');
    pkgEl.className = 'prescribe-summary-pkg';
    pkgEl.textContent = packages ? `${packages} förp.` : '—';

    if (pkgSize > 0) {
      const sizeEl = document.createElement('span');
      sizeEl.className = 'prescribe-summary-size';
      sizeEl.textContent = `à ${pkgSize} st`;
      rightEl.appendChild(pkgEl);
      rightEl.appendChild(sizeEl);
    } else {
      rightEl.appendChild(pkgEl);
    }

    row.appendChild(nameEl);
    row.appendChild(rightEl);
    row.addEventListener('click', () => selectMed(i));
    list.appendChild(row);
  });

  wrap.appendChild(list);
  box.appendChild(wrap);
}

/* Visa/dölj och initiera panelen för givet läkemedelsindex */
function renderPrescribePanel(i) {
  const panel = getEl('prescribePanel');
  if (!panel) return;
  const s = states[i] || {};

  const canRenew = s.valid && s.calculable !== false &&
    ((!s.isOveruse && !s.isTooEarly) ||
     ((s.isOveruse || s.isTooEarly) && s.earlyRenewalDecision === 'yes'));

  if (!canRenew) { panel.classList.add('is-hidden'); return; }
  panel.classList.remove('is-hidden');

  // Initialt state för detta läkemedel
  if (!prescribeState[i]) {
    prescribeState[i] = { mode: 'months', months: 7, endDate: '', packageSize: String(s.amt || '') };
  } else {
    // Uppdatera bara om fältet är tomt — bevara manuell inmatning från läkaren
    if (!prescribeState[i].packageSize) {
      prescribeState[i].packageSize = String(s.amt || '');
    }
  }

  buildPrescribeInner(i);
  renderPrescribeSummary();
}

/* Lägg till / ta bort läkemedel */
function addMedCard() {
  if (medCardCount>=8) return;
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
  states[i] = { activeTab:'patient', patientLang:'sv' };
  prescribeState[i] = null;
  buildMedList();
  renderFormForMed(i);
  renderResultForMed(i);
  // Återställ formulärfält
  const fields = ['medInput','doseInput','amtInput','refInput','leftInput'];
  fields.forEach(id => { const el=getEl(id); if (el) { el.value=''; toggleError(el,false); } });
  const dateEl = getEl('dateInput'); if (dateEl) { dateEl.value=todayStr(); toggleError(dateEl,false); }
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
  renderResultForMed(0);
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

// === FLIK 2: LÅNGVARIG FÖRBRUKNING ===
function periodRowTemplate(idx) {
  const labelClass = 'section-label';
  const eidx=escapeHtml(idx), eidx1=escapeHtml(idx+1);
  const eStart=escapeHtml(oneYearAgoStr()), eEnd=escapeHtml(todayStr());
  return `
    <div class="${labelClass}">Period ${eidx1}</div>
    <div class="form-row-3" id="lt-period-${eidx}">
      <div class="field"><label for="lt-start-${eidx}" data-tooltip="Startdatum för perioden — vanligen förskrivnings- eller uthämtningsdatum.">Startdatum</label>
        <input id="lt-start-${eidx}" type="text" inputmode="numeric" placeholder="ÅÅÅÅ-MM-DD" pattern="\\d{4}-\\d{2}-\\d{2}" maxlength="10" autocomplete="off" value="${eStart}"></div>
      <div class="field"><label for="lt-total-${eidx}" data-tooltip="Totalt antal tabletter eller kapslar uttagna under perioden. Hämtas från apotekskvitto eller journaldokumentation.">Antal uttagna tabletter</label>
        <input id="lt-total-${eidx}" type="number" placeholder="100" min="1"></div>
      <div class="field"><label for="lt-end-${eidx}" data-tooltip="Slutdatum för perioden — när medicinen tog slut eller nästa recept utfärdades.">Slutdatum</label>
        <input id="lt-end-${eidx}" type="text" inputmode="numeric" placeholder="ÅÅÅÅ-MM-DD" pattern="\\d{4}-\\d{2}-\\d{2}" maxlength="10" autocomplete="off" value="${eEnd}"></div>
    </div>
    ${idx>0?`<button class="btn btn-ghost" style="font-size:11px;margin-bottom:8px" data-action="remove-period" data-idx="${eidx}">✕ Ta bort period ${eidx1}</button>`:''}`;
}
function buildPeriodContainer() {
  const container = getEl('lt-periods-container'); if (!container) return;
  container.textContent='';
  for (let i=0;i<ltPeriodCount;i++) {
    const div=document.createElement('div'); div.id=`lt-period-wrap-${i}`;
    div.innerHTML=periodRowTemplate(i); container.appendChild(div);
  }
}
function collectRawPeriods() {
  const out=[];
  for (let i=0;i<ltPeriodCount;i++) {
    out.push({ start:(getEl('lt-start-'+i)||{}).value||'', total:(getEl('lt-total-'+i)||{}).value||'', end:(getEl('lt-end-'+i)||{}).value||'' });
  }
  return out;
}
function addPeriod() {
  if (ltPeriodCount>=10) return;
  const periods=collectRawPeriods(); ltPeriodCount++;
  buildPeriodContainer();
  periods.forEach((p,i)=>{ const s=getEl('lt-start-'+i);if(s&&p.start)s.value=p.start; const t=getEl('lt-total-'+i);if(t&&p.total)t.value=p.total; const e=getEl('lt-end-'+i);if(e&&p.end)e.value=p.end; });
  calcLongterm();
}
function removePeriod(idx) {
  const periods=collectRawPeriods(); periods.splice(idx,1);
  ltPeriodCount=Math.max(1,ltPeriodCount-1); buildPeriodContainer();
  periods.forEach((p,i)=>{ const s=getEl('lt-start-'+i);if(s)s.value=p.start; const t=getEl('lt-total-'+i);if(t)t.value=p.total; const e=getEl('lt-end-'+i);if(e)e.value=p.end; });
  calcLongterm();
}
function clearLongterm() {
  const m=getEl('lt-med');if(m)m.value=''; const d=getEl('lt-dose');if(d){d.value='';toggleError(d,false);}
  ltPeriodCount=1; buildPeriodContainer();
  ['lt-alerts','lt-overlap-alert','lt-resGrid','lt-period-rows'].forEach(id=>{ const e=getEl(id);if(e)e.textContent=''; });
  showEl('lt-result',false); showEl('lt-copySection',false); showEl('lt-fassBtn',false);
  showEl('lt-bar-section',false); showEl('lt-period-table-section',false);
}
function calcLongterm() {
  resetTimer();
  const medEl=getEl('lt-med'), doseEl=getEl('lt-dose');
  if (!medEl||!doseEl) return;
  const medRaw=medEl.value.trim(), doseRaw=doseEl.value;
  const ordDose=parseFloat(doseRaw.replace(',','.'));
  const doseIsInvalid=doseRaw!==''&&(isNaN(ordDose)||ordDose<0.1||ordDose>50);
  toggleError(doseEl,doseIsInvalid);
  const today=getToday();
  const periods=[];
  for (let i=0;i<ltPeriodCount;i++) {
    const startEl=getEl('lt-start-'+i), totalEl=getEl('lt-total-'+i), endEl=getEl('lt-end-'+i);
    const startDate=parseDateUTC(startEl?startEl.value:''), endDate=parseDateUTC(endEl?endEl.value:'');
    const totalVal=parseFloat(totalEl?totalEl.value:'');
    const startInvalid=startEl&&startEl.value!==''&&(!startDate||startDate>today);
    const endInvalid=endEl&&endEl.value!==''&&(!endDate||(startDate&&endDate<=startDate));
    const totalInvalid=totalEl&&totalEl.value!==''&&(isNaN(totalVal)||totalVal<=0);
    toggleError(startEl,!!startInvalid); toggleError(endEl,!!endInvalid); toggleError(totalEl,!!totalInvalid);
    if (startDate&&endDate&&!isNaN(totalVal)&&totalVal>0&&startDate<endDate) {
      const days=getDaysDiff(endDate,startDate);
      if (days===0||days>365*50) continue;
      periods.push({startDate,endDate,total:totalVal,days,avgPerDay:totalVal/days});
    }
  }
  if (!medRaw||doseIsInvalid||isNaN(ordDose)||periods.length===0) { showEl('lt-result',false); return; }
  periods.sort((a,b)=>a.startDate-b.startDate);
  showEl('lt-result', true, 'flex');
  const ltAlerts=getEl('lt-alerts');if(ltAlerts)ltAlerts.textContent='';
  const ltOverlap=getEl('lt-overlap-alert');if(ltOverlap)ltOverlap.textContent='';
  if (periods.length>1) {
    for (let i=0;i<periods.length-1;i++) {
      if (periods[i].endDate>periods[i+1].startDate) { renderAlert('lt-overlap-alert','warn','Överlappande perioder','Tidsperioderna överlappar varandra. Kontrollera att alla perioder är disjunkta.'); break; }
    }
  }
  const totalTablets=periods.reduce((s,p)=>s+p.total,0);
  const totalDays=periods.reduce((s,p)=>s+p.days,0);
  if (totalDays===0) { showEl('lt-result',false); return; }
  const overallAvg=totalTablets/totalDays;
  const consumptionPct=(overallAvg/ordDose)*100;
  const doseUnit=extractDoseUnit(medRaw);
  let avgStr=`${overallAvg.toFixed(2)} st/dag`;
  if (doseUnit) avgStr+=` (${(overallAvg*doseUnit.amount).toFixed(1)} ${doseUnit.unit}/dag)`;

  const resGridEl=getEl('lt-resGrid');
  if (resGridEl) {
    resGridEl.textContent=''; const frag=document.createDocumentFragment();
    buildResultRow(frag,'Analyserade perioder',`${periods.length} st`);
    buildResultRow(frag,'Total analyslängd',`${totalDays} dagar`);
    buildResultRow(frag,'Totalt uttagna tabletter',`${totalTablets} st`);
    const hr=document.createElement('hr');hr.className='divider';frag.appendChild(hr);
    buildResultRow(frag,'Ordinerad dos',`${ordDose} st/dag`);
    buildResultRow(frag,'Snittförbrukning',avgStr);
    buildResultRow(frag,'Relativt ordination',`${consumptionPct.toFixed(1)}%`);
    resGridEl.appendChild(frag);
  }

  const OVER=1.10, UNDER=0.80;
  let overallStatus, alertType, alertTitle, alertMsg;
  if (overallAvg>ordDose*OVER) { overallStatus='over';alertType='danger';alertTitle='Förbrukning överstiger ordination';alertMsg=`Snitt ${avgStr} är ${(consumptionPct-100).toFixed(1)}% över ordinerad dos (${ordDose} st/dag). Gör en individuell klinisk bedömning.`; }
  else if (overallAvg<ordDose*UNDER) { overallStatus='under';alertType='warn';alertTitle='Låg förbrukning';alertMsg=`Snitt ${avgStr} är ${(100-consumptionPct).toFixed(1)}% under ordinerad dos (${ordDose} st/dag). Överväg om patienten tar medicinen som ordinerat.`; }
  else { overallStatus='ok';alertType='ok';alertTitle='Förbrukning enligt ordination';alertMsg=`Snitt ${avgStr} är i linje med ordinerad dos (${ordDose} st/dag), avvikelse ${Math.abs(consumptionPct-100).toFixed(1)}%.`; }
  renderAlert('lt-alerts',alertType,alertTitle,alertMsg);

  const barPct=Math.min(150,Math.max(0,consumptionPct));
  const barEl=getEl('lt-bar');
  if (barEl) { barEl.style.width=`${(barPct/150)*100}%`; barEl.className=`consumption-bar ${overallStatus}`; barEl.textContent=barPct>20?`${consumptionPct.toFixed(0)}%`:''; }
  showEl('lt-bar-section',true);

  const rowsContainer=getEl('lt-period-rows');
  if (rowsContainer) {
    rowsContainer.textContent=''; const frag=document.createDocumentFragment();
    periods.forEach(p=>{
      const pPct=(p.avgPerDay/ordDose)*100;
      let badgeClass,badgeText;
      if (p.avgPerDay>ordDose*OVER){badgeClass='badge-over';badgeText='Över';}
      else if (p.avgPerDay<ordDose*UNDER){badgeClass='badge-under';badgeText='Under';}
      else {badgeClass='badge-ok';badgeText='OK';}
      const row=document.createElement('div');row.className='period-row';
      const c1=document.createElement('span');c1.className='period-cell';c1.textContent=`${fmtDate(p.startDate)} – ${fmtDate(p.endDate)} (${p.days}d)`;
      const c2=document.createElement('span');c2.className='period-cell mono ph-avg';c2.textContent=`${p.avgPerDay.toFixed(2)} st/dag`;
      const c3=document.createElement('span');c3.className='period-cell mono';c3.textContent=`${pPct>=100?'+':''}${(pPct-100).toFixed(1)}%`;
      const c4=document.createElement('span');c4.className='period-cell';
      const badge=document.createElement('span');badge.className=`badge ${badgeClass}`;badge.textContent=badgeText;c4.appendChild(badge);
      row.appendChild(c1);row.appendChild(c2);row.appendChild(c3);row.appendChild(c4);frag.appendChild(row);
    });
    rowsContainer.appendChild(frag);
  }
  showEl('lt-period-table-section',true);

  if (medRaw) { const lb=getEl('lt-fassBtn');if(lb){lb.href=getFassUrl(medRaw);showEl('lt-fassBtn',true,'inline-flex');} }

  const periodSummary=periods.map((p,idx)=>`  Period ${idx+1}: ${fmtDate(p.startDate)}–${fmtDate(p.endDate)} (${p.days} dagar, ${p.total} tabletter, snitt ${p.avgPerDay.toFixed(2)} st/dag)`).join('\n');
  const journalText=`Aktuellt: Förbrukningsanalys av ${medRaw}.\n\nOrdinerad dos: ${ordDose} st/dag.\nAnalysperiod: ${periods.length} period(er), totalt ${totalDays} dagar.\n\nPerioder:\n${periodSummary}\n\nSammanlagd snittförbrukning: ${avgStr} (${consumptionPct.toFixed(1)}% av ordinerad dos).\n\nBedömning: [fyll i här]`;
  const copyBody=getEl('lt-copyBody');if(copyBody)copyBody.textContent=journalText;
  showEl('lt-copySection',true);
}

const ltCopyTimers=new Map();
function copyLtText() {
  const body=getEl('lt-copyBody'), text=body?body.textContent:'';
  const btn=getEl('ltCopyBtn');
  navigator.clipboard.writeText(text).then(()=>{
    if(!btn)return;
    const orig=btn.dataset.origLabel||btn.textContent;btn.dataset.origLabel=orig;btn.textContent='✅ Kopierat!';
    if(ltCopyTimers.has(btn))clearTimeout(ltCopyTimers.get(btn));
    const t=setTimeout(()=>{btn.textContent=orig;delete btn.dataset.origLabel;ltCopyTimers.delete(btn);},1800);
    ltCopyTimers.set(btn,t);
  }).catch(()=>{if(btn)btn.textContent='⚠️ Kopiera manuellt';});
}

// === INITIERING ===
// Tema
try { applyTheme(localStorage.getItem('theme')||'klinisk'); }
catch(e) { applyTheme('klinisk'); }

// Bygg initial state
buildMedList();
renderFormForMed(0);
renderResultForMed(0);
ltPeriodCount=1;
buildPeriodContainer();

// Event delegation: formulärinput
const formPanel = getEl('formPanel');
if (formPanel) {
  formPanel.addEventListener('input', e => {
    if (e.target.id==='medInput') updateNarcBadge(e.target.value);
    if (e.target.id==='dateInput') autoFormatDate(e.target);
    saveFormValues(activeMedIdx);
    ensureDebounce(activeMedIdx); calcDebounced[activeMedIdx]();
  });
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
  periodsContainer.addEventListener('input', e => { if (e.target.matches('input[type="text"]')) autoFormatDate(e.target); calcLongtermDebounced(); });
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
  if (ltPeriodCount>0) calcLongterm();
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
  for(let i=0;i<ltPeriodCount;i++){
    const se=getEl('lt-start-'+i);if(se)se.value='';
    const te=getEl('lt-total-'+i);if(te)te.value='';
    const ee=getEl('lt-end-'+i);if(ee)ee.value='';
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
