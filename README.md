# PlankPlan

Lokale Laminat-Verlegeplanung mit React, TypeScript und Vite. Grundrissbilder, polygonale Räume und echte Dielenmaße – ohne Backend, Konto oder Cloudspeicherung.

## Starten

Node.js 22.12 oder neuer (im Entwicklungsumfeld mit Node.js 25 geprüft).

```powershell
cd D:\Projekte\PlankPlan
npm install
npm run dev
```

Die im Terminal ausgegebene lokale Adresse im Browser öffnen (normalerweise http://localhost:5173). Nach der ersten Installation läuft die App ohne Internetzugang. `npm run build` erstellt die statische Anwendung in `dist/`; `npm run preview` zeigt diesen Build lokal an. Eine direkte Öffnung von `index.html` als Datei ist nicht der vorgesehene Startweg.

Unter Windows geht es auch per Doppelklick auf **Start-PlankPlan.cmd**. Das startet den lokalen Entwicklungsserver und öffnet den Browser. Das Terminalfenster während der Nutzung offen lassen; Strg+C beendet den Server.

## MVP benutzen

1. Etage auswählen oder eine weitere Etage anlegen.
2. PNG, JPG oder WebP als Grundriss laden (bis 8 MB).
3. Zwei Punkte einer bekannten Strecke anklicken, deren reale Länge in **mm** eintragen und den Maßstab übernehmen. Bereits gezeichnete Räume skalieren bei einer Neukalibrierung mit dem Bild.
4. Raum zeichnen: Eckpunkte anklicken, mit dem ersten Punkt oder dem Button schließen. Shift rastet auf 45°-Winkel; Backspace nimmt den letzten Punkt zurück; Escape bricht ab.
5. Raum auswählen, benennen oder die Eckpunkte ziehen. Räume dürfen konkav sein. Sich selbst kreuzende Konturen werden abgewiesen.
6. Dielenmaße und Bewegungsfuge einstellen. Vorlagen: Parador Selected Eiche Luxemburg **1285 × 194 × 8 mm**, Wunderwerk Eiche Malmö **1292 × 246 × 8 mm** (Maße aus der Vorgabe des Nutzers).
7. Richtung und Längs-Offset einstellen, Quer-Offset per Schieberegler ändern oder optimieren. Ganze Dielen und Zuschnitte sind farblich unterscheidbar. Beim Zeigen auf eine Diele werden Maße und Abfallfläche angezeigt.
8. JSON speichern; darin sind alle Etagen, Bilder, Kalibrierungen, Konturen und Verlegeeinstellungen enthalten. JSON laden stellt das vollständige Projekt wieder her. Änderungen werden außerdem im lokalen Browserspeicher gespeichert. Bei vollem Speicher bitte per JSON exportieren.

Ein neuer Start enthält ein L-förmiges Beispielwohnzimmer. Das Beispiel lässt sich löschen oder auf einer neuen Etage durch einen eigenen Grundriss ergänzen. Materialparameter gelten projektweit; Richtung und Offsets sind je Raum unabhängig.

## Architektur

```text
src/model/       Versioniertes Projektmodell mit floors[] und Materialvorlagen
src/geometry/    Polygonprüfung, Maßstab, Transformationen, innere Bewegungsfuge
src/flooring/    Dielenraster, echte Polygonzuschnitte, Reihen- und Materialauswertung
src/optimizer/   Quer-Offset-Suche; separater Worker für die Oberfläche
src/import/      Validierter Projektimport und zusätzlicher Raumimport
src/export/      Serialisierung und JSON-Dateidownload
src/ui/          SVG-Editor und Eingabefelder
```

Die Engine importiert keine React- oder DOM-Komponenten. Alle Raum- und Dielenkoordinaten sind Millimeter. Bildabmessungen und Kalibrierungs-Messpunkte sind explizit in Bildpixeln gespeichert. Zoom und Ansicht verändern keine Raumgeometrie.

Die Bewegungsfuge wird mit Clipper als innerer Miter-Offset berechnet (0,01-mm-Präzision). Polygon-Clipping schneidet jede Rasterposition mit dieser inneren Fläche; konkave Räume und getrennte Zuschnittfragmente bleiben erhalten. Dielen werden nicht bloß durch eine visuelle Maske versteckt. Fehler oder zu große Berechnungen werden angezeigt statt die Oberfläche zu blockieren.

Der Optimierer durchsucht periodische Quer-Offsets, zusätzliche Kandidaten aus Raumkanten und eine lokale Verfeinerung von 0,25 mm. Er gewichtet schmale Reihen und Teilbereiche stark, bevorzugt ähnliche Randbreiten und berücksichtigt die Abfallfläche. Er garantiert das beste Ergebnis **unter den geprüften Kandidaten**, kein globales mathematisches Optimum für beliebige Polygone. Richtung und Längs-Offset werden dabei beibehalten.

### Engine-Aufruf

```ts
import { layoutRoom } from './src/flooring/layout';
import { optimizeTransverse } from './src/optimizer/transverse';

const layout = layoutRoom(room, project.flooring);
const optimum = optimizeTransverse(room, project.flooring);
// optimum.offsetY in Millimetern; Ergebnis manuell veränderbar.
```

## Testen

```powershell
npm test
npm run build
npm run test:e2e
```

Vitest prüft Flächenerhaltung, fehlende Überlappungen, konkave Räume, Zuschnittfragmente, Rotation, Bewegungsfugen, ungültige Geometrie, periodische Offsets, Randreihenoptimierung und JSON-Roundtrips. Playwright prüft echte Browserabläufe einschließlich Bildimport, Kalibrierung, Zeichnen, Hintergrund-Worker, Etagen, Speicherung, Export/Import und mobilem Layout. Die Browserprüfung verwendet lokal installiertes Microsoft Edge. In einer Umgebung ohne Edge in `playwright.config.ts` den Kanal passend ändern oder einen Playwright-Browser installieren.

## Projekt-JSON

Version 1 hat zwingend die Struktur `floors[]`. Jede Etage besitzt `background`, `calibration` und `rooms`; die ersten beiden können `null` sein. `docs/example-project.json` ist ein vollständiges Beispiel.

Über „Räume aus JSON einfügen“ können zusätzliche Räume mit dieser Kurzform in die aktuelle Etage übernommen werden:

```json
{
  "rooms": [{
    "name": "Schlafzimmer",
    "polygon": [[0, 0], [4200, 0], [4200, 3600], [0, 3600]]
  }]
}
```

Alternativ sind Punkte als `{ "x": 0, "y": 0 }` möglich. IDs werden neu vergeben; Standardrichtung und Offsets sind 0.

## Bedeutung der Ergebnisse und nächste Schritte

- Erste/letzte Reihenbreite: Ausdehnung der geschnittenen Randreihe entlang der Achse quer zur Dielenrichtung. Bei schrägen Wänden kann die lokale Breite kleiner sein; die Kontur und die Hinweise müssen mitgeprüft werden.
- Materialmenge: eine neue Diele pro belegter Rasterposition. Getrennte Fragmente derselben Position gehören zu derselben Ausgangsdiele. Reststücke werden noch nicht anderweitig wiederverwendet.
- Verschnitt: Ausgangsmaterial minus tatsächlich verlegte Fläche. Sägeblattbreite, Packungsgrößen und Kaufreserve sind noch nicht enthalten.
- Kurze Endstücke und Stirnfugenversatz werden angezeigt bzw. geprüft, aber noch nicht automatisch durch eine Längs-Optimierung gelöst.
- Default-Bewegungsfuge und Mindestmaße sind editierbare Planungswerte, keine produktspezifisch verifizierten Herstellerregeln.

Geplante Erweiterungen: Reststück-Inventar mit Herkunft und nutzbaren Klickkanten, gemeinsame Quer-/Längs-Optimierung, Schnittplan, PDF-Grundrisse, Aussparungen, Bildtransformationen, durchgehende Verlegung über Türöffnungen, Packungs- und Reservemengen. Einzelne Eckpunkte verschieben, Duplizieren und Löschen sind bereits möglich; zusätzliche Eckpunkte in bestehende Konturen einfügen/entfernen folgt später.

Die vollständige übernommene Anforderung und die MVP-Abgrenzung stehen in `docs/SPECIFICATION.md`.
