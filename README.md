# Receptberäkning

> Kliniskt beslutsstöd för läkare vid handläggning av receptförnyelser via 1177, nyförskrivning samt analys av långvarig förbrukning.

**Live:** [receptberakning.pages.dev](https://receptberakning.pages.dev/)

---

> **Observera:** Verktyget är endast ett beslutsstöd. Sjukvårdspersonal ska alltid använda sitt kliniska omdöme. Genererade texter är förslag baserade på matematiska beräkningar och kan behöva justeras utifrån patientens unika situation.

---

## Vad gör verktyget?

Verktyget består av tre funktioner fördelade på två huvudflikar:

### 1. 💊 Receptförnyelse
Läkaren matar in ordinationsinformation (läkemedel + styrka, senaste receptdatum, mängd per uttag, antal uttag och ordinerad dygnsdos). Verktyget beräknar patientens förbrukningstakt och bedömer om förnyelse är lämplig.

Baserat på beräkningen visas ett **utlåtande** med:
- **OK att förnya** – förbrukning inom ±10 % av ordination, eller ≤20 % av receptperioden kvar.
- **För tidigt att förnya** – normal förbrukning men mer än 20 % av receptperioden kvar.
- **Överförbrukning** – snittförbrukning >10 % över ordinerad dos och (mer än 7 dosdagar kvar *eller* mer än 14 perioddagar kvar).

För överförbrukning eller för tidig förnyelse kan läkaren **aktivt överstyra** via knapparna **Ja, förnya** / **Nej, avslå**. Detta påverkar både statusfärg, sidomeny och de genererade texterna.

För varje läkemedel genereras direkt:
- **Svar till patient (svenska)** – redo att skickas via 1177.
- **Svar till patient (engelska)** – växla med en knapp.
- **Journalanteckning (förslag)** – anpassad efter bedömningen.

Stöd för upp till **8 läkemedel** i samma session – en sammanhållen patienttext och journalanteckning skapas för alla.

### 2. 📦 Nyförskrivning
När förnyelse beviljas visas en panel för beräkning av nytt recept. Läkaren anger önskad förskrivningsperiod (1–12 månader eller slutdatum) – verktyget beräknar exakt antal förpackningar som behövs, med hänsyn till kvarvarande dagar på befintligt recept. En sammanfattande översikt visas när flera läkemedel förnyas samtidigt.

### 3. 📊 Långvarig förbrukning
Analysera förbrukningsmönster över flera receptperioder (upp till 10 perioder). För varje period anges startdatum, antal uttagna tabletter och slutdatum. Verktyget beräknar:
- Snittförbrukning per dag i varje period.
- Avvikelse i procent mot ordinerad dos.
- Total snittförbrukning över alla perioder.
- Visuell stapel och status (Över / OK / Under).
- Genererad journalanteckning med sammanfattning.

---

## Funktioner i detalj

### ✅ Receptförnyelse
- Stöd för upp till **8 läkemedel**.
- **Autocomplete** för läkemedelsnamn – sök bland ~2 000 preparat ur FASS.
- **Automatisk datumformatering** (ÅÅÅÅ-MM-DD).
- **Valfritt fält för kvarvarande doser** – ger exakt snittberäkning i stället för worst‑case‑antagande.
- **Direktlänk till FASS** för aktuellt läkemedel.
- **Narkotikavarning** – identifierar narkotikaklassade preparat enligt LVFS 2011:10 och visar en badge (Förteckning II–V).
- **Tidslinje** – visar hur stor del av receptperioden som förflutit.
- **Mätvärden** med verktygstips (totalt förskrivet, slutdatum, snittförbrukning).
- **Alerter** – varning vid låg/överförbrukning, tidig uthämtning, avvikande data.
- **Kliniskt överstyrande** – vid överförbrukning eller för tidig begäran kan läkaren manuellt godkänna förnyelse (Ja/Nej).
- **Svar till patient på svenska och engelska** – växla med en knapp, ingen översättningstjänst krävs.
- **Journalanteckning** – anpassas efter förnyelsebeslut och klinisk bedömning.
- **Kopieringsknappar** – för snabb inklistring i journalsystem/1177.

### 📦 Nyförskrivning
- Välj periodlängd via **månadsväljare** (1–12 månader) eller **angivet slutdatum**.
- Beräknar exakt **antal förpackningar** med hänsyn till daglig dos, förpackningsstorlek och kvarvarande täckning från nuvarande recept.
- Hanterar månadsövergångar korrekt (t.ex. 31 januari + 1 månad → 28 februari).
- **Sammanfattande översikt** när flera läkemedel är aktuella för nyförskrivning.

### 📊 Långvarig förbrukning
- **Upp till 10 perioder** – lägg till/ta bort efter behov.
- Förvalda datum: start = ett år tillbaka, slut = idag.
- Validering av datum (start < slut, inga framtida datum).
- Hanterar **överlappande perioder** via datumunion för korrekt totaldygnsberäkning.
- **Stapeldiagram** – relativ förbrukning (0–150 % av ordination).
- **Periodtabell** – visar snitt/dag, avvikelse % och badge.
- **Journalanteckning** – sammanfattar alla perioder och total snittförbrukning.

### 🔒 Integritet och säkerhet
- All patientdata stannar **enbart i webbläsarens minne** – skickas aldrig till någon server.
- **Automatisk rensning** efter 23 minuters inaktivitet (varning efter 22 min) – anpassat för delade kliniska datorer.
- Endast temainställningen sparas i `localStorage`.
- **Content Security Policy** blockerar alla externa nätverksanrop.
- **Inga externa bibliotek** – ren HTML/CSS/JavaScript.
- **Trusted Types** enforced för skydd mot DOM-baserade XSS-attacker.
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
- **Validering** – dygnsdos 0,1–50 st/dag, förpackningsstorlek 1–10 000, antal uttag 1–12, strikt datumvalidering inklusive skottår.

---

## Teknisk information

- **Ren HTML/CSS/JavaScript** – inga ramverk, inga externa beroenden i produktion.
- **Modulär arkitektur** (alla filer i `Kod/`):
  - `index.html` – applikationsskal
  - `app.css` – all stilmall (tre teman, responsiv design)
  - `app.js` – orkestrering (eventlyssnare, temahantering, inaktivitetstimer)
  - `utils.js` – DOM-hjälpare, datumverktyg, toast, kopiering
  - `state.js` – centraliserad tillståndshantering
  - `calc-renew.js` – beräkningskärna och textgenerering för receptförnyelse
  - `ui-renew.js` – UI-rendering för receptförnyelse (sidebar, formulär, resultatpanel, autocomplete)
  - `prescribe.js` – beräkningskärna och UI för nyförskrivning
  - `longterm.js` – långvarig förbrukning (beräkning + UI)
  - `drugs.js` – läkemedelsdatabas (~2 000 preparat)
- Fungerar **helt offline** – öppna bara `index.html` i en webbläsare.
- **Standardiserad datumhantering** – alla datum hanteras som UTC för att undvika tidszonsproblem.
- **Rena beräkningsfunktioner** (`calcCore`, `calcLongtermCore`, `calcPrescribeResult`) saknar DOM-beroenden. DOM-skal läser fält, anropar kärnan, renderar resultat.

---

## Kom igång

**Lokalt:**
Öppna `Kod/index.html` i valfri webbläsare – ingen installation behövs.

**Utveckling:**
```bash
npm test              # Kör alla tester (calc + UI)
npm run test:calc     # Endast beräkningslogik
npm run test:ui       # Endast UI-rendering
npm run build:db      # Crawla FASS och bygg product-db.json (~45 min)
npm run generate:drugs # Generera drugs.js från ranking + FASS-data (~2 min)
```

**Driftsätt online:**
Ladda upp samtliga filer i `Kod/` till valfri statisk webbserver, t.ex. Cloudflare Pages. `_headers`-filen konfigurerar säkerhetsheaders (CSP, HSTS, COOP/COEP/CORP).

---

## Datapipeline

Läkemedelsdatabasen (`drugs.js`) byggs i två steg:

```
FASS.se (~14 000 NPL-ID:n)
  └─ build:db → data/product-db.json
       └─ generate:drugs → Kod/drugs.js
            (sammanfogar med Socialstyrelsens förskrivningsranking)
```

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
> Åtgärd: Nytt recept utfärdat. Svar skickat till patient via 1177.

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
