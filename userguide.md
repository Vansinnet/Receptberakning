<FILE file_path="/home/workdir/attachments/användarguide.md" size="12480 bytes">
# Användarguide – Receptberäkning

**Välkommen till Receptberäkning** – ett kliniskt beslutsstöd för läkare vid receptförnyelse via 1177 och analys av långvarig förbrukning.

Verktyget är helt offline (arbetar lokalt i webbläsaren efter att du gått in i verktyget), innehåller inga externa beroenden och sparar ingen patientdata.

---

## 1. Kom igång

Använd verktyget här:  
**[https://receptberakning.pages.dev/](https://receptberakning.pages.dev/)**

(alltid den senaste versionen – ingen nedladdning behövs)

---

## 2. Översikt – två flikar

| Flik                     | Användning                              |
|--------------------------|-----------------------------------------|
| **💊 Receptförnyelse**   | Vanligaste användningen – bedömning och förnyelse av recept |
| **📊 Långvarig förbrukning** | Analys av förbrukning över längre tid (flera perioder) |

Du kan växla mellan flikarna i toppmenyn.

---

## 3. Receptförnyelse – steg för steg

### Steg 1: Lägg till läkemedel
- I vänster sidopanel finns redan ett läkemedelskort.
- Klicka på **＋ Lägg till** för att lägga till fler (max 8 stycken).

### Steg 2: Fyll i uppgifter (mittenkolumnen)
För varje läkemedel fyller du i:

| Fält                  | Vad du ska skriva                          | Kommentar |
|-----------------------|--------------------------------------------|---------|
| Läkemedel och styrka  | T.ex. `Elvanse 50 mg`                      | Exakt som på receptet |
| Senaste recept        | Förskrivningsdatum (ÅÅÅÅ-MM-DD)            | Autoformateras |
| Dos per dag           | T.ex. `1` eller `1,5`                      | Kan vara decimal |
| Förpackningsstorlek   | Antal tabletter/kapslar per förpackning    | T.ex. 100 |
| Antal uttag           | Antal uthämtningar på receptet             | Max 12 |
| Doser kvar            | Antal tabletter patienten har kvar         | **Valfritt** – ger exaktare beräkning |

### Steg 3: Tolka resultatet (högerkolumnen)
Verktyget visar direkt:

- **Verdict** (grön/gul/röd ruta)
- **Tidslinje** – hur stor del av receptperioden som gått
- **Mätvärden** – totalt förskrivet, räcker t.o.m., snittförbrukning
- **Alerter** – varningar vid låg/överförbrukning eller tidig uthämtning

**Vid överförbrukning eller för tidigt:**
- Klicka **✓ Ja, förnya** eller **✕ Nej, avslå**
- Beslutet påverkar både status och de genererade texterna.

### Steg 4: Kopiera texter
- Under resultat visas:
  - **Svar till patient** (svenska + engelska)
  - **Journalanteckning**
- Klicka **📋 Kopiera text** – texten är redo att klistras in i 1177 eller journalsystem.

### Steg 5: Ny förskrivning (automatiskt)
När förnyelse godkänts visas en panel till höger:
- Ange förpackningsstorlek
- Välj antal månader eller specifikt slutdatum
- Verktyget räknar ut exakt antal förpackningar att förskriva

---

## 4. Långvarig förbrukning

1. Fyll i läkemedel och ordinerad dos.
2. Lägg till perioder (startdatum, antal uttagna tabletter, slutdatum).
3. Klicka på **＋ Lägg till period** vid behov.
4. Resultatet visar:
   - Total snittförbrukning
   - Stapel 0–150 %
   - Tabell med per-period analys (Över / OK / Under)
   - Färdig journalanteckning

**Tips:** Använd den här fliken vid misstänkt låg följsamhet, misstänkt missbruk eller vid uppföljning av långvarig behandling.

---

## 5. Praktiska funktioner

- **Tema**: Välj mellan Klinisk (standard), Mörkt eller Körsbär i toppmenyn.
- **Rensa ett kort**: Klicka **Rensa** i formulärhuvudet.
- **Ta bort kort**: Använd **Rensa** när bara ett kort finns kvar, eller ta bort via sidopanelen.
- **Återställ allt**: Klicka **🔄 Återställ allt** i toppmenyn.
- **Inaktivitetsskydd**: Efter 4 minuter varnas du, efter 5 minuter rensas all data (skyddar patientuppgifter på delade datorer).
- **FASS**: Klicka på FASS-länken bredvid läkemedelsnamnet.

---

## 6. Vanliga frågor

**Fråga:** Varför blir det "För tidigt" även om patienten säger att medicinen är slut?  
**Svar:** Verktyget baserar "för tidigt" på **receptperioden**, inte på kvarvarande doser. Det är ett aktivt val för patientsäkerhet.

**Fråga:** Hur exakt är beräkningen om jag fyller i "Doser kvar"?  
**Svar:** Mycket exaktare – då används faktisk förbrukning istället för antagande.

**Fråga:** Kan jag använda verktyget utan internet?  
**Svar:** Ja, helt offline efter att filen laddats ner.

**Fråga:** Sparas mina uppgifter?  
**Svar:** Nej. Allt finns bara i webbläsarens minne under sessionen.

---

## 7. Tips till läkare

- Använd **Doser kvar** när patienten ger tydlig uppgift om det – det ger bäst precision i beslutsstödet.
- Vid narkotika eller högriskläkemedel – dubbelkolla alltid manuellt.
- Kopiera journaltexten direkt – den är anpassad efter ditt beslut.
- Använd fliken **Långvarig förbrukning** vid oklar följsamhet eller misstänkt över-/underförbrukning.

---

**Lycka till med verktyget!**  
Det är skapat för att spara tid och öka patientsäkerheten – använd det med ditt kliniska omdöme.

---

**Senast uppdaterad:** 2026-05-03
</FILE>
