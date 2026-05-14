# Uppgift: Granska scraping-pipeline för buggar

Du ska granska två skript som tillsammans bygger läkemedelsdatabasen från FASS.se
till `drugs.js`. Fokus är på den nya klassificeringslogiken för beredningsformer.

## Pipeline

```
FASS.se (~14 000 produktsidor)
  └─ scripts/build-product-db.js  →  data/product-db.json
       └─ scripts/generate-drugs.js →  Kod/drugs.js
            └─ Kod/ui-renew.js  →  autocomplete + state (doseUnit, notCalculable)
                 └─ Kod/calc-renew.js → beräkning (st/ml/dos eller blockerad)
```

## Vad som nyss ändrats

Tidigare filtrerades allt utom tabletter/kapslar bort. Nu ska ALLA beredningsformer
sparas i databasen — klassificerade i tre kategorier:

| Klass | `unit` | `notCalculable` |
|---|---|---|
| Diskreta fasta enheter | `"st"` | `false` |
| Volymmätta vätskor | `"ml"` | `false` |
| Doserade enheter | `"dos"` | `false` |
| Ej kvantifierbara | `null` | `true` |

## Filerna du ska granska

Läs båda filerna i sin helhet:

- `scripts/build-product-db.js`
- `scripts/generate-drugs.js`

Valfritt för kontext (läs minst inledningen):
- `Kod/ui-renew.js:480–540` — hur drug‑entries läses in i autocomplete
- `Kod/calc-renew.js:126–136` — hur notCalculable hanteras i beräkning

## Granskningspunkter

### 1. `classifyDoseForm()` — matchningsordning (build-product-db.js:29–65)

Funktionen kör `if/return` i fast ordning. Hitta fall där en doseForm‑sträng
matchar fel gren först — eller matchar två grenar men borde gå till den andra.

Exempel på farliga mönster:
- `"injektionsvätska, lösning"` — innehåller både `"injektion"` och `"lösning"`.
  `"lösning"` finns inte som eget nyckelord, men om doseForm är
  `"oral lösning"` kontra `"injektionsvätska, lösning"` — vilken gren träffas?
- `"kutan lösning"` matchar `"kutan lösning"` → `ml`. Men vad händer med
  `"kutan emulsion"` eller `"kutan suspension"`? De innehåller varken
  `"kutan lösning"`, `"kutan spray"` eller `"kutant skum"` — de faller
  igenom till `"st"`. Är det korrekt?
- `"oral suspension"` → `ml`. Men `"rektalsuspension"` → `ml`. Stämmer det
  kliniskt? Rektalsuspension mäts ofta i ml, men ibland i doser.
- `"droppar"` på rad 55: matchar ALLA droppar som `ml`, inklusive
  `"ögondroppar"` och `"örondroppar"` som redan returnerat `"dos"` på rad 50.
  Är ordningen rätt? (Ja — `"ögondroppar"` checkas först på rad 50.)
  Men `"orala droppar"` på rad 55 är överflödig efter rad 55:s breda
  `"droppar"` — eller tvärtom: rad 55 fångar `"droppar"` och rad 55:s
  `"orala droppar"` är redundant. Är detta en bugg eller avsiktligt?
- `"nässpray"` → `dos` (rad 48). Men `"kutan spray"` → `ml` (rad 58).
  Vad med `"spray"` utan prefix? Faller igenom till `"st"`. Är det korrekt?
  T.ex. `"munhålespray"` — borde den vara `"dos"` eller `"ml"`?

### 2. `classifyDoseForm()` — saknade beredningsformer

Identifiera FASS‑termer som INTE matchas av någon regel och därmed
faller igenom till default `{ unit: "st", notCalculable: false }`.

Exempel att testa mentalt:
- `"depottablett"` — innehåller `"tablett"`? Nej. Faller igenom till `"st"`.
  OK, men `cleanForm()` i generate-drugs.js returnerar `"Depottablett"`.
- `"filmdragerad tablett"` — innehåller `"tablett"`? Nej, `"tablett"` finns
  inte som nyckelord i classifyDoseForm! Faller igenom till `"st"` via default.
  Är detta medvetet? Alla tablettvarianter litar på default.
- `"granulat"` — fanns i gamla filtreringslistan men finns INTE i
  classifyDoseForm. Faller igenom till `"st"`. Borde vara `notCalculable`?
- `"pulver till oral lösning"` — innehåller `"oral lösning"` → `ml`.
  Men det är ett pulver som ska blandas. Är `ml` korrekt, eller borde
  det vara `notCalculable`?
- `"pulver till injektionsvätska"` — innehåller `"injektion"` → `ml`.
  Samma fråga.
- `"koncentrat till infusionsvätska"` — innehåller `"infusion"` → `ml`.
- `"sublingual tablett"` — innehåller inte `"tablett"` som nyckelord.
  Faller igenom → `"st"`. OK, men `cleanForm()` missar den också och
  returnerar råsträngen. Är det OK?

### 3. `classifyDoseForm()` vs `cleanForm()` — konsistens

Två separata funktioner i två olika filer tolkar samma doseForm‑sträng.
De måste vara överens om vad varje sträng betyder.

Hitta alla fall där:
- `classifyDoseForm()` klassificerar en form som t.ex. `"dos"` men
  `cleanForm()` returnerar ett visningsnamn som inte matchar
  (t.ex. `"Injektionsvätska"` för en form som klassificerats som `"dos"`).
- `cleanForm()` har en matchning som `classifyDoseForm()` saknar, eller
  vice versa — så att en form får rätt visningsnamn men fel enhet, eller
  rätt enhet men konstigt visningsnamn.

Specifika fall:
- `"förfylld spruta"` → classify: `"dos"`, cleanForm: `"Förfylld spruta"`. OK.
- `"injektionsvätska, lösning"` → classify: innehåller `"injektion"` (rad 57)
  men INTE `"förfylld"` → `"ml"`. cleanForm: `"injektionsvätska"` matchar
  först (rad 187), returnerar `"Injektionsvätska"`. Matchar.
- `"injektionsvätska, lösning i förfylld spruta"` → classify:
  innehåller `"förfylld spruta"` (rad 46) → `"dos"`.
  cleanForm: `"förfylld spruta"` matchar (rad 185) → `"Förfylld spruta"`.
  Matchar.
- Men: `"injektionsvätska, lösning i förfylld injektionspenna"` →
  classify: rad 46 `"förfylld injektionspenna"` → `"dos"`.
  cleanForm: rad 186 `"förfylld injektionspenna"` → `"Injektionspenna"`.
  OK.
- `"depotinjektionsvätska"` — classify: innehåller `"injektion"` men
  INTE `"förfylld"` → `"ml"`. cleanForm: innehåller `"injektion"` → 
  `"Injektionsvätska"`. OK. Men kliniskt: en depotinjektion är ofta
  en förfylld spruta. Beroende på exakta FASS‑termen kan den hamna fel.

### 4. `cleanForm()` — matchningar som borde finnas men saknas

FASS doseForm‑strängar som förekommer i verkligheten (från tidigare
crawlar eller erfarenhet) men som varken `classifyDoseForm()` eller
`cleanForm()` hanterar explicit:

- `"Filmdragerad tablett"`
- `"Dragerad tablett"`
- `"Sublingual tablett"`
- `"Oralt sönderfallande tablett"` (synonym till munsönderfallande)
- `"Kapsel, hård"` (med kommatecken — `cleanForm()` hanterar `"kapsel"` + `"hård"`)
- `"Kapsel, mjuk"` 
- `"Depotkapsel, hård"` — `cleanForm()` returnerar `"Depotkapsel"` (rad 153)
  innan `"kapsel"` + `"hård"` hinner matcha. OK.
- `"Enterokapsel, hård"`
- `"Granulat"` — varken classify eller cleanForm har specialhantering
- `"Pulver till oral lösning"`
- `"Pulver och vätska till oral lösning"`
- `"Koncentrat till infusionsvätska, lösning"`
- `"Medicinsk gas, komprimerad"` — classify: `"medicinsk gas"` → notCalculable. OK.
- `"Ögondroppar, lösning"` — classify: `"ögondroppar"` → `"dos"`. OK.
  cleanForm: `"ögondroppar"` → `"Ögondroppar"`. OK.
- `"Örondroppar, lösning"` — samma.
- `"Ögonsalva"` — classify: `"salva"` → notCalculable. OK.
- `"ögongel"` — classify: rad 35 exkluderar explicit `"ögongel"` från
  notCalculable. Men sen matchas inget → `"st"`.
  Är `"st"` rätt för ögongel? Borde det vara `"dos"` eller `"ml"`?
  cleanForm: `"gel"` → `"Gel"` (rad 203). Ger ointuitiv visning.

### 5. `generate-drugs.js` — dataflöde

- Rad 115: `const unit = prod.unit || "st"`. Om `prod.unit` är `null`
  (från notCalculable), sätts unit till `"st"`. Är detta korrekt?
  Borde notCalculable‑produkter ha `unit: null` i drugs.js?
  Just nu får de `unit: "st"` (default) men `notCalculable: true`.
  `ui-renew.js:494` läser `drug.u || 'st'` — för notCalculable visas
  varningen men `'st'` används som enhet. Detta är harmlöst eftersom
  `calc-renew.js:126` kollar `notCalculable` först och blockar
  beräkningen. Men är det rent?

- Rad 136: `if (unit !== "st") entry.unit = unit`. Detta betyder att
  `entry.unit` sätts till `null` för notCalculable (unit=null !== "st").
  I output blir det `u: null`. När `ui-renew.js:526` läser `drug.u || 'st'`
  får den `'st'`. OK.

- Rad 134: `atc: atcCode` — läggs till i varje entry. `ui-renew.js:528`
  läser `drug.a || null`. Används `atcCode` någonstans i runtime?
  Leta igenom `Kod/` efter `atcCode` för att se om detta fält används.
  Om inte — onödig data i drugs.js.

- `generateDrugEntries()` filtrerar `pkg.quantity <= 1` (rad 123).
  `strength` kan vara `""` vilket ger namn som `"Alvedon "` med
  trailing space (rad 130: `trim()` fixar detta). OK.

### 6. `build-product-db.js` — edge cases i datakällan

- `extractProductData()` (rad 97): regex `self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)`
  är greedy-in-match men lazy-in-group. Kan den missa payloads som
  innehåller escaped quotes?
  
- `findProductHeader()` (rad 123): `depth > 25` guard. Kan stora produkter
  med många packages/alternativeForms överskrida detta?

- `normalizeProduct()` (rad 164):
  - `if (!raw || !raw.doseForm) return null` — vad händer med produkter
    som saknar doseForm? De kastas bort. Är det rätt?
  - `unit: classification.unit` (rad 207) — sparas `null` för notCalculable.
    I JSON blir detta `"unit": null`. OK.
  - `alternativeForms` (rad 146) extraheras men används inte. Kan den
    användas för att förbättra klassificeringen? T.ex. om en produkt har
    både tablett och injektionsform som alternativ.

### 7. Regression: tidigare filtrerade former som nu släpps igenom

Gamla `isLiquidOrTopical()` filtrerade bort bl.a.:
`"tuggummi"`, `"plåster"`, `"depotplåster"`, `"vagitorium"`,
`"suppositorium"`, `"granulat"`, `"pulver till"`, `"endosbehållare"`,
`"nässpray"`, `"inhalationspulver"`, `"inhalationsspray"`,
`"munsköljvätska"`, `"munhålegel"`, `"dentalgel"`, `"ögondroppar"`,
`"örondroppar"`.

Nya `classifyDoseForm()` klassificerar dessa — men är klassificeringen
kliniskt korrekt för ALLA? Gå igenom listan och flagga tveksamma fall.

Specifikt:
- `"tuggummi"` → `"st"` (default). OK, men `cleanForm()` returnerar
  `"Tuggummi"`. Är `"st"` rätt enhet för tuggummi?
- `"plåster"` → `"st"` (default). `cleanForm()` → `"Plåster"`. OK.
- `"depotplåster"` → `"st"`. OK.
- `"vagitorium"` / `"suppositorium"` → `"st"`. `cleanForm()` har
  matchningar. OK.
- `"granulat"` → `"st"` (default). Borde det vara `notCalculable`?
  Granulat doseras ofta i dospåsar men mäts i gram.
- `"dentalgel"` → `"gel"` → notCalculable (rad 35). OK.
- `"munhålegel"` → `"gel"` → notCalculable (rad 35). OK.

### 8. Konsekvenser i runtime

När `drugs.js` nu innehåller tusentals nya entries med `unit: "ml"`,
`unit: "dos"` och `notCalculable: true`:

- **Autocomplete**: `ui-renew.js:494` visar `drug.c ? '⚠ ej beräkningsbar' : ...`.
  Fungerar visningen för alla tre kategorierna? Testa mentalt:
  - Tablett: `"100 st · Tablett"` ✓
  - Oral lösning: `"200 ml · Oral lösning"` ✓
  - Inhalationsspray: `"120 dos · Inhalationsspray"` ✓
  - Kräm: `"⚠ ej beräkningsbar"` ✓

- **Validering**: `calc-renew.js:42–53` tillåter decimaler för `ml`/`dos`
  men kräver heltal för `st`. Detta är korrekt.

- **Förskrivningspanel**: `prescribe.js` använder `UNIT_DISPLAY` för
  att visa `"tabletter"`, `"ml"`, `"doser"`. Stämmer det för alla
  tänkbara beredningsformer? T.ex. plåster visas som `"tabletter"`
  i labeln `"Förpackningsstorlek (tabletter)"`. Borde det stå
  `"Förpackningsstorlek (plåster)"`?

- **Journaltexter**: `calc-renew.js` bygger texter med `${doseUnit}`.
  `"st"` → `"st"`. `"ml"` → `"ml"`. `"dos"` → `"dos"`.
  Grammatiskt ok på svenska?

## Leverabel

Returnera en numrerad lista med alla buggar, uppdelat i:
1. **Säkerhetsbugs** (t.ex. felaktig klassificering som påverkar patientsäkerhet)
2. **Logiska bugs** (t.ex. matchningsordning som ger fel enhet)
3. **Saknad täckning** (FASS‑termer som faller igenom oförtjänt)
4. **Konsistensbugs** (classifyDoseForm ≠ cleanForm)
5. **Kosmetiska** (visningstexter, labels)

För varje bugg: ange fil, radnummer, vad som är fel, och föreslagen fix.
