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
5. Raum auswählen, benennen oder die Eckpunkte ziehen. Das Plus an jeder Kante fügt einen weiteren Eckpunkt ein; es lässt sich auch direkt an die gewünschte Position ziehen. Mit Tab und Enter/Leertaste können Punkte ebenfalls eingefügt werden. Beim Ziehen richtet Shift die nächstliegende Nachbarkante exakt waagerecht oder senkrecht aus; Drücken und Loslassen wirkt auch ohne weitere Mausbewegung. Die Ausrichtung wird blau angezeigt und hat Vorrang vor dem Einrasten an anderen Räumen. Einen Punkt anklicken und über „Punkt löschen“ oder Entf entfernen; mindestens drei Punkte bleiben erhalten. Räume dürfen konkav sein. Sich selbst kreuzende Konturen werden abgewiesen. Mit „Raum verschieben“ kann ein vollständiger Raum versetzt werden. Bei eingeschaltetem Einrasten verbinden sich nahe Ecken oder Wände exakt, ohne Raumgrößen zu verändern. Das Einrasten gilt auch beim Zeichnen und Eckpunkte-Ziehen.
6. Dielenmaße und Bewegungsfuge einstellen. Vorlagen: Parador Selected Eiche Luxemburg **1285 × 194 × 8 mm**, Wunderwerk Eiche Malmö **1292 × 246 × 8 mm** (Maße aus der Vorgabe des Nutzers).
7. Richtung wählen. Standardmäßig werden Randreihen und Startstücke automatisch geplant. Die App verhindert Teilstücke unter der eingestellten Mindestlänge und prüft den tatsächlichen Fugenversatz benachbarter Reihen. Start- und Endstücke jeder Reihe stehen unter „Reihen im Detail“, einschließlich der Herkunft wiederverwendeter Startstücke. Falls keine gültige Kombination gefunden wird, werden keine ungültigen Dielen und keine irreführenden Paketmengen ausgegeben. Wiederverwendete Reststücke sind grün hervorgehoben; beim Zeigen auf eine Diele erscheinen Maße und Ausgangsdiele. Für gezielte Rasterexperimente gibt es einen getrennten Expertenmodus.
8. JSON speichern; darin sind alle Etagen, Bilder, Kalibrierungen, Konturen und Verlegeeinstellungen enthalten. JSON laden stellt das vollständige Projekt wieder her. Änderungen werden außerdem im lokalen Browserspeicher gespeichert. Bei vollem Speicher bitte per JSON exportieren.

Ein neuer Start enthält ein L-förmiges Beispielwohnzimmer. Das Beispiel lässt sich löschen oder auf einer neuen Etage durch einen eigenen Grundriss ergänzen. Materialparameter gelten projektweit; Richtung und Offsets sind je Raum unabhängig.

Unter dem Raumnamen kann „Laminat in diesem Raum verlegen“ ausgeschaltet werden, beispielsweise für Bad oder Küche. Solche Räume behalten ihre Geometrie, bleiben auswählbar und können an andere Räume einrasten; sie benötigen keine Dielen oder Pakete.

Die Paketanzeige berechnet die benötigten Ausgangsdielen einschließlich realer Zuschnitte, addiert die gewählte Zusatzreserve und rundet auf vollständige Pakete auf. Für Parador Eiche Luxemburg sind 10 Dielen pro Paket voreingestellt, entsprechend den [Produktdaten von Raumtrend Hinze](https://www.raumtrend-hinze.de/laminat/parador-selected-laminat-eiche-luxemburg-1747215). Bei Wunderwerk oder eigenen Formaten bitte den Paketinhalt selbst eintragen. Der Paketinhalt ist editierbar; bei alten Luxemburg-Projekten wird die bekannte Vorlage beim Laden ergänzt.

Die automatische Planung berücksichtigt nun wiederverwendbare, gerade Abschnitte in voller Dielenbreite innerhalb desselben Raums. Ein Endabschnitt behält die rechte werksseitige Stirnkante für einen späteren Reihenanfang; der linke Abschnitt einer verkürzten Anfangsdiele kann als Endstück dienen. Fugenversatz und Mindestlänge bleiben harte Regeln: Ein Rest muss unter Umständen gekürzt oder für eine spätere Reihe aufbewahrt werden. Pro Querschnitt werden standardmäßig 3 mm Sägeblattverlust abgezogen, editierbar über „Sägeblattbreite / Schnittverlust“. Schrägschnitte, Längsstreifen und fehlende Klickkanten sind konservativ von der Wiederverwendung ausgeschlossen. Im manuellen Expertenmodus ist die Wiederverwendung ausgeschaltet.

## Architektur

```text
src/model/       Versioniertes Projektmodell mit floors[] und Materialvorlagen
src/geometry/    Polygonprüfung, Maßstab, Transformationen, innere Bewegungsfuge
src/flooring/    Dielenraster, echte Polygonzuschnitte, Reihen- und Materialauswertung
src/optimizer/   Randreihen-Suche und automatische Startstücke mit Fugenprüfung
src/import/      Validierter Projektimport und zusätzlicher Raumimport
src/export/      Serialisierung und JSON-Dateidownload
src/ui/          SVG-Editor und Eingabefelder
```

Die Engine importiert keine React- oder DOM-Komponenten. Alle Raum- und Dielenkoordinaten sind Millimeter. Bildabmessungen und Kalibrierungs-Messpunkte sind explizit in Bildpixeln gespeichert. Zoom und Ansicht verändern keine Raumgeometrie.

Die Bewegungsfuge wird mit Clipper als innerer Miter-Offset berechnet (0,01-mm-Präzision). Polygon-Clipping schneidet jede Rasterposition mit dieser inneren Fläche; konkave Räume und getrennte Zuschnittfragmente bleiben erhalten. Dielen werden nicht bloß durch eine visuelle Maske versteckt. Fehler oder zu große Berechnungen werden angezeigt statt die Oberfläche zu blockieren.

Die Planung optimiert zunächst die Randreihen durch eine periodische Quer-Offset-Suche. Danach sucht sie zulässige Startstücke pro Reihe anhand der tatsächlichen Zuschnittpolygone. Ein verkürztes Startstück verhindert einen zu kurzen Rest am anderen Ende; ganze Mitteldielen bleiben erhalten. Getrennte Zuschnittfragmente werden einzeln auf die Mindestlänge geprüft. Eine Beam-Suche mit bis zu 32 fortgeführten Zuständen pro Reihe berücksichtigt alternative Startstücke, einen Reststückbestand pro Kandidat und den Mindestabstand realer Fugen zur Nachbarreihe. Weniger neue Ausgangsdielen werden bevorzugt; reststückgerechte Startlängen kommen als zusätzliche Kandidaten hinzu. Die Richtung wird beibehalten. Standardmäßig gelten 300 mm Mindeststücklänge und 300 mm Mindest-Fugenabstand; die Regeln sind konfigurierbar.

Der [Parador-Laminatratgeber 2024, Seite 16](https://www.hirsch-don.de/images/HerstellerDownloads/Documents/Ratgeber/Downloads-Parador-Laminat/ratgeber_laminat_2024_de.pdf) beschreibt Endabschnitte als Startstücke der nächsten Reihe und nennt für Dielenformat mindestens 400 mm Querfugenversatz. Diesen Wert bitte für Parador in den Verlegeregeln einstellen; die bestehenden Projekteinstellungen bleiben erhalten. Die 300-mm-Mindeststücklänge folgt der strengeren Vorgabe des Nutzers.

Die Suche ist endlich und garantiert kein globales mathematisches Optimum für beliebige Polygone. „Keine zulässige Verlegung gefunden“ bedeutet, dass die geprüften Kandidaten keine gültige Lösung lieferten; es ist kein mathematischer Unmöglichkeitsbeweis. Es werden in diesem Fall keine kurzen Stücke als Baulösung ausgegeben. Bei schrägen Wänden bedeutet Stücklänge die Ausdehnung jedes einzelnen Zuschnittfragments entlang der Dielenrichtung.

### Engine-Aufruf

```ts
import { layoutRoom } from './src/flooring/layout';
import { optimizeTransverse } from './src/optimizer/transverse';

const layout = layoutRoom(room, project.flooring); // automatisch, wenn mode fehlt
const optimum = optimizeTransverse(room, project.flooring);
// optimum.offsetY in Millimetern; Ergebnis manuell veränderbar.
```

## Testen

```powershell
npm test
npm run build
npm run test:e2e
```

Vitest prüft Flächenerhaltung, fehlende Überlappungen, konkave Räume, Zuschnittfragmente, Rotation, Bewegungsfugen, ungültige Geometrie, periodische Offsets, automatische Startstücke, harte Mindeststücklängen, echte Fugenabstände, Reststück-Herkunft, Klickkanten, Sägeblattverlust, fehlende Doppelverwendung, Paket-Aufrundung, Raum-Snapping und JSON-Roundtrips. Playwright prüft echte Browserabläufe einschließlich Bildimport, Kalibrierung, Zeichnen, automatischer Planung, Wiederverwendung, Paketanzeige aus tatsächlich neuen Dielen, ausgeschaltetem Laminat, dem Verschieben und Einrasten ganzer Räume, Etagen, Speicherung, Export/Import und mobilem Layout. Lokal nutzt die Browserprüfung installiertes Microsoft Edge, in GitHub Actions Chromium.

## Projekt-JSON

Version 1 hat zwingend die Struktur `floors[]`. Jede Etage besitzt `background`, `calibration` und `rooms`; die ersten beiden können `null` sein. `docs/example-project.json` ist ein vollständiges Beispiel.

Über „Räume aus JSON einfügen“ können zusätzliche Räume mit dieser Kurzform in die aktuelle Etage übernommen werden:

```json
{
  "rooms": [{
    "name": "Schlafzimmer",
    "flooringEnabled": true,
    "polygon": [[0, 0], [4200, 0], [4200, 3600], [0, 3600]]
  }]
}
```

Alternativ sind Punkte als `{ "x": 0, "y": 0 }` möglich. IDs werden neu vergeben; Standardrichtung und Offsets sind 0.

`flooringEnabled: false` definiert einen Raum ohne Laminat. `layout.mode` kann `automatic` oder `manual` sein; ohne Angabe gilt automatisch. `flooring.boardsPerPack`, `reservePercent`, `minJointOffset` und `sawKerf` speichern Paketinhalt, Zusatzreserve, Mindest-Fugenabstand und Sägeblattverlust. Alte Projektdateien bleiben ladbar. Die Materialzuordnung und Reststücke werden aus den gespeicherten Planungsdaten deterministisch neu berechnet.

## Bedeutung der Ergebnisse und nächste Schritte

- Erste/letzte Reihenbreite: Ausdehnung der geschnittenen Randreihe entlang der Achse quer zur Dielenrichtung. Bei schrägen Wänden kann die lokale Breite kleiner sein; die Kontur und die Hinweise müssen mitgeprüft werden.
- Materialmenge: zählt tatsächlich neu benötigte Ausgangsdielen; wiederverwendete Reststücke benötigen keine zusätzliche Diele. Ganze Dielen plus Zuschnittpositionen zählen die Verlegung und dürfen nicht mit der Anzahl neuer Ausgangsdielen verwechselt werden.
- Restmaterial und Schnittverlust: Ausgangsmaterial minus tatsächlich verlegte Fläche. Nutzbare verbleibende Reststücke werden zusätzlich ausgewiesen und sind Teil dieser Restfläche. Die separate Paketanzeige enthält Paket-Aufrundung und Zusatzreserve; diese Werte werden nicht als Schnittabfall gezählt. Sägeblattbreite wird bei modellierten Querschnitten berücksichtigt; schräge Schnitte und Längsschnitte bleiben konservativ in der Restfläche enthalten.
- Mindeststücklänge und Stirnfugenversatz werden bei automatischer Planung als harte Regeln behandelt. Wenn keine gültige Lösung gefunden wird, bleibt die Dielenplanung leer und der Grund wird angezeigt.
- Default-Bewegungsfuge und Mindestmaße sind editierbare Planungswerte, keine produktspezifisch verifizierten Herstellerregeln.

Geplante Erweiterungen: raumübergreifendes Reststück-Inventar, modellierte Wiederverwendung von Schräg-/Längszuschnitten, gemeinsame Suche über Verlegerichtungen, exportierbarer Schnittplan, PDF-Grundrisse, Aussparungen, Bildtransformationen und durchgehende Verlegung über Türöffnungen. Das Einrasten verbindet Raumkoordinaten; es legt noch kein gemeinsames Dielenraster über mehrere Räume an. Einzelne Eckpunkte verschieben, Duplizieren, Löschen und vollständige Räume versetzen sind möglich; zusätzliche Eckpunkte in bestehende Konturen einfügen/entfernen folgt später.

Die vollständige übernommene Anforderung und die MVP-Abgrenzung stehen in `docs/SPECIFICATION.md`.
