# Recept 5.0

> Beräkningshjälpmedel för läkare och sjuksköterskor vid receptförnyelse via 1177. Verktyget räknar — förskrivaren fattar alla kliniska beslut.

**Live:** [receptberakning.pages.dev](https://receptberakning.pages.dev/)

> **Observera:** Verktyget är endast ett beräkningshjälpmedel. Genererade texter är förslag och kan behöva anpassas efter patientens situation.

## Vad verktyget svarar på

Räcker det som förskrevs senast till nu, eller är det läge att förnya? Verktyget räknar bara på receptet och ordinerad dos:

| Visas | Beräkning |
| --- | --- |
| Förskrivet | förpackningsstorlek × antal uttag |
| Räcker t.o.m. | receptdatum + hela dagar det förskrivna räcker − 1 (receptdagen är dag 1) |
| Borde finnas kvar idag | förskrivet − dygnsdos × dagar sedan receptdatum |
| Förbrukning om patienten har slut nu | förskrivet ÷ dagar sedan receptdatum, i procent av dygnsdosen |

Patientens egen uppgift om kvarvarande mängd och antal uttag kvar på receptet visas som **jämförelse** — de påverkar aldrig beräkningen.

Status: **Räcker** (14 dagar eller mer kvar), **Tar snart slut** (0–13 dagar), **Slut**, **Slut sedan länge** (mer än 90 dagar). Förbrukningen visas grön vid 80–110 % av ordinerad dos.

## Funktioner

- **Ärende med upp till 8 läkemedel**, med status per läkemedel.
- **Sökning bland ca 8 300 preparat från FASS** — fyller i förpackningsstorlek, enhet och beredningsform. Alla sökord matchas i valfri ordning.
- **Dos per dag, vecka eller månad** i tabletter, ml eller doser.
- **Ej beräkningsbara beredningar** (krämer m.m.) går till manuell bedömning men kan förnyas och få text.
- **FASS-länk, narkotikaklass** och **möjliga interaktioner** med länk till Janusmed.
- **Beslut per läkemedel** — Förnya eller Avslå. Verktyget rekommenderar aldrig ett beslut.
- **Nyförskrivning** i 1–12 månader eller till ett datum, med antal förpackningar. Vid minst 14 dagar kvar väljer läkaren om den nya perioden räknas från idag eller från beräknat slut.
- **Texter för hela ärendet:** svar till patient på svenska eller engelska och journalanteckning. Texterna kan justeras innan de kopieras.
- **Sjuksköterskeläge:** samma underlag utan beslutsknappar, bedömning av vitalparametrar och uppföljning i tre lägen (normal, avvikande, ej bedömd) och journaltext som lämnar ärendet till läkare.
- **Långtidsanalys** över upp till 10 perioder, med diagram, tabell och journaltext. Överlappande dagar räknas en gång.
- **Ljust och mörkt tema** som följer datorns inställning.
- **Utskriftsvy.**

## Integritet och säkerhet

- All patientdata stannar i webbläsarens minne och skickas aldrig någonstans.
- Allt rensas efter 22 minuter utan aktivitet (med 60 sekunders nedräkning) och när fliken stängs.
- Bara temavalet sparas i webbläsaren.
- Strikt Content Security Policy: inga externa anrop, typsnitten ligger på egen server.
- Fungerar offline efter första laddningen.

## Kvalitet

- 32 kliniska testfall, godkända av verksamheten, körs som automatiska tester.
- Egenskapstester med tusentals slumpade fall, till exempel att patientens uppgift aldrig ändrar beräkningen.
- Webbläsartester av hela flödet med tillgänglighetskontroll (WCAG 2.1 AA) i ljust och mörkt tema.

## Kom igång

```bash
npm install
npm run dev          # utvecklingsserver
npm test             # 139 enhetstester
npm run test:e2e     # webbläsartester
npm run build        # production-build → dist/
```

Cloudflare Pages: build command `npm run build`, output directory `dist`.

## Datapipeline

```
FASS.se → npm run build:db → data/product-db.json → npm run generate:drugs → public/data/drugs.json
Janusmed → npm run update:interactions → src/lib/data/interactions-scraped.json
```

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
