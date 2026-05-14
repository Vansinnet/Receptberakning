# Instruktion för uppdatering av läkemedelsdatabasen

## Översikt

Läkemedelslistan (`Kod/drugs.js`) byggs i två steg:

| Steg | Script | Tid | Frekvens |
|---|---|---|---|
| 1. Produktdatabas | `build:db` | ~45 min | Engång / kvartalsvis |
| 2. Generera drugs.js | `generate:drugs` | ~1 min | Vid varje uppdatering |

---

## Steg 1: Bygg produktdatabas (engång/kvartalsvis)

Crawlar FASS.se och bygger `data/product-db.json` med samtliga saluförda läkemedel (namn, ATC-kod, styrkor, förpackningar, narkotikaklass).

```bash
npm run build:db
```

- Crawlar ~14 000 NPL-ID:n från `sitemap-health-product.xml`
- Sparar progress i `data/_crawl-progress.json` – kan avbrytas och återupptas
- Exkluderar automatiskt vätskeformer (injektioner, lösningar, krämer, etc.)
- Vid nätverksfel: scriptet retryar 1 gång och loggar felet

**När?** Kör vid behov – när FASS-sortimentet ändrats markant, eller inför större versioner.

---

## Steg 2: Generera drugs.js (vid varje uppdatering)

Läser `data/product-db.json` och genererar `Kod/drugs.js` med samtliga tabletter och kapslar – **samtliga** ATC-koder inkluderas, ingen rankingfiltrering.

```bash
npm run generate:drugs
```

Vad som händer:
1. Läser `product-db.json` – alla ATC-koder inkluderas
2. Filtrerar bort vätskeformer (lösningar, injektioner, krämer etc.)
3. Behandlar enbart tabletter/kapslar (depottablett, enterotablett, brustablett, resoriblett etc.)
4. Genererar `Kod/drugs.js` med sektionsrubriker per ATC-grupp
5. Uppdaterar "uppdaterad"-datumet i `index.html` automatiskt

**När?** Efter varje `build:db` – eller när du vill uppdatera läkemedelslistan.

---

## Dataflöde

```
FASS.se
  └─ sitemap-health-product.xml
       └─ build:db ──→ data/product-db.json
                            └─ generate:drugs ──→ Kod/drugs.js
```

---

## Output-format (drugs.js)

```js
var DRUG_LIST = [
  // === Sömnmedel och lugnande medel ===
  { name: "Imovane 5 mg", pkg: 28, form: "Tablett", narc: "V" },
  { name: "Zopiklon 5 mg", pkg: 30, form: "Tablett", narc: "V" },
  { name: "Zopiklon 5 mg", pkg: 100, form: "Tablett", narc: "V" },

  // === Antidepressiva ===
  { name: "Sertralin 50 mg", pkg: 30, form: "Tablett" },
  { name: "Sertralin 50 mg", pkg: 100, form: "Tablett" },
  ...
];
```

Fältet `narc` finns endast på narkotikaklassade preparat (I–V).

---

## Felsökning

| Problem | Åtgärd |
|---|---|
| `build:db` timeout | Scriptet sparar progress – bara kör igen, det återupptar |
| `build:db` får HTTP-fel | FASS kan vara nere eller throttla. Vänta 5 min, kör igen |
| `generate:drugs` hittar inte product-db.json | Kör `npm run build:db` först |
| Listan ser ofullständig ut | Kontrollera `data/_crawl-progress.json` för fel. Rensa och kör om `build:db` |
