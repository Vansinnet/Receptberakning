<FILE file_path="/home/workdir/attachments/readme.md" size="8920 bytes">
# Receptberäkning

> Kliniskt beslutsstöd för läkare vid receptförnyelse via 1177 och analys av långvarig förbrukning.

**Live:** [receptberakning.pages.dev](https://receptberakning.pages.dev/)  
**Senast uppdaterad:** 2026-05-03

---

**Viktigt:** Verktyget är ett beslutsstöd. Den förskrivande läkaren har alltid det fulla kliniska ansvaret. Genererade texter är förslag och ska alltid granskas och vid behov anpassas.

---

## Vad gör verktyget?

Verktyget består av två huvudflikar:

### 1. 💊 Receptförnyelse (huvudfunktion)
Läkaren matar in uppgifter om ett eller flera läkemedel. Verktyget beräknar förbrukningstakt och ger ett klart utlåtande:

- **OK att förnya** – förbrukning inom ±10 % av ordination.
- **För tidigt att förnya** – normal förbrukning men >20 % av receptperioden återstår.
- **Överförbrukning** – snitt >10 % över ordination **och** (mer än 7 dosdagar kvar **eller** receptperioden har mer än 14 dagar kvar).

Vid överförbrukning eller för tidig förnyelse kan läkaren **kliniskt överstyra** med knapparna **Ja, förnya** / **Nej, avslå**.

När förnyelse godkänns visas automatiskt **Ny förskrivning**-panelen.

### 2. 📊 Långvarig förbrukning
Analyserar förbrukningsmönster över flera receptperioder (upp till 10 perioder). Beräknar snittförbrukning, avvikelse (över/under/OK) och genererar journalanteckning.

---

## Huvudfunktioner

### Receptförnyelse
- Stöd för upp till **8 läkemedel** samtidigt.
- Automatisk beräkning av snittförbrukning (med eller utan uppgift om kvarvarande doser).
- **Kvarvarande doser** ger exaktare faktisk förbrukning (earlyPickup-logik).
- **Ny förskrivning**-panel – räknar från när nuvarande recept löper ut (aktivt val för att undvika överförskrivning).
- Tidslinje, mätvärden, kliniska alerter och verktygstips.
- Genererar:
  - Svar till patient (svenska + engelska)
  - Journalanteckning (anpassad efter beslut)
- FASS-länk för varje läkemedel.
- Inaktivitetstimer (varning efter 4 min, rensning efter 5 min).

### Långvarig förbrukning
- Gränsvärden: **>110 %** = över, **<80 %** = under.
- Hanterar överlappande perioder med varning.
- Visuell stapel (0–150 %) och detaljerad periodtabell.
- Genererad journalanteckning med sammanfattning.

### Ny förskrivning
- Förskrivning startar automatiskt vid utgången av nuvarande recept.
- Välj antal månader (1–12) eller specifikt slutdatum.
- Beräknar antal förpackningar baserat på angiven förpackningsstorlek.

### Säkerhet & integritet
- All data stannar **endast i webbläsarens minne** – inget sparas, inget skickas.
- Strikt Content Security Policy + moderna säkerhets-headers.
- Inga externa beroenden eller nätverksanrop (förutom FASS-länkar).
- Endast temainställning sparas i `localStorage`.

### Teknik
- Ren HTML + CSS + JavaScript (inga ramverk).
- Modulär kodstruktur för utveckling och testning (`utils.js`, `calc-renew.js`, `ui-renew.js`, `prescribe.js`, `longterm.js`, `app.js`).
- Enkel att köra lokalt eller driftsätta som statisk sajt.
- Fullt responsiv och print-vänlig.

---

## Kom igång

**Lokalt:**
1. Ladda ner alla filer.
2. Öppna `index.html` i valfri webbläsare.

**Driftsättning:**
Ladda upp samtliga filer till valfri statisk webbhost (GitHub Pages, Cloudflare Pages, etc.).

**Testning av beräkningslogik:**
```bash
node test-calc.js