# Receptberäkning 💊

Ett webbaserat beslutsstöd för sjukvårdspersonal för att underlätta och säkra handläggningen av receptförnyelser. Verktyget beräknar patientens läkemedelsförbrukning, upptäcker över- eller underkonsumtion och genererar färdiga svarsmallar för patientkontakt (t.ex. via 1177) och journalföring.

[Verktyget skapades och underhålls av Gabriel Jungestrand](https://github.com/Vansinnet/Receptberakning).

---

## ✨ Funktioner

* **Beräkning av Receptförnyelse:** * Fyll i läkemedel, dosering, uttag och senaste receptdatum för att se exakt hur länge medicinen bör räcka.
  * Hanterar upp till 8 samtidiga läkemedel.
  * Valfri inmatning av kvarvarande doser för exakt snittberäkning.
* **Långvarig Förbrukningsanalys:** * Utvärdera förbrukningsmönster över tid genom att lägga in flera historiska receptperioder.
  * Visuell mätare som visar förbrukningen relativt den ordinerade dosen.
* **Smarta Varningar:** Varnar automatiskt vid överförbrukning, underförbrukning, orimliga värden eller datum satta i framtiden.
* **Automatiska Texter:** Genererar kopieringsbara texter anpassade för patientsvar (t.ex. 1177) och medicinska journaler baserat på beräkningsutfallet.
* **FASS-integration:** Skapar automatiskt direktlänkar till FASS för vårdpersonal baserat på det inmatade läkemedelsnamnet.
* **GDPR & Patientsäkerhet (Inbyggt skydd):**
  * All beräkning sker lokalt i webbläsaren (Client-side). Ingen patientdata sparas på någon server.
  * **Inaktivitetstimer:** Rensar automatiskt skärmen och all inmatad data efter 15 minuters inaktivitet för att skydda känsliga patientuppgifter.
* **Anpassningsbart Gränssnitt:** Stöd för fem olika färgteman (Ljust, Mörkt, Sakura, Regnbåge, Lazerwave). Temaval sparas lokalt via `localStorage`.

## 🚀 Kom igång

Projektet är byggt helt i **HTML, CSS och Vanilla JavaScript**. Det kräver inga ramverk, byggsteg eller externa beroenden.

### Alternativ 1: Kör lokalt
1. Klona repot:
   ```bash
   git clone [https://github.com/Vansinnet/Receptberakning.git](https://github.com/Vansinnet/Receptberakning.git)
