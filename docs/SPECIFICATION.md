# PlankPlan – Anforderung und Umsetzung

## Ziel und Rahmen

Lokale React/TypeScript/Vite-Web-App für eine praktische Laminat-Verlegeplanung. SVG als Editor, kein erforderliches Backend. Geometrieberechnung strikt von der Oberfläche getrennt und automatisiert getestet. Interne Raum- und Dielenkoordinaten in Millimetern, unabhängig von Darstellung und Zoom.

Übernommen aus dem Chat „Werkzeug fürs Laminat verlegen“ und der konkretisierten MVP-Anforderung vom 7. Oktober 2026. Das Mehr-Etagen-Modell ersetzt das ursprüngliche Ein-Etagen-Modell direkt ab Version 1.

## Datenmodell

- Projekt: `version`, `name`, `flooring`, `floors[]`.
- Jede Etage: `id`, `name`, `background`, `calibration`, `rooms[]`.
- Hintergrund: eingebettetes Bild, Originalabmessungen in Pixeln, Deckkraft, Ursprung in Millimetern.
- Kalibrierung: zwei Bildpixel-Punkte, reale Strecke in Millimetern, daraus berechnete Millimeter pro Pixel.
- Raum: `id`, `name`, einfaches polygonales Raumprofil, `layout` mit Richtung, Längs-Offset und Quer-Offset.
- Dielenberechnung: Reihen- und Spaltenindex, Ausgangsrechteck mit Rotation, verbleibendes Zuschnitt-Multipolygon, belegte Fläche, ganze/geschnittene Diele und benötigte Abmessungen.

Default-Material: Parador Selected Eiche Luxemburg, 1285 × 194 × 8 mm. Vergleichsvorlage: Wunderwerk Eiche Malmö, 1292 × 246 × 8 mm. Default-Bewegungsfuge 10 mm, Mindest-Reihenbreite 60 mm, Mindest-Endstücklänge 300 mm, Reihenversatz 400 mm; Werte editierbar und anhand der Herstelleranleitung anpassbar.

## MVP – umgesetzt

- Mehrere Etagen mit unabhängigen Hintergründen, Kalibrierungen und Räumen.
- PNG-/JPG-/WebP-Grundriss laden und Deckkraft einstellen.
- Zwei-Punkte-Kalibrierung; vorhandene Konturen bleiben bei Neukalibrierung am Bild ausgerichtet.
- Polygonraum zeichnen und schließen, konkave Räume unterstützen; ungültige Konturen abweisen.
- Zeichnen mit Millimeter-Raster und optionalen 45°-Winkeln; letzten Punkt zurücknehmen und abbrechen.
- Räume auswählen, umbenennen, duplizieren, löschen; bestehende Eckpunkte ziehen.
- Reale Dielenmaße eingeben, Vorlagen wechseln, Verlegerichtung 0°/90°/freier Winkel einstellen.
- Bewegungsfuge geometrisch nach innen versetzen; Räume mit echten Dielen füllen und tatsächliche Zuschnittpolygone an Grenzen anzeigen.
- Ganze und zugeschnittene Dielen unterscheiden; Dieleninformationen bei Hover.
- Quer-Offset interaktiv verändern, Längs-Offset manuell einstellen.
- Erste und letzte Reihenbreite auswerten; kurze Stücke und schmale Bereiche kennzeichnen.
- Automatischen optimalen Quer-Offset unter geprüften Kandidaten suchen, anschließend manuell ändern.
- Raumfläche, verlegte Fläche, ganze/geschnittene Dielen, Ausgangsmaterial und rechnerischen Verschnitt auswerten.
- Gesamtes Projekt als JSON speichern/laden, einschließlich Bilder und Maßstab; zusätzliche Räume als JSON einfügen.
- Lokaler Browserspeicher mit Hinweis bei Speicherfehlern.
- Engine-Tests und Browser-Integrationstests.

## Nächste Ausbaustufen aus der vollständigen Spezifikation

1. Gemeinsame Suche über Quer-/Längs-Offset, Richtung und Anfangsstücklänge. Gewichtete Bewertung: schmale Reihen, kurze Endstücke, Stirnfugenabstand, Abfallfläche und Ausgangsdielenmenge. Längsoptimierung ist nicht Bestandteil des angeforderten MVP.
2. Reststück-Inventar: Größe, Ausgangsdiele, Herkunft, Schnittart und intakte Klickkanten; geeignete Endabschnitte als nächste Anfangsstücke verwenden. Kein rein flächenbasierter Wiederverwendungsansatz.
3. Exportierbarer Schnittplan und Dielen-/Reststückzuordnung. Sägeblattverlust, Packungsgrößen, Kaufreserve und vollständige Mengenplanung.
4. Aussparungen für Kamin, Treppe, Einbauten und weitere Hindernisse.
5. PDF-Grundrissimport, Hintergrund verschieben/drehen, Ausrichtung an längster Wand oder Fensterlicht.
6. Punkte in bestehende Konturen einfügen/entfernen, direkte Drehgriffe, zusätzliche Maßbeschriftungen.
7. Durchgehendes gemeinsames Raster über mehrere Räume und Türöffnungen; Raumverbindungen im Modell ergänzen.

## Qualitätskriterien

Fläche der Dielenzuschnitte entspricht der inneren Raumfläche; keine überlappenden Dielen und keine Fläche außerhalb der Bewegungsfuge. Keine Phantomreihen bei exakten Dielenvielfachen. Reihenbreiten werden in der lokalen Verlegeachse berechnet. Selbstkreuzende Polygone, ungültige Parameter und unvertretbar große Raster werden abgewiesen. Export/Import erhält die vollständigen Etagen- und Raumdaten. Der Optimierer verändert den Raum oder dessen Richtung/Längs-Offset nicht und liefert bei nicht erfüllbaren Mindestbreiten einen transparenten Hinweis.
