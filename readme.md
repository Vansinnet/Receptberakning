# Receptberäkning

> Kliniskt beslutsstöd för läkare vid handläggning av receptförnyelser via 1177.

**Live:** [receptberakning.pages.dev](https://receptberakning.pages.dev/)

---

> **Observera:** Detta verktyg är endast ett beslutsstöd. Verktyget genererar ett underlag — **det kliniska ställningstagandet fattas alltid av läkaren**, oavsett vad beräkningen visar. Genererade patient- och journaltexter är förslag som kan behöva justeras utifrån patientens unika situation.

---

## Vad gör verktyget?

Läkaren matar in ordinationsinformation — läkemedel, senaste receptdatum, mängd per uttag, antal uttag och ordinerad dygnsdos. Verktyget beräknar automatiskt patientens förbrukningstakt och avgör utfall:

| Utfall | Villkor | Statusfärg |
|---|---|---|
| ✅ OK att förnya | Normal förbrukning och ≤ 20 % av receptperioden kvar | 🟢 Grön |
| ⚠ Bedömning krävs | Snitt > 10 % över ordination (med > 7 dagar kvar) | 🔴 Röd |
| ⏳ För tidigt | Normal förbrukning men > 20 % av receptperioden kvar | 🟡 Gul |
| ✓ OK efter beslut | Läkare godkänt förnyelse trots avvikelse | 🟢 Grön |

Vid avvikelse ställs en klinisk beslutsfråga: **"Bedömer du att receptet ska förnyas?"** Läkarens svar (Ja/Nej) styr journaltext, patienttext och sidebarsindikator.

För varje utfall genereras ett färdigt **svar till patient via 1177** och en **journalanteckning** — redo att kopiera och klistra in.

---

## Funktioner

### 💊 Receptförnyelse

- Stöd för upp till **8 läkemedel** i samma session med individuell beräkning per kort
- Beräknar snittförbrukning baserat på förskrivningsdatum, mängd och antal uttag
- Valfritt fält **Doser kvar** — ger exakt förbrukningsberäkning mot faktiskt kvarvarande antal i stället för worst-case-antagande
- Tar hänsyn till vilka uttag som rimligen hunnit hämtas ut vid beräkningstillfället
- Tidslinje som visar hur stor andel av receptperioden som förflutit
- Direktlänk till **FASS** för varje läkemedel
- Samlat 1177-svar och journalanteckning för alla läkemedel genereras automatiskt och fördelas till samtliga kort

### 🩺 Klinisk beslutsfunktion

- Vid överförbrukning eller för tidig förfrågan visas frågan: *"Mot bakgrund av ovanstående — bedömer du att receptet ska förnyas?"*
- Läkaren svarar **Ja, förnya** eller **Nej, avslå**
- Beslutet reflekteras direkt i verdict-rutan (färg och rubrik), sidebarsindikator, patienttext och journalanteckning
- Beslutet återställs automatiskt om kliniska flaggor ändras vid omberäkning

### 🌐 Svar till patient på engelska

- Knapp för att växla patientmeddelandet till engelska
- Fungerar **helt offline** — färdiga engelska mallar är inbyggda, inga externa anrop
- Täcker alla utfall och flermedicinscenarier
- Kopieringsknappen kopierar alltid den version som visas

### 🔒 Varning för narkotikaklassade preparat

- Automatisk kontroll mot inbyggd lista över narkotikaklassade substanser i Sverige (LVFS 2011:10)
- Varningsbadge visas direkt under läkemedelsfältet om preparatet är narkotikaklassat (förteckning II–V)
- Täcker opioider, bensodiazepiner, Z-läkemedel, centralstimulantia, pregabalin, ketamin m.fl.
- Datumstämpel i koden anger när listan senast stämdes av
- Kräver ingen nätverksuppkoppling

### 📊 Långvarig förbrukningsanalys

- Analys av förbrukningsmönster över **upp till 10 receptperioder**
- Startdatum förvalt till ett år bakåt, slutdatum till idag
- Individuell snittberäkning och procentuell jämförelse mot ordinerad dos per period
- Varning vid överlappande perioder
- Journaltext med sammanfattning av samtliga perioder och plats för klinisk bedömning

### 🔐 Integritet och säkerhet

- All patientdata stannar **i webbläsarens minne** — ingenting skickas till någon server
- Automatisk datarensning efter **5 minuters inaktivitet** (varning med nedräkning visas vid 4 min)
- Sidan rensas vid navigering bort (`pagehide`) för att minimera exponering i webbläsarens cache
- Content Security Policy blockerar alla externa nätverksanrop och inline-skript
- `innerHTML` används inte för användardata — alla DOM-uppdateringar sker via säkra DOM-metoder
- Inmatningsfält begränsade till rimliga maxlängder för att motverka ReDoS-risker
- Endast temainställningen sparas i `localStorage`

### 🎨 Teman

Tre inbyggda färgteman: **Mörkt**, **Kliniskt** (standard), **Lazerwave**

---

## Beräkningslogik

| Parameter | Värde |
|---|---|
| Överförbrukningströskel | Snitt > 10 % av ordinerad dos |
| 7-dagarsundantag | Ingen överförbrukningsflagga om ≤ 7 dagar kvar |
| Tidig förnyelse-tröskel | > 20 % av receptets totala längd kvar |
| Rekommenderat återkontaktdatum | Slutdatum − 20 % av receptlängden |
| Uttag | Modellen tar hänsyn till vilka uttag som rimligen hunnit hämtas ut vid beräkningstillfället |

---

## Teknisk information

- Ren **HTML / CSS / JavaScript** — inga ramverk, inga externa beroenden
- Tre filer: `index.html`, `app.css`, `app.js` samt `_headers` för Cloudflare Pages-konfiguration
- Ingen server, ingen databas, inga API-anrop
- Fungerar helt offline — öppna bara `index.html` i en webbläsare

---

## Kom igång

**Lokalt:**
```
Öppna index.html i valfri webbläsare — ingen installation behövs.
```

**Driftsätt online:**
Ladda upp filerna till valfri statisk webbserver, t.ex. GitHub Pages eller Cloudflare Pages.

---

## Genererade texter — exempel

**OK att förnya — svar till patient:**
> Vi har tagit emot din begäran på Elvanse 50 mg och kommer att förnya ditt recept inom 2–3 arbetsdagar. Du kan därefter hämta ut din medicin på valfritt apotek.

**För tidigt — svar till patient:**
> Vi har tagit emot din förfrågan om receptförnyelse för Sertralin 50 mg. Enligt din ordination (1 st/dag) beräknas medicinen räcka till den 2026-06-14. Eftersom det datumet inte ännu har passerat kan vi inte förnya receptet just nu. Vänligen hör av dig igen runt den 2026-06-08 så hjälper vi dig då med nytt recept.

**Överförbrukning, läkare väljer Ja — journalanteckning:**
> Beräknad snittförbrukning: 1.72 st/dag (86.0 mg/dag) (beräknat under antagandet att alla hittills tillgängliga doser är förbrukade) — överstiger ordination. Receptet förnyas på klinisk indikation.
> Åtgärd: Nytt recept utfärdat. Svar skickat till patient via 1177.

**Överförbrukning, läkare väljer Nej — journalanteckning:**
> Åtgärd: Ej förnyat efter klinisk, individuell bedömning.

---

## Licens

MIT — fri att använda, modifiera och distribuera.

---
