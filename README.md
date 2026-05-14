# Receptberäkning

Kliniskt beslutsstöd för läkare vid receptförnyelse och läkemedelsberäkning.

## Kör lokalt

Öppna `Kod/index.html` i en webbläsare.

## Kommandon (körs från `Kod/`)

```bash
npm test                         # calc + interactions + UI (270 tester)
npm run build:css                # minifiera app.css → app.min.css
npm run build:db                 # crawla FASS → data/product-db.json (~45 min)
npm run generate:drugs           # data/product-db.json → Kod/drugs.js (~1 min)
```

## Deploy (Cloudflare Pages)

Publish directory: **`Kod/`**
