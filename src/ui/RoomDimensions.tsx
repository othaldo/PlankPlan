import { useState } from 'react';
import type { Point, Room } from '../model/types';
import { bounds } from '../geometry/polygon';
import { changeCorner, changeWallLength, isRectangle, makeRectangle, positionRoom, resizeRoom } from '../geometry/dimensions';
import { NumberField } from './NumberField';
import { HelpInfo } from './HelpInfo';

export function RoomDimensions({ room, rooms, onChange, onError }:
  { room: Room; rooms: Room[]; onChange: (polygon: Point[]) => void; onError: (message: string) => void }) {
  const [corner, setCorner] = useState(0);
  const index = Math.min(corner, room.polygon.length - 1), point = room.polygon[index], b = bounds(room.polygon);
  const width = b.maxX - b.minX, depth = b.maxY - b.minY;
  function apply(fn: () => Point[]) {
    try { onChange(fn()); return true; } catch (e) { onError((e as Error).message); return false; }
  }
  const rounded = (n: number) => Math.round(n * 1000) / 1000;
  return <div className="room-dimensions"><strong>Raummaße eingeben</strong><HelpInfo label="Raummaße">Breite und Tiefe skalieren die Kontur, ohne schräge Wände zu begradigen. Bei vier Ecken richtet „Wände rechtwinklig ausrichten“ den Raum als exaktes Rechteck mit diesen Maßen aus. Die obere linke Begrenzung bleibt an ihrem Platz.</HelpInfo>
    <div className="field-pair"><NumberField label="Breite des Raums" value={rounded(width)} min={1} step={.1}
      onChange={n => apply(() => resizeRoom(room.polygon, n, depth))} />
      <NumberField label="Tiefe des Raums" value={rounded(depth)} min={1} step={.1}
        onChange={n => apply(() => resizeRoom(room.polygon, width, n))} /></div>
    {room.polygon.length===4 && <div className="rectangle-actions">
      {!isRectangle(room.polygon) && <small className="warning-text">Wände sind nicht waagerecht/senkrecht.</small>}
      <button className="secondary full" onClick={()=>apply(()=>makeRectangle(room.polygon,width,depth))}>Wände rechtwinklig ausrichten</button>
    </div>}
    <div className="help-row"><strong>Raumposition</strong><HelpInfo label="Raumposition">Außenbegrenzung des Raums in Millimetern: links/rechts sind X-Koordinaten, oben/unten Y-Koordinaten. X wächst nach rechts, Y nach unten. Eine Eingabe verschiebt den ganzen Raum und erhält Form und Größe. Bei schrägen Wänden gilt jeweils der äußerste Punkt. Alle Räume derselben Etage verwenden denselben Ursprung.</HelpInfo></div>
    <div className="field-pair"><NumberField label="Oben (Y)" value={rounded(b.minY)} min={-1e6} step={.1} onChange={n=>apply(()=>positionRoom(room.polygon,'top',n))} />
      <NumberField label="Unten (Y)" value={rounded(b.maxY)} min={-1e6} step={.1} onChange={n=>apply(()=>positionRoom(room.polygon,'bottom',n))} /></div>
    <div className="field-pair"><NumberField label="Links (X)" value={rounded(b.minX)} min={-1e6} step={.1} onChange={n=>apply(()=>positionRoom(room.polygon,'left',n))} />
      <NumberField label="Rechts (X)" value={rounded(b.maxX)} min={-1e6} step={.1} onChange={n=>apply(()=>positionRoom(room.polygon,'right',n))} /></div>
    {rooms.length>1 && <details className="row-details"><summary>Raumpositionen vergleichen</summary>
      <table data-testid="room-positions"><thead><tr><th>Raum</th><th>Oben Y</th><th>Unten Y</th><th>Links X</th><th>Rechts X</th></tr></thead>
        <tbody>{rooms.map(r=>{const outer=bounds(r.polygon);return <tr key={r.id}><td>{r.name}</td>{[outer.minY,outer.maxY,outer.minX,outer.maxX].map((n,i)=><td key={i}>{rounded(n).toLocaleString('de-DE',{maximumFractionDigits:3})}</td>)}</tr>;})}</tbody></table>
    </details>}
    <details><summary>Eckpunkte & Wandlängen</summary>
      <label className="field"><span>Eckpunkt auswählen</span><select aria-label="Eckpunkt auswählen" value={index} onChange={e => setCorner(Number(e.target.value))}>
        {room.polygon.map((_, i) => <option key={i} value={i}>Punkt {i + 1}</option>)}</select></label>
      <div className="field-pair"><NumberField label="Eckpunkt X" value={rounded(point.x)} min={-1e6} step={.1}
        onChange={x => apply(() => changeCorner(room.polygon, index, { ...point, x }))} />
        <NumberField label="Eckpunkt Y" value={rounded(point.y)} min={-1e6} step={.1}
          onChange={y => apply(() => changeCorner(room.polygon, index, { ...point, y }))} /></div>
      <div className="help-row"><HelpInfo label="Eckpunktkoordinaten">X läuft nach rechts, Y nach unten. Ursprung: X = 0 / Y = 0.</HelpInfo></div>
      <ol className="wall-lengths">{room.polygon.map((p, i) => { const q = room.polygon[(i + 1) % room.polygon.length];
        return <li key={i}><NumberField label={`Wand ${i + 1}`} value={rounded(Math.hypot(p.x-q.x,p.y-q.y))} min={1} step={.1}
          onChange={n=>apply(()=>changeWallLength(room.polygon,i,n))} /></li>;
      })}</ol>
    </details>
  </div>;
}
