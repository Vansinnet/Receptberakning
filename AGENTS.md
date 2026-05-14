# AGENTS.md

## Kommandon (körs från `Kod/`)

```bash
npm test                # calc + interactions + UI
npm run test:calc       # beräkningslogik (ingen jsdom)
npm run test:interactions # interaktionsmatchningsmotor (ingen jsdom)
npm run test:ui         # UI-rendering (kräver jsdom)
npm run build:css       # minifiera app.css → app.min.css (~1 s)
npm run build:db        # crawla FASS → data/product-db.json (~45 min)
npm run generate:drugs  # data/product-db.json → Kod/drugs.js (~1 min)
```

`build:css` måste köras efter varje ändring i `app.css` — `index.html` använder `app.min.css`.
`generate:drugs` uppdaterar även datumet (CSS-klass `app-brand-date`) i `index.html`.
Öppna `Kod/index.html` direkt i webbläsaren för lokal utveckling.

## Filstruktur

Alla produktionsfiler i `Kod/`, byggskript i `scripts/`, rådata i `data/`.

`drugs.js` (~6 000 preparat) är **script-genererad** – redigera den inte för hand.  
`app.min.css` genereras med `npm run build:css` från `app.css` – redigera den inte för hand.
Script-load-ordning i `index.html` (måste bevaras): `utils.js` → `state.js` → `drugs.js` → `interactions.js` → `ui-renew.js` → `calc-renew.js` → `prescribe.js` → `longterm.js` → `app.js`.

**Nyckelmönster:** Rena beräkningsfunktioner (`calcCore`, `calcLongtermCore`, `calcPrescribeResult`) saknar DOM-beroenden. DOM-skal läser fält, anropar kärnan, renderar resultat.

## State (state.js)

**All mutation** via accessorfunktioner – direkt tilldelning till `states[]`, `prescribeState`, `ltPeriods[]` är förbjuden utanför state.js. Direktläsning är tillåten.

Viktiga: `applyMedStatePatch(i, patch)`, `setMedUIPreference(i, key, value)`, `pushMedCard()`, `spliceMedCard(i)`, `setLtPeriodField(i, field, value)`, `clearAllMedStateData()` (bfcache-rensning), `resetAllMedState()`.

## Kodkonventioner

- **`el()`** från utils.js för DOM-skapande. Använd aldrig `document.createElement`.
- **Inga defensiva null-checkar** där kontrollflödet garanterar värdet.
- **Två uppdateringsvägar (tung/lätt)** måste uppdatera samma DOM-element – annars blir t.ex. startdatum inaktuellt.
- **Validera oberoende fält oberoende** – samla alla fel, tidig return på första felet leder till onödiga rundor.
- **Synka felmeddelande och kontroll** – `Number.isInteger`, inte `parseFloat > 0`.
- **Kommentarer sparsamma** – endast icke-uppenbara kliniska beslut. Inga sektionsrubriker eller GDPR-block.

## Säkerhet

- **Logga aldrig kliniska uppgifter** (läkemedelsnamn, doser, datum, flaggor). Endast `err.message`.
- Beräkningsfunktioner får inte misslyckas tyst – fånga fel, visa neutralt meddelande, `console.error` med kontext.
- Efter ändring i beräkningslogik: **kör `npm run test:calc`**.
- Efter ändring i interaktioner: **kör `npm run test:interactions`**.
- CSP (`_headers` + `<meta>`) blockerar inline-script och externa anslutningar – lägg inga inline-script.

## Test-hjälpfunktioner

Båda testfilerna patchar `getToday()` via `ctx._mockToday` (mock: `2025-06-15`).  
Hjälpfunktionerna har **olika namn** mellan filerna:

| Syfte | `test-calc.js` | `test-ui.js` |
|---|---|---|
| Sätt läkemedelsstate | `__setTestState(i, data)` | `__setState(i, data)` |
| Sätt prescribeState | `__setTestPS(i, data)` | – |
| Sätt prescribe-globals | `__setPrescribeGlobals(mode, months, endDate)` | samma |
| Aktivera index | – | `__setActive(i)` |
| Återställ state | – | `__resetState()` |

`test-interactions.js` följer samma mönster — laddar `utils.js` → `state.js` → `interactions.js` i VM-kontext utan jsdom.

## Fallgropar

- **`calcDebounced[]`** har indexbaserade closures. Vid `spliceMedCard()`: avbryt timers ≥ borttaget index, splicea, återskapa debounce för skiftade index.
- **`_el()`** i ui-renew.js är en lazy DOM-cache (`_dom[id]`). Rensa via `resetDomCache()` vid pagehide/pageshow. Förväxla inte med `getEl()` från utils – de har olika cache-semantik.
- **`_prescribePanelBuiltFor`** måste nollställas i `resetPrescribePanel()` och pagehide. **Generell regel:** Alla modulnivå-cachevariabler måste rensas i pagehide, clearAll och resetAll – annars inaktuell DOM efter bfcache.
- **`patientLang`** sätts till `'sv'` i `calc()` efter varje beräkning – språkval återställs avsiktligt.
- **Datum:** Alltid ÅÅÅÅ-MM-DD. `parseDateUTC()` validerar strikt (inklusive skottår).
- **CSS state-klasser:** `is-hidden` (dölj), `active` (vald flik/läkemedel), `visible` (toast/modal).
- **Vid borttagning av funktion/fil:** sök igenom `_headers`, `index.html` och CSS efter kvarvarande referenser.
- **`.gitignore`** — vid tillägg av genererade filer (byggskript, minifiering): lägg till i `.gitignore` så de inte checkas in av misstag.

