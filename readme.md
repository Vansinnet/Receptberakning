# Receptberäkning 4.0

> Beräkningshjälpmedel för läkare vid handläggning av receptförnyelser via 1177, nyförskrivning samt analys av långvarig förbrukning.

**Live:** [receptberakning.pages.dev](https://receptberakning.pages.dev/)

---

> **Observera:** Verktyget är endast ett beräkningshjälpmedel. Sjukvårdspersonal ska alltid använda sitt kliniska omdöme. Genererade texter är förslag baserade på matematiska beräkningar och kan behöva justeras utifrån patientens unika situation.

---

## Vad gör verktyget?

Verktyget består av två huvudflikar:

### 1. 💊 Receptförnyelse
Läkaren matar in ordinationsinformation (läkemedel + styrka, senaste receptdatum, mängd per uttag, antal uttag och ordinerad dos). Verktyget beräknar patientens förbrukningstakt och bedömer om förnyelse är lämplig.

Baserat på beräkningen visas ett **utlåtande** med:
- **OK att förnya** – förbrukning inom ±10 % av ordination, eller ≤20 % av receptperioden kvar.
- **För tidigt att förnya** – normal förbrukning men mer än 20 % av receptperioden kvar.
- **Överförbrukning** – snittförbrukning >10 % över ordinerad dos och (mer än 7 dosdagar kvar *eller* mer än 14 perioddagar kvar).

För överförbrukning eller för tidig förnyelse kan läkaren **aktivt överstyra** via knapparna **Ja, förnya** / **Nej, avslå**. Detta påverkar både statusfärg, sidomeny och de genererade texterna.

För varje läkemedel genereras direkt:
- **Svar till patient (svenska)** – redo att skickas via 1177.
- **Svar till patient (engelska)** – växla med en knapp (inklusiva SVG-flaggor).
- **Journalanteckning (förslag)** – anpassad efter bedömningen.

Stöd för upp till **8 läkemedel** i samma session — en sammanhållen patienttext och journalanteckning skapas för alla.

Vid flera läkemedel analyseras automatiskt **läkemedelsinteraktioner** — 89 regler baserade på ATC-koder som varnar för bland annat serotonergt syndrom, blödningsrisk, QT-förlängning och dubbelbehandling. Varningarna graderas som danger (röd) eller warn (gul) och visas ovanför beräkningsresultatet.

När förnyelse beviljas visas en **nyförskrivningspanel** — läkaren anger förskrivningsperiod (1–12 månader eller slutdatum) och verktyget beräknar exakt antal förpackningar med hänsyn till kvarvarande dagar på befintligt recept.

### 2. 📊 Långvarig förbrukning
Analysera förbrukningsmönster över flera receptperioder (upp till 10 perioder). För varje period anges startdatum, antal uttagna enheter och slutdatum. Verktyget beräknar:
- Snittförbrukning per dag i varje period.
- Avvikelse i procent mot ordinerad dos.
- Total snittförbrukning över alla perioder.
- Visuell stapel och status (Över / OK / Under).
- Genererad journalanteckning med sammanfattning.

---

## Funktioner i detalj

### ✅ Receptförnyelse
- Stöd för upp till **8 läkemedel**.
- **Autocomplete** för läkemedelsnamn – sök bland ~8 300 preparat ur FASS.
- **Automatisk datumformatering** (ÅÅÅÅ-MM-DD).
- **Dosintervall** – per dag, per vecka (t.ex. plåster, veckodepåer) eller per månad (t.ex. månadsdepåer, implantat).
- **Dosenheter** – st (tabletter, kapslar, plåster), ml (orala lösningar, injektioner), doser (inhalatorer, nässprayer, ögondroppar, injektionspennor).
- **Ej kvantifierbara beredningar** – krämer, salvor, dialysvätskor, gaser markeras för manuell bedömning.
- **Valfritt fält för kvarvarande mängd** – ger exakt snittberäkning i stället för worst‑case‑antagande. Decimaler tillåtna för ml och doser.
- **Direktlänk till FASS** för aktuellt läkemedel.
- **Narkotikavarning** – identifierar narkotikaklassade preparat enligt LVFS 2011:10 och visar en badge (Förteckning II–V).
- **Tidslinje** – visar hur stor del av receptperioden som förflutit.
- **Mätvärden** med verktygstips (totalt förskrivet, slutdatum, snittförbrukning i aktuell enhet).
- **Alerter** – varning vid låg förbrukning, förhöjd förbrukning inom 7 dagar, tidig uthämtning, avvikande data.
- **Kliniskt överstyrande** – vid överförbrukning eller för tidig begäran kan läkaren manuellt godkänna förnyelse (Ja/Nej). Beslutet bevaras vid kortväxling.
- **Svar till patient på svenska och engelska** – växla med SVG-flaggor, ingen översättningstjänst krävs.
- **Journalanteckning** – anpassas efter förnyelsebeslut och klinisk bedömning.
- **Interaktionsvarningar** – 89 regler fördelade på kategorier: serotonergt syndrom, blödningsrisk, hyperkalemi, bradykardi/AV-block, smal terapeutisk bredd, CYP-interaktioner, QT-förlängning, triple whammy, psykofarmaka och övriga. Varningarna graderas danger/warn med beskrivning och åtgärdsrekommendation.
- **Kopieringsknappar** – för snabb inklistring i journalsystem/1177. Tillfällig bekräftelsetext ("✅ Text kopierad till urklipp.") visas i 2 sekunder.

### 📦 Nyförskrivning
- Välj periodlängd via **månadsväljare** (1–12 månader) eller **angivet slutdatum**.
- Beräknar exakt **antal förpackningar** med hänsyn till daglig dos, förpackningsstorlek och kvarvarande täckning från nuvarande recept.
- **Dynamisk enhetsbeteckning** – förpackningsstorlek och resultat visas i rätt enhet (tabletter, ml eller doser) beroende på läkemedlets beredningsform.
- Hanterar månadsövergångar korrekt (t.ex. 31 januari + 1 månad → 28 februari).
- **Sammanfattande översikt** när flera läkemedel är aktuella för nyförskrivning.

### 🩺 Sjuksköterskebedömning
Valfri kolumn som möjliggör dokumentation av sjuksköterskans kliniska bedömning (vitalparametrar, uppföljning och ordinationsorsak). Bedömningen inkluderas automatiskt i journaltexten.

### 📊 Långvarig förbrukning
- **Upp till 10 perioder** – lägg till/ta bort efter behov.
- Validering av datum (start < slut, inga framtida datum).
- Hanterar **överlappande perioder** via datumunion för korrekt totaldygnsberäkning.
- **Stapeldiagram** – relativ förbrukning (0–150 % av ordination).
- **Periodtabell** – visar snitt/dag, avvikelse % och badge.
- **Journalanteckning** – sammanfattar alla perioder och total snittförbrukning.

### 🔒 Integritet och säkerhet
- All patientdata stannar **enbart i webbläsarens minne** – skickas aldrig till någon server.
- **Automatisk rensning** efter 23 minuters inaktivitet (varning efter 22 min) – anpassat för delade kliniska datorer.
- Endast temainställningen sparas i `localStorage`.
- **Content Security Policy** blockerar alla externa nätverksanrop. `connect-src 'self'` tillåter fetch av `drugs.json` från samma origin.
- **Inga externa bibliotek i runtime** – Svelte 5 kompileras bort vid build.
- Data rensas vid `pagehide` (bfcache-säkerhet).

### 🎨 Utseende
Tre inbyggda teman som växlas direkt:
- **🩺 Klinisk** (standard) – lugn grön/teal-bas.
- **🌙 Mörkt** – hög kontrast, mörk bakgrund.
- **🌸 Körsbär** – varmt rosa tema med mjuka accenter.

### 🧰 Övrigt
- **Verktygstips** (`data-tooltip`) för nästan alla inmatningsfält och mätvärden.
- **Toastmeddelande** vid inaktivitet.
- **Modal** för bekräftelse vid rensning av all data.
- **Responsiv design** – anpassar sig för smalare skärmar (staplad vy).
- **Validering** – dos 0,1–50 (oberoende enhet), mängd per uttag 1–10 000 (heltal för st, decimaler tillåtna för ml/doser), antal uttag 1–12, strikt datumvalidering inklusive skottår.

---

## Teknisk information

- **Svelte 5 + TypeScript** — reaktiva komponenter med `$state`/`$derived`, strict type-checking
- **Vite** — byggsystem med HMR i dev, tree-shaking och code-splitting i production
- **Vitest** — 264 enhetstester (213 calc + 43 interactions + 8 property-based)
- **Playwright** — 32 E2E-tester + 200 fuzz-simuleringar
- **PWA** — offline-first via `vite-plugin-pwa` + Workbox, precache av alla assets

### Projektstruktur
```
src/
  lib/           — 10 pure-function filer (TypeScript)
    constants.ts, types.ts, clock.ts, utils.ts,
    calc.ts, calc-longterm.ts, text-gen.ts,
    prescribe-calc.ts, interactions.ts, drug-search.ts,
    state.svelte.ts  — Svelte 5 reaktivt tillståndslager
  components/    — 9 Svelte-komponenter
    App.svelte, TopBar.svelte, MedList.svelte,
    MedCard.svelte, CalcResult.svelte, NurseView.svelte,
    PrescribePanel.svelte, LongtermPanel.svelte, Alert.svelte
  app.css        — CSS (global, inga scoped styles)
  main.ts        — Entrypoint
public/
  _headers       — CSP för Cloudflare Pages
  robots.txt
  data/          — drugs.json + drugs-version.json
```

- **Standardiserad datumhantering** — alla datum hanteras som UTC för att undvika tidszonsproblem. `clock.ts` möjliggör mockning i tester.
- **Rena beräkningsfunktioner** (`calcCore`, `calcLongtermCore`, `calcPrescribeResult`) saknar DOM-beroenden. Verifierade mot 3.0 med 51 golden fixtures (`deep.equal`).
- **WCAG 2.1 AA** — 0 axe-core violations, 27 passes.
- **CSP** — strikt Content Security Policy (`style-src 'self'`, `script-src 'self'`, `connect-src 'self'`).

---

## Kom igång

**Utveckling:**
```bash
npm install               # Installera beroenden
npm run dev               # Starta Vite dev-server (HMR)
npm run build             # Production build → dist/
npm test                  # Kör 264 vitest-tester
npm run test:e2e          # Kör 32 Playwright E2E-tester
npm run check             # TypeScript-kontroll (svelte-check)
npm run build:db          # Crawla FASS och bygg product-db.json (~45 min)
npm run generate:drugs    # Generera drugs.json → public/data/drugs.json (~1 min)
```

**Driftsätt online:**
```bash
npm run build             # Bygg → dist/
```

För **Cloudflare Pages**: build command `npm run build`, output directory `dist`. `_headers`-filen konfigurerar säkerhetsheaders (CSP, HSTS, COOP/COEP/CORP) automatiskt.

---

## Datapipeline

Läkemedelsdatabasen (`drugs.json`) byggs i två steg:

```
FASS.se (~14 000 NPL-ID:n)
  └─ build:db → data/product-db.json
       └─ generate:drugs → public/data/drugs.json (samtliga beredningsformer)
```

`build:db` använder `classifyDoseForm()` för att kategorisera varje produkt: kvantifierbara med enhetsnyckel (`st`, `ml`, `dos`) eller markerade som ej kvantifierbara (`notCalculable`). `generate:drugs` läser klassificeringen och genererar drug‑entrierna med rätt enhet och flagga. `drug-data.js` genereras inte i 4.0 — ersatt av `fetch('/data/drugs.json')` via `drug-search.ts` med IndexedDB-cache.

Bör köras kvartalsvis eller vid större förändringar i FASS sortiment.

---

## Genererade texter – exempel

**OK att förnya – svar till patient (sv)**
> Vi har tagit emot din begäran på Elvanse 50 mg och kommer att förnya ditt recept inom 2–3 arbetsdagar. Du kan därefter hämta ut din medicin på valfritt apotek.

**För tidigt – svar till patient (sv)**
> Vi har tagit emot din förfrågan om receptförnyelse för Elvanse 50 mg. Enligt din ordination (1 st/dag) beräknas medicinen räcka till den 2025-06-14. Eftersom det datumet inte ännu har passerat kan vi inte förnya receptet just nu. Vänligen hör av dig igen runt den 2025-06-07 så hjälper vi dig då med nytt recept.

**Överförbrukning – journalanteckning (efter klinisk bedömning)**
> Kontaktorsak: Receptförnyelse via 1177.
>
> Bedömning: Patienten begär förnyelse av Elvanse 50 mg. Senaste receptet utfärdades 2025-01-15 (totalt 300 doser, ordination 1 st/dag) och borde räcka till 2025-11-12. Beräknad snittförbrukning: 1,72 st/dag (beräknat på faktisk förbrukning…) – överstiger ordination. Receptet förnyas på klinisk indikation.
>
> Åtgärd: Nytt recept utfärdat (räcker t.o.m. 2025-12-15). Svar skickat till patient via 1177.

---

## Licens och användningsvillkor

Copyright (C) 2026 Vansinnet. Alla rättigheter förbehållna.

Detta verktyg är publicerat med öppen källkod för att möjliggöra transparens, klinisk granskning och bidrag från communityt. För användning gäller följande:

* **Privatpersoner/Enskilda läkare:** Du får använda verktyget fritt för personligt bruk och enskild klinisk handläggning.
* **Vårdföretag och kommersiella aktörer:** Det är **inte tillåtet** att implementera, distribuera eller använda detta verktyg systematiskt inom vinstdrivande verksamhet eller kommersiella system utan uttryckligt skriftligt medgivande från upphovsmannen.

För tillstånd eller frågor om kommersiell licensiering, vänligen kontakta mig via GitHub.

---

## Friskrivning (Disclaimer)
Verktyget tillhandahålls "i befintligt skick" utan garantier. Skaparen tar inget ansvar för medicinska beslut eller tekniska fel. Det kliniska ansvaret vilar alltid på den förskrivande läkaren.
