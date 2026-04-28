# Receptberäkning

> Kliniskt beslutsstöd för läkare vid handläggning av receptförnyelser via 1177.

**Live:** [receptberakning.pages.dev](https://receptberakning.pages.dev/)

---

> **Observera:** Detta verktyg är endast ett beslutsstöd. Sjukvårdspersonal ska alltid använda sitt kliniska omdöme. Genererade texter är förslag baserade på matematiska beräkningar och kan behöva justeras utifrån patientens unika situation.

---

## Vad gör verktyget?

Läkaren matar in ordinationsinformation (läkemedel, senaste receptdatum, mängd, antal uttag och ordinerad dygnsdos) — verktyget beräknar automatiskt patientens förbrukningstakt och avgör vilket av tre utfall som gäller:

| Utfall | Villkor | Statusfärg |
|---|---|---|
| ✅ OK att förnya | Förbrukning normal och ≤ 14 dagar kvar | 🟢 Grön |
| ⏳ För tidigt att förnya | Förbrukning normal men > 14 dagar kvar | 🔴 Röd |
| 🚨 Överförbrukning | Snittförbrukning > 10 % över ordinerad dos | 🔴 Röd |

För varje utfall genereras direkt ett färdigt **svar till patient via 1177** och en **journalanteckning** — redo att kopiera och klistra in.

---

## Funktioner

### 💊 Receptförnyelse

- Stöd för upp till **8 läkemedel** i samma session
- Beräknar snittförbrukning baserat på ordinationsdatum, mängd och antal uttag
- Valfritt fält för **kvarvarande doser** — ger exakt snittberäkning istället för worst-case-antagande
- Direktlänk till **FASS** för varje läkemedel
- Samlat 1177-svar och journalanteckning för alla läkemedel genereras automatiskt
- Kopieringsknapp för snabb inklistring i journalsystem

### 🌐 Svar till patient på engelska

- Knapp för att översätta patientmeddelandet till engelska med ett knapptryck
- Fungerar **helt offline** — färdiga engelska mallar är inbyggda, inga externa anrop
- Täcker alla tre utfall (OK att förnya, för tidigt, överförbrukning) samt flerdrugsscenarier
- Kopieringsknappen kopierar alltid den version som visas (svenska eller engelska)

### 🔒 Varning för narkotikaklassade preparat

- Automatisk kontroll mot inbyggd lista över narkotikaklassade substanser i Sverige (LVFS 2011:10)
- Diskret varningsbadge visas direkt under läkemedelsfältet om preparatet är narkotikaklassat
- Täcker opioider, bensodiazepiner, Z-läkemedel, centralstimulantia, pregabalin, ketamin m.fl.
- Datumstämpel i koden anger när listan senast stämdes av mot tillgängliga preparat på svenska marknaden
- Kräver ingen nätverksuppkoppling

### 📊 Långvarig förbrukning

- Analys av förbrukningsmönster över **flera receptperioder**
- Startdatum förvalt till ett år bakåt
- Upp till 10 perioder med individuell snittberäkning
- Procentuell jämförelse mot ordinerad dos per period
- Journaltext med sammanfattning av alla perioder

### 🔒 Integritet och säkerhet

- All data stannar **i webbläsarens minne** — ingenting skickas till någon server
- Automatisk datarensning efter **15 minuters inaktivitet** (varning visas vid 14 min)
- Content Security Policy blockerar alla externa nätverksanrop
- Endast temainställningen sparas i `localStorage`

### 🎨 Utseende

Fem inbyggda färgteman: **Ljust**, **Mörkt**, **Körsbärsblom**, **Regnbåge**, **Lazerwave**

---

## Teknisk information

- Ren **HTML/CSS/JavaScript** — inga ramverk, inga externa beroenden
- En enda fil: `index.html`
- Ingen server, ingen databas
- Fungerar helt offline — öppna bara filen i en webbläsare

---

## Kom igång

**Lokalt:**
```
Öppna index.html i valfri webbläsare — ingen installation behövs.
```

**Driftsätt online:**
Ladda upp `index.html` till valfri statisk webbserver, t.ex. GitHub Pages eller Cloudflare Pages.

---

## Genererade texter — exempel

**OK att förnya — svar till patient:**
> Vi har tagit emot din begäran på Elvanse 50 mg och kommer att förnya ditt recept inom 2–3 arbetsdagar. Du kan därefter hämta ut din medicin på valfritt apotek.

**För tidigt — svar till patient:**
> Medicinen beräknas räcka till den 2025-06-14. Vänligen hör av dig igen runt den 2025-06-07 så hjälper vi dig då med nytt recept.

**Överförbrukning — journalanteckning:**
> Beräknad snittförbrukning: 1.72 st/dag (ordination 1.0 st/dag). Anledning till förhöjd förbrukning: [Fyll i]. Åtgärd: [Nytt recept utfärdat / Ej utfärdat — motivering]

---

# Licens och Användning

Detta projekt är licensierat under **Creative Commons Erkännande-Ickekommersiell 4.0 Internationell (CC BY-NC 4.0)**.

Kortfattat innebär detta att:
* ✅ **Du får** läsa koden, granska den och lämna förslag via Issues/Pull Requests.
* ✅ **Du får** använda och anpassa koden för personliga, akademiska eller icke-kommersiella syften.
* ❌ **Du får INTE** använda koden i kommersiella, vinstdrivande syften eller integrera den i kommersiella journalsystem utan mitt uttryckliga tillstånd.

Är du intresserad av att använda verktyget kommersiellt? Vänligen kontakta mig!

## Friskrivning (Disclaimer)
Programvaran tillhandahålls "I BEFINTLIGT SKICK" (AS IS), utan några som helst garantier. Skaparen tar inget medicinskt, juridiskt eller ekonomiskt ansvar för hur verktyget används. Det kliniska beslutet och ansvaret vilar alltid till 100 % på den förskrivande läkaren.

---
