// === CENTRALISERAD TILLSTÅNDSHANTERING ===
// All klinisk state deklareras här. Alla mutationer ska gå via nedanstående
// funktioner — direktskrivning till state-variablerna är inte tillåten utanför
// denna fil. För läsning: använd getState(i). Direktläsning (states[i]) är
// tillåten men getState(i) rekommenderas.
//
// Beroende: utils.js måste vara laddat före denna fil (oneYearAgoStr, todayStr).

/* Klinisk state */
let _nextCardId   = 2;
let states         = [{ _cardId: 1 }];
let activeMedIdx   = 0;
let prescribeState = {};
let ltPeriods      = [{ start: oneYearAgoStr(), total: '', end: todayStr() }];

/* Sjuksköterskevy */
let nurseViewActive         = false;
let nurseVitalNormal        = false;
let nurseFollowUpAdequate   = false;

// === AKTIVT LÄKEMEDEL ===

function setActiveMed(i) {
  activeMedIdx = i;
}

// === STATES[i] MUTATIONER ===

// Applicerar ett partiellt objekt på states[i]. Skapar elementet om det saknas.
function applyMedStatePatch(i, patch) {
  if (!states[i]) states[i] = {};
  Object.assign(states[i], patch);
}

// Ersätter states[i] med ett nytt objekt (t.ex. vid hård nollställning av ett kort).
// Bevarar _cardId så att calcDebounced-Map:en inte tappar sin nyckel.
function setMedState(i, value) {
  const cardId = states[i] && states[i]._cardId;
  states[i] = value;
  if (cardId) states[i]._cardId = cardId;
}

// Sätter en enskild UI-preferens (activeTab, patientLang) utan att röra klinisk data.
function setMedUIPreference(i, key, value) {
  if (!states[i]) states[i] = {};
  states[i][key] = value;
}

// Rekommenderad läs-accessor för states[i]. Returnerar alltid ett objekt
// (aldrig undefined/null) för att skydda mot krasch vid obefintligt index.
function getState(i) {
  return states[i] || {};
}

// Nollställer all klinisk data utan att ändra arrayens längd — används vid pagehide
// för att undvika att data finns kvar i bfcache.
function clearAllMedStateData() {
  states        = states.map(() => ({}));
  prescribeState = {};
  activeMedIdx  = 0;
  ltPeriods     = [{ start: '', total: '', end: '' }];
  resetNurseState();
}

// === PRESCRIBESTATE[i] MUTATIONER ===

// Initierar (eller nollställer) prescribeState[i] med ett givet värde.
function initPrescribeState(i, initial) {
  prescribeState[i] = initial;
}

// Applicerar ett partiellt objekt på prescribeState[i].
// Är ett no-op om prescribeState[i] inte finns (null/undefined).
function applyPrescribeStatePatch(i, patch) {
  if (!prescribeState[i]) return;
  Object.assign(prescribeState[i], patch);
}

// === LÄKEMEDELSKORT: LÄGG TILL / TA BORT ===

// Lägger till ett tomt läkemedelskort och returnerar det nya indexet.
function pushMedCard() {
  states.push({ _cardId: _nextCardId++ });
}

// Tar bort kort vid index i och kompakterar prescribeState.
// calcDebounced hanteras separat i app.js (Map<cardId, fn>, inga index).
function spliceMedCard(i) {
  states.splice(i, 1);
  const newPS = {};
  for (let j = 0; j < states.length; j++) {
    newPS[j] = prescribeState[j >= i ? j + 1 : j];
  }
  prescribeState = newPS;
}

// Återställer all klinisk state till grundläget (ett tomt läkemedelskort).
function resetAllMedState() {
  _nextCardId   = 2;
  states         = [{ _cardId: 1 }];
  activeMedIdx   = 0;
  prescribeState = {};
  resetLtPeriods();
  resetNurseState();
}

// === SJUKSKÖTERSKEVY ===

function setNurseView(v) {
  nurseViewActive = !!v;
}

function setNurseVitalNormal(v) {
  nurseVitalNormal = !!v;
}

function setNurseFollowUpAdequate(v) {
  nurseFollowUpAdequate = !!v;
}

function resetNurseState() {
  nurseViewActive = false;
  nurseVitalNormal = false;
  nurseFollowUpAdequate = false;
}

// === LTPERIODS MUTATIONER ===

// Sätter ett enskilt fältvärde på en period. Tyst no-op om perioden inte finns.
function setLtPeriodField(i, field, value) {
  if (ltPeriods[i]) ltPeriods[i][field] = value;
}

// Lägger till en tom period. Returnerar true om det lyckades, false om taket (10) nåtts.
function pushLtPeriod() {
  if (ltPeriods.length >= MAX_LT_PERIODS) return false;
  ltPeriods.push({ start: '', total: '', end: '' });
  return true;
}

// Tar bort period vid index i. Returnerar false om det bara finns en period kvar.
function spliceLtPeriod(i) {
  if (ltPeriods.length <= MIN_LT_PERIODS) return false;
  ltPeriods.splice(i, 1);
  return true;
}

// Återställer perioder till ett tomt standardläge.
function resetLtPeriods() {
  ltPeriods = [{ start: oneYearAgoStr(), total: '', end: todayStr() }];
}