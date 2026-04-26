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

## Licens

MIT — fri att använda, modifiera och distribuera.

---

*Skapad och underhållen av Gabriel Jungestrand.*
