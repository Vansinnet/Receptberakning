# Receptberäkning

Ett kliniskt beslutsstöd för läkare vid handläggning av receptförnyelser. Verktyget beräknar patientens läkemedelsförbrukning och genererar färdiga svarsförslag för 1177 och journalanteckning — anpassade efter om receptet ska förnyas, är för tidigt att förnya, eller om en överförbrukning har detekterats.

🌐 **Verktyget finns tillgängligt live på:** [https://receptberakning.pages.dev/](https://receptberakning.pages.dev/)

> **Observera:** Detta verktyg är endast ett beslutsstöd. Sjukvårdspersonal ska alltid använda sitt kliniska omdöme. Genererade texter är förslag baserade på matematiska beräkningar och kan behöva justeras utifrån patientens unika situation.

---

## Funktioner

### 💊 Receptförnyelse
- Stöd för upp till 8 läkemedel samtidigt
- Beräknar snittförbrukning baserat på ordinationsdatum, mängd och antal uttag
- Valfritt fält för kvarvarande doser — ger exakt snittberäkning istället för worst-case
- Tre automatiska scenarier:
  - **Överförbrukning** (>10% över ordinerad dos) — varning och anpassat svar
  - **För tidigt att förnya** (>14 dagar kvar) — patienten hänvisas att höra av sig närmre slutdatumet
  - **OK att förnya** (≤14 dagar kvar, normal förbrukning) — recept kan utfärdas
- Samlat 1177-svar och journalanteckning för alla läkemedel automatiskt i varje kort
- Direktlänk till FASS för varje läkemedel
- Kopieringsfunktion för snabb inklistring i journalsystem

### 📊 Långvarig förbrukning
- Analys av förbrukningsmönster över flera receptperioder
- Startdatum förvalt till ett år bakåt
- Upp till 10 perioder med individuell snittberäkning
- Procentuell jämförelse mot ordinerad dos per period
- Journaltext med sammanfattning av alla perioder

### Övrigt
- Automatisk datarensning efter 60 sekunders inaktivitet (skyddar patientdata)
- Fem färgteman: Ljust, Mörkt, Körsbärsblom, Regnbåge, Lazerwave
- Fungerar helt offline — ingen data skickas någonstans
- Responsiv layout för dator och surfplatta

---

## Teknisk information

- Ren HTML/CSS/JavaScript — inga ramverk eller externa beroenden
- En enda fil (`index.html`) — enkel att driftsätta eller köra lokalt
- Ingen server eller databas krävs
- Content Security Policy förhindrar externa nätverksanrop

---

## Användning

1. Öppna `index.html` i en webbläsare — fungerar lokalt utan internetuppkoppling
2. Eller driftsätt filen på valfri statisk webbserver (t.ex. GitHub Pages eller Cloudflare Pages)

---

## Scenarier och genererade texter

| Scenario | Statusfärg | 1177-svar | Journalanteckning |
|---|---|---|---|
| OK att förnya | 🟢 Grön | Recept förnyas inom 2–3 arbetsdagar | Förnyat, snittförbrukning enligt ordination |
| För tidigt | 🔴 Röd | Hör av dig runt [datum – 7 dagar] | Ej förnyat, dagar kvar angivet |
| Överförbrukning | 🔴 Röd | Hör av dig runt [datum – 7 dagar] | Ej förnyat, platsmarkering för klinisk bedömning |

---

## Licens

MIT — fri att använda, modifiera och distribuera.

---

*Verktyget skapades och underhålls av Gabriel Jungestrand.*