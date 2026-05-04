# Användarguide – Receptberäkning

**Välkommen till Receptberäkning** – ett kliniskt beslutsstöd för förskrivare vid receptförnyelse via 1177 och analys av långvarig läkemedelsförbrukning.

Verktyget körs helt lokalt i webbläsaren. Ingen patientdata skickas externt och ingenting sparas efter att sessionen avslutats.

Länk till verktyget: **[https://receptberakning.pages.dev/](https://receptberakning.pages.dev/)**

---

## Innehåll

1. [Receptförnyelse – steg för steg](#1-receptförnyelse--steg-för-steg)
2. [Beräkningslogik och bedömningskriterier](#2-beräkningslogik-och-bedömningskriterier)
3. [Tolka resultatet](#3-tolka-resultatet)
4. [Ny förskrivning](#4-ny-förskrivning)
5. [Långvarig förbrukning](#5-långvarig-förbrukning)
6. [Praktiska funktioner](#6-praktiska-funktioner)
7. [Vanliga frågor](#7-vanliga-frågor)

---

## 1. Receptförnyelse – steg för steg

### Steg 1: Lägg till läkemedel

Vid start finns ett tomt läkemedelskort. Använd knappen **＋ Lägg till** i sidopanelen för att lägga till ytterligare läkemedel (max 8 stycken). Varje kort hanteras oberoende men patienttexter och journalanteckningar genereras alltid samlat för alla ifyllda kort.

### Steg 2: Fyll i uppgifter

| Fält | Beskrivning | Kommentar |
|------|-------------|-----------|
| **Läkemedel och styrka** | Namn och styrka exakt som på receptet, t.ex. `Elvanse 50 mg` | Styr FASS-länken |
| **Senaste recept** | Förskrivningsdatum (ÅÅÅÅ-MM-DD) | Autoformateras vid inmatning |
| **Dos per dag** | Ordinerad dygnsdos i antal tabletter/kapslar | Kan vara decimalt, t.ex. `0,5` |
| **Förpackningsstorlek (st)** | Antal tabletter/kapslar per förpackning | T.ex. `100` |
| **Antal uttag** | Antal tillåtna uthämtningar på receptet | Heltal 1–12 |
| **Doser kvar** | Patientens uppgivna antal kvarvarande doser | Valfritt – ger exaktare snittberäkning |

### Steg 3: Tolka resultatet

Resultatet visas direkt och uppdateras automatiskt vid varje ändring.

### Steg 4: Ta beslut (vid flaggat ärende)

Vid överförbrukning eller för tidig förnyelse visas frågan **"Mot bakgrund av ovanstående — bedömer du att receptet ska förnyas?"**. Välj **✓ Ja, förnya** eller **✕ Nej, avslå** — beslutet återspeglas i de genererade texterna.

### Steg 5: Kopiera texter

Under resultatpanelen finns färdiga förslag för **Svar till patient** (svenska och engelska) och **Journalanteckning**. Klicka **📋 Kopiera text** och klistra in direkt i 1177 eller journalsystemet. Texterna är anpassade till kliniska scenariot och det beslut som tagits.

---

## 2. Beräkningslogik och bedömningskriterier

### Grundläggande beräkning

Totalt förskrivet antal doser beräknas som `förpackningsstorlek × antal uttag`. Utifrån detta och ordinerad dygnsdos beräknas receptperiodens längd i dagar.

**Snittförbrukning** beräknas från förskrivningsdatumet till idag:

- **Utan "Doser kvar":** Verktyget antar att alla tillgängliga doser är förbrukade. Detta är ett konservativt antagande som kan ge falskt positivt utslag för överförbrukning tidigt i en lång receptperiod med många uttag — läkaren bedömer med klinisk kontext.
- **Med "Doser kvar":** Faktisk förbrukning beräknas som tillgängliga doser minus kvarvarande. Ger väsentligt exaktare snittförbrukning.

### Förnyelsefönstret

Förnyelse anses vara i rätt tid när **20 % eller mindre** av receptperioden återstår. Exakt gräns varierar med totalperioden, t.ex.:

- 90-dagarsrecept → förnyelse möjlig de sista 18 dagarna
- 180-dagarsrecept → förnyelse möjlig de sista 36 dagarna

### Kriterier för "För tidig förnyelse – bedömning krävs"

Flaggas när **samtliga** nedanstående villkor är uppfyllda:

1. Snittförbrukning överstiger ordination med **mer än 10 %**
2. Antingen mer än **7 dosdagar återstår**, eller mer än **14 dagar kvar** av receptperioden

### Kriterier för "För tidigt"

Flaggas när:

1. Villkoren för överförbrukning **inte** är uppfyllda, och
2. Mer än 20 % av receptperioden återstår

### Låg förbrukning

En varning om låg förbrukning visas när snittet är under 80 % av ordinerad dos. Detta kan tyda på bristande följsamhet och rekommenderas följas upp.

---

## 3. Tolka resultatet

### Verdict

| Färg | Innebörd |
|------|----------|
| 🟢 Grön | OK – Förnya recept |
| 🟡 Gul | För tidigt att förnya |
| 🔴 Röd | För tidig förnyelse – individuell bedömning krävs |

### Tidslinje

Visar receptperiodens förlopp från förskrivningsdatum till beräknat slutdatum. Det vertikala strecket markerar dagens datum.

### Mätvärden

- **Totalt förskrivet** – förpackningsstorlek × antal uttag
- **Räcker t.o.m.** – beräknat slutdatum vid ordinerad förbrukningshastighet
- **Snittförbrukning** – faktisk eller estimerad förbrukning per dag

### Alerter

Varningar visas vid:

- Snittförbrukning >10 % över ordination (röd)
- Snittförbrukning <80 % av ordination (gul)
- Nollförbrukning – patienten verkar inte ha tagit medicinen (röd)
- Förhöjd förbrukning men medicinen tar slut inom 7 dagar – förnyelse godkänd med notering (gul)
- Tidig uthämtning – kvarvarande doser överstiger modellens förväntning (blå)

---

## 4. Ny förskrivning

När ett recept godkänts för förnyelse (grönt utfall eller manuellt godkänt) visas en panel för ny förskrivning:

1. Ange önskad förpackningsstorlek
2. Välj antal månader **eller** ange ett specifikt slutdatum
3. Verktyget beräknar exakt antal förpackningar att förskriva

---

## 5. Långvarig förbrukning

Fliken **📊 Långvarig förbrukning** är avsedd för analys av förbrukningsmönster över flera receptperioder — exempelvis vid misstänkt bristande följsamhet, misstänkt missbruk eller vid uppföljning av långvarig behandling.

### Så används fliken

1. Fyll i läkemedel och styrka samt ordinerad dygnsdos
2. Lägg till perioder via **＋ Lägg till period** — varje period kräver startdatum, antal uttagna tabletter och slutdatum
3. Resultatet visas direkt och inkluderar:
   - Total snittförbrukning för samtliga perioder
   - Stapeldiagram (0–150 % av ordination)
   - Per-period-tabell med snittförbrukning och avvikelsestatus (Över / OK / Under)
   - Färdig journalanteckning

---

## 6. Praktiska funktioner

**Tema** – välj mellan Klinisk (standard), Mörkt eller Körsbär via toppmenyn.

**Rensa kort** – klicka **Rensa** i formulärhuvudet för att tömma ett enskilt läkemedelskort.

**Återställ allt** – klicka **🔄 Återställ allt** i toppmenyn för att rensa samtliga kort. En bekräftelse krävs.

**FASS** – klicka på FASS-länken bredvid läkemedelsnamnet för att öppna produktresumén i ny flik.

**Inaktivitetsskydd** – efter 4 minuters inaktivitet visas en varning. Om ingen åtgärd vidtas rensas all data efter ytterligare 60 sekunder. Skyddar patientuppgifter på delade datorer.

**Offline-användning** – verktyget fungerar helt utan internet efter att sidan laddats ned och filerna läggs i samma mapp. Starta `index.html` i en webbläsare.

---

## 7. Vanliga frågor

**Varför flaggas "För tidig förnyelse" trots att patienten säger att medicinen är slut?**
Bedömningen baseras på beräknad förbrukningshastighet relativt ordinationen — inte enbart på patientens uppgift om att medicinen är slut. Syftet är att identifiera ärenden som kräver en individuell klinisk bedömning, inte att automatiskt neka förnyelse. Fyll i **Doser kvar = 0** för att ge verktyget den informationen.

**Hur förbättras precisionen om patienten uppger kvarvarande doser?**
Väsentligt — utan det fältet antas alla hittills tillgängliga doser vara förbrukade, vilket kan överskatta förbrukningstakten. Med kvarvarande doser ifyllt beräknas faktisk förbrukning och snittet blir korrekt.

**Varför kan beräkning inte göras om receptet är utfärdat idag?**
Minst en dags historia krävs för att snittförbrukning ska vara meningsfullt beräkningsbar.

**Vad innebär "Tidig uthämtning" i alerterna?**
Det betyder att de kvarvarande doserna som patienten uppgett överstiger vad modellen förväntar sig baserat på uttagsintervallet. Verktyget justerar beräkningsbasen till det minsta möjliga antalet uttag och noterar avvikelsen.

**Sparas data mellan sessioner?**
Nej. All data finns enbart i webbläsarens arbetsminne under sessionen och rensas när fliken stängs eller vid inaktivitetstimeout.

**Kan jag hantera flera läkemedel samtidigt?**
Ja, upp till 8 läkemedelskort kan vara öppna parallellt. Patientbrev och journalanteckning genereras samlat för samtliga ifyllda kort.

---

*Verktyget är ett beslutsstöd — förskrivaren ansvarar alltid för kliniska beslut.*

**Senast uppdaterat:** 2026-05-04
