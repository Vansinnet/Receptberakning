## Commit-instruktion

Vid varje commit:
1. Kör `npm run build:css` om `app.css` ändrats (annars blir `app.min.css` inaktuell)
2. Kör `npm test` — 270 tester måste passera
3. `git add -A && git commit -m "kort rubrik"` — body med `-m` vid behov
4. `git push`
