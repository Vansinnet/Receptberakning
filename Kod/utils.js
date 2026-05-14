const VALID_THEMES     = new Set(['dark','klinisk','sakura']);
const SAFE_ALERT_TYPES = new Set(['danger','warn','info','ok']);
const VALID_INTERVALS  = [1, 7, 30];


function debounce(fn, wait = 120) {
  let t;
  const d = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
  d.cancel = () => clearTimeout(t);
  return d;
}

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

/* DOM-hjälpfunktioner */
function getEl(id) { return document.getElementById(id); }

// Skapar ett DOM-element med valfria egenskaper.
// cls: className-sträng, text: textContent, value: node.value (input/select/option),
// style: cssText-sträng, attrs: objekt med setAttribute-par, dataset: objekt med dataset-par.
function el(tag, { cls, text, value, style, attrs, dataset } = {}) {
  const node = document.createElement(tag);
  if (cls   !== undefined) node.className    = cls;
  if (text  !== undefined) node.textContent  = text;
  if (value !== undefined) node.value        = value;
  if (style !== undefined) node.style.cssText = style;
  if (attrs)   for (const [k, v] of Object.entries(attrs))   node.setAttribute(k, String(v));
  if (dataset) for (const [k, v] of Object.entries(dataset)) node.dataset[k] = String(v);
  return node;
}

function toggleError(el, isInvalid) {
  if (!el) return;
  el.classList.toggle('input-error', isInvalid);
  isInvalid ? el.setAttribute('aria-invalid','true') : el.removeAttribute('aria-invalid');
}

// Sätter eller rensar fel på ett namngivet fält plus dess felmeddelande-span.
// message='' rensar felet; annars visas texten under fältet och läses av skärmläsare.
function setFieldError(inputId, message) {
  const input  = getEl(inputId);
  const errEl  = getEl(inputId + '-err');
  const isInvalid = message !== '';
  toggleError(input, isInvalid);
  if (errEl) {
    errEl.textContent = message;
    errEl.classList.toggle('visible', isInvalid);
  }
}

function buildAlertEl(type, title, message) {
  const safeType = SAFE_ALERT_TYPES.has(type) ? type : 'info';
  const div = el('div', { cls: `alert alert-${safeType}` });
  if (title) {
    div.appendChild(el('strong', { text: title }));
    div.appendChild(document.createTextNode(' '));
  }
  div.appendChild(document.createTextNode(message));
  return div;
}

function renderAlert(containerId, type, title, message) {
  const container = getEl(containerId); if (!container) return;
  container.textContent = '';
  container.appendChild(buildAlertEl(type, title, message));
}

function showEl(id, show, displayValue = 'block') {
  const e = getEl(id); if (e) e.style.display = show ? displayValue : 'none';
}

function showToast(msg, durationMs = 3000) {
  // Ta bort eventuellt tidigare toast så att de inte staplas vid snabba anrop.
  const prev = document.querySelector('.toast-flash');
  if (prev) prev.remove();

  const div = el('div', { cls: 'toast-flash', text: msg, attrs: { role: 'status', 'aria-live': 'polite' } });
  document.body.appendChild(div);
  requestAnimationFrame(() => div.classList.add('visible'));
  setTimeout(() => {
    div.classList.remove('visible');
    setTimeout(() => div.remove(), 200); // vänta ut fade-out-transition
  }, durationMs);
}

/* Datumverktyg */
function todayStr() {
  return fmtDate(getToday());
}

function oneYearAgoStr() {
  const n = new Date();
  const d = new Date(Date.UTC(n.getFullYear()-1, n.getMonth(), n.getDate()));
  return fmtDate(d);
}

function fmtDate(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}

let _todayCache = null, _todayCacheKey = '';
function getToday() {
  const n = new Date();
  const key = `${n.getFullYear()}-${n.getMonth()}-${n.getDate()}`;
  if (_todayCache && _todayCacheKey === key) return _todayCache;
  _todayCache = new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
  _todayCacheKey = key;
  return _todayCache;
}

function getDaysDiff(d1,d2) { return Math.round((d1-d2)/86400000); }

function extractDoseUnit(medRaw) {
  // Längre former (mikrogram, microgram, gram) måste stå före kortare (µg, mcg, g)
  // så att t.ex. "50 gram" inte felmatchar på enbart "g".
  const m = medRaw.match(/(\d+(?:[.,]\d+)?)\s*(mg|ml|µg|mikrogram|microgram|mcg|nanogram|gram|ng|IU|IE|g)\b/i);
  if (!m) return null;
  const amount  = parseFloat(m[1].replace(',', '.'));
  const rawUnit = m[2].toLowerCase();
  const NORMALIZE = { mikrogram: 'µg', microgram: 'µg', mcg: 'µg', nanogram: 'ng', gram: 'g', ie: 'IE', iu: 'IE' };
  const unit = NORMALIZE[rawUnit] ?? rawUnit;
  return { amount, unit };
}

function getFassUrl(medRaw, nplId) {
  if (nplId) return `https://www.fass.se/LIF/product?nplId=${nplId}&userType=0`;
  const url = `https://www.fass.se/LIF/result?query=${encodeURIComponent(medRaw.trim())}&userType=0`;
  return url.startsWith('https://www.fass.se/') ? url : '#';
}

let _mfrRe;
function buildMfrRe() {
  if (_mfrRe) return _mfrRe;
  let compounds = [
    "Medical Valley", "Abacus Medicine", "EQL Pharma",
    "G\\.L\\.\\s*Pharma", "1A Farma", "Omet Pharma", "Nordic Drugs"
  ];
  let singles = [
    "STADA", "Sandoz", "Accord(?:pharma)?", "Teva", "Krka", "Ebb",
    "Viatris", "Orion", "Actavis", "Zentiva", "Orifarm", "Bluefish",
    "Glenmark", "Evolan", "APL", "ABECE", "Avansor", "Apofri",
    "SUN", "Amarox", "Aurobindo", "Hexal", "HEXAL", "Alternova",
    "Mylan", "Bijon", "Grindeks", "Newbury", "Jubilant", "Strides",
    "Holsten", "Vitabalans", "Medartuum", "Abcur", "2care4",
    "Amdipharm", "Brown", "Pfizer", "Xiromed", "Accordpharma", "Pilum",
    "Rivopharm", "Novum", "Aristo", "Tillomed", "Waymade", "Baxter"
  ];
  const all = compounds.concat(singles);
  _mfrRe = new RegExp("\\b(?:" + all.join("|") + ")\\b", "gi");
  return _mfrRe;
}

function stripManufacturer(name) {
  if (!name) return name;
  return name.replace(buildMfrRe(), "").replace(/\s+/g, " ").trim();
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

/* Resultattabell-rad */
function buildResultRow(frag, label, valueText, badgeNode=null) {
  const rk = el('span', { cls: 'rk', text: label });
  const rv = el('span', { cls: 'rv', text: valueText });
  if (badgeNode) { rv.appendChild(document.createTextNode(' ')); rv.appendChild(badgeNode); }
  frag.appendChild(rk);
  frag.appendChild(rv);
}

/* Delad klippbordsfunktion */
const _copyTimers = {};
function copyTextToClipboard(bodyId, btnId, timerKey) {
  const body = getEl(bodyId), text = body ? body.textContent : '';
  const btn = getEl(btnId);
  if (!navigator.clipboard) { if (btn) btn.textContent = '⚠️ Kopiera manuellt'; return; }
  navigator.clipboard.writeText(text).then(() => {
    if (!btn) return;
    const orig = btn.dataset.origLabel || btn.textContent;
    btn.dataset.origLabel = orig;
    btn.textContent = '✅ Kopierat!';
    const ann = getEl('a11y-announce'); if (ann) ann.textContent = 'Text kopierad till urklipp.';
    if (_copyTimers[timerKey]) clearTimeout(_copyTimers[timerKey]);
    _copyTimers[timerKey] = setTimeout(() => {
      btn.textContent = orig;
      delete btn.dataset.origLabel;
      delete _copyTimers[timerKey];
    }, 1800);
  }).catch(() => { if (btn) btn.textContent = '⚠️ Kopiera manuellt'; });
}