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
3. Zwei Punkte einer bekannten Strecke anklicken, deren reale Länge in **mm** eintragen und den Maßstab übernehmen. Kalibriert wird standardmäßig nur das Bild: vorhandene Raumkoordinaten und reale Maße bleiben erhalten, auch beim Ersetzen des Hintergrunds. Nur die ausdrückliche Option „Raumkonturen ebenfalls skalieren“ verändert alle Raumkonturen der Etage. Diese Option dient zuvor im falschen Bildmaßstab nachgezeichneten Räumen.
4. Raum zeichnen: Eckpunkte anklicken, mit dem ersten Punkt oder dem Button schließen. Shift rastet auf 45°-Winkel; Backspace nimmt den letzten Punkt zurück; Escape bricht ab.
5. Raum auswählen, benennen oder die Eckpunkte ziehen. Das Plus an jeder Kante fügt einen weiteren Eckpunkt ein; es lässt sich auch direkt an die gewünschte Position ziehen. Mit Tab und Enter/Leertaste können Punkte ebenfalls eingefügt werden. Beim Ziehen richtet Shift die nächstliegende Nachbarkante exakt waagerecht oder senkrecht aus; Drücken und Loslassen wirkt auch ohne weitere Mausbewegung. Die Ausrichtung wird blau angezeigt und hat Vorrang vor dem Einrasten an anderen Räumen. Einen Punkt anklicken und über „Punkt löschen“ oder Entf entfernen; mindestens drei Punkte bleiben erhalten. Räume dürfen konkav sein. Sich selbst kreuzende Konturen werden abgewiesen. Mit „Raum verschieben“ kann ein vollständiger Raum versetzt werden. Bei eingeschaltetem Einrasten verbinden sich nahe Ecken oder Wände exakt, ohne Raumgrößen zu verändern. Das Einrasten gilt auch beim Zeichnen und Eckpunkte-Ziehen.
6. Dielenmaße und Bewegungsfuge einstellen. Vorlagen: Parador Selected Eiche Luxemburg **1285 × 194 × 8 mm**, Wunderwerk Eiche Malmö **1292 × 246 × 8 mm** (Maße aus der Vorgabe des Nutzers).
7. Richtung wählen. Standardmäßig werden Randreihen und Startstücke automatisch geplant. Die App verhindert Teilstücke unter der eingestellten Mindestlänge und prüft den tatsächlichen Fugenversatz benachbarter Reihen. Start- und Endstücke jeder Reihe stehen unter „Reihen im Detail“, einschließlich der Herkunft wiederverwendeter Startstücke. Falls keine gültige Kombination gefunden wird, werden keine ungültigen Dielen und keine irreführenden Paketmengen ausgegeben. Wiederverwendete Reststücke sind grün hervorgehoben; beim Zeigen auf eine Diele erscheinen Maße und Ausgangsdiele. Für gezielte Rasterexperimente gibt es einen getrennten Expertenmodus.
8. JSON speichern; darin sind alle Etagen, Bilder, Kalibrierungen, Konturen und Verlegeeinstellungen enthalten. JSON laden stellt das vollständige Projekt wieder her. Änderungen werden außerdem im lokalen Browserspeicher gespeichert. Bei vollem Speicher bitte per JSON exportieren.

Ein neuer Start enthält ein L-förmiges Beispielwohnzimmer. Das Beispiel lässt sich löschen oder auf einer neuen Etage durch einen eigenen Grundriss ergänzen. Materialparameter gelten projektweit; Richtung und Offsets sind je Raum unabhängig.

Unter „Erste Reihe“ lässt sich volle Dielenbreite wählen oder eine eigene Breite festlegen. Die erste Breite bleibt dann fest; die Längsplanung folgt dem ausgewählten Verlegemuster und der Startdielenvorgabe. Die letzte Reihe nimmt die verbleibende Breite auf; unterschreitet sie die Mindestbreite, erscheint ein Hinweis. „Breite automatisch planen“ stellt die automatische Randreihenoptimierung wieder her. Die Breite wird ab der inneren Raumkante nach Abzug der Bewegungsfuge gemessen; bei schrägen Wänden oder Nischen bleiben lokale Konturzuschnitte notwendig.

„Eigener fester Versatz“ unter „Verlegemuster“ erlaubt einen exakten Wert in Millimetern je Reihe. „Mit ganzer Startdiele beginnen“ fixiert unabhängig davon die erste Startdiele auf volle Länge; ihre Breite wird weiterhin über „Erste Reihe“ bestimmt. Beispiel: 400 mm Versatz und 1285 mm Startdiele ergeben an einer geraden Wand Startlängen von 1285, 400, 800, 1200, 315 mm usw. Das Muster läuft nach einer Dielenlänge weiter. Beide Vorgaben werden im JSON gespeichert und bei der Paketoptimierung erhalten. Die volle Startlänge kann auch beim freien Versatz, Halb- oder Drittelversatz aktiviert werden. Kollidieren die Vorgaben mit Mindeststücklänge, Fugenabstand oder einem nötigen schrägen Zuschnitt an der Startwand, erscheint ein Konflikt; die App kürzt die Startdiele oder verändert den Versatz nicht stillschweigend.

Der Button „Festen Versatz mit ganzer Startdiele einstellen“ sucht automatisch einen passenden konstanten Versatz, ohne dass ein Wert geraten werden muss. Die Suche läuft im Hintergrund, prüft zuerst den bisherigen Wert, danach Halb-, Drittel- und Viertelversatz sowie weitere begrenzte Kandidaten. Der erste zulässige Treffer wird übernommen; es wird kein globales Optimum versprochen. Eine während der Suche geänderte Planung wird nicht überschrieben. Die verbindlichen Mindestlängen und Fugenabstände bleiben bestehen. Scheitert schon die erste Reihe, zeigt der Hinweis das konkrete Start-/Endstück mit tatsächlicher Länge und Mindestlänge oder den notwendigen Zuschnitt an der Startwand. Ein anderer Versatz späterer Reihen kann diese erste Reihe bei festgehaltener ganzer Startdiele nicht ändern. Auch bei Konflikten in späteren Reihen wird die betroffene Reihe und Stücklänge bzw. der tatsächliche Fugenabstand angezeigt.

Unter dem Raumnamen kann „Laminat in diesem Raum verlegen“ ausgeschaltet werden, beispielsweise für Bad oder Küche. Solche Räume behalten ihre Geometrie, bleiben auswählbar und können an andere Räume einrasten; sie benötigen keine Dielen oder Pakete.

„Raummaße eingeben“ erlaubt direkte Eingaben von Breite und Tiefe in Millimetern. Gemeint sind die Außenmaße entlang der horizontalen/vertikalen Planachsen; die Kontur wird proportional angepasst, mit festem Ursprung oben links. Unter „Eckpunkte & Wandlängen“ können einzelne X-/Y-Koordinaten geändert und alle Wandlängen kontrolliert werden. Ungültige Änderungen werden abgewiesen. Auch ausgeschlossene Räume bleiben so editierbar. Über „Bildposition im Plan“ lässt sich das Hintergrundbild unabhängig von den Räumen verschieben.

„Rückgängig“ und „Wiederholen“ halten bis zu 30 Änderungen während der laufenden Sitzung vor. Vor Bildimport/-ersatz, Kalibrierung, Hintergrundentfernung und Projektimport wird zusätzlich eine vollständige Sicherung inklusive Bildern in IndexedDB gespeichert. Die jeweils letzte Sicherung übersteht ein Neuladen und lässt sich oben unter „Sicherung“ als JSON herunterladen oder wiederherstellen. Auch die Wiederherstellung kann rückgängig gemacht werden. Der erste Start mit dieser Funktion sichert den dann vorhandenen Stand; frühere Änderungen lassen sich damit nicht nachträglich rekonstruieren. Sicherungen und Autospeicherung gelten für die jeweilige Browseradresse einschließlich Port.

Die Paketanzeige berechnet die benötigten Ausgangsdielen einschließlich realer Zuschnitte, addiert die gewählte Zusatzreserve und rundet auf vollständige Pakete auf. Für Parador Eiche Luxemburg sind 10 Dielen pro Paket voreingestellt, entsprechend den [Produktdaten von Raumtrend Hinze](https://www.raumtrend-hinze.de/laminat/parador-selected-laminat-eiche-luxemburg-1747215). Bei Wunderwerk oder eigenen Formaten bitte den Paketinhalt selbst eintragen. Der Paketinhalt ist editierbar; bei alten Luxemburg-Projekten wird die bekannte Vorlage beim Laden ergänzt.

Die Planung berücksichtigt wiederverwendbare, gerade Abschnitte in voller Dielenbreite im gemeinsamen Bestand über alle Räume und Etagen. Ein Endabschnitt behält die rechte werksseitige Stirnkante für einen späteren Reihenanfang; der linke Abschnitt einer verkürzten Anfangsdiele kann als Endstück dienen. Reststücke werden nicht gedreht, um unpassende Klickkanten zu ersetzen. In der automatischen Planung bleiben Fugenversatz und Mindestlänge harte Regeln: Ein Rest muss unter Umständen gekürzt oder für eine spätere Reihe aufbewahrt werden. Pro Querschnitt werden standardmäßig 3 mm Sägeblattverlust abgezogen, editierbar über „Sägeblattbreite / Schnittverlust“. Schrägschnitte, Längsstreifen und fehlende Klickkanten sind konservativ von der Wiederverwendung ausgeschlossen. Im manuellen Expertenmodus bleibt das vorgegebene Raster erhalten; passende Reststücke können auch dort zugeordnet werden.

„Pakete optimieren“ sucht eine günstige Verlegereihenfolge und passt Startstücke der automatischen Räume an den bereits vorhandenen Bestand an. Die Paketanzahl wird für das gesamte Projekt einmal aufgerundet, inklusive einmaliger gemeinsamer Reserve. Ausgeschlossene Räume benötigen kein Material. Die Anzeige vergleicht den Bedarf mit gemeinsamem Einkauf ohne Reststücktausch und mit je Raum einzeln gerundeten Paketen. Herkunftsraum, Etage und Art des ursprünglichen Zuschnitts erscheinen bei den grünen Dielen und für Anfangs-/Endstücke in der Reihentabelle. Die empfohlene Raumreihenfolge muss eingehalten werden, damit benötigte Reststücke bereits vorhanden sind.

Bis fünf Räume werden alle Raumreihenfolgen mit bestehenden Zuschnitten geprüft, bei größeren Projekten höchstens 128 reproduzierbare Reihenfolgen. Bis zu vier günstige Reihenfolgen werden mit einer materialabhängigen Startstücksuche nachgeplant, mit einem Zeitlimit zwischen Räumen. Das Ergebnis ist die beste gefundene Lösung und kein garantierter globaler Optimalwert. Die Suche läuft in einem Hintergrund-Worker und kann abgebrochen werden. Verlegerichtungen und manuelle erste Reihenbreiten bleiben erhalten. Reihenfolge und Suchmodus werden mit einer kanonischen Signatur der Planungsdaten im JSON gespeichert; der Plan und seine Materialzuordnungen werden beim Laden reproduziert. Änderungen an Geometrie oder Regeln erfordern eine erneute Optimierung; umbenannte Räume behalten die Materialplanung.

## Architektur

Unter „Verlegemuster“ gibt es zusätzlich zum freien, materialsparenden Versatz einen regelmäßigen Halbversatz (Wiederholung alle zwei Reihen) und Drittelversatz (alle drei Reihen). Die Automatik sucht eine gemeinsame Startposition und erhält den exakten Versatz von einer halben bzw. einem Drittel der Dielenlänge über sämtliche Reihen, auch bei der projektweiten Paketoptimierung. Mindeststücklänge, tatsächlicher Fugenabstand und erste Reihenbreite bleiben verbindlich. Gibt es unter diesen Regeln keine geprüfte zulässige Lösung, wird ein Hinweis angezeigt und kein unregelmäßiges Ersatzmuster eingesetzt. Das gewählte Muster wird im JSON gespeichert; alte Projekte ohne Muster behalten den freien Versatz. Regelmäßige Muster können mehr Ausgangsdielen erfordern.

„Zuschnitte farbig markieren“ unter dem Plan kann ausgeschaltet werden, um das Fugenbild mit einheitlicher Dielenfarbe zu beurteilen. Braun und Grün sind Planungshilfen für Zuschnitte und wiederverwendete Reststücke, keine tatsächlichen Farbunterschiede des Laminats. Diese Ansicht verändert weder Geometrie noch Materialbedarf.

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
import { planProject, optimizeProject } from './src/optimizer/project';

const layout = layoutRoom(room, project.flooring); // automatisch, wenn mode fehlt
const optimum = optimizeTransverse(room, project.flooring);
// optimum.offsetY in Millimetern; Ergebnis manuell veränderbar.
const shared = planProject(project); // Gemeinsames Inventar und Paketbedarf.
const best = optimizeProject(project); // Reihenfolgen und Startstücke vergleichen.
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

Geplante Erweiterungen: modellierte Wiederverwendung von Schräg-/Längszuschnitten, gemeinsame Suche über Verlegerichtungen, exportierbarer Schnittplan, PDF-Grundrisse, Aussparungen, Bildtransformationen und durchgehende Verlegung über Türöffnungen. Das Einrasten verbindet Raumkoordinaten; es legt noch kein gemeinsames Dielenraster über mehrere Räume an. Eckpunkte lassen sich einfügen, verschieben, ausrichten und entfernen.

Die vollständige übernommene Anforderung und die MVP-Abgrenzung stehen in `docs/SPECIFICATION.md`.
