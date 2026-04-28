  /* ────────────────────────────────────────────
     STORAGE POLICY (GDPR)
     localStorage: endast 'theme'
     Klinisk data: endast i minnet (states[])
  ─────────────────────────────────────────── */

  const VALID_THEMES = new Set(['dark','klinisk','lazerwave']);
  const SAFE_ALERT_TYPES = new Set(['danger','warn','info','ok']);

  // Escapa HTML-specialtecken — används i template-strängar som sätts in via innerHTML.
  // Skyddar mot XSS om ett framtida värde råkar innehålla användardata.
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  let states = [{}];
  let medCardCount = 1;
  let warnTimer, clearTimer, countdownInt;
  let ltPeriodCount = 0;

  /* ────────────────────────────────────────────
     Prestanda: debounce (UX-säkert)
  ─────────────────────────────────────────── */
  function debounce(fn, wait = 120) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  const calcDebounced = [];
  // Säkerställ att debounce-funktionen är initialiserad för kort-index i.
  // Guard mot race conditions: returnera direkt om redan initialiserad.
  function ensureDebounce(i) {
    if (calcDebounced[i]) return;
    while (calcDebounced.length <= i) {
      const idx = calcDebounced.length;
      calcDebounced.push(debounce(() => calc(idx), 120));
    }
  }
  const calcLongtermDebounced = debounce(() => calcLongterm(), 150);

  /* ────────────────────────────────────────────
     Datumformatering: auto YYYY-MM-DD
  ─────────────────────────────────────────── */
  function autoFormatDate(input) {
    const val = input.value;
    const sel = input.selectionStart;

    let raw = val.replace(/\D/g, '').substring(0, 8);
    let formatted = raw;
    if (raw.length > 4) formatted = raw.substring(0, 4) + '-' + raw.substring(4);
    if (raw.length > 6) formatted = raw.substring(0, 4) + '-' + raw.substring(4, 6) + '-' + raw.substring(6);

    if (formatted === val) return; // Inget ändrat, hoppa över
    input.value = formatted;

    // Räkna siffror FÖRE markören i originalsträngen,
    // placera sedan markören efter samma antal siffror i det formaterade resultatet.
    // Detta hanterar backspace korrekt utan att markören hoppar.
    const digitsBeforeCursor = val.substring(0, sel).replace(/\D/g, '').length;
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

  /* ────────────────────────────────────────────
     Hjälpfunktioner
  ─────────────────────────────────────────── */
  function getEl(id) {
    const el = document.getElementById(id);
    if (!el) console.error(`Kritiskt fel: Elementet '${id}' saknas i DOM.`);
    return el;
  }

  function toggleError(el, isInvalid) {
    if (!el) return;
    el.classList.toggle('input-error', isInvalid);
    if (isInvalid) {
      el.setAttribute('aria-invalid', 'true');
    } else {
      el.removeAttribute('aria-invalid');
    }
  }

  function renderAlert(containerId, type, title, message) {
    const container = getEl(containerId);
    if (!container) return;
    container.textContent = '';
    const safeType = SAFE_ALERT_TYPES.has(type) ? type : 'info';
    const div = document.createElement('div');
    div.className = `alert alert-${safeType}`;
    if (title) {
      const strong = document.createElement('strong');
      strong.textContent = title;
      div.appendChild(strong);
      div.appendChild(document.createTextNode(' '));
    }
    div.appendChild(document.createTextNode(message));
    container.appendChild(div);
  }

  function setStatus(i, statusClass, text) {
    const isMuted = statusClass === 'muted';
    const sumDot = getEl('sumDot' + i);
    const sumVal = getEl('sumVal' + i);
    const dot = getEl('dot' + i);
    if (sumDot) sumDot.className = 'summary-dot' + (isMuted ? '' : ' ' + statusClass);
    if (sumVal) { sumVal.className = 'value ' + statusClass; sumVal.textContent = text; }
    if (dot) dot.className = 'card-status-dot' + (isMuted ? '' : ' ' + statusClass);
  }

  function todayStr() {
    // Använd UTC konsekvent med getToday() för att undvika datumskift nära midnatt
    const n = new Date();
    return `${n.getUTCFullYear()}-${String(n.getUTCMonth()+1).padStart(2,'0')}-${String(n.getUTCDate()).padStart(2,'0')}`;
  }

  function oneYearAgoStr() {
    const n = new Date();
    // Använd Date.UTC för korrekt hantering av skottdagar (t.ex. 29 feb → 1 mars föregående år)
    const d = new Date(Date.UTC(n.getUTCFullYear() - 1, n.getUTCMonth(), n.getUTCDate()));
    return fmtDate(d);
  }

  function fmtDate(d) {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  }

  /* ── Delade hjälpfunktioner (cache + återanvändning) ── */
  let _todayCache = null, _todayCacheKey = '';
  function getToday() {
    const n = new Date();
    const key = `${n.getUTCFullYear()}-${n.getUTCMonth()}-${n.getUTCDate()}`;
    if (_todayCache && _todayCacheKey === key) return _todayCache;
    _todayCache = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
    _todayCacheKey = key;
    return _todayCache;
  }

  function getDaysDiff(d1, d2) {
    return Math.round((d1 - d2) / 86400000);
  }

  // Extraherar styrka och enhet ur läkemedelsnamnet.
  // Hanterar mg, µg/mikrogram och ml — returnerar { amount, unit } eller null.
  function extractDoseUnit(medRaw) {
    const m = medRaw.match(/(\d+(?:[.,]\d+)?)\s*(mg|ml|µg|mikrogram)/i);
    if (!m) return null;
    const amount = parseFloat(m[1].replace(',', '.'));
    const rawUnit = m[2].toLowerCase();
    // Normalisera "mikrogram" → "µg" för enhetlig visning
    const unit = rawUnit === 'mikrogram' ? '\u00b5g' : rawUnit;
    return { amount, unit };
  }

  function getFassUrl(medRaw) {
    return `https://www.fass.se/LIF/result?query=${encodeURIComponent(medRaw.trim())}&userType=2`;
  }

  // ── Narkotikaklassade läkemedel (LVFS 2011:10 med ändringar) ──────────────
  // Senast kontrollerad mot Läkemedelsverkets förteckningar: 2026-04-28
  // Förteckning II  = Högt missbrukspotential, godkänd medicinsk användning
  // Förteckning III = Kombinations- och lågdospreparat (t.ex. kodein, buprenorfin)
  // Förteckning IV  = Lägre missbrukspotential (bensodiazepin, z-läkemedel, tramadol, pregabalin …)
  // Förteckning V   = Lägst potential (klometiazol)
  const NARCOTICS_LIST_DATE = '2026-04-28';
  const NARCOTICS_SCHEDULES = [
    // ── Förteckning II ─────────────────────────────────────────────────────
    { schedule: 'II', terms: [
      // Starka opioider
      'morfin','dolcontin','depolan','mst continus',
      'oxikodon','oxycodon','oxycontin','oxynorm','targiniq','zomestine','reltebon',
      'fentanyl','durogesic','matrifen','instanyl','abstral','pecfent','breakyl','recivit','vellofent',
      'actiq','effentora','ionsys',
      'metadon','methadone',
      'hydromorfon','hydromorphone','palladon',
      'tapentadol','palexia',
      'ketobemidon','ketogan',
      'petidin','pethidine',
      'alfentanil','rapifen',
      'sufentanil','sufenta','dzuveo',
      'remifentanil','ultiva',
      // Centralstimulantia
      'metylfenidat','methylphenidate','ritalin','concerta','medikinet','equasym','rubifen','inspiral','kinecteen',
      'lisdexamfetamin','lisdexamphetamine','elvanse','vyvanse',
      'amfetamin','amphetamine','attentin',
      'dexamfetamin','dexamphetamine','dexedrin',
      // Ketamin
      'ketamin','ketamine','ketalar',
      // GHB / natriumoxybat
      'natriumoxybat','xyrem',
      // Cannabis-baserat
      'nabilon','cesamet',
      'dronabinol','marinol',
      'sativex','nabiximols',
      // Barbiturater (hög risk)
      'pentobarbital',
      'amobarbital',
      // Flunitrazepam — förteckning II p.g.a. hög missbruksrisk (särskilt i Sverige)
      'flunitrazepam','rohypnol',
    ]},
    // ── Förteckning III ────────────────────────────────────────────────────
    { schedule: 'III', terms: [
      // Svagare opioider och kombinationspreparat
      'kodein','citodon','panocod','kodipront',
      'etylmorfin','cocillana',
      'dihydrokodein',
      // Buprenorfin (agonist/antagonist — förteckning III i Sverige)
      'buprenorfin','buprenorphine','temgesic','norspan','subutex','suboxone','buvidal','espranor','sublocade',
    ]},
    // ── Förteckning IV ─────────────────────────────────────────────────────
    { schedule: 'IV', terms: [
      // Bensodiazepiner
      'diazepam','stesolid','valium','apozepam',
      'alprazolam','xanax','xanor',
      'klonazepam','clonazepam','rivotril','iktorivil',
      'lorazepam','temesta',
      'oxazepam','oxascand','sobril',
      'nitrazepam','mogadon','apodorm',
      'temazepam','normison',
      'midazolam','dormicum','buccolam','epistatus',
      'triazolam','halcion',
      'klorazepat','tranxilium',
      'bromazepam','lexotan',
      'klobazam','clobazam','frisium','epaclob',
      // Z-läkemedel
      'zolpidem','stilnoct','zolpinox',
      'zopiklon','imovane','zoplida',
      'zaleplon','sonata',
      // Tramadol (narkotikaklassat sedan 2008)
      'tramadol','tiparol','tradolan',
      // Pregabalin (narkotikaklassat i Sverige fr.o.m. 2018-07-24)
      // OBS: Gabapentin är INTE narkotikaklassat i Sverige
      'pregabalin','lyrica','brigatox',
      // Modafinil
      'modafinil','modiodal',
      // Esketamin (Spravato — godkänt för behandlingsresistent depression)
      'esketamin','esketamine','spravato',
      // Fenobarbital (barbiturat med lägre missbrukspotential, används vid epilepsi)
      'fenobarbital','phenobarbital','fenemal',
    ]},
    // ── Förteckning V ──────────────────────────────────────────────────────
    { schedule: 'V', terms: [
      // Klometiazol — nationellt narkotikaförklarat
      'klometiazol','clomethiazole','heminevrin',
    ]},
  ];

  // Bygg en platt söktabell: { re: RegExp, schedule: string }[]
  // Förkompilerade regex med ordgräns (\b) — undviker falska positiver som
  // "morfinantagonist" → morfin, eller "deksamfetamin" → amfetamin.
  const NARCOTICS_RE = [];
  for (const { schedule, terms } of NARCOTICS_SCHEDULES) {
    for (const term of terms) {
      NARCOTICS_RE.push({ re: new RegExp(`\\b${term}\\b`, 'i'), schedule });
    }
  }

  function checkNarcotic(i) {
    const medEl = getEl('med' + i);
    const badge = getEl('narcBadge' + i);
    if (!medEl || !badge) return;
    const val = medEl.value;
    // Normalisera: ersätt siffror och decimaltecken med mellanslag så att
    // "Elvanse50mg" behandlas som "Elvanse mg" och matchar \bElvanse\b korrekt.
    // Utan detta missar \b matchning när preparat skrivs ihop med styrka utan mellanslag.
    const normalized = val.replace(/[\d.,]+/g, ' ');
    if (val.length < 3) { badge.style.display = 'none'; return; }
    const match = NARCOTICS_RE.find(({ re }) => re.test(normalized));
    if (match) {
      badge.textContent = `🔒 Narkotikaklassat – Förteckning ${match.schedule}`;
      badge.style.display = 'block';
    } else {
      badge.style.display = 'none';
    }
  }

  function buildResultRow(frag, label, valueText, badgeNode = null) {
    const rk = document.createElement('span'); rk.className = 'rk'; rk.textContent = label;
    const rv = document.createElement('span'); rv.className = 'rv'; rv.textContent = valueText;
    if (badgeNode) { rv.appendChild(document.createTextNode(' ')); rv.appendChild(badgeNode); }
    frag.appendChild(rk); frag.appendChild(rv);
  }

  function showEl(id, show, displayValue = 'block') {
    const e = getEl(id);
    if (e) e.style.display = show ? displayValue : 'none';
  }

  function resetResultPanel(i) {
    const rg = getEl('resGrid' + i);
    const al = getEl('alerts' + i);
    if (rg) rg.textContent = '';
    if (al) al.textContent = '';
    showEl('copySection' + i, false);
  }

  /* ────────────────────────────────────────────
     Flik-hantering (huvud)
  ─────────────────────────────────────────── */
  function switchMainTab(tab) {
    ['renew','longterm'].forEach(t => {
      const panel = getEl('panel-' + t);
      if (panel) panel.classList.toggle('active', t === tab);
    });
    document.querySelectorAll('.main-tab').forEach((btn, idx) => {
      btn.classList.toggle('active',
        (idx === 0 && tab === 'renew') ||
        (idx === 1 && tab === 'longterm')
      );
      btn.setAttribute('aria-selected', btn.classList.contains('active'));
    });
  }

  /* ────────────────────────────────────────────
     Inaktivitetstimer
  ─────────────────────────────────────────── */
  let lastActivityReset = 0;
  function resetTimer(isUserEvent = false) {
    const now = Date.now();
    if (isUserEvent && now - lastActivityReset < 2000) return;
    lastActivityReset = now;

    clearTimeout(warnTimer);
    clearTimeout(clearTimer);
    clearInterval(countdownInt);

    const toast = getEl('toast');
    const toastCount = getEl('toastCount');

    if (toast) toast.classList.remove('visible');

    warnTimer = setTimeout(() => {
      let s = 60;
      if (!toast || !toastCount) return;

      toastCount.textContent = String(s);
      toast.classList.add('visible');

      countdownInt = setInterval(() => {
        s--;
        if (toastCount) toastCount.textContent = String(s);
        if (s <= 0) clearInterval(countdownInt);
      }, 1000);
    }, 14 * 60 * 1000);

    clearTimer = setTimeout(() => {
      clearInterval(countdownInt);
      if (toast) toast.classList.remove('visible');
      confirmClearAll(true);
    }, 15 * 60 * 1000);
  }

  /* ────────────────────────────────────────────
     Tema
  ─────────────────────────────────────────── */
  function applyTheme(t) {
    const safeTheme = VALID_THEMES.has(t) ? t : 'klinisk';
    document.documentElement.setAttribute('data-theme', safeTheme);
    const selectBox = getEl('themeSelect');
    if (selectBox) selectBox.value = safeTheme;

    // Säker localStorage-lagring (kan vara blockerat i privat läge / vissa policys)
    try {
      localStorage.setItem('theme', safeTheme);
    } catch (e) {
      console.warn('Kunde inte spara tema till localStorage:', e);
    }
  }

  /* ────────────────────────────────────────────
     FLIK 1: RECEPTFÖRNYELSE
  ─────────────────────────────────────────── */
  function cardTemplate(i) {
    const removeBtnHtml = i > 0
      ? `<button class="btn btn-ghost btn-remove-inline" data-action="remove-card">✕ Ta bort</button>`
      : '';
    // escapeHtml på alla interpolerade värden — defensiv kodning om framtida refactoring
    // skulle byta ut numeriska index mot användardata.
    const ei = escapeHtml(i);
    const ei1 = escapeHtml(i + 1);
    const eDate = escapeHtml(todayStr());
    const eNarcDate = escapeHtml(NARCOTICS_LIST_DATE);
    return `
      <div class="card card-horizontal" id="card${ei}">
        <div class="card-header">
          <div class="card-header-left">
            <div class="card-num">${ei1}</div>
            <span class="card-title">Läkemedel ${ei1}</span>
          </div>
          <div class="row-inline-center">
            <div class="card-status-dot" id="dot${ei}"></div>
            ${removeBtnHtml}
          </div>
        </div>
        <div class="card-body">
          <div class="card-form-col">
            <div class="field">
              <label for="med${ei}">Läkemedel och styrka</label>
              <input id="med${ei}" type="text" placeholder="T.ex. Elvanse 50 mg" maxlength="200" autocomplete="off">
              <span id="narcBadge${ei}" class="badge badge-warn narc-badge is-hidden" title="Narkotikaklassat preparat (LVFS 2011:10). Listan kontrollerades senast ${eNarcDate}."></span>
            </div>
            <div class="form-row">
              <div class="field">
                <label for="date${ei}">Senaste recept</label>
                <input id="date${ei}" type="text" inputmode="numeric" placeholder="ÅÅÅÅ-MM-DD" pattern="\\d{4}-\\d{2}-\\d{2}" maxlength="10" autocomplete="off" value="${eDate}">
              </div>
              <div class="field">
                <label for="dose${ei}">Antal per dag</label>
                <input id="dose${ei}" type="text" inputmode="decimal" placeholder="T.ex. 1.5" maxlength="10">
              </div>
            </div>
            <div class="form-row">
              <div class="field">
                <label for="amt${ei}">Mängd per uttag (st)</label>
                <input id="amt${ei}" type="number" placeholder="100" min="1" step="1">
              </div>
              <div class="field">
                <label for="ref${ei}">Antal uttag (heltal)</label>
                <input id="ref${ei}" type="number" placeholder="4" min="1" max="12" step="1">
              </div>
            </div>
            <div class="field field-optional">
              <label for="left${ei}">Doser kvar <span class="optional-tag">valfritt</span></label>
              <input id="left${ei}" type="number" placeholder="Lämna tomt om medicinen är slut" min="0" step="1">
              <span class="field-hint">Anges om patienten har kvarvarande doser — ger exakt snittberäkning</span>
            </div>
            <div class="action-row">
              <a class="btn fass-link btn-ghost is-hidden" id="fassBtn${ei}" href="#" target="_blank" rel="noopener">📘 FASS</a>
              <button class="btn btn-ghost ml-auto" data-action="clear-card">Rensa</button>
            </div>
          </div>
          <div class="card-result-col">
            <div class="card-result-empty" id="resPh${ei}">Fyll i formuläret för att se beräkning</div>
            <div class="result-panel" id="res${ei}" aria-live="polite">
              <div class="result-grid" id="resGrid${ei}"></div>
              <div id="alerts${ei}"></div>

              <div class="copy-section" id="copySection${ei}">
                <div class="copy-tabs">
                  <button class="copy-tab active" data-action="switch-tab" data-tab="patient">📝 Svar till patient</button>
                  <button class="copy-tab" data-action="switch-tab" data-tab="journal">🏥 Journalanteckning</button>
                </div>
                <div class="copy-body" id="copyBody${ei}"></div>
                <div class="copy-footer">
                  <button class="btn btn-ghost is-hidden" id="langBtn${ei}" data-action="toggle-lang">🌐 English</button>
                  <button class="btn btn-ghost" id="copyBtn${ei}" data-action="copy">📋 Kopiera text</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }

  function buildCards() {
    const grid = getEl('cardsGrid');
    const bar  = getEl('summaryBar');
    if (!grid) return;

    // Bygg summary-bar dynamiskt
    if (bar) {
      bar.innerHTML = '';
      for (let i = 0; i < medCardCount; i++) {
        bar.insertAdjacentHTML('beforeend',
          `<div class="summary-card">
            <div class="summary-dot" id="sumDot${i}"></div>
            <div class="summary-info">
              <div class="label">Läkemedel ${i + 1}</div>
              <div class="value muted" id="sumVal${i}">Ej ifyllt</div>
            </div>
          </div>`);
      }
    }

    // Bygg alla kort i ett enda innerHTML-anrop (undviker N reflows)
    let gridHtml = '';
    for (let i = 0; i < medCardCount; i++) {
      ensureDebounce(i);
      gridHtml += cardTemplate(i);
    }
    grid.innerHTML = gridHtml;
  }

  function collectCardValues() {
    const out = [];
    for (let i = 0; i < medCardCount; i++) {
      out.push({
        med:  (getEl('med'  + i) || {}).value || '',
        date: (getEl('date' + i) || {}).value || todayStr(),
        dose: (getEl('dose' + i) || {}).value || '',
        amt:  (getEl('amt'  + i) || {}).value || '',
        ref:  (getEl('ref'  + i) || {}).value || '',
        left: (getEl('left' + i) || {}).value || '',
      });
    }
    return out;
  }

  function restoreCardValues(vals) {
    vals.forEach((v, i) => {
      const medEl  = getEl('med'  + i); if (medEl)  medEl.value  = v.med;
      const dateEl = getEl('date' + i); if (dateEl) dateEl.value = v.date;
      const doseEl = getEl('dose' + i); if (doseEl) doseEl.value = v.dose;
      const amtEl  = getEl('amt'  + i); if (amtEl)  amtEl.value  = v.amt;
      const refEl  = getEl('ref'  + i); if (refEl)  refEl.value  = v.ref;
      const leftEl = getEl('left' + i); if (leftEl) leftEl.value = v.left;
      checkNarcotic(i);
      if (v.med || v.dose || v.amt || v.ref) calc(i);
    });
  }

  function addMedCard() {
    if (medCardCount >= 8) return;
    const vals = collectCardValues();
    medCardCount++;
    states.push({});
    buildCards();
    _suppressDistribute = true;
    try { restoreCardValues(vals); } finally { _suppressDistribute = false; }
    generateAndDistribute();
  }

  function removeMedCard(idx) {
    if (medCardCount <= 1) return;
    clearTimeout(copyFeedbackTimers[idx]);
    delete copyFeedbackTimers[idx];
    const vals = collectCardValues();
    vals.splice(idx, 1);
    states.splice(idx, 1);
    // Rensa cached texter på alla kvarvarande states så gammal text inte återanvänds
    states.forEach(s => { s.patientText = ''; s.patientTextEn = ''; s.patientLang = 'sv'; s.journalText = ''; });
    medCardCount--;
    buildCards();
    _suppressDistribute = true;
    try { restoreCardValues(vals); } finally { _suppressDistribute = false; }
    generateAndDistribute();
  }

  function switchTab(i, tab) {
    states[i].activeTab = tab;
    const tabs = document.querySelectorAll(`#card${i} .copy-tab`);
    if (tabs[0]) tabs[0].classList.toggle('active', tab === 'patient');
    if (tabs[1]) tabs[1].classList.toggle('active', tab === 'journal');
    const body    = getEl('copyBody' + i);
    const langBtn = getEl('langBtn' + i);
    if (tab === 'patient') {
      const isEn = states[i].patientLang === 'en';
      if (body) body.textContent = isEn
        ? (states[i].patientTextEn || states[i].patientText || '')
        : (states[i].patientText || '');
      if (langBtn) {
        langBtn.style.display = 'inline-flex';
        langBtn.textContent = isEn ? '🇸🇪 Svenska' : '🌐 English';
      }
    } else {
      if (body) body.textContent = states[i].journalText || '';
      if (langBtn) langBtn.style.display = 'none';
    }
  }

  function togglePatientLang(i) {
    if (!states[i].patientTextEn) return;
    states[i].patientLang = states[i].patientLang === 'en' ? 'sv' : 'en';
    const isEn    = states[i].patientLang === 'en';
    const body    = getEl('copyBody' + i);
    const langBtn = getEl('langBtn' + i);
    if (body) body.textContent = isEn
      ? (states[i].patientTextEn || '')
      : (states[i].patientText || '');
    if (langBtn) langBtn.textContent = isEn ? '🇸🇪 Svenska' : '🌐 English';
  }

  // ── Samlat svar — skrivs till alla korts copy-sektioner ──
  let _suppressDistribute = false;
  function generateAndDistribute() {
    if (_suppressDistribute) return;
    const validCount = states.filter(s => s.valid).length;
    if (validCount === 0) {
      // Rensa alla korts copy-rutor
      for (let i = 0; i < medCardCount; i++) {
        const body = getEl('copyBody' + i);
        if (body) body.textContent = '';
      }
      return;
    }

    const toRenew  = [];
    const tooEarly = [];
    const overuse  = [];

    for (let i = 0; i < medCardCount; i++) {
      const s = states[i];
      if (!s.valid) continue;
      const medEl = getEl('med' + i);
      const name = (medEl && medEl.value.trim()) || `Läkemedel ${i + 1}`;
      if (s.isOveruse)        overuse.push({ name, i });
      else if (s.isTooEarly) tooEarly.push({ name, i });
      else                   toRenew.push({ name, i });
    }

    // ── 1177-text (svenska) ──
    let patLines = ['Hej,', ''];
    if (validCount === 1) {
      // Ett läkemedel: bygg texten direkt utan läkemedelsprefixer
      if (toRenew.length === 1) {
        patLines.push(`Vi har tagit emot din begäran på ${toRenew[0].name} och kommer att förnya ditt recept inom 2–3 arbetsdagar. Du kan därefter hämta ut din medicin på valfritt apotek.`);
      } else if (tooEarly.length === 1) {
        const s = states[tooEarly[0].i];
        patLines.push(`Vi har tagit emot din förfrågan om receptförnyelse för ${tooEarly[0].name}. Enligt din ordination (${s.dose} st/dag) beräknas medicinen räcka till den ${s.endDateStr}. Eftersom det datumet inte ännu har passerat kan vi inte förnya receptet just nu. Vänligen hör av dig igen runt den ${s.renewDateStr} så hjälper vi dig då med nytt recept.`);
        patLines.push('');
        patLines.push('Vid frågor är du välkommen att kontakta oss via 1177.');
      } else if (overuse.length === 1) {
        const s = states[overuse[0].i];
        const closingSv1 = s.prescribedContactIsPast
          ? `Medicinen beräknas ta slut snart — därför förnyas recept från och med ${s.prescribedEndDateStr}.`
          : `Vänligen hör av dig igen runt den ${s.prescribedContactDateStr} så hjälper vi dig då med nytt recept.`;
        patLines.push(`Vi har tagit emot din förfrågan om receptförnyelse för ${overuse[0].name}. Enligt din ordination (${s.dose} st/dag) beräknas medicinen räcka till den ${s.prescribedEndDateStr}. Eftersom det datumet inte ännu har passerat kan vi inte förnya receptet just nu. ${closingSv1}`);
        patLines.push('');
        patLines.push('Vid frågor är du välkommen att kontakta oss via 1177.');
      }
    } else {
      patLines.push('Vi har tagit emot din förfrågan om receptförnyelse för följande läkemedel:');
      patLines.push('');
      toRenew.forEach(({ name }) => {
        patLines.push(`${name}: Vi förnyar ditt recept inom 2–3 arbetsdagar. Du kan därefter hämta ut medicinen på valfritt apotek.`);
      });
      tooEarly.forEach(({ name, i }) => {
        const s = states[i];
        patLines.push(`${name}: Medicinen beräknas räcka till den ${s.endDateStr}. Vänligen hör av dig igen runt den ${s.renewDateStr} så hjälper vi dig då med nytt recept.`);
      });
      overuse.forEach(({ name, i }) => {
        const s = states[i];
        const closingSvM = s.prescribedContactIsPast
          ? `Medicinen beräknas ta slut snart — därför förnyas recept från och med ${s.prescribedEndDateStr}.`
          : `Vänligen hör av dig igen runt den ${s.prescribedContactDateStr} så hjälper vi dig då med nytt recept.`;
        patLines.push(`${name}: Medicinen beräknas räcka till den ${s.prescribedEndDateStr}. Eftersom det datumet inte ännu har passerat kan vi inte förnya receptet just nu. ${closingSvM}`);
      });
      patLines.push('');
      patLines.push('Vid frågor är du välkommen att kontakta oss via 1177.');
    }
    const patientText = patLines.join('\n');

    // ── 1177-text (engelska, offline-översättning) ──
    let patLinesEn = ['Hello,', ''];
    if (validCount === 1) {
      if (toRenew.length === 1) {
        patLinesEn.push(`We have received your request for ${toRenew[0].name} and will renew your prescription within 2–3 working days. You can then collect your medication at any pharmacy.`);
      } else if (tooEarly.length === 1) {
        const s = states[tooEarly[0].i];
        patLinesEn.push(`We have received your prescription renewal request for ${tooEarly[0].name}. According to your prescription (${s.dose} tablets/day), your medication is estimated to last until ${s.endDateStr}. Since that date has not yet passed, we are unable to renew your prescription at this time. Please contact us again around ${s.renewDateStr} and we will help you with a new prescription then.`);
        patLinesEn.push('');
        patLinesEn.push('If you have any questions, please contact us through 1177.');
      } else if (overuse.length === 1) {
        const s = states[overuse[0].i];
        const closingEn1 = s.prescribedContactIsPast
          ? `Your medication is expected to run out soon — a new prescription will therefore be issued from ${s.prescribedEndDateStr}.`
          : `Please contact us again closer to ${s.prescribedContactDateStr} and we will assist you then.`;
        patLinesEn.push(`We have received your prescription renewal request for ${overuse[0].name}. According to your prescription (${s.dose} tablets/day), your medication is estimated to last until ${s.prescribedEndDateStr}. Since that date has not yet passed, we are unable to renew your prescription at this time. ${closingEn1}`);
        patLinesEn.push('');
        patLinesEn.push('If you have any questions, please contact us through 1177.');
      }
    } else {
      patLinesEn.push('We have received your prescription renewal request for the following medications:');
      patLinesEn.push('');
      toRenew.forEach(({ name }) => {
        patLinesEn.push(`${name}: We will renew your prescription within 2–3 working days. You can then collect your medication at any pharmacy.`);
      });
      tooEarly.forEach(({ name, i }) => {
        const s = states[i];
        patLinesEn.push(`${name}: Your medication is estimated to last until ${s.endDateStr}. Please contact us again around ${s.renewDateStr} and we will help you with a new prescription then.`);
      });
      overuse.forEach(({ name, i }) => {
        const s = states[i];
        const closingEnM = s.prescribedContactIsPast
          ? `Your medication is expected to run out soon — a new prescription will therefore be issued from ${s.prescribedEndDateStr}.`
          : `Please contact us again closer to ${s.prescribedContactDateStr} and we will assist you then.`;
        patLinesEn.push(`${name}: Your medication is estimated to last until ${s.prescribedEndDateStr}. Since that date has not yet passed, we are unable to renew your prescription at this time. ${closingEnM}`);
      });
      patLinesEn.push('');
      patLinesEn.push('If you have any questions, please contact us through 1177.');
    }
    const patientTextEn = patLinesEn.join('\n');

    // ── Journaltext ──
    let jLines = [];
    if (validCount === 1) {
      // Ett läkemedel: bygg journaltexten direkt
      if (toRenew.length === 1) {
        const s = states[toRenew[0].i];
        jLines.push(`Kontaktorsak: Receptförnyelse via 1177.`);
        jLines.push('');
        jLines.push(`Bedömning: Patienten begär förnyelse av ${toRenew[0].name}. Senaste receptet utfärdades ${s.pDateStr} (totalt ${s.total} doser, ordination ${s.dose} st/dag) och beräknas räcka till ${s.endDateStr}.`);
        jLines.push(`Förbrukningen bedöms vara enligt ordination (beräknad snittförbrukning: ${s.displayAvgStr} ${s.avgNote}).`);
        jLines.push('');
        jLines.push(`Åtgärd: Nytt recept utfärdat. Svar skickat till patient via 1177.`);
      } else if (tooEarly.length === 1) {
        const s = states[tooEarly[0].i];
        jLines.push(`Kontaktorsak: Receptförnyelse via 1177.`);
        jLines.push('');
        jLines.push(`Bedömning: Patienten begär förnyelse av ${tooEarly[0].name}. Senaste receptet utfärdades ${s.pDateStr} (totalt ${s.total} doser, ordination ${s.dose} st/dag) och beräknas räcka till ${s.endDateStr} (${s.daysRemaining} dagar kvar).`);
        jLines.push(`Förbrukningen bedöms vara enligt ordination (beräknad snittförbrukning: ${s.displayAvgStr} ${s.avgNote}).`);
        jLines.push('');
        jLines.push(`Åtgärd: Ej förnyat — för tidigt. Svar skickat till patient via 1177.`);
      } else if (overuse.length === 1) {
        const s = states[overuse[0].i];
        const supplyNote = s.daysRemaining > 0 ? `Aktuell förskrivning beräknas räcka ytterligare ${s.daysRemaining} dagar.` : `Aktuell förskrivning är slut.`;
        jLines.push(`Kontaktorsak: Receptförnyelse via 1177.`);
        jLines.push('');
        jLines.push(`Bedömning: Patienten begär förnyelse av ${overuse[0].name}. Senaste receptet utfärdades ${s.pDateStr} (totalt ${s.total} doser, ordination ${s.dose} st/dag) och borde räcka till ${s.prescribedEndDateStr}. ${supplyNote} Beräknad snittförbrukning: ${s.displayAvgStr} ${s.avgNote}.`);
        jLines.push(`Anledning till förhöjd förbrukning: [Fyll i]`);
        jLines.push('');
        jLines.push(`Åtgärd: [Nytt recept utfärdat / Ej utfärdat — motivering]`);
      }

    } else {
      jLines.push('Kontaktorsak: Receptförnyelse via 1177 (flera läkemedel).', '');
      toRenew.forEach(({ name, i }) => {
        const s = states[i];
        jLines.push(`${name}: Förnyat. Beräknas räcka t.o.m ${s.endDateStr}. Snittförbrukning: ${s.displayAvgStr}.`);
      });
      tooEarly.forEach(({ name, i }) => {
        const s = states[i];
        jLines.push(`${name}: Ej förnyat — för tidigt (${s.daysRemaining} dagar kvar, t.o.m ${s.endDateStr}). Beräknad snittförbrukning: ${s.displayAvgStr} ${s.avgNote}.`);
      });
      overuse.forEach(({ name, i }) => {
        const s = states[i];
        const supplyNote = s.daysRemaining > 0
          ? `Aktuell förskrivning beräknas räcka ytterligare ${s.daysRemaining} dagar.`
          : `Aktuell förskrivning är slut.`;
        jLines.push(`${name}: Ej förnyat — överförbrukning detekterad.`);
        jLines.push(`Bedömning: Patienten begär förnyelse av ${name}. Senaste receptet utfärdades ${s.pDateStr} (totalt ${s.total} doser, ordination ${s.dose} st/dag) och borde räcka till ${s.prescribedEndDateStr}. ${supplyNote} Beräknad snittförbrukning: ${s.displayAvgStr} ${s.avgNote}.`);
        jLines.push(`Anledning till förhöjd förbrukning: [Fyll i]`);
        jLines.push(`Åtgärd: [Nytt recept utfärdat / Ej utfärdat — motivering]`);
        jLines.push('');
      });
      jLines.push('');
      if (toRenew.length > 0) {
        jLines.push(`Åtgärd: Recept utfärdat för ${toRenew.map(x => x.name).join(', ')}. Svar skickat till patient via 1177.`);
      } else {
        jLines.push('Åtgärd: Inga recept utfärdade. Svar skickat till patient via 1177.');
      }
    }
    const journalText = jLines.join('\n');

    // Skriv till alla giltiga korts copy-sektioner
    for (let i = 0; i < medCardCount; i++) {
      if (!states[i].valid) continue;
      states[i].patientText   = patientText;
      states[i].patientTextEn = patientTextEn;
      states[i].patientLang   = 'sv';
      states[i].journalText   = journalText;
      const body    = getEl('copyBody' + i);
      const langBtn = getEl('langBtn' + i);
      if (langBtn && states[i].activeTab !== 'journal') {
        langBtn.style.display = 'inline-flex';
        langBtn.textContent   = '🌐 English';
      }
      if (body) body.textContent = states[i].activeTab === 'journal' ? journalText : patientText;
    }
  }
  // ─────────────────────────────────────────────────────────

  // Visar ett kortlivat felmeddelande i stil med applikationens övriga UI —
  // ersätter inbyggd alert() som kan blockeras och inte stämmer visuellt.
  const _copyErrTimers = new Map();
  function showCopyError(btn, msg) {
    if (!btn) return;
    const orig = btn.dataset.origLabel || btn.textContent;
    btn.dataset.origLabel = orig;
    btn.textContent = '⚠️ ' + msg;
    if (_copyErrTimers.has(btn)) clearTimeout(_copyErrTimers.get(btn));
    const t = setTimeout(() => {
      btn.textContent = orig;
      delete btn.dataset.origLabel;
      _copyErrTimers.delete(btn);
    }, 3000);
    _copyErrTimers.set(btn, t);
  }

  const copyFeedbackTimers = {};
  function copyText(i) {
    const body = getEl('copyBody' + i);
    const text = body ? body.textContent : '';
    navigator.clipboard.writeText(text).then(() => {
      const btn = getEl('copyBtn' + i);
      if (!btn) return;
      const orig = btn.dataset.origLabel || btn.textContent;
      btn.dataset.origLabel = orig;
      btn.textContent = '✅ Kopierat!';
      clearTimeout(copyFeedbackTimers[i]);
      copyFeedbackTimers[i] = setTimeout(() => {
        btn.textContent = orig;
        delete btn.dataset.origLabel;
      }, 1800);
    }).catch(() => showCopyError(getEl('copyBtn' + i), 'Kopiera manuellt'));
  }

  function clearCard(i) {
    ['med','dose','amt','ref','left'].forEach(f => {
      const el = getEl(f + i);
      if (el) {
        el.value = '';
        toggleError(el, false);
      }
    });
    const dateEl = getEl('date' + i);
    if (dateEl) { dateEl.value = todayStr(); toggleError(dateEl, false); }
    showEl('res' + i, false);
    showEl('fassBtn' + i, false);
    showEl('resPh' + i, true, 'flex');
    resetResultPanel(i);
    setStatus(i, 'muted', 'Ej ifyllt');
    states[i] = { patientLang: 'sv' };
    // Rensa distribuerade texter för övriga giltiga kort så gammal sammanslagen text inte kvarstår
    for (let j = 0; j < states.length; j++) {
      if (j !== i) { states[j].patientText = ''; states[j].patientTextEn = ''; states[j].journalText = ''; }
    }
    generateAndDistribute();
  }

  function confirmClearAll(force = false) {
    if (force) {
      executeClearAll();
    } else {
      const m = getEl('clearModal');
      if (m) m.classList.add('visible');
    }
  }

  function closeClearModal() {
    const m = getEl('clearModal');
    if (m) m.classList.remove('visible');
  }

  function executeClearAll() {
    for (let i = 0; i < medCardCount; i++) clearCard(i);
    medCardCount = 1;
    states = [{}];
    buildCards();
    clearLongterm();
    closeClearModal();
  }

  function validateInputs(i) {
    const medEl  = getEl('med' + i);
    const dateEl = getEl('date' + i);
    const amtEl  = getEl('amt' + i);
    const doseEl = getEl('dose' + i);
    const refEl  = getEl('ref' + i);
    if (!medEl || !dateEl || !amtEl || !doseEl || !refEl) return { valid: false, reason: 'incomplete' };

    const medRaw = medEl.value.trim();
    if (medRaw.length > 200) return { valid: false, reason: 'incomplete' };
    const dateVal = dateEl.value;
    if (dateVal.length > 10) return { valid: false, reason: 'invalid_date' };

    const amtRaw = amtEl.value;
    const amt = parseInt(amtRaw, 10);
    // Övre gräns 10000 — sanity check mot tryckfel
    const amtIsInvalid = amtRaw !== '' && (isNaN(amt) || amt <= 0 || amt > 10000 || !Number.isInteger(Number(amtRaw)));
    toggleError(amtEl, amtIsInvalid);

    const doseRaw = doseEl.value;
    const dose = parseFloat(doseRaw.replace(',','.'));
    // Övre gräns 50 st/dag — extremt högt men teoretiskt möjligt; sanity check mot tryckfel
    const doseIsInvalid = doseRaw !== '' && (isNaN(dose) || dose < 0.1 || dose > 50);
    toggleError(doseEl, doseIsInvalid);

    const refRaw = refEl.value.trim();
    const refNum = Number(refRaw);
    const refOutOfRange = Number.isFinite(refNum) && Number.isInteger(refNum) && refNum > 12;
    const refIsInvalid = refRaw !== '' && (!Number.isFinite(refNum) || !Number.isInteger(refNum) || refNum < 1 || refNum > 12);
    toggleError(refEl, refIsInvalid);

    if (refOutOfRange) return { valid: false, reason: 'too_many_refs' };

    if (!medRaw || !dateVal || isNaN(dose) || doseIsInvalid || isNaN(amt) || amtIsInvalid || refIsInvalid || !refNum || refNum < 1) {
      return { valid: false, reason: 'incomplete' };
    }
    const ref = refNum;

    const pDate = parseDateUTC(dateVal);
    const dateIsInvalid = !!dateVal && !pDate;
    toggleError(dateEl, dateIsInvalid);
    if (!pDate) return { valid: false, reason: 'invalid_date' };

    // Sanity check: datum får inte vara i framtiden
    const today = getToday();
    if (pDate > today) {
      toggleError(dateEl, true);
      return { valid: false, reason: 'invalid_date' };
    }

    // Valfritt: kvarvarande doser
    const leftEl  = getEl('left' + i);
    const leftRaw = leftEl ? leftEl.value.trim() : '';
    const remaining = leftRaw !== '' ? parseInt(leftRaw, 10) : null;
    const leftIsInvalid = leftRaw !== '' && (isNaN(remaining) || remaining < 0 || !Number.isInteger(Number(leftRaw)));
    if (leftEl) toggleError(leftEl, leftIsInvalid);
    if (leftIsInvalid) return { valid: false, reason: 'incomplete' };

    return { valid: true, medRaw, dateVal, pDate, amt, dose, ref, remaining };
  }

  function buildResultGrid(i, data) {
    const { daysRemaining, medRaw, avgNum, total, totalDays, endDate, prescribedEndDate, dose, daysSince, hasRemaining, remaining } = data;

    const daysInfoNode = document.createElement('span');
    if (daysRemaining < 0) {
      const daysAgo = Math.abs(daysRemaining);
      daysInfoNode.className = 'badge badge-ok';
      daysInfoNode.textContent = `Tog slut för ${daysAgo} ${daysAgo === 1 ? 'dag' : 'dagar'} sedan`;
    }

    const doseUnit = extractDoseUnit(medRaw);
    let displayAvg = `${avgNum.toFixed(2)} st/dag`;
    if (doseUnit) displayAvg += ` (${(avgNum * doseUnit.amount).toFixed(1)} ${doseUnit.unit}/dag)`;

    const resGridEl = getEl('resGrid' + i);
    if (!resGridEl) return displayAvg;
    resGridEl.textContent = '';

    const frag = document.createDocumentFragment();
    buildResultRow(frag, 'Totalt antal doser', `${total} st`);
    buildResultRow(frag, 'Borde räcka i', `${Math.round(totalDays)} dagar`);
    buildResultRow(frag, 'Borde räcka t.o.m', fmtDate(prescribedEndDate));
    if (hasRemaining) buildResultRow(frag, 'Räcker t.o.m (kvar)', fmtDate(endDate));
    const hr = document.createElement('hr'); hr.className = 'divider'; frag.appendChild(hr);
    const dosesLeft = hasRemaining ? remaining : Math.max(0, Math.floor(total - (daysSince * dose)));
    buildResultRow(frag, 'Doser kvar idag', `${dosesLeft} st`, daysInfoNode);
    buildResultRow(frag, 'Snittförbrukning', displayAvg);

    resGridEl.appendChild(frag);
    return displayAvg;
  }

  function buildCopyTexts(i, data) {
    const { isOveruse, isTooEarly, displayAvg, daysRemaining, medRaw, dose, endDate, prescribedEndDate, pDate, total, accessibleTotal, amt, ref, today, hasRemaining, remaining } = data;

    const alerts = getEl('alerts' + i);
    if (alerts) alerts.textContent = '';

    // Notering om snittförbrukning — anpassas beroende på om kvarvarande doser angavs
    const earlyPickupNote = data.earlyPickup
      ? ' OBS: Kvarvarande doser överstiger normalt tillgänglig mängd — patienten kan ha hämtat ut uttag i förväg.'
      : '';
    const avgNote = hasRemaining
      ? `(beräknat på faktisk förbrukning: ${data.calcBase - remaining} av ${data.calcBase} tillgängliga doser${earlyPickupNote})`
      : `(beräknat under antagandet att alla hittills tillgängliga doser är förbrukade)`;

    if (isOveruse) {
      // SCENARIO 1: Förbrukning >10 % över ordinerad dos → klinisk bedömning krävs
      const daysNote = daysRemaining > 0
        ? ` — ${daysRemaining} ${daysRemaining === 1 ? 'dag' : 'dagar'} kvar av aktuell förskrivning`
        : ` — aktuell förskrivning är slut`;
      renderAlert('alerts' + i, 'danger', '🚨 Överförbrukning detekterad',
        `Snitt ${displayAvg} ${avgNote}${daysNote}. Gör en individuell bedömning om patienten överförbrukar läkemedlet.`);
      const supplyNote = daysRemaining > 0
        ? `Aktuell förskrivning beräknas räcka ytterligare ${daysRemaining} ${daysRemaining === 1 ? 'dag' : 'dagar'}.`
        : `Aktuell förskrivning är slut.`;
      const contactDate = new Date(prescribedEndDate);
      contactDate.setUTCDate(contactDate.getUTCDate() - 7);
      const todayContact = getToday();
      const contactIsPast = contactDate < todayContact;
      const effectiveContactDate = contactIsPast ? todayContact : contactDate;
      states[i].endDateStr = fmtDate(prescribedEndDate);
      states[i].prescribedEndDateStr = fmtDate(prescribedEndDate);
      states[i].prescribedContactDateStr = fmtDate(effectiveContactDate);
      states[i].prescribedContactIsPast = contactIsPast;
      states[i].daysRemaining = daysRemaining;
      states[i].pDateStr = fmtDate(pDate);
      states[i].total = total;
      states[i].dose = dose;
      states[i].avgNote = avgNote;
      const renewFromStr = fmtDate(prescribedEndDate);
      const overuseClosingLine = contactIsPast
        ? `Medicinen beräknas ta slut snart — därför förnyas recept från och med ${renewFromStr}.`
        : `Vänligen hör av dig igen närmre den ${fmtDate(effectiveContactDate)} så hjälper vi dig då.`;
      states[i].patientText =
`Hej,

Vi har tagit emot din förfrågan om receptförnyelse för ${medRaw}. Enligt din ordination (${dose} st/dag) beräknas medicinen räcka till den ${fmtDate(prescribedEndDate)}. Eftersom det datumet inte ännu har passerat kan vi inte förnya receptet just nu. ${overuseClosingLine}

Vid frågor är du välkommen att kontakta oss via 1177.`;
      states[i].journalText =
`Kontaktorsak: Receptförnyelse via 1177.

Bedömning: Patienten begär förnyelse av ${medRaw}. Senaste receptet utfärdades ${fmtDate(pDate)} (totalt ${total} doser, ordination ${dose} st/dag) och borde räcka till ${fmtDate(prescribedEndDate)}. ${supplyNote} Beräknad snittförbrukning: ${displayAvg} ${avgNote}.

Anledning till förhöjd förbrukning: [Fyll i]

Åtgärd: [Nytt recept utfärdat / Ej utfärdat — motivering]`;

    } else if (isTooEarly) {
      // SCENARIO 2: Förbrukning OK men för tidigt att förnya → be dem höra av sig senare
      const renewDate = new Date(endDate);
      renewDate.setUTCDate(renewDate.getUTCDate() - 7);
      states[i].endDateStr = fmtDate(endDate);
      states[i].renewDateStr = fmtDate(renewDate);
      states[i].daysRemaining = daysRemaining;
      states[i].pDateStr = fmtDate(pDate);
      states[i].total = total;
      states[i].dose = dose;
      states[i].avgNote = avgNote;
      renderAlert('alerts' + i, 'info', 'ℹ️ För tidigt att förnya',
        `Medicinen beräknas räcka ytterligare ${daysRemaining} dagar (t.o.m ${fmtDate(endDate)}). Receptförnyelse rekommenderas närmre slutdatumet.`);
      states[i].patientText =
`Hej,

Vi har tagit emot din förfrågan om receptförnyelse för ${medRaw}. Enligt din ordination (${dose} st/dag) beräknas medicinen räcka till den ${fmtDate(endDate)}. Eftersom det datumet inte ännu har passerat kan vi inte förnya receptet just nu. Vänligen hör av dig igen runt den ${fmtDate(renewDate)} så hjälper vi dig då med nytt recept.

Vid frågor är du välkommen att kontakta oss via 1177.`;
      states[i].journalText =
`Kontaktorsak: Receptförnyelse via 1177.

Bedömning: Patienten begär förnyelse av ${medRaw}. Senaste receptet utfärdades ${fmtDate(pDate)} (totalt ${total} doser, ordination ${dose} st/dag) och beräknas räcka till ${fmtDate(endDate)} (${daysRemaining} dagar kvar).
Förbrukningen bedöms vara enligt ordination (beräknad snittförbrukning: ${displayAvg} ${avgNote}).

Åtgärd: Ej förnyat — för tidigt. Svar skickat till patient via 1177.`;

    } else {
      // SCENARIO 3: Förbrukning OK och inom förnyelsefönster → förskriv
      states[i].endDateStr = fmtDate(endDate);
      states[i].daysRemaining = daysRemaining;
      states[i].pDateStr = fmtDate(pDate);
      states[i].total = total;
      states[i].dose = dose;
      states[i].avgNote = avgNote;
      states[i].patientText =
`Hej,

Vi har tagit emot din begäran på ${medRaw} och kommer att förnya ditt recept inom 2–3 arbetsdagar. Du kan därefter hämta ut din medicin på valfritt apotek.`;
      states[i].journalText =
`Kontaktorsak: Receptförnyelse via 1177.

Bedömning: Patienten begär förnyelse av ${medRaw}. Senaste receptet utfärdades ${fmtDate(pDate)} (totalt ${total} doser, ordination ${dose} st/dag) och beräknas räcka till ${fmtDate(endDate)}.
Förbrukningen bedöms vara enligt ordination (beräknad snittförbrukning: ${displayAvg} ${avgNote}).

Åtgärd: Nytt recept utfärdat. Svar skickat till patient via 1177.`;
    }

    showEl('copySection' + i, true);
    switchTab(i, 'patient');
  }

  function showResult(i, show) {
    const res = getEl('res' + i);
    const ph  = getEl('resPh' + i);
    if (res) res.style.display = show ? 'block' : 'none';
    if (ph)  ph.style.display  = show ? 'none'  : 'flex';
  }

  function calc(i) {
    resetTimer();
    states[i].valid = false;

    const inputData = validateInputs(i);

    if (!inputData.valid) {
      showResult(i, false);
      resetResultPanel(i);
      states[i].patientText   = '';
      states[i].patientTextEn = '';
      states[i].patientLang   = 'sv';
      states[i].journalText   = '';
      generateAndDistribute();

      if (inputData.reason === 'too_many_refs') {
        showResult(i, true);
        renderAlert('alerts' + i, 'danger', '⚠️ Ogiltigt antal uttag', 'Max 12 uttag stöds.');
        setStatus(i, 'warn', 'Ogiltigt antal');
      } else if (inputData.reason === 'invalid_date') {
        setStatus(i, 'warn', 'Ogiltigt datum');
      } else {
        setStatus(i, 'muted', 'Ej ifyllt');
      }
      return;
    }

    const today = getToday();
    const daysSince = getDaysDiff(today, inputData.pDate);

    if (daysSince === 0) {
      resetResultPanel(i);
      showResult(i, true);
      renderAlert('alerts' + i, 'info', '', 'ℹ️ För att beräkna snittförbrukning krävs att receptet utfärdades minst en dag tidigare än dagens datum.');
      setStatus(i, 'warn', 'Kan ej beräknas idag');
      return;
    }

    const total = inputData.amt * inputData.ref;
    const totalDays = total / inputData.dose;

    if (totalDays > 3650) {
      resetResultPanel(i);
      showResult(i, true);
      renderAlert('alerts' + i, 'danger', '⚠️ Orimlig tid', 'Beräknad tid överstiger 10 år. Kontrollera inmatade värden.');
      setStatus(i, 'warn', 'Orimliga värden');
      return;
    }

    const { remaining } = inputData;
    const hasRemaining = remaining !== null && remaining !== undefined;

    // Antal uttag som fysiskt hunnit lösas ut sedan receptdatumet.
    // Patienten kan inte ha förbrukat tabletter från uttag som ännu inte är tillgängliga.
    const batchDuration = inputData.amt / inputData.dose; // dagar per uttag vid ordinerad dos
    const batchesDispensed = Math.min(inputData.ref, Math.floor(daysSince / batchDuration) + 1);
    const accessibleTotal = Math.min(total, batchesDispensed * inputData.amt);

    let endDate, daysRemaining, avgNum;
    let earlyPickup = false;
    let calcBase = accessibleTotal;

    if (hasRemaining) {
      // Exakt beräkning: faktisk förbrukning och faktiska kvarvarande dagar
      if (remaining > total) {
        // Kvarvarande kan aldrig överstiga totalt förskrivna doser
        resetResultPanel(i);
        showResult(i, true);
        renderAlert('alerts' + i, 'warn', '⚠️ Orimligt värde', `Kvarvarande doser (${remaining}) kan inte överstiga totalt antal förskrivna doser (${total}).`);
        setStatus(i, 'warn', 'Orimliga värden');
        return;
      }
      // Om remaining > accessibleTotal har patienten hämtat ut fler uttag än modellen förväntar.
      // Beräkna minsta möjliga antal uttag som krävs för att förklara remaining.
      earlyPickup = remaining > accessibleTotal;
      if (earlyPickup) {
        const minBatchesNeeded = Math.ceil(remaining / inputData.amt);
        const clampedBatches   = Math.min(minBatchesNeeded, inputData.ref);
        calcBase = clampedBatches * inputData.amt;
      } else {
        // När remaining är angivet vet vi exakt hur många som förbrukats: total − remaining.
        // Använd total (alla förskrivna doser) som bas — inte accessibleTotal, som ignorerar
        // hur många uttag patienten faktiskt gjort.
        calcBase = total;
      }
      const consumed = calcBase - remaining;
      if (consumed < 0) {
        // Defensiv kontroll – ska inte kunna inträffa
        resetResultPanel(i);
        showResult(i, true);
        renderAlert('alerts' + i, 'warn', '⚠️ Orimligt värde', `Kvarvarande doser (${remaining}) överstiger totalt antal förskrivna doser (${total}).`);
        setStatus(i, 'warn', 'Orimliga värden');
        return;
      }
      avgNum        = consumed / daysSince;
      daysRemaining = Math.floor(remaining / inputData.dose);
      endDate       = new Date(today);
      endDate.setUTCDate(today.getUTCDate() + daysRemaining);
    } else {
      // Antar att alla uttag är hämtade och förbrukade när kvarvarande doser inte anges.
      // Patienten hör av sig för förnyelse — rimligt antagande är full förbrukning av total.
      endDate = new Date(inputData.pDate);
      endDate.setUTCDate(endDate.getUTCDate() + Math.round(totalDays));
      daysRemaining = getDaysDiff(endDate, today);
      avgNum        = total / daysSince;
    }

    // Överkonsumtion: snitt >10 % över ordinerad dos (tolerans för naturlig variation)
    const isOveruse = avgNum > inputData.dose * 1.10;

    // Det datum receptet borde ha räckt till enligt ordinationen (alltid pDate + totalDays)
    const prescribedEndDate = new Date(inputData.pDate);
    prescribedEndDate.setUTCDate(prescribedEndDate.getUTCDate() + Math.round(totalDays));

    states[i].valid = true;
    const isTooEarly = !isOveruse && daysRemaining > 14;
    states[i].isOveruse  = isOveruse;
    states[i].isTooEarly = isTooEarly;
    const statusClass = isOveruse ? 'warn' : isTooEarly ? 'warn' : 'ok';
    const statusText = isOveruse ? 'Överförbrukning' : isTooEarly ? `För tidigt — ${daysRemaining} dagar kvar` : `OK — t.o.m ${fmtDate(endDate)}`;
    setStatus(i, statusClass, statusText);

    const displayData = { ...inputData, total, accessibleTotal, calcBase, earlyPickup, totalDays, endDate, prescribedEndDate, daysRemaining, avgNum, isOveruse, isTooEarly, daysSince, today, hasRemaining };
    const displayAvg = buildResultGrid(i, displayData);
    displayData.displayAvg = displayAvg;
    buildCopyTexts(i, displayData); // OBS: rensar alerts+i internt
    states[i].displayAvgStr = displayAvg;
    generateAndDistribute();

    // Rendera alert EFTER buildCopyTexts (annars raderas den av alerts.textContent='')
    const consumptionPct = (avgNum / inputData.dose) * 100;

    if (avgNum === 0) {
      renderAlert('alerts' + i, 'danger', '🚨 Ingen förbrukning registrerad',
        `Beräknad snittförbrukning är 0 st/dag — patienten verkar inte ha tagit medicinen alls under perioden. ` +
        `Klinisk bedömning krävs innan receptförnyelse.`);
    } else if (consumptionPct < 80) {
      renderAlert('alerts' + i, 'warn', '⚠️ Låg förbrukning',
        `Snittförbrukning ${avgNum.toFixed(2)} st/dag är ${(100 - consumptionPct).toFixed(1)}% under ordinerad dos (${inputData.dose} st/dag). ` +
        `Patienten verkar inte ta medicinen som ordinerat — överväg uppföljningssamtal.`);
    } else if (avgNum > inputData.dose * 2.5) {
      renderAlert('alerts' + i, 'warn', '⚠️ Datakontroll krävs',
        `Beräknad snittförbrukning (${avgNum.toFixed(2)} st/dag) är mycket högre än ordinerad dos (${inputData.dose} st/dag). ` +
        `Kontrollera att antal kvarvarande doser är korrekt inmatat.`);
    }

    if (displayData.earlyPickup) {
      const alertsEl = getEl('alerts' + i);
      if (alertsEl) {
        const note = document.createElement('div');
        note.className = 'alert alert-info';
        note.textContent = 'ℹ️ Kvarvarande doser överstiger modellens förväntade tillgängliga mängd — patienten kan ha hämtat ut uttag i förväg eller haft överblivna tabletter från tidigare recept. Beräkningen utgår från minsta möjliga antal hämtade uttag.';
        alertsEl.appendChild(note);
      }
    }

    const fassBtn = getEl('fassBtn' + i);
    if (fassBtn) {
      fassBtn.href = getFassUrl(inputData.medRaw);
      showEl('fassBtn' + i, true, 'inline-flex');
    }
    showResult(i, true);
  }

  /* ────────────────────────────────────────────
     FLIK 2: LÅNGVARIG FÖRBRUKNING
  ─────────────────────────────────────────── */

  function periodRowTemplate(idx) {
    const labelClass = idx === 0 ? 'section-label section-label-first' : 'section-label';
    const eidx  = escapeHtml(idx);
    const eidx1 = escapeHtml(idx + 1);
    const eStart = escapeHtml(oneYearAgoStr());
    const eEnd   = escapeHtml(todayStr());
    return `
      <div class="${labelClass}">Period ${eidx1}</div>
      <div class="form-row-3 period-form-row" id="lt-period-${eidx}">
        <div class="field period-date-field">
          <label for="lt-start-${eidx}">Startdatum</label>
          <input id="lt-start-${eidx}" type="text" inputmode="numeric" placeholder="ÅÅÅÅ-MM-DD" pattern="\\d{4}-\\d{2}-\\d{2}" maxlength="10" autocomplete="off" value="${eStart}">
        </div>
        <div class="field period-date-field">
          <label for="lt-total-${eidx}">Antal uttagna tabletter</label>
          <input id="lt-total-${eidx}" type="number" placeholder="100" min="1">
        </div>
        <div class="field period-date-field">
          <label for="lt-end-${eidx}">Slutdatum</label>
          <input id="lt-end-${eidx}" type="text" inputmode="numeric" placeholder="ÅÅÅÅ-MM-DD" pattern="\\d{4}-\\d{2}-\\d{2}" maxlength="10" autocomplete="off" value="${eEnd}">
        </div>
      </div>
      ${idx > 0 ? `<button class="btn btn-ghost btn-remove-period" data-action="remove-period" data-idx="${eidx}">✕ Ta bort period ${eidx1}</button>` : ''}
    `;
  }

  function buildPeriodContainer() {
    const container = getEl('lt-periods-container');
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < ltPeriodCount; i++) {
      const div = document.createElement('div');
      div.id = `lt-period-wrap-${i}`;
      div.innerHTML = periodRowTemplate(i);
      container.appendChild(div);
    }
  }

  function addPeriod() {
    if (ltPeriodCount >= 10) return;
    const periods = collectRawPeriods();
    ltPeriodCount++;
    buildPeriodContainer();
    periods.forEach((p, i) => {
      const s = getEl('lt-start-' + i); if (s && p.start) s.value = p.start;
      const t = getEl('lt-total-' + i); if (t && p.total) t.value = p.total;
      const e = getEl('lt-end-' + i);   if (e && p.end)   e.value = p.end;
    });
    calcLongterm();
  }

  function collectRawPeriods() {
    const out = [];
    for (let i = 0; i < ltPeriodCount; i++) {
      out.push({
        start: (getEl('lt-start-' + i) || {}).value || '',
        total: (getEl('lt-total-' + i) || {}).value || '',
        end:   (getEl('lt-end-' + i)   || {}).value || ''
      });
    }
    return out;
  }

  function removePeriod(idx) {
    const periods = collectRawPeriods();
    periods.splice(idx, 1);
    ltPeriodCount = Math.max(1, ltPeriodCount - 1);
    buildPeriodContainer();
    periods.forEach((p, i) => {
      const s = getEl('lt-start-' + i); if (s) s.value = p.start;
      const t = getEl('lt-total-' + i); if (t) t.value = p.total;
      const e = getEl('lt-end-' + i);   if (e) e.value = p.end;
    });
    calcLongterm();
  }

  function parseDateUTC(str) {
    if (!str) return null;
    const parts = str.split('-');
    if (parts.length !== 3) return null;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    // Grundvalidering av intervall innan Date.UTC — förhindrar tyst overflow
    // (t.ex. månad 13 → januari nästa år, dag 31 i feb → mars)
    if (isNaN(y) || isNaN(m) || isNaN(day) || m < 1 || m > 12 || day < 1 || day > 31) return null;

    // Året måste ligga inom rimligt klinisk-relevant intervall
    if (y < 1950 || y > 2100) return null;

    const d = new Date(Date.UTC(y, m - 1, day));
    if (isNaN(d.getTime())) return null;
    // Kontrollera att ingen overflow skett (t.ex. 31 feb → 3 mars)
    if (d.getUTCFullYear() !== y || d.getUTCMonth() !== m - 1 || d.getUTCDate() !== day) return null;
    return d;
  }

  function clearLongterm() {
    const m = getEl('lt-med'); if (m) m.value = '';
    const d = getEl('lt-dose'); if (d) { d.value = ''; toggleError(d, false); }
    ltPeriodCount = 1;
    buildPeriodContainer();

    const alerts  = getEl('lt-alerts');        if (alerts)  alerts.textContent = '';
    const overlap = getEl('lt-overlap-alert'); if (overlap) overlap.textContent = '';
    const grid    = getEl('lt-resGrid');       if (grid)    grid.textContent = '';
    const rows   = getEl('lt-period-rows'); if (rows) rows.textContent = '';

    showEl('lt-result', false);
    showEl('lt-copySection', false);
    showEl('lt-fassBtn', false);
    showEl('lt-bar-section', false);
    showEl('lt-period-table-section', false);
  }

  function calcLongterm() {
    resetTimer();

    const medEl = getEl('lt-med');
    const doseEl = getEl('lt-dose');
    if (!medEl || !doseEl) return;

    const medRaw = medEl.value.trim();
    const doseRaw = doseEl.value;
    const ordDose = parseFloat(doseRaw.replace(',', '.'));
    // Sanity check: ordinerad dos inom rimligt intervall (0.1–50 st/dag)
    const doseIsInvalid = doseRaw !== '' && (isNaN(ordDose) || ordDose < 0.1 || ordDose > 50);
    toggleError(doseEl, doseIsInvalid);

    const today = getToday();

    const periods = [];
    for (let i = 0; i < ltPeriodCount; i++) {
      const startEl = getEl('lt-start-' + i);
      const totalEl = getEl('lt-total-' + i);
      const endEl   = getEl('lt-end-' + i);

      const startDate = parseDateUTC(startEl ? startEl.value : '');
      const endDate   = parseDateUTC(endEl ? endEl.value : '');
      const totalVal  = parseFloat(totalEl ? totalEl.value : '');

      const startInvalid = startEl && startEl.value !== '' && (!startDate || startDate > today);
      const endInvalid   = endEl   && endEl.value   !== '' && (!endDate || (startDate && endDate <= startDate));
      const totalInvalid = totalEl && totalEl.value !== '' && (isNaN(totalVal) || totalVal <= 0);

      toggleError(startEl, !!startInvalid);
      toggleError(endEl, !!endInvalid);
      toggleError(totalEl, !!totalInvalid);

      if (startDate && endDate && !isNaN(totalVal) && totalVal > 0 && startDate < endDate) {
        const days = getDaysDiff(endDate, startDate);
        // Skydd mot division med noll
        if (days === 0) {
          console.warn(`Period ${i} har 0 dagar (samma start och slutdatum) - ignoreras`);
          continue;
        }
        // Sanity check: ingen period bör vara längre än 50 år
        if (days > 365 * 50) {
          console.warn(`Period ${i} är större än 50 år - ignoreras`);
          continue;
        }
        const avgPerDay = totalVal / days;
        periods.push({ startDate, endDate, total: totalVal, days, avgPerDay });
      }
    }

    if (!medRaw || doseIsInvalid || isNaN(ordDose) || periods.length === 0) {
      showEl('lt-result', false);
      return;
    }

    // Sortera perioder kronologiskt oavsett inmatningsordning,
    // så att överlappskontroll och tabellrendering alltid är korrekta.
    periods.sort((a, b) => a.startDate - b.startDate);

    showEl('lt-result', true);
    const ltAlerts = getEl('lt-alerts'); if (ltAlerts) ltAlerts.textContent = '';
    const ltOverlap = getEl('lt-overlap-alert'); if (ltOverlap) ltOverlap.textContent = '';

    // Överlappningsvarning renderas i egen div så att den inte skrivs över av huvudresultatet.
    if (periods.length > 1) {
      for (let i = 0; i < periods.length - 1; i++) {
        if (periods[i].endDate > periods[i + 1].startDate) {
          renderAlert('lt-overlap-alert', 'warn', '⚠️ Överlappande perioder',
            'Tidsperioderna överlappar varandra. Se till att alla perioder är disjunkta för korrekt beräkning.');
          break;
        }
      }
    }

    const totalTablets = periods.reduce((s, p) => s + p.total, 0);
    const totalDays    = periods.reduce((s, p) => s + p.days, 0);

    // Skydd mot division med noll
    if (totalDays === 0) {
      renderAlert('lt-alerts', 'warn', '⚠️ Ogiltiga perioder',
        'Totala analyslängden är 0 dagar. Säkerställ att minst en period täcker ett helt dygn.');
      showEl('lt-result', false);
      return;
    }

    const overallAvg   = totalTablets / totalDays;
    const consumptionPct = (overallAvg / ordDose) * 100;

    const doseUnit = extractDoseUnit(medRaw);
    let avgStr = `${overallAvg.toFixed(2)} st/dag`;
    if (doseUnit) avgStr += ` (${(overallAvg * doseUnit.amount).toFixed(1)} ${doseUnit.unit}/dag)`;

    const resGridEl = getEl('lt-resGrid');
    if (resGridEl) {
      resGridEl.textContent = '';
      const frag = document.createDocumentFragment();
      buildResultRow(frag, 'Analyserade perioder', `${periods.length} st`);
      buildResultRow(frag, 'Total analyslängd', `${totalDays} dagar`);
      buildResultRow(frag, 'Totalt uttagna tabletter', `${totalTablets} st`);
      const hr = document.createElement('hr'); hr.className = 'divider'; frag.appendChild(hr);
      buildResultRow(frag, 'Ordinerad dos', `${ordDose} st/dag`);
      buildResultRow(frag, 'Beräknad snittförbrukning', avgStr);
      buildResultRow(frag, 'Förbrukning relativt ordination', `${consumptionPct.toFixed(1)}%`);
      resGridEl.appendChild(frag);
    }

    const OVER_THRESHOLD  = 1.10;
    const UNDER_THRESHOLD = 0.80;

    let overallStatus, alertType, alertTitle, alertMsg;
    if (overallAvg > ordDose * OVER_THRESHOLD) {
      overallStatus = 'over';
      alertType = 'danger';
      alertTitle = '🚨 Överförbrukning detekterad';
      alertMsg = `Snittförbrukning ${avgStr} är ${(consumptionPct - 100).toFixed(1)}% över ordinerad dos (${ordDose} st/dag) sett över ${totalDays} dagar. Gör en individuell klinisk bedömning.`;
    } else if (overallAvg < ordDose * UNDER_THRESHOLD) {
      overallStatus = 'under';
      alertType = 'warn';
      alertTitle = '⚠️ Underförbrukning detekterad';
      alertMsg = `Snittförbrukning ${avgStr} är ${(100 - consumptionPct).toFixed(1)}% under ordinerad dos (${ordDose} st/dag) sett över ${totalDays} dagar. Patienten kanske inte tar medicinen som ordinerat — överväg uppföljning.`;
    } else {
      overallStatus = 'ok';
      alertType = 'ok';
      alertTitle = '✅ Förbrukning enligt ordination';
      alertMsg = `Snittförbrukning ${avgStr} bedöms vara i linje med ordinerad dos (${ordDose} st/dag) med en avvikelse på ${Math.abs(consumptionPct - 100).toFixed(1)}%.`;
    }

    renderAlert('lt-alerts', alertType, alertTitle, alertMsg);

    const barPct = Math.min(150, Math.max(0, consumptionPct));
    const barEl = getEl('lt-bar');
    if (barEl) {
      barEl.style.width = `${(barPct / 150) * 100}%`;
      barEl.className = `consumption-bar ${overallStatus}`;
      barEl.textContent = barPct > 20 ? `${consumptionPct.toFixed(0)}%` : '';
    }
    showEl('lt-bar-section', true);

    const rowsContainer = getEl('lt-period-rows');
    if (rowsContainer) {
      rowsContainer.textContent = '';
      const frag = document.createDocumentFragment();

      periods.forEach((p) => {
        const pPct = (p.avgPerDay / ordDose) * 100;
        let badgeClass, badgeText;
        if (p.avgPerDay > ordDose * OVER_THRESHOLD) {
          badgeClass = 'badge-over'; badgeText = 'Över';
        } else if (p.avgPerDay < ordDose * UNDER_THRESHOLD) {
          badgeClass = 'badge-under'; badgeText = 'Under';
        } else {
          badgeClass = 'badge-ok'; badgeText = 'OK';
        }

        const row = document.createElement('div');
        row.className = 'period-row';

        const c1 = document.createElement('span'); c1.className = 'period-cell';
        c1.textContent = `${fmtDate(p.startDate)} – ${fmtDate(p.endDate)} (${p.days}d)`;

        const c2 = document.createElement('span'); c2.className = 'period-cell mono ph-avg';
        c2.textContent = `${p.avgPerDay.toFixed(2)} st/dag`;

        const c3 = document.createElement('span'); c3.className = 'period-cell mono';
        c3.textContent = `${pPct >= 100 ? '+' : ''}${(pPct - 100).toFixed(1)}%`;

        const c4 = document.createElement('span'); c4.className = 'period-cell';
        const badge = document.createElement('span');
        badge.className = `badge ${badgeClass}`;
        badge.textContent = badgeText;
        c4.appendChild(badge);

        row.appendChild(c1); row.appendChild(c2); row.appendChild(c3); row.appendChild(c4);
        frag.appendChild(row);
      });

      rowsContainer.appendChild(frag);
    }
    showEl('lt-period-table-section', true);

    if (medRaw) {
      const ltFassBtn = getEl('lt-fassBtn');
      if (ltFassBtn) {
        ltFassBtn.href = getFassUrl(medRaw);
        showEl('lt-fassBtn', true, 'inline-flex');
      }
    }

    const periodSummary = periods.map((p, idx) =>
      `  Period ${idx+1}: ${fmtDate(p.startDate)}–${fmtDate(p.endDate)} (${p.days} dagar, ${p.total} tabletter, snitt ${p.avgPerDay.toFixed(2)} st/dag)`
    ).join('\n');

    const journalText =
`Kontaktorsak: Förbrukningsanalys av ${medRaw}.

Ordinerad dos: ${ordDose} st/dag.
Analysperiod: ${periods.length} period(er) totalt ${totalDays} dagar.

Perioder:
${periodSummary}

Sammanlagd snittförbrukning: ${avgStr} (${consumptionPct.toFixed(1)}% av ordinerad dos).

Bedömning: ${alertTitle.replace(/^\S+\s+/, '')} — ${alertMsg}`;

    const copyBody = getEl('lt-copyBody');
    if (copyBody) copyBody.textContent = journalText;
    showEl('lt-copySection', true);
  }

  // Map med timer-referenser per knapp — undviker race conditions vid snabba klick
  const ltCopyTimers = new Map();
  function copyLtText() {
    const body = getEl('lt-copyBody');
    const text = body ? body.textContent : '';
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.querySelector('#lt-copySection .copy-footer .btn');
      if (!btn) return;
      const orig = btn.dataset.origLabel || btn.textContent;
      btn.dataset.origLabel = orig;
      btn.textContent = '✅ Kopierat!';
      // Töm tidigare timer för denna knapp
      if (ltCopyTimers.has(btn)) clearTimeout(ltCopyTimers.get(btn));
      const timer = setTimeout(() => {
        btn.textContent = orig;
        delete btn.dataset.origLabel;
        ltCopyTimers.delete(btn);
      }, 1800);
      ltCopyTimers.set(btn, timer);
    }).catch(() => showCopyError(document.querySelector('#lt-copySection .copy-footer .btn'), 'Kopiera manuellt'));
  }

  /* ────────────────────────────────────────────
     Initiering
  ─────────────────────────────────────────── */
  buildCards();

  // Hämta sparat tema; fallback till standard om localStorage är blockerat (privat läge etc)
  try {
    const savedTheme = localStorage.getItem('theme') || 'klinisk';
    applyTheme(savedTheme);
  } catch (e) {
    console.warn('localStorage inte tillgängligt, använder standardtema');
    applyTheme('klinisk');
  }

  ltPeriodCount = 1;
  buildPeriodContainer();

  // Event delegation för medicinkort — ersätter alla inline-handlers i kortmallen
  const cardsGrid = getEl('cardsGrid');
  if (cardsGrid) {
    cardsGrid.addEventListener('input', e => {
      const card = e.target.closest('.card-horizontal');
      if (!card) return;
      const i = parseInt(card.id.replace('card', ''), 10);
      if (isNaN(i)) return;
      // Narkotikakontroll vid inmatning i läkemedelsfältet
      if (e.target.id === 'med' + i) checkNarcotic(i);
      // Auto-formatering av datum
      if (e.target.id === 'date' + i) autoFormatDate(e.target);
      ensureDebounce(i); calcDebounced[i]();
    });
    // Omedelbar omräkning vid change (blur) på datumfältet —
    // input-delegationen täcker tangentbordsinmatning; change fångar klistring/autofyll
    cardsGrid.addEventListener('change', e => {
      if (!e.target.matches('input[id^="date"]')) return;
      const card = e.target.closest('.card-horizontal');
      if (!card) return;
      const i = parseInt(card.id.replace('card', ''), 10);
      if (!isNaN(i)) calc(i);
    });
    // Klick-delegation för kortets knappar och flikar
    cardsGrid.addEventListener('click', e => {
      const actionEl = e.target.closest('[data-action]');
      if (!actionEl) return;
      const card = actionEl.closest('.card-horizontal');
      if (!card) return;
      const i = parseInt(card.id.replace('card', ''), 10);
      if (isNaN(i)) return;
      const action = actionEl.dataset.action;
      if (action === 'remove-card')  removeMedCard(i);
      else if (action === 'clear-card')   clearCard(i);
      else if (action === 'switch-tab')   switchTab(i, actionEl.dataset.tab);
      else if (action === 'toggle-lang')  togglePatientLang(i);
      else if (action === 'copy')         copyText(i);
    });
  }

  // Event delegation för periodfält (Långvarig förbrukning)
  const periodsContainer = getEl('lt-periods-container');
  if (periodsContainer) {
    periodsContainer.addEventListener('input', e => {
      if (e.target.matches('input[type="text"]')) autoFormatDate(e.target);
      calcLongtermDebounced();
    });
    periodsContainer.addEventListener('change', e => {
      if (e.target.matches('input[type="text"]')) calcLongterm();
    });
    periodsContainer.addEventListener('click', e => {
      const btn = e.target.closest('[data-action="remove-period"]');
      if (btn) {
        const idx = parseInt(btn.dataset.idx, 10);
        if (!isNaN(idx)) removePeriod(idx);
      }
    });
  }

  // Statiska knappar i HTML — addEventListener ersätter inline onXxx-attribut
  const themeSelect = getEl('themeSelect');
  if (themeSelect) themeSelect.addEventListener('change', e => applyTheme(e.target.value));

  const clearAllBtn = getEl('clearAllBtn');
  if (clearAllBtn) clearAllBtn.addEventListener('click', () => confirmClearAll());

  document.querySelectorAll('.main-tab').forEach(btn => {
    btn.addEventListener('click', () => switchMainTab(btn.dataset.tab));
  });

  const addMedBtn = getEl('addMedBtn');
  if (addMedBtn) addMedBtn.addEventListener('click', addMedCard);

  const addPeriodBtn = getEl('addPeriodBtn');
  if (addPeriodBtn) addPeriodBtn.addEventListener('click', addPeriod);

  const clearLongtermBtn = getEl('clearLongtermBtn');
  if (clearLongtermBtn) clearLongtermBtn.addEventListener('click', clearLongterm);

  // Fält för Långvarig förbrukning (static — ej i periodContainer)
  const ltMedEl = getEl('lt-med');
  if (ltMedEl) ltMedEl.addEventListener('input', calcLongtermDebounced);
  const ltDoseEl = getEl('lt-dose');
  if (ltDoseEl) ltDoseEl.addEventListener('input', calcLongtermDebounced);

  const ltCopyBtn = getEl('ltCopyBtn');
  if (ltCopyBtn) ltCopyBtn.addEventListener('click', copyLtText);

  const continueSessionBtn = getEl('continueSessionBtn');
  if (continueSessionBtn) continueSessionBtn.addEventListener('click', resetTimer);

  const closeClearModalBtn = getEl('closeClearModalBtn');
  if (closeClearModalBtn) closeClearModalBtn.addEventListener('click', closeClearModal);

  const executeClearAllBtn = getEl('executeClearAllBtn');
  if (executeClearAllBtn) executeClearAllBtn.addEventListener('click', executeClearAll);

  // Aktivitetslyssnare för inaktivitetstimer
  ['click','keydown','touchstart'].forEach(e =>
    document.addEventListener(e, () => resetTimer(true), { passive: true })
  );

  // Säkerställ att datumberoende beräkningar uppdateras vid fönsterfokus / synlighet
  // (t.ex. om sessionen korsar midnatt så att getToday() hämtar korrekt dygn)
  function recalcOnDateChange() {
    _todayCache = null; _todayCacheKey = '';
    for (let i = 0; i < medCardCount; i++) {
      if (states[i] && states[i].valid) calc(i);
    }
    if (ltPeriodCount > 0) calcLongterm();
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) recalcOnDateChange();
  });
  window.addEventListener('focus', recalcOnDateChange);
  // Sätt förvalt startdatum för Långvarig förbrukning till ett år sedan
  const ltStart0 = getEl('lt-start-0');
  if (ltStart0 && !ltStart0.value) ltStart0.value = oneYearAgoStr();

  resetTimer();

  // Rensa patientdata när sidan döljs (t.ex. bakåtknapp, flikbyte).
  // pagehide täcker bfcache-scenariot där sidan fryses istället för att laddas om.
  // Observera: både states[] och synliga DOM-fält rensas — annars kan bfcache
  // återställa sidan med patientdata synlig i formulären.
  window.addEventListener('pagehide', () => {
    // Rensa in-memory beräkningsresultat
    states = states.map(() => ({}));

    // Rensa synliga formulärfält i receptförnyelse-korten
    const today = todayStr();
    for (let i = 0; i < medCardCount; i++) {
      ['med', 'dose', 'amt', 'ref', 'left'].forEach(field => {
        const el = document.getElementById(field + i);
        if (el) el.value = '';
      });
      const dateEl = document.getElementById('date' + i);
      if (dateEl) dateEl.value = today;
      const bodyEl = document.getElementById('copyBody' + i);
      if (bodyEl) bodyEl.textContent = '';
    }

    // Rensa fält för långvarig förbrukningsanalys
    const ltMedEl  = document.getElementById('lt-med');      if (ltMedEl)  ltMedEl.value = '';
    const ltDoseEl = document.getElementById('lt-dose');     if (ltDoseEl) ltDoseEl.value = '';
    const ltCopyEl = document.getElementById('lt-copyBody'); if (ltCopyEl) ltCopyEl.textContent = '';
    for (let i = 0; i < ltPeriodCount; i++) {
      const se = document.getElementById('lt-start-' + i); if (se) se.value = '';
      const te = document.getElementById('lt-total-' + i); if (te) te.value = '';
      const ee = document.getElementById('lt-end-'   + i); if (ee) ee.value = '';
    }
  });

  // Vid återkomst från bfcache (pageshow med persisted=true): states och DOM är redan
  // rensade av pagehide-hanteraren, så här behövs bara datumcachen tömmas och timern
  // återstartas så att inaktivitetstimern tickar korrekt från sidvisningen.
  window.addEventListener('pageshow', e => {
    if (!e.persisted) return;
    _todayCache = null;
    resetTimer();
  });
