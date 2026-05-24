# Receptberäkning 4.0

> Beräkningshjälpmedel för läkare vid handläggning av receptförnyelser via 1177. Verktyget beräknar förbrukning och slutsiffror — läkaren fattar alla kliniska beslut.

**Live:** [receptberakning.pages.dev](https://receptberakning.pages.dev/)

---

> **Observera:** Verktyget är endast ett beräkningshjälpmedel. Sjukvårdspersonal ska alltid använda sitt kliniska omdöme. Genererade texter är förslag baserade på matematiska beräkningar och kan behöva justeras utifrån patientens unika situation.

---

## Vad gör verktyget?

Verktyget består av två huvudflikar:

### 1. 💊 Receptförnyelse
Läkaren matar in ordinationsinformation (läkemedel + styrka, senaste receptdatum, mängd per uttag, antal uttag och ordinerad dos). Verktyget beräknar patientens förbrukningstakt och visar resultatet med färgindikatorer:

- **Snittförbrukning** — grön vid 80–110% av ordinerad dos, gul annars.
- **Räcker t.o.m.** — grön om <14 dagar kvar (eller slut), gul om ≥14 dagar kvar.
- **Datakontroll** — varning vid >2.5× ordinerad dos.

Läkaren fattar alltid det **kliniska beslutet** via knapparna **Förnya / Avslå** som visas för varje läkemedel. Vid "Förnya" på recept med ≥14 dagar kvar får läkaren en följdfråga om förpackningsberäkningen ska utgå från dagens datum eller beräknat slutdatum.

För varje läkemedel genereras direkt:
- **Svar till patient (svenska)** – redo att skickas via 1177.
- **Svar till patient (engelska)** – växla med en knapp (inklusiva SVG-flaggor).
- **Journalanteckning (förslag)** – anpassad efter bedömningen.

Stöd för upp till **8 läkemedel** i samma session — en sammanhållen patienttext och journalanteckning skapas för alla.

Vid flera läkemedel detekteras automatiskt **läkemedelsinteraktioner** — 2926 regler baserade på ATC-koder som identifierar potentiella interaktioner. En genväg till Janusmed visas med läkemedlen redan ifyllda för klinisk bedömning.

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
- **Autocomplete** för läkemedelsnamn – sök bland ~8 300 preparat ur FASS. Deduplicerar tillverkarvariationer — visar ett rent läkemedelsnamn per styrka/form/förpackningsstorlek, sorterat efter styrka (lägst först).
- **Automatisk datumformatering** (ÅÅÅÅ-MM-DD).
- **Dosintervall** – per dag, per vecka (t.ex. plåster, veckodepåer) eller per månad (t.ex. månadsdepåer, implantat).
- **Dosenheter** – st (tabletter, kapslar, plåster), ml (orala lösningar, injektioner), doser (inhalatorer, nässprayer, ögondroppar, injektionspennor).
- **Ej kvantifierbara beredningar** – krämer, salvor, dialysvätskor, gaser markeras för manuell bedömning.
- **Valfritt fält för kvarvarande mängd** – ger exakt snittberäkning i stället för worst‑case‑antagande. Decimaler tillåtna för ml och doser.
- **Direktlänk till FASS** för aktuellt läkemedel.
- **Narkotikavarning** – identifierar narkotikaklassade preparat enligt LVFS 2011:10 och visar en badge (Förteckning II–V).
- **Tidslinje** – visar hur stor del av receptperioden som förflutit.
- **Mätvärden** med verktygstips (totalt förskrivet, slutdatum, snittförbrukning i aktuell enhet).
- **Alerter** – varning vid ingen förbrukning registrerad, datakontroll (>2.5× dos), tidig uthämtning.
- **Kliniskt beslut** – läkaren väljer Förnya eller Avslå för varje läkemedel. Vid Förnya med ≥14 dagar kvar: följdfråga om förskrivning ska räknas från dagens datum eller receptets slutdatum.
- **Svar till patient på svenska och engelska** – växla med SVG-flaggor, ingen översättningstjänst krävs.
- **Journalanteckning** – anpassas efter förnyelsebeslut och klinisk bedömning.
- **Interaktionsdetektion** – 2926 ATC-regler detekterar potentiella interaktioner. Visar vilka läkemedel som berörs med direktlänk till Janusmed för klinisk bedömning (ingen medicinsk vägledning i verktyget).
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
- **Vitest** — 241 enhetstester (123 calc + 21 interactions + 5 properties + 8 card-status + 75 utils + 9 components)
- **Playwright** — 46 E2E-tester (varav 2000 fuzz-scenarier) + axe-core a11y-checkar
- **PWA** — `vite-plugin-pwa` + Workbox, precache av alla assets. Fungerar offline efter första laddning (drugs.json cachas).

### Projektstruktur
```
src/
  lib/           — 11 TypeScript-filer + 9 .svelte.ts-moduler
    constants.ts, types.ts, clock.ts, utils.ts,
    calc.ts, calc-longterm.ts, text-gen.ts,
    prescribe-calc.ts, interactions.ts, drug-search.ts,
    drug-cache.ts,
    state.svelte.ts           — Barrel-export (5 statemoduler)
    form-state.svelte.ts      — Formulär, validering, aktiv beräkning
    calc-state.svelte.ts      — Per-kort beräkning, getCardStatus
    prescribe-state.svelte.ts — Förskrivar-state (per cardId)
    longterm-state.svelte.ts  — Långvarig förbrukning
    text-state.svelte.ts      — Textorkestrering, prescribe-derivations
    autocomplete.svelte.ts    — Autocomplete-modul (generisk)
    inactivity.svelte.ts      — Inaktivitetstimer
    actions.svelte.ts         — Svelte actions (copyable)
  components/    — 15 Svelte-komponenter
    App.svelte, TopBar.svelte, MedList.svelte,
    MedCard.svelte, CalcResult.svelte, NurseView.svelte,
    PrescribePanel.svelte, LongtermPanel.svelte, Alert.svelte,
    GitHubIcon.svelte, FieldError.svelte, FlagIcon.svelte,
    InteractionAlerts.svelte, InactivityTimer.svelte,
    AlertDialog.svelte
  css/           — 7 CSS-filer (@import i app.css)
    variables.css, base.css, layout.css,
    components.css, forms.css, utilities.css,
    a11y.css, print.css
  app.css        — @import-sammanställning
  app.d.ts       — TypeScript-deklarationer
  main.ts        — Entrypoint
public/
  _headers       — CSP för Cloudflare Pages
  robots.txt
  data/          — drugs.json + drugs-version.json
```

- **Standardiserad datumhantering** — alla datum hanteras som UTC för att undvika tidszonsproblem. `clock.ts` möjliggör mockning i tester.
- **Rena beräkningsfunktioner** (`calcCore`, `calcLongtermCore`, `calcPrescribeResult`) saknar DOM-beroenden.
- **WCAG 2.1 AA** — axe-core integrerat i E2E (4 kontrollpunkter), 0 violationer i produktion.
- **CSP** — strikt Content Security Policy (`style-src 'self'`, `script-src 'self'`, `connect-src 'self'`).

---

## Kom igång

**Utveckling:**
```bash
npm install               # Installera beroenden
npm run dev               # Starta Vite dev-server (HMR)
npm run build             # Production build → dist/
npm test                  # Kör 241 vitest-tester
npm run test:coverage     # Kör tester + kodtäckningsanalys
npm run test:e2e          # Kör 46 Playwright E2E-tester
npm run test:e2e:smoke    # Kör 33 E2E smoke-tester (~30s)
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

**Förnya – svar till patient (sv)**
> Vi har tagit emot din förfrågan om receptförnyelse för Sertralin 50 mg. Vi förnyar ditt recept så att det räcker till 2025-12-15. Du kan inom 2–3 arbetsdagar hämta ut det på valfritt apotek.

**Avslå – svar till patient (sv)**
> Vi har tagit emot din förfrågan. Nuvarande recept beräknas räcka t.o.m. 2025-12-31. Hör av dig närmare 2025-12-24. Vi kan tyvärr inte förnya receptet vid detta tillfälle efter klinisk individuell bedömning av läkare.

**Förnya – journalanteckning**
> Kontaktorsak: Receptförnyelse via 1177.
>
> Bedömning: Patienten begär förnyelse av Sertralin 50 mg. Senaste receptet utfärdades 2025-01-15 (totalt 300 st, ordination 1 st/dag) och beräknas räcka till 2025-11-12 (180 dagar kvar). Snittförbrukning: 1.00 st/dag (50.0 mg/dag) (beräknat under antagandet att alla förskrivna st är förbrukade) (100.0% av ordinerad dos).
>
> Åtgärd: Förnyat så att läkemedlet räcker till 2026-06-15.

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
