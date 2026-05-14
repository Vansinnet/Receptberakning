## Commit-instruktion

Version (i `index.html`): nuvarande `v1.00`, nästa commit blir `v1.01`.

Vid varje commit:
1. Kör `npm run build:css` om `app.css` ändrats (annars blir `app.min.css` inaktuell)
2. Kör `npm test` — 270 tester måste passera
3. Bumpa versionen i `Kod/index.html` (rad 69) — öka minor, t.ex. v1.00 → v1.01
4. `git add -A && git commit -m "kort rubrik"` — body med `-m` vid behov
5. `git push`

Viktigt: AGENTS.md är lokal — ska aldrig läggas i repot (`git rm --cached AGENTS.md` om den råkar checkas in).
