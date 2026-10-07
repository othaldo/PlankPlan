# PlankPlan – Anforderung und Umsetzung

## Ziel und Rahmen

Lokale React/TypeScript/Vite-Web-App für eine praktische Laminat-Verlegeplanung. SVG als Editor, kein erforderliches Backend. Geometrieberechnung strikt von der Oberfläche getrennt und automatisiert getestet. Interne Raum- und Dielenkoordinaten in Millimetern, unabhängig von Darstellung und Zoom.

Übernommen aus dem Chat „Werkzeug fürs Laminat verlegen“ und der konkretisierten MVP-Anforderung vom 7. Oktober 2026. Das Mehr-Etagen-Modell ersetzt das ursprüngliche Ein-Etagen-Modell direkt ab Version 1.

## Datenmodell

- Projekt: `version`, `name`, `flooring`, `floors[]`.
- Optionales `materialPlan`: empfohlene `roomOrder` als kombinierte Etagen-/Raum-IDs, `adaptive` für materialabhängige Startstücke und kanonische `signature` der relevanten Planungsdaten. Alte Dateien ohne dieses Feld bleiben ladbar. Herkunftsraum, Etage und Zuschnittseite stehen in der berechneten Materialzuordnung; Reststück-IDs sind raumübergreifend eindeutig.
- Jede Etage: `id`, `name`, `background`, `calibration`, `rooms[]`.
- Hintergrund: eingebettetes Bild, Originalabmessungen in Pixeln, Deckkraft, Ursprung in Millimetern.
- Kalibrierung: zwei Bildpixel-Punkte, reale Strecke in Millimetern, daraus berechnete Millimeter pro Pixel.
- Raum: `id`, `name`, einfaches polygonales Raumprofil, `flooringEnabled` zum Ausschließen aus der Laminatplanung, `layout` mit Richtung, Offsets und optionalem Modus `automatic`/`manual`. Fehlender Modus bedeutet automatisch. Optionales `layout.firstRowWidth`: fehlend für automatische Randreihen, `"full"` für volle Dielenbreite oder eine gewünschte Breite in Millimetern (maximal aktuelle Dielenbreite).
- Zusätzliche Materialwerte: `minJointOffset`, `boardsPerPack`, `reservePercent`, `sawKerf`. Alte Projektdateien bleiben ladbar.
- Dielenberechnung: Reihen- und Spaltenindex, Ausgangsrechteck mit Rotation, verbleibendes Zuschnitt-Multipolygon, belegte Fläche, ganze/geschnittene Diele und benötigte Abmessungen.

Default-Material: Parador Selected Eiche Luxemburg, 1285 × 194 × 8 mm. Vergleichsvorlage: Wunderwerk Eiche Malmö, 1292 × 246 × 8 mm. Default-Bewegungsfuge 10 mm, Mindest-Reihenbreite 60 mm, Mindest-Endstücklänge 300 mm, Reihenversatz 400 mm; Werte editierbar und anhand der Herstelleranleitung anpassbar.

## MVP – umgesetzt

- Mehrere Etagen mit unabhängigen Hintergründen, Kalibrierungen und Räumen.
- PNG-/JPG-/WebP-Grundriss laden und Deckkraft einstellen.
- Zwei-Punkte-Kalibrierung ausschließlich des Bildmaßstabs als Standard. Vorhandene Raummaße bleiben bei Bildwechsel und Neukalibrierung unverändert. Ausdrückliche Option zum gemeinsamen Skalieren der Konturen; standardmäßig ausgeschaltet und nach Anwendung zurückgesetzt.
- Manuelle Breite/Tiefe in Planachsen, proportionale Anpassung der Kontur mit festem Ursprung oben links. Einzelne Eckpunkte als X-/Y-Koordinaten editieren und Wandlängen anzeigen; ungültige Konturen abweisen. Bildposition unabhängig von Raumgeometrie eingeben.
- Bis zu 30 Änderungen rückgängig machen/wiederholen. Vollständige persistente Sicherung vor Bildwechsel, Kalibrierung, Hintergrundentfernung und Projektimport; letzte Sicherung aus IndexedDB nach Neuladen wiederherstellbar und als JSON exportierbar. Kein nachträglicher Verlauf für Änderungen vor Einführung der Funktion.
- Polygonraum zeichnen und schließen, konkave Räume unterstützen; ungültige Konturen abweisen.
- Zeichnen mit Millimeter-Raster und optionalen 45°-Winkeln; letzten Punkt zurücknehmen und abbrechen.
- Räume auswählen, umbenennen, duplizieren, löschen; bestehende Eckpunkte ziehen. Plus-Griffe an allen Kanten einschließlich der Schlusskante fügen Punkte per Klick, Ziehen oder Tastatur ein. Ausgewählte Punkte per Button oder Entf löschen; mindestens drei Punkte erhalten. Ungültige Änderungen überschreiben die gültige Kontur nicht.
- Shift beim Eckpunkte-Ziehen richtet die nächstliegende Nachbarkante exakt horizontal oder vertikal aus, mit sichtbarer Hilfslinie. Drücken/Loslassen wirkt sofort, auch ohne Mausbewegung; die Achsenausrichtung hat Vorrang vor dem Einrasten an anderen Räumen.
- Laminat pro Raum ein-/ausschalten; ausgeschlossene Räume behalten ihre Geometrie und benötigen kein Material.
- Ecken und Wandsegmente beim Zeichnen, Eckpunkte-Ziehen und Verschieben ganzer Räume einrasten lassen. Toleranz entspricht 10 Bildschirmpixeln bei jedem Zoom; vollständige Raumverschiebung verändert keine Maße.
- Reale Dielenmaße eingeben, Vorlagen wechseln, Verlegerichtung 0°/90°/freier Winkel einstellen.
- Bewegungsfuge geometrisch nach innen versetzen; Räume mit echten Dielen füllen und tatsächliche Zuschnittpolygone an Grenzen anzeigen.
- Ganze und zugeschnittene Dielen unterscheiden; Dieleninformationen bei Hover.
- Automatische Planung als Standard: Randreihen optimieren, individuelle Startstücke je Reihe bestimmen und den Mindest-Fugenabstand zwischen benachbarten Reihen einhalten.
- Optionales `layout.pattern`: `optimized` (Standard), `half` oder `third`. Regelmäßige Muster suchen einen gemeinsamen Start und wiederholen die Fugenphasen nach zwei bzw. drei Reihen. Mindestlängen und tatsächliche Fugenabstände bleiben verbindlich; keine stille Lockerung oder Rückkehr zum freien Versatz. Paketoptimierung, Cache und Plan-Signatur berücksichtigen das Muster; JSON erhält es.
- Zuschnitt-/Reststückfarben zum Beurteilen des Fugenbilds ausschalten, ohne Geometrie oder Materialzuordnung zu ändern.
- Erste Reihe unabhängig von der Längsplanung festlegen: volle Dielenbreite oder eine eigene Breite. Die Automatik überschreibt diese Vorgabe nicht und plant Startstücke, Fugenversatz sowie Reststückverwendung weiter. Die Bewegungsfuge bleibt erhalten; eine dadurch zu schmale letzte Reihe wird angezeigt. Die Vorgabe gilt pro Raum und bleibt über JSON und Browserspeicher erhalten.
- Jedes getrennte Zuschnittfragment muss mindestens die konfigurierte Mindeststücklänge besitzen. Gibt die Suche keine gültige Lösung her, werden keine ungültigen Dielen ausgegeben und keine Paketmenge behauptet.
- Erste und letzte Reihenbreite sowie Start- und Endstücke aller Reihen auswerten.
- Manuelle Quer-/Längs-Rasterkontrolle als expliziter Expertenmodus erhalten.
- Raumfläche, verlegte Fläche, ganze/geschnittene Dielen, Ausgangsmaterial und rechnerischen Verschnitt auswerten.
- Pakete projektweit aus tatsächlich neuen Ausgangsdielen und einer einmaligen einstellbaren Zusatzreserve aufrunden. Einzelraum-Pakete werden nur bei einem aktiven Raum angezeigt. Vergleich mit gemeinsamem Einkauf ohne Raumtausch und einzeln gerundeten Raumbedarfen.
- Reststückbestand pro Suchzustand: Herkunft, Länge, Breite und erhaltene Stirnkante. Geeignete Endabschnitte an späteren Reihenanfängen und Anfangsabschnitte an späteren Reihenenden verwenden; Mindestlänge, Fugenversatz und Sägeblattverlust beachten. Keine Doppelverwendung desselben Reststücks.
- Wiederverwendete Stücke grün hervorheben, Ausgangsdiele im Hover anzeigen und noch nutzbare Reststücke ausweisen. Schräge Zuschnitte und Längsstreifen werden vorerst nicht wiederverwendet.
- Gemeinsames Reststück-Inventar über alle Räume und Etagen. Nur Material bereits geplanter Räume kann übernommen werden; keine Doppelverwendung. Übertragene Stockfläche wird beim Herkunftsraum abgezogen und beim Empfänger gezählt, sodass die Raummaterialflächen das gesamte neue Ausgangsmaterial ergeben.
- Paketoptimierung im abbrechbaren Worker: bis fünf Räume alle Reihenfolgen mit bestehenden Zuschnitten, danach begrenzte reproduzierbare Reihenfolgensuche. Bis zu vier günstige Reihenfolgen materialabhängig nachplanen. Pakete zuerst minimieren, dann neue Dielen; eine gültige bisherige Lösung bleibt als Vergleich erhalten. Kein garantiertes globales Minimum. Verlegerichtungen und festgelegte erste Reihenbreiten bleiben erhalten.
- Gesamtes Projekt als JSON speichern/laden, einschließlich Bilder und Maßstab; zusätzliche Räume als JSON einfügen.
- Lokaler Browserspeicher mit Hinweis bei Speicherfehlern.
- Engine-Tests und Browser-Integrationstests.

## Nächste Ausbaustufen aus der vollständigen Spezifikation

1. Suche über mehrere Richtungen. Automatische Startstücke, gemeinsames Reststück-Inventar und Paketoptimierung über Raumreihenfolgen sind bereits implementiert; die Suche erhebt keinen Anspruch auf globale Optimalität.
2. Wiederverwendung komplexerer Zuschnitte. Das raumübergreifende, klickkantengerechte Inventar für gerade Querschnitte in voller Dielenbreite ist bereits implementiert.
3. Exportierbarer Schnittplan und druckbare Dielen-/Reststückzuordnung. Sägeblattverlust, projektweite Material-/Reststückplanung, Packungsgrößen und gemeinsame Zusatzreserve sind bereits umgesetzt.
4. Aussparungen für Kamin, Treppe, Einbauten und weitere Hindernisse.
5. PDF-Grundrissimport, Hintergrund per Ziehen verschieben/drehen, Ausrichtung an längster Wand oder Fensterlicht. Hintergrundposition ist bereits numerisch editierbar.
6. Direkte Drehgriffe und zusätzliche Maßbeschriftungen. Einfügen/Entfernen zusätzlicher Eckpunkte und waagerechte/senkrechte Ausrichtung per Shift sind bereits umgesetzt.
7. Durchgehendes gemeinsames Raster über mehrere Räume und Türöffnungen; Raumverbindungen im Modell ergänzen.

## Qualitätskriterien

Fläche der Dielenzuschnitte entspricht der inneren Raumfläche; keine überlappenden Dielen und keine Fläche außerhalb der Bewegungsfuge. Keine Phantomreihen bei exakten Dielenvielfachen. Reihenbreiten werden in der lokalen Verlegeachse berechnet. Selbstkreuzende Polygone, ungültige Parameter und unvertretbar große Raster werden abgewiesen. Export/Import erhält die vollständigen Etagen- und Raumdaten. Der Optimierer verändert den Raum oder dessen Richtung/Längs-Offset nicht und liefert bei nicht erfüllbaren Mindestbreiten einen transparenten Hinweis.
