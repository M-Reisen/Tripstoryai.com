# Fotobuch: Druckdatei und Übergabe an Fotobuch-Anbieter

## Was die App liefert

| | Drucken / PDF | Druckdatei |
|---|---|---|
| Zweck | Zuhause drucken, als PDF teilen | Upload bei einem Fotobuch-Anbieter |
| Seitenformat | 297 × 210 mm (A4 quer) | 303 × 216 mm (A4 quer + 3 mm Beschnitt an jeder Kante) |
| Fotoauflösung | ca. 200 dpi | 300 dpi (Ausnahme: siehe „Grenzen“) |
| Seitenzahl | wie erzeugt | immer gerade (bei Bedarf eine Leerseite vor der Schlussseite) |
| Sicherheitsabstand | Text und Fotos mind. 15 mm vom Rand | dito, gemessen ab Schnittkante |
| Farbraum | RGB (sRGB) | RGB (sRGB) |

Aufbau: Seite 1 Deckblatt, dann Unterkunfts-, Tages- und Textseiten, am Ende „Unsere Reise in Zahlen“.
Fotos am Seitenrand (Deckblatt, Unterkunft) laufen in den Beschnitt hinein.

## So entsteht die Druckdatei

1. Am Computer in Chrome oder Edge die Reise öffnen (am Handy ignorieren die Browser das Seitenformat).
2. Menü → „Fotobuch als PDF“ → **Druckdatei**.
3. Die App lädt alle Fotos in Druckqualität, danach öffnet sich der Druckdialog.
4. Ziel „Als PDF speichern“, Ränder „Keine“, Skalierung „Standard/100 %“, Hintergrundgrafiken an.
5. Die PDF beim Anbieter hochladen.

In der Vorschau zeigt eine gestrichelte Linie die spätere Schnittkante.

## Anbieter im Überblick (Stand Oktober 2026, ohne Gewähr)

| Anbieter | PDF-Upload | Hinweise |
|---|---|---|
| Saal Digital | Ja, im Online-Shop („PDF Upload“) | Umschlag und Innenseiten als **zwei** PDFs; Maße exakt laut Saal-Vorlage. Unsere Seiten 2 bis Ende als Innenteil nutzen; den Umschlag am besten im Saal-Designer gestalten. [Anleitung](https://www.saal-digital.com/service/professional-zone/upload-your-pdf-in-the-online-shop/) |
| CEWE | Ja, „CEWE Fotobuch von PDF“ | Maße kommen aus dem CEWE-Vorlagengenerator (für InDesign); Umschlag separat. Format vorher mit den CEWE-Maßen abgleichen. [Info](https://www.cewe.de/cewe-fotobuch-von-pdf-bestellen.html) |
| Pixum | Kein PDF-Upload gefunden | Nur über die Pixum-Software bzw. App. |
| Fotofabrik | Ja | [PDF-Fotobuch](https://www.fotofabrik.de/fotobuch-als-pdf/) |
| Prodigi (Print-API) | Ja, auch per API | A4 quer im Programm; eine PDF, Seite 1 = Vorderseite, letzte Seite = Rückseite; gerade Seitenzahl; 10 mm Sicherheitsabstand; Beschnitt wird dort selbst erzeugt (dann „Drucken / PDF“ ohne Beschnitt nehmen). [Technik](https://www.prodigi.com/blog/photo-books-technical-guide/) |
| Peecho, Lulu (Print-API) | Ja | Für eine spätere Bestellung direkt aus Travona (Druck auf Abruf, Versand an Kunden). Konditionen nur auf Anfrage. [Peecho](https://www.peecho.com/solutions/print-api), [Lulu](https://www.lulu.com/sell/sell-on-your-site/print-api) |

Jeder Anbieter hat eigene Endformate (oft nicht exakt A4). Vor der ersten Bestellung die Vorlage des
Anbieters herunterladen und Maße vergleichen; weicht das Format ab, kann die App ein zweites Profil
bekommen (nur Zahlen in `MODES` in `fotobuch.js` ändern).

## Designs

Über „🎨 Design“ stehen 10 Designs zur Wahl (Farben, Titelschrift, Motiv). Die Wahl wird pro Reise auf dem
Gerät gespeichert und gilt für Vorschau, „Drucken / PDF“ und „Druckdatei“. „Sternennacht“ hat dunkle Seiten:
im Fotobuch sehr edel, beim Drucken zu Hause braucht es viel Tinte. Neue Designs entstehen durch einen Eintrag
in `THEMES` in `fotobuch.js`.

## Grenzen

- Fotos werden beim Upload auf 2000 px lange Kante verkleinert. Kleine und mittlere Rahmen erreichen
  300 dpi, große Fotos (Deckblatt, Unterkunft) teils nur ca. 160–200 dpi. Für Bücher reicht das meist;
  für volle 300 dpi müsste die Upload-Grenze auf ca. 3500 px steigen (mehr Speicher in Supabase).
- Druckauflösung kommt aus der Supabase-Bildumwandlung (max. 2500 px). Die App nutzt sie schon heute
  für alle Vorschaubilder; abgerechnet wird pro Originalbild und Monat, nicht pro Größe.
- Keine CMYK- oder PDF/X-Ausgabe aus dem Browser. Die genannten Anbieter nehmen RGB-PDFs an und
  wandeln selbst um.

## Nächster Schritt (Entscheidung Ramona)

Direktbestellung aus der App wäre über eine Print-API (z. B. Prodigi oder Peecho) möglich. Das braucht
einen Vertrag bzw. ein Händlerkonto und eine Server-Funktion für die Bestellung. Nichts davon ist
eingerichtet.
