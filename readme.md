# Receptberäkning

> Kliniskt beslutsstöd för läkare vid handläggning av receptförnyelser via 1177 samt analys av långvarig förbrukning.

**Live:** [receptberakning.pages.dev](https://receptberakning.pages.dev/)

---

> **Observera:** Verktyget är endast ett beslutsstöd. Sjukvårdspersonal ska alltid använda sitt kliniska omdöme. Genererade texter är förslag baserade på matematiska beräkningar och kan behöva justeras utifrån patientens unika situation.

---

## Vad gör verktyget?

Verktyget består av två huvudflikar:

### 1. 💊 Receptförnyelse

Läkaren matar in ordinationsinformation (läkemedel och styrka, senaste receptdatum, förpackningsstorlek, antal uttag och ordinerad dygnsdos). Verktyget beräknar patientens förbrukningstakt och bedömer om förnyelse är lämplig.

Baserat på beräkningen visas ett **utlåtande** med:

- **OK att förnya** – förbrukning inom ±10 % av ordination. Förhöjd förbrukning suppressas till en notering (ej blockering) om medicinen beräknas ta slut inom 7 dagar **och** receptperioden har mindre än 14 dagar kvar.
- **För tidigt att förnya** – normal förbrukning men mer än 20 % av receptperioden återstår.
- **Överförbrukning** – snittförbrukning >10 % över ordinerad dos, och antingen mer än 7 dosdagar återstår eller receptperioden har mer än 14 dagar kvar. Det senare fångar fall där patienten tagit slut på medicinen för tidigt.

För överförbrukning eller för tidig förnyelse kan läkaren **aktivt överstyra** via knapparna **Ja, förnya** / **Nej, avslå**. Detta påverkar statusfärg, sidomeny och genererade texter.

När förnyelse är godkänd visas automatiskt ett **Ny förskrivning**-verktyg (se nedan).

För varje läkemedel genereras direkt:

- **Svar till patient (svenska)** – redo att skickas via 1177.
- **Svar till patient (engelska)** – växla med en knapp.
- **Journalanteckning (förslag)** – anpassad efter bedömningen.

Stöd för upp till **8 läkemedel** i samma session – en sammanhållen patienttext och journalanteckning skapas för alla.

### 2. 📊 Långvarig förbrukning

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
- **Automatisk datumformatering** (ÅÅÅÅ-MM-DD).
- **Valfritt fält för kvarvarande doser** – används enbart för att beräkna faktisk snittförbrukning. "Räcker t.o.m." visar alltid när receptet tar slut vid ordinerad dos, oavsett om fältet är ifyllt.
- **Direktlänk till FASS** för aktuellt läkemedel.
- **Narkotikavarning** – identifierar narkotikaklassade preparat enligt LVFS 2011:10 och visar en badge (Förteckning II–V).
- **Tidslinje** – visar hur stor del av receptperioden som förflutit.
- **Mätvärden** med verktygstips (totalt förskrivet, slutdatum, snittförbrukning).
- **Alerter** – varning vid låg/överförbrukning, tidig uthämtning, avvikande data.
- **Kliniskt överstyrande** – vid överförbrukning eller för tidig begäran kan läkaren manuellt godkänna förnyelse (knapparna Ja/Nej).
- **Svar till patient på svenska och engelska** – växla med en knapp, ingen översättningstjänst krävs.
- **Journalanteckning** – anpassas efter om förnyelse beviljats eller ej.
- **Kopieringsknappar** – för snabb inklistring i journalsystem/1177.

### 📋 Ny förskrivning

När ett recept godkänns för förnyelse visas ett dedikerat verktyg för att beräkna den nya förskrivningen:

- **Förpackningsstorlek** kopieras automatiskt från det föregående receptet.
- **Förskrivning fr.o.m.** beräknas automatiskt: om nuvarande recept löper ut i framtiden börjar det nya receptet därifrån (patienten behöver inte gå utan medicin).
- Välj varaktighet som **antal månader** (1–12, förinställt 7) eller ett specifikt **slutdatum**.
- Verktyget beräknar och visar **antal förpackningar att förskriva**, total tablettmängd och receptperiod.

### 📊 Långvarig förbrukning

- **Upp till 10 perioder** – lägg till/ta bort efter behov.
- Förvalda datum: start = ett år tillbaka, slut = idag.
- Validering av datum (start < slut, inga framtida datum).
- Varning vid överlappande perioder.
- **Stapeldiagram** – relativ förbrukning (0–150 % av ordination).
- **Periodtabell** – visar snitt/dag, avvikelse % och badge.
- **Journalanteckning** – sammanfattar alla perioder och total snittförbrukning.

### 🔒 Integritet och säkerhet

- All patientdata stannar **enbart i webbläsarens minne** – skickas aldrig till någon server.
- **Automatisk rensning** efter 5 minuters inaktivitet (varning efter 4 min).
- Endast temainställningen sparas i `localStorage`.
- **Content Security Policy** blockerar alla externa nätverksanrop.
- **Inga externa bibliotek** – ren HTML/CSS/JavaScript.

### 🎨 Utseende

Tre inbyggda teman som växlas direkt:

- **🩺 Klinisk** (standard) – lugn grön/teal-bas.
- **🌙 Mörkt** – hög kontrast, mörk bakgrund.
- **🌸 Körsbär** – ljust rosa tema.

### 🧰 Övrigt

- **Verktygstips** (`data-tooltip`) för nästan alla inmatningsfält och mätvärden.
- **Toastmeddelande** vid inaktivitet.
- **Modal** för bekräftelse vid rensning av all data.
- **Responsiv design** – anpassar sig för smalare skärmar (staplad vy).

---

## Teknisk information

- **Ren HTML/CSS/JavaScript** – inga ramverk, inga externa beroenden.
- Modulär filstruktur: `index.html`, `app.css`, `app.js`, `calc-renew.js`, `ui-renew.js`, `prescribe.js`, `longterm.js`, `utils.js`.
- Fungerar **helt offline** – öppna bara filen i en webbläsare.
- **Standardiserad datumhantering** – alla datum hanteras som UTC för att undvika tidszonsproblem.

---

## Kom igång

**Lokalt:**
Öppna `index.html` i valfri webbläsare – ingen installation behövs.

**Driftsätt online:**
Ladda upp samtliga filer (`index.html`, `app.css`, `app.js`, `calc-renew.js`, `ui-renew.js`, `prescribe.js`, `longterm.js`, `utils.js`) till valfri statisk webbserver, t.ex. GitHub Pages eller Cloudflare Pages.

---

## Genererade texter – exempel

**OK att förnya – svar till patient (sv)**

> Vi har tagit emot din förfrågan om receptförnyelse för Elvanse 50 mg och kommer att förnya ditt recept inom 2–3 arbetsdagar. Du kan därefter hämta ut din medicin på valfritt apotek.

**För tidigt – svar till patient (sv)**

> Vi har tagit emot din förfrågan om receptförnyelse för Elvanse 50 mg. Enligt din ordination (1 st/dag) beräknas medicinen räcka till den 2025-06-14. Eftersom det datumet inte ännu har passerat kan vi inte förnya receptet just nu. Vänligen hör av dig igen runt den 2025-06-07 så hjälper vi dig då med nytt recept.

**Överförbrukning – journalanteckning (efter klinisk bedömning)**

> Kontaktorsak: Receptförnyelse via 1177.
>
> Bedömning: Patienten begär förnyelse av Elvanse 50 mg. Senaste receptet utfärdades 2025-01-15 (totalt 300 doser, ordination 1 st/dag) och borde räcka till 2025-11-12. Beräknad snittförbrukning: 1,72 st/dag – överstiger ordination. Receptet förnyas på klinisk indikation.
>
> Åtgärd: Nytt recept utfärdat. Svar skickat till patient via 1177.

---

## Licens och användningsvillkor

Copyright (C) 2026 Vansinnet. Alla rättigheter förbehållna.

Detta verktyg är publicerat med öppen källkod för att möjliggöra transparens, klinisk granskning och bidrag från communityt. För användning gäller följande:

- **Privatpersoner/Enskilda läkare:** Du får använda verktyget fritt för personligt bruk och enskild klinisk handläggning.
- **Vårdföretag och kommersiella aktörer:** Det är **inte tillåtet** att implementera, distribuera eller använda detta verktyg systematiskt inom vinstdrivande verksamhet eller kommersiella system utan uttryckligt skriftligt medgivande från upphovsmannen.

För tillstånd eller frågor om kommersiell licensiering, vänligen kontakta mig via GitHub.

---

## Friskrivning (Disclaimer)

Verktyget tillhandahålls "i befintligt skick" utan garantier. Skaparen tar inget ansvar för medicinska beslut eller tekniska fel. Det kliniska ansvaret vilar alltid på den förskrivande läkaren.
