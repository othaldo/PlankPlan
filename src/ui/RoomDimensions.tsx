import { useState } from 'react';
import type { Point, Room } from '../model/types';
import { bounds } from '../geometry/polygon';
import { changeCorner, changeWallLength, isRectangle, makeRectangle, resizeRoom } from '../geometry/dimensions';
import { NumberField } from './NumberField';
import { HelpInfo } from './HelpInfo';

export function RoomDimensions({ room, onChange, onError }:
  { room: Room; onChange: (polygon: Point[]) => void; onError: (message: string) => void }) {
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
