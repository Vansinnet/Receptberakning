# KODGRANSKNING: Svelte 5 Receptberäkningsverktyg

**Datum:** 2026-05-19  
**Omfattning:** Hela `src/lib/` och `src/components/`  
**Metod:** Systematisk analys enligt 9-punktschecklista för Svelte 5

---

## DETALJERADE FYND

### 1. SVELTE 5 RUNES & REAKTIVITET

| # | Fil | Rad(er) | Allvarlighetsgrad | Kategori | Beskrivning | Rotorsak | Rekommenderad åtgärd |
|---|-----|---------|-------------------|----------|-------------|----------|----------------------|
| 1 | `state.svelte.ts` | 187-193 | Kritisk | Race condition i $derived | `_activeResult` läser från `_cardStatusPrev` Map för tidigare värden. Men `_cardStatusPrev` uppdateras endast via `_syncCardStatus()` i App.svelte, vilket körs i en separat `$effect` (rad 141). Om `_activeResult` utvärderas innan `_syncCardStatus()` körs, använder beräkningen gamla flaggor för `flagsChanged`-detection. Detta kan ge felaktig `earlyRenewalDecision`-reset. | `_cardStatusPrev` är non-reactive Map. Svelte garanterar inte att `_effect` på rad 141 körs före `$derived` på rad 187. | Flytta `_syncCardStatus()` logik in i samma `$derived.by` som `_texts` (rad 212), eller gör `_cardStatusPrev` till `$state` och uppdatera den direkt i `_texts.by`. |
| 2 | `App.svelte` | 144-162 | Allvarlig | Villkorad cleanup i $effect | Event listeners registreras och cleanup definieras inuti `if (typeof document !== 'undefined')`. Om denna condition är false första gången, registreras listeners ej. Om sedan condition blir true senare och listeners registreras, men cleanup är definierad inuti samma if, kan cleanup misas. Dessutom — cleanup-funktionen är returvärdet från if-blocket, vilket betyder om blocket inte körs, returneras undefined, och cleanup körs aldrig. | If-sats rundar cleanup-definition. Om villkoret är false, returneras ingen cleanup-funktion. | Flytta cleanup-definition utanför if-blocket. Registrera listeners villkorligt men definiera cleanup utan villkor: `$effect(() => { if (typeof document === 'undefined') return; document.addEventListener(...); return () => { document.removeEventListener(...); }; })` |
| 3 | `App.svelte` | 166-173 | Allvarlig | Implicit beroende på Map i $effect | `$effect` loopar `medCards` array och läser `getCardStatus(cardId)` för varje kort. `getCardStatus()` returnerar värden från `_cardStatus` Map (state.svelte.ts rad 180). Om kort läggs till/tas bort eller ordningen ändras, kan loopen hoppa över eller missa ändringar på grund av implicit tracking av Map. Svelte 5 trackerar `$state`-ändringar, men if-branchens logik gör loopen fragil. | Implicit reaktivitet på non-Array data structure. | Gör loopen explicit reaktiv: `$effect(() => { const statuses = medCards.map(c => getCardStatus(c._cardId)); ... })` för att tvinga array-dependency. |
| 4 | `state.svelte.ts` | 212-356 | Kritisk | Mutation i `$derived.by` utan cleanup | `_texts` är en `$derived.by` som muterar `cardStatusUpdates` array (rad 218, 237, 249, 257). Sedan anropas denna array från `_syncCardStatus()` (rad 364). Men `_texts` kan omvärderas när som helst — multipla omvärderingar kan orsaka att `cardStatusUpdates` byts ut utan att tidigare värden processas. Viktigt: denna mutation är dock OK enligt Svelte 5 (derivat kan muteras tillfälligt för caching), men det är felaktigt att read/mutate från beroende $effect. | Derivat muterar lokala värden för tempkaching. Senare `$effect` läser dessa värden. | Validering: Kontrollera att `_texts` endast omvärderas när dess faktiska inputs ändras (medCards, _app.currentDate, etc.). Lägg till eksplicit logging för att spåra cardStatusUpdates. |
| 5 | `MedCard.svelte` | 143-150 | Allvarlig | `bind:value` med event handlers kan orsaka race condition | `bind:value={card.form.medRaw}` kombineras med `oninput={handleMedInput}`, `onkeydown={handleAcKeydown}`, `onblur={handleBlur}`. I Svelte 5 kan `bind:` race-condition med event handlers om bindingen uppdateras medan handler kör async-kod (handleMedInput är async). Mellan await och callback kan DOM-värdet ha ändrats av binding. | Svelte 5:s binding-system uppdaterar state asynchront medan event handlers körs. Async handlers kan race. | Använd enbart event handlers, inte `bind:value`. Manual state update i `oninput`: `const idx = getActiveMedIdx(); if (idx >= 0 && idx < medCards.length) medCards[idx].form.medRaw = (e.target as HTMLInputElement).value;` |

**Kategori 1 Sammanfattning:**  
- **Kritisk:** 2 buggar (race conditions i derived-kedjor, mutation i derived)
- **Allvarlig:** 3 buggar (villkorad cleanup, implicit Map-tracking, bind+async race)

---

### 2. PROPS & KOMPONENTGRÄNSSNITT

| # | Fil | Rad(er) | Allvarlighetsgrad | Kategori | Beskrivning | Rotorsak | Rekommenderad åtgärd |
|---|-----|---------|-------------------|----------|-------------|----------|----------------------|
| 6 | `CalcResult.svelte` | 6-12 | Lindrig | Props använder default callback | `onEarlyDecision = (_decision: 'yes' \| 'no') => {}` och `onCopy = () => {}` är default no-op callbacks. Dessa bör inte ha defaults — komponent bör kräva callbacks eller göra intern state-hantering. | Props med default callbacks kan ge stumma fel om parent glömmer att skicka handler. | Ändra till `onEarlyDecision: (decision: 'yes' \| 'no') => void` utan default, eller gör logik intern i komponenten. I detta fall är intern state OK eftersom CalcResult är dumb component. |

**Kategori 2 Sammanfattning:**  
- **Lindrig:** 1 bugg (prop design utan tvång)

---

### 3. TILLSTÅNDSHANTERING

| # | Fil | Rad(er) | Allvarlighetsgrad | Kategori | Beskrivning | Rotorsak | Rekommenderad åtgärd |
|---|-----|---------|-------------------|----------|-------------|----------|----------------------|
| 7 | `App.svelte` | 85-90 | Kritisk | Array bounds-check saknas före mutation | `handleEarlyDecision()` muterar `medCards[idx].earlyRenewalDecision` utan att verifiera att `idx >= 0 && idx < medCards.length`. Om `idx = -1` eller > length, blir mutationen undefined-fel. `getActiveMedIdx()` kan returnera 0, vilket är giltigt, men ingen dokumentation säger vad som returneras om inget kort är aktivt. | Ingen bounds-check. | Lägg till guard: `if (idx < 0 \|\| idx >= medCards.length) return;` |
| 8 | `state.svelte.ts` | 176-177 | Allvarlig | Non-reactive Map (`_cardStatusPrev`) parallellt med reactive Record (`_cardStatus`) | `_cardStatusPrev` är en vanlig `Map` (non-reactive) och `_cardStatus` är `$state<Record>`. Två parallella strukturer som måste hålla sync. Risk för desync när kort läggs till/tas bort snabbt, eller om `_syncCardStatus()` inte körs vid rätt tid. | Två separata strukturer med manuell synk-logik. | Kombinera till en enda `$state<Record<number, CardStatusCache & { _prev?: CardStatusCache }>>` eller använd två `$state` Records istället för Map + Record. |
| 9 | `state.svelte.ts` | 363-369 | Allvarlig | `_syncCardStatus()` kan tappa updates | `_syncCardStatus()` anropas från App.svelte `$effect` (rad 141). Men `_texts` kan omvärderas flera gånger mellan två `_syncCardStatus()` calls. Om en ny omvärdering av `_texts` sker innan effekten körs nästa gång, överskrives `cardStatusUpdates` utan att gamla updates processats. Ingen queue eller buffering — bara senast värde används. | No queuing/buffering av updates. | Lägg `cardStatusUpdates` i en queue eller array som växer över tid, och processas incrementellt. Alternativt: gör `_syncCardStatus()` till en reactive derivation som alltid kör när `_texts.cardStatusUpdates` ändras. |
| 10 | `state.svelte.ts` | 85-96 | Medelsvårt | Möjlig minnesläcka vid `spliceMedCard()` | Vid borttagning av kort rensas `_prescribeState` och `_cardStatus` (rad 89-91). Men om samma `_cardId` återanvänds senare (genom `pushMedCard()` som inkrementerar `nextCardId`), är risk liten. Men det är möjligt attorphaned entries existerar om logiken ändras. Inte omedelbar bug, men arkitektur-risk. | Manuell cleanup av två strukturer. | Lägg cleanup i en `deleteMedCardCache(cardId)` funktion och anropa alltid från en plats för DRY. |

**Kategori 3 Sammanfattning:**  
- **Kritisk:** 1 bugg (array bounds-check)
- **Allvarlig:** 2 buggar (Map/Record sync, queue updates)
- **Medelsvårt:** 1 bugg (potential minnesläcka vid cleanup)

---

### 4. BERÄKNINGS- & DERIVED-KEDJOR

| # | Fil | Rad(er) | Allvarlighetsgrad | Kategori | Beskrivning | Rotorsak | Rekommenderad åtgärd |
|---|-----|---------|-------------------|----------|-------------|----------|----------------------|
| 11 | `state.svelte.ts` | 358-361 | Kritisk | `getActiveTexts()` returnerar tom `cardStatusUpdates` array | Funktionen läser `_texts` (som innehåller korrekt `cardStatusUpdates`) men returnerar `{ ..., cardStatusUpdates: [] }` — alltid tom! Detta gör att `_syncCardStatus()` får tom array och uppdateringar tappas. Hela update-flödet för kort-status går förlorad. | Copy-paste error. Returen hardkodar tom array istället för att sprida `_texts.cardStatusUpdates`. | Ändra rad 358-361 till: `export function getActiveTexts(): TextResult { return _texts; }` (return helt objekt, inte just fälten). |
| 12 | `state.svelte.ts` | 231 | Medelsvårt | Standard-defaults i calcCore kan ge felaktig flagsChanged-detection | `_activeResult` anropar `calcCore()` med `_cardStatusPrev.get(...)?.[key] ?? false`. För nytt kort eller kort som inte finns i cache returneras `false` för båda flags. Detta kan ge felaktig `flagsChanged`-logik i `calcCore()` rad 240 (jämför prev flags mot nya). Första gången ett kort beräknas returneras alltid `flagsChanged = true` även om det är samma värden. | Default-fallback är false, vilket kan vara syntaktiskt korrekt men semantiskt fel för flags. | Explicit hantera missing prev-cache: `const prev = _cardStatusPrev.get(...) ?? { isOveruse: null, isTooEarly: null, earlyRenewalDecision: null };` och använd null-jämförelse istället för false-jämförelse. |

**Kategori 4 Sammanfattning:**  
- **Kritisk:** 1 bugg (tom cardStatusUpdates return)
- **Medelsvårt:** 1 bugg (false-defaults i flagsChanged)

---

### 5. LIVSCYKEL & EVENT-HANTERING

| # | Fil | Rad(er) | Allvarlighetsgrad | Kategori | Beskrivning | Rotorsak | Rekommenderad åtgärd |
|---|-----|---------|-------------------|----------|-------------|----------|----------------------|
| 13 | `App.svelte` | 111-121 | Allvarlig | `setInterval` kan läcka vid multipla resetInactivityTimer-anrop | `resetInactivityTimer()` rensas timers först (rad 103-104) men skapar nya (rad 113). Om denna funktion anropas ofta (t.ex. från mousemove handlers), kan gamla intervals lämnas bakom om clearInterval misslyckas eller om refs försvinner. Dessutom — interval sparas i `inactivityCountdownTimer` som är modul-scope, så om två intervals startas innan första rensas, andra överskriver första-referensen. | Interval-refs sparas i en enda variabel som kan överskrivas. | Använd explicit array: `const intervals: ReturnType<typeof setInterval>[] = [];` och iterera över alla när du rensar: `intervals.forEach(id => clearInterval(id)); intervals.length = 0;` |
| 14 | `MedCard.svelte` | 92-97 | Medelsvårt | `setTimeout` i `handleBlur()` saknar cleanup | `handleBlur()` använder `setTimeout` utan cleanup. Om komponenten unmounts innan timeout körs, körs callback ändå och kan försöka uppdatera unmounted state. Svelte 5 ger warning men detta är risk för race. | Timer registreras utan cleanup vid unmount. | Lagra timer-ID: `let blurTimer: number \| null = null;` och renså i `onDestroy`: `import { onDestroy } from 'svelte'; onDestroy(() => { if (blurTimer) clearTimeout(blurTimer); });` Eller använd `setTimeout` direkt utan wrapper-funktion. |
| 15 | `App.svelte` | 146-150 | Medelsvårt | Event listeners kan registreras dubbelt om samma handler-ref är olika | Samma funktioner (`showTooltip`, `hideTooltip`) registreras för `mouseover` & `focusin` respektive `mouseout` & `focusout`. Svelte 5 bör hantera detta korrekt, men om handler-ref ändras mellan renders, kan duplikater bildas. Ingen uppenbar bug men fragil design. | Handler registreras för flera events men cleanup är en shared return från $effect. | Skapa en setup-funktion i event-listener setup-blocket som är explicit: `const handlersMap = { mouseover: showTooltip, focusin: showTooltip, mouseout: hideTooltip, focusout: hideTooltip }; Object.entries(handlersMap).forEach(([evt, hdl]) => document.addEventListener(evt, hdl)); return () => Object.entries(handlersMap).forEach(([evt, hdl]) => document.removeEventListener(evt, hdl));` |

**Kategori 5 Sammanfattning:**  
- **Allvarlig:** 1 bugg (interval refs kan överskrivas)
- **Medelsvårt:** 2 buggar (setTimeout cleanup, listener duplikater)

---

### 6. TILLGÄNGLIGHET (A11Y) & DOM

| # | Fil | Rad(er) | Allvarlighetsgrad | Kategori | Beskrivning | Rotorsak | Rekommenderad åtgärd |
|---|-----|---------|-------------------|----------|-------------|----------|----------------------|
| 16 | `MedCard.svelte` | 129 | Medelsvårt | FASS-länk kan ha undefined `href` | `href={fassUrl}` kan vara undefined eller tom sträng baserat på `getFassUrl()`. Om medRaw är tomt, returnerar getFassUrl möjligen tom string. Knapp är conditional (`{#if card.form.medRaw}`) så detta är delvis skyddat, men getFassUrl returnerar inte explicit värde. | getFassUrl() saknar null-check return. | Validera: `href={fassUrl ?? '#'}` eller ändra knappens visibility: `{#if fassUrl}` istället för `{#if card.form.medRaw}` |
| 17 | `App.svelte` | 260-273 | Lindrig | Emoji-ikoner saknar `aria-hidden` | Interaction warning-ikoner använder emoji `⚠` och `⚡` som är dekorativa. De bör ha `aria-hidden="true"`. | Emoji är dekorativa men inte markerade som sådana. | Lägg till `aria-hidden="true"` på divs som innehåller bara emoji: `<span aria-hidden="true">{w.s === 'danger' ? '⚠' : '⚡'}</span>` |
| 18 | `CalcResult.svelte` | 82 | Lindrig | `aria-valuenow` kan ta undefined värde | `aria-valuenow={Math.round(result.tlPct)}` — `tlPct` kan vara null/undefined. Math.round(null) = 0, men bör vara explicit. | Null-safety på ARIA-attribut. | Lägg till: `{Math.round(result.tlPct ?? 0)}` eller `{Math.round(result.tlPct ?? 100)}` beroende på semantik. |
| 19 | `App.svelte` | 331-338 | Lindrig | Inactivity toast har inte tillräckligt kontrast-info | Toast-meddelandet använder `aria-live="assertive"` och `role="alert"` korrekt, men styling-info saknas (att kontrollera). Förutsätter att CSS-styling ger tillräcklig kontrast. | A11y-attribut OK men implementering beror på CSS. | Verifiera CSS-kontrast för toast via automated a11y-test. |

**Kategori 6 Sammanfattning:**  
- **Medelsvårt:** 1 bugg (undefined href)
- **Lindrig:** 3 buggar (emoji aria-hidden, aria-valuenow null, CSS-kontrast)

---

### 7. TYPER & TYPESCRIPT

| # | Fil | Rad(er) | Allvarlighetsgrad | Kategori | Beskrivning | Rotorsak | Rekommenderad åtgärd |
|---|-----|---------|-------------------|----------|-------------|----------|----------------------|
| 20 | `MedCard.svelte` | 34-44 | Medelsvårt | Null-check på `card` följd av unsafe mutation | `if (card) { card.form.atcCode = ... }` — efter if-blocket kan `card` fortfarande vara null enligt strict null-checks, men rad 34 antar att `card !== null`. TypeScript-kontrollen kan missa detta om type-narrowing inte är korrekt. | If-sats gör inte implicit type-narrowing utanför blocket. | Lägg till type-guard: `if (!card) return;` före mutationerna, eller använd optional chaining: `card?.form?.atcCode = ...` (men detta är read-only, måste använda `if` för mutations). |
| 21 | `PrescribePanel.svelte` | 72-83 | Medelsvårt | Partiell `MedState` typ-assertion | `const s: MedState = { _cardId, dose, doseInterval, doseUnit, prescribedEndDateStr }` — `s` är inte en komplett `MedState`, bara ett partiellt objekt. `calcPrescribeResult()` accepterar denna typ, men om koden senare förväntar sig alla MedState-fält, kan runtime-error ske. | Type-assertion för partiella objekt utan explicit `Partial<>`. | Använd explicit typ: `const s: Partial<MedState> = { ... }` eller definierad interface för denna användning. |
| 22 | `state.svelte.ts` | 189-190 | Lindrig | Redundant type-fallback | `_cardStatusPrev.get(medCards[_app.activeMedIdx]?._cardId ?? -1)` — `_cardId` är redan känd från kort-objektet, så `-1` är bara fallback om kort är undefined (vilket redan hanteras av `??`). | Redundant null-handling. | Förenkla: `const cardId = medCards[_app.activeMedIdx]?._cardId; const prev = cardId ? _cardStatusPrev.get(cardId) : undefined;` |
| 23 | `calc.ts` | 50-70 | Lindrig | Många inline type-narrowing checks utan typad guard | Validering av `amt`, `dose`, `ref`, etc. använder inline `isNaN()`, `Number.isFinite()`, `Number.isInteger()` checks utan typad type-guards (t.ex. `is`-predicates). Код lesbar men kan göras mer underhållig. | Manual inline-validation. | Definiera type-guard funktioner i utils.ts: `function isValidInteger(v: any): v is number { return Number.isInteger(v) && Number.isFinite(v); }` |

**Kategori 7 Sammanfattning:**  
- **Medelsvårt:** 2 buggar (null-check, partial type-assertion)
- **Lindrig:** 2 buggar (redundant fallback, inline type-checks)

---

### 8. PRESTANDA & LOGIKFEL

| # | Fil | Rad(er) | Allvarlighetsgrad | Kategori | Beskrivning | Rotorsak | Rekommenderad åtgärd |
|---|-----|---------|-------------------|----------|-------------|----------|----------------------|
| 24 | `MedCard.svelte` | 33-59 | Allvarlig | Race condition i async `handleMedInput` | `acSearchSeq` incrementeras (rad 35) och `seq` sparas (rad 36). Men detta är inte atomisk operation. Om två input-events triggas snabbt efter varandra kan båda få samma `seq`-värde innan första await. Mellan increment och användning av seq kan race ske. | Sekvens-ID inte atomisk. | Gör sequencing-logik atmoisk: `const localSeq = ++acSearchSeq;` på en rad. Eller ännu bättre — använd AbortController istället för sekvens-ID för async cancellation: `const ac = new AbortController(); oldAc?.abort(); oldAc = ac; await loadDrugs(); if (ac.signal.aborted) return;` |
| 25 | `state.svelte.ts` | 219-258 | Medelsvårt | O(n) loop i `_texts` derived-chain | `_texts` loopar igenom alla `medCards` för att validera och beräkna. För 8 kort är detta OK, men om MAX_MED_CARDS stiger eller logiken blir komplexare, kan detta bli bottleneck. Ingen memoization eller keying. | Ingen optimering av loop. | Implementera key-based update: spåra bara kort som faktiskt ändrades genom `_previousMedCards` och diff, eller använd indexed results-cache. För MVP är detta OK. |
| 26 | `state.svelte.ts` | 333-348 | Medelsvårt | Nested loop i `_texts` för prescribe-result | Två loopar: en för `cardResults` (rad 270) och en för `toRenew` (rad 333). Båda loopar kan O(n²) i värsta fall. Men för 8 kort är detta OK. | Nested loops utan optimering. | Denna är låg-prioritet för MVP, men kan optimeras senare genom att bygga Map<cardId> direkt i första loopen. |
| 27 | `LongtermPanel.svelte` | 38-44 | Lindrig | Implicit beroende på `ltPeriods` i `$derived.by` | `result` derived läser `ltPeriods` men gör `ltPeriods.map(...)` vilket är reaktivt, men map-resultat är nytt objekt varje gång. Ingen risk för race men ineffektivt. | Map returnerar ny array varje gång, även om items är oförändrade. | Lägg till explicit dependency spårning eller använd strukturell likhet-check före `.map()`. För detta fall är inlining OK. |

**Kategori 8 Sammanfattning:**  
- **Allvarlig:** 1 bugg (race condition i async sekvens)
- **Medelsvårt:** 2 buggar (O(n) loops, nested loops)
- **Lindrig:** 1 bugg (implicit dependency)

---

### 9. KONSTANTER & KONFIGURATION

| # | Fil | Rad(er) | Allvarlighetsgrad | Kategori | Beskrivning | Rotorsak | Rekommenderad åtgärd |
|---|-----|---------|-------------------|----------|-------------|----------|----------------------|
| 28 | `calc.ts` | 144 | Lindrig | Lokalt definierad `INTERVAL_LABELS` i funktion | `INTERVAL_LABELS` är definierad inuti `calcCore()` istället för i `constants.ts`. Denna mapping är tröskelvärde-information som bör centraliseras. | Konstant definierad lokalt för convenience. | Flytta till constants.ts: `export const INTERVAL_LABELS: Record<DoseInterval, string> = { 1: 'dag', 7: 'vecka', 30: 'månad' };` |
| 29 | `MedCard.svelte` | 141 | Lindrig | Hårdkodad placeholder-text | Placeholder "T.ex. Sertralin 50 mg" är hårdkodad. För lokalisering bör denna vara i konstanter eller språk-fil. | String-literal i komponenten. | Lägg i constants.ts: `export const EXAMPLES = { medName: 'T.ex. Sertralin 50 mg', ... };` och importera. |

**Kategori 9 Sammanfattning:**  
- **Lindrig:** 2 buggar (lokalt definierad konstant, hårdkodad text)

---

## SAMMANFATTNING PER KATEGORI

| Kategori | Kritisk | Allvarlig | Medelsvårt | Lindrig | Total |
|----------|---------|-----------|-----------|---------|-------|
| 1. Runes & Reaktivitet | 2 | 3 | — | — | 5 |
| 2. Props & Gränssnitt | — | — | — | 1 | 1 |
| 3. Tillståndshantering | 1 | 2 | 1 | — | 4 |
| 4. Derivat & Beräkningar | 1 | — | 1 | — | 2 |
| 5. Livscykel & Event | — | 1 | 2 | — | 3 |
| 6. A11Y & DOM | — | 1 | — | 3 | 4 |
| 7. Typer & TypeScript | — | — | 2 | 2 | 4 |
| 8. Prestanda & Logik | — | 1 | 2 | 1 | 4 |
| 9. Konstanter & Config | — | — | — | 2 | 2 |
| **TOTALT** | **4** | **8** | **8** | **9** | **29** |

---

## TOP 10 PRIORITERADE ÅTGÄRDER

### 🔴 MÅSTE FIXAS OMEDELBAR (Kritisk)

1. **state.svelte.ts rad 358-361: Fixa `getActiveTexts()` tom array-bug**
   - **Effekt:** Alla kort-statusuppdateringar tappas. UI visar felaktig status.
   - **Åtgärd:** Returnera `_texts` helt istället för tom `cardStatusUpdates`.
   - **Tid:** 5 min

2. **state.svelte.ts rad 187-193: Fixa race condition mellan `_activeResult` och `_cardStatusPrev`**
   - **Effekt:** Flaggor för överanvändning/för tidigt förnyelse kan sättas felaktigt.
   - **Åtgärd:** Gör `_cardStatusPrev` till `$state` eller flytta sync-logik in i `_texts.by`.
   - **Tid:** 20 min

3. **App.svelte rad 85-90: Lägg till bounds-check i `handleEarlyDecision()`**
   - **Effekt:** Kan orsaka undefined-error vid mutation.
   - **Åtgärd:** `if (idx < 0 || idx >= medCards.length) return;`
   - **Tid:** 5 min

4. **MedCard.svelte rad 143-150: Fixa race condition mellan `bind:value` och async event handler**
   - **Effekt:** Användar-input kan lämnas i inkonsistent tillstånd under search.
   - **Åtgärd:** Ersätt `bind:value` med manuell event-uppdatering.
   - **Tid:** 15 min

### 🟠 BORDE FIXAS SNAR (Allvarlig)

5. **state.svelte.ts rad 363-369: Lägg till queueing för `cardStatusUpdates`**
   - **Effekt:** Updates kan tappas om `_texts` omvärderas snabbt.
   - **Åtgärd:** Använd queue eller gör sync till reaktiv derivation.
   - **Tid:** 30 min

6. **App.svelte rad 144-162: Fixa villkorad cleanup i event-listener `$effect`**
   - **Effekt:** Kan orsaka memory leak av event listeners.
   - **Åtgärd:** Flytta cleanup-definition utanför if-sats.
   - **Tid:** 10 min

7. **App.svelte rad 166-173: Gör `$effect` explicit reaktiv på `getCardStatus()` resultat**
   - **Effekt:** Kan missa earlyRenewalDecision-reset för vissa kort.
   - **Åtgärd:** Gör loopen array-baserad istället för Map-baserad.
   - **Tid:** 15 min

8. **MedCard.svelte rad 33-59: Fixa async race condition i `handleMedInput`**
   - **Effekt:** Search-resultat kan blandas samman vid snabb inmatning.
   - **Åtgärd:** Använd AtomicInteger (JavaScript counter) eller AbortController.
   - **Tid:** 20 min

### 🟡 KAN VÄNTA (Medelsvårt/Lindrig)

9. **App.svelte rad 111-121: Fixa `setInterval` ref-överwriting i `resetInactivityTimer()`**
   - **Effekt:** Kan orsaka memory leak av timeout-handlers.
   - **Åtgärd:** Använd array för att spåra alla aktiva intervals.
   - **Tid:** 15 min

10. **Constants + Text lokalisering**
    - **Effekt:** Svårt att underhålla text och constants spridda över komponenter.
    - **Åtgärd:** Centralisera `INTERVAL_LABELS` och placeholder-texter i constants.ts.
    - **Tid:** 20 min

---

## YTTERLIGARE REKOMMENDATIONER

### Arkitektur-förbättringar
- Dokumentera `_cardStatusPrev` vs `_cardStatus` sync-pattern tydligare eller kombinera till ens struktur
- Lägg till integration tests för state-ändringar (add med, delete kort, calcCore updates)
- Implementera dev-mode assertion för att verifiera `cardStatusUpdates` processas innan nästa omvärdering

### Testing-gaps
- Aktuell testning verkar fokusera på calc.ts (208 tests). Saknade UI-integration-tests för state-mutations
- E2E-tester (32 st) kan utökas med scenarios: add/remove kort snabbt, sökning under debounce, listener cleanup

### Dokumentation
- AGENTS.md är bra, men lägg till arch-docs för state-flow: inputs → $derived-chain → UI
- Dokumentera varför `_cardStatusPrev` är non-reactive (performance vs data-safety tradeoff)

---

**Rapport slut**  
Generated: 2026-05-19 | Granskare: Senior Svelte 5 Code Reviewer
