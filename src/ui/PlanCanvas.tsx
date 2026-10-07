import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { MultiPolygon } from 'polygon-clipping';
import { bounds, validatePolygon } from '../geometry/polygon';
import type { Layout } from '../flooring/layout';
import type { Floor, Point, Room } from '../model/types';
import { Maximize, Minus, Plus } from 'lucide-react';
import { snapRoomTranslation, snapToRooms } from '../geometry/snapping';

export type Tool = 'select' | 'draw' | 'calibrate' | 'pan' | 'move-room';
export function pathData(polygons: MultiPolygon) {
  return polygons.map(poly => poly.map(ring => `M ${ring.map(p => p.join(' ')).join(' L ')} Z`).join(' ')).join(' ');
}
const pointsString = (points: Point[]) => points.map(p => `${p.x},${p.y}`).join(' ');
export function PlanCanvas({ floor, selectedId, layouts, tool, draft, setDraft, calibrationPoints, setCalibrationPoints,
  onSelect, onRoom, onPolygon, onError, snap, snapRooms, showBoards }:
  { floor: Floor; selectedId: string | null; layouts: Map<string, Layout>; tool: Tool;
    draft: Point[]; setDraft: (p: Point[]) => void; calibrationPoints: Point[]; setCalibrationPoints: (p: Point[]) => void;
    onSelect: (id: string) => void; onRoom: (polygon: Point[]) => void; onPolygon: (id: string, polygon: Point[]) => void;
    onError: (message: string) => void; snap: number; snapRooms: boolean; showBoards: boolean }) {
  const svg = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ x: -450, y: -450, w: 7000, h: 5700 });
  const [cursor, setCursor] = useState<Point | null>(null);
  const drag = useRef<{ kind: 'vertex' | 'pan' | 'room'; id?: string; index?: number; point: Point; initial?: Point[]; view?: typeof view; current?: Point[] } | null>(null);
  const [preview, setPreview] = useState<{ id: string; polygon: Point[] } | null>(null);
  const [snapTarget, setSnapTarget] = useState<Point | null>(null);
  const scale = floor.calibration?.mmPerPixel ?? 5;
  function fit() {
    const points = floor.rooms.flatMap(r => r.polygon);
    if (floor.background) {
      const bg = floor.background; points.push(bg.origin, { x: bg.origin.x + bg.widthPx * scale, y: bg.origin.y + bg.heightPx * scale });
    }
    if (!points.length) { setView({ x: -450, y: -450, w: 7000, h: 5700 }); return; }
    const b = bounds(points), w = Math.max(500, b.maxX - b.minX), h = Math.max(500, b.maxY - b.minY);
    setView({ x: b.minX - w * 0.1, y: b.minY - h * 0.1, w: w * 1.2, h: h * 1.2 });
  }
  useEffect(() => { fit(); setPreview(null); }, [floor.id, floor.background?.dataUrl, scale]); // View changes never alter geometry.
  function coordinate(clientX: number, clientY: number): Point {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const p = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse()); return { x: p.x, y: p.y };
  }
  function tolerance() { const m = svg.current?.getScreenCTM(); return m ? 10 / Math.hypot(m.a, m.b) : view.w / 80; }
  function snapped(p: Point, shift: boolean, excludeId?: string): Point {
    let result = { x: Math.round(p.x / snap) * snap, y: Math.round(p.y / snap) * snap };
    if (shift && draft.length) {
      const start = draft.at(-1)!; const length = Math.hypot(p.x - start.x, p.y - start.y);
      const angle = Math.round(Math.atan2(p.y - start.y, p.x - start.x) / (Math.PI / 4)) * Math.PI / 4;
      result = { x: start.x + length * Math.cos(angle), y: start.y + length * Math.sin(angle) };
    }
    const target = snapRooms && (tool === 'draw' || drag.current?.kind === 'vertex') ? snapToRooms(p, floor.rooms, tolerance(), excludeId) : null;
    setSnapTarget(target); return target ?? result;
  }
  function finish() { const error = validatePolygon(draft); if (error) onError(error); else onRoom(draft); }
  function click(e: ReactPointerEvent<SVGSVGElement>) {
    if (e.button !== 0 || drag.current) return;
    const p = coordinate(e.clientX, e.clientY);
    if (tool === 'draw') {
      const q = snapped(p, e.shiftKey);
      if (draft.length >= 3 && Math.hypot(q.x - draft[0].x, q.y - draft[0].y) < view.w / 70) finish();
      else if (!draft.length || Math.hypot(q.x - draft.at(-1)!.x, q.y - draft.at(-1)!.y) >= 1) setDraft([...draft, q]);
    }
    if (tool === 'calibrate' && floor.background && calibrationPoints.length < 2) {
      const bg = floor.background;
      if (p.x < bg.origin.x || p.y < bg.origin.y || p.x > bg.origin.x + bg.widthPx * scale || p.y > bg.origin.y + bg.heightPx * scale)
        onError('Bitte beide Messpunkte innerhalb des Grundrissbilds setzen.');
      else setCalibrationPoints([...calibrationPoints, p]);
    }
    if (tool === 'pan') { drag.current = { kind: 'pan', point: p, view }; e.currentTarget.setPointerCapture(e.pointerId); }
  }
  function move(e: ReactPointerEvent<SVGSVGElement>) {
    const p = coordinate(e.clientX, e.clientY); setCursor(snapped(p, e.shiftKey));
    const d = drag.current;
    if (d?.kind === 'pan' && d.view) {
      const m = svg.current?.getScreenCTM(); if (!m) return;
      // Keep the initial world anchor under the current pointer, independent of accumulated pan.
      setView(v => ({ ...v, x: v.x + d.point.x - p.x, y: v.y + d.point.y - p.y }));
    }
    if (d?.kind === 'vertex' && d.initial && d.id !== undefined && d.index !== undefined) {
      const polygon = d.initial.map((point, i) => i === d.index ? snapped(p, false, d.id) : point);
      d.current = polygon; setPreview({ id: d.id, polygon });
    }
    if (d?.kind === 'room' && d.initial && d.id) {
      const delta = { x: p.x - d.point.x, y: p.y - d.point.y };
      const moved = snapRoomTranslation(d.initial, delta, snapRooms ? floor.rooms : [], tolerance(), d.id);
      d.current = moved.polygon; setPreview({ id: d.id, polygon: moved.polygon }); setSnapTarget(moved.target);
    }
  }
  function release() {
    const d = drag.current;
    if ((d?.kind === 'vertex' || d?.kind === 'room') && d.id && d.current) {
      const error = validatePolygon(d.current); if (error) onError(error); else onPolygon(d.id, d.current);
    }
    drag.current = null; setPreview(null); setSnapTarget(null);
  }
  function roomPointer(e: ReactPointerEvent<SVGElement>, room: Room) {
    if (tool !== 'select' && tool !== 'move-room') return;
    e.stopPropagation(); onSelect(room.id);
    if (tool === 'move-room') {
      drag.current = { kind: 'room', id: room.id, point: coordinate(e.clientX, e.clientY), initial: room.polygon };
      svg.current?.setPointerCapture(e.pointerId);
    }
  }
  function zoom(factor: number, center = { x: view.x + view.w / 2, y: view.y + view.h / 2 }) {
    if (view.w * factor < 100 || view.w * factor > 2e6) return;
    setView({ x: center.x - (center.x - view.x) * factor, y: center.y - (center.y - view.y) * factor, w: view.w * factor, h: view.h * factor });
  }
  function roomPoints(room: Room) { return preview?.id === room.id ? preview.polygon : room.polygon; }
  const labelSize = view.w / 75, gridSize = view.w > 16000 ? 1000 : 500;
  return <div className={`plan-canvas tool-${tool}`}>
    <svg ref={svg} role="img" aria-label="Interaktiver Verlegeplan" viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      onPointerDown={click} onPointerMove={move} onPointerUp={release} onPointerCancel={() => { drag.current = null; setPreview(null); }}
      onWheel={e => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.12 : 0.88, coordinate(e.clientX, e.clientY)); }}>
      <defs><pattern id="grid" width={gridSize} height={gridSize} patternUnits="userSpaceOnUse"><path d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`} fill="none" stroke="#dce1da" strokeWidth="1" vectorEffect="non-scaling-stroke" /></pattern></defs>
      <rect x={view.x - view.w} y={view.y - view.h} width={view.w * 3} height={view.h * 3} fill="url(#grid)" />
      {floor.background && <image href={floor.background.dataUrl} x={floor.background.origin.x} y={floor.background.origin.y}
        width={floor.background.widthPx * scale} height={floor.background.heightPx * scale} opacity={floor.background.opacity} />}
      {floor.rooms.map(room => {
        const layout = layouts.get(room.id), selected = room.id === selectedId, points = roomPoints(room);
        const b = bounds(points);
        return <g key={room.id}>
          <polygon points={pointsString(points)} fill={room.flooringEnabled === false ? 'rgba(167,177,183,.22)' : layout?.feasible === false ? 'rgba(189,97,59,.12)' : 'rgba(233,238,226,.4)'} stroke="none"
            onPointerDown={e => roomPointer(e, room)} />
          {showBoards && !(preview?.id === room.id) && layout?.boards.map(board => <path key={board.id} d={pathData(board.polygon)} fillRule="evenodd"
            fill={board.cut ? (board.row % 2 ? '#d5ad76' : '#dfbc88') : (board.row % 2 ? '#eee0c5' : '#e6d3af')}
            stroke={board.cut ? '#a47940' : '#b6a082'} strokeWidth="0.7" vectorEffect="non-scaling-stroke"
            onPointerDown={e => roomPointer(e, room)}>
            <title>{`${room.name} · Reihe ${board.row + 1} · Diele ${board.column + 1}\n${board.cut ? 'Zuschnitt' : 'Ganze Diele'}: ${board.usedLength.toFixed(1)} × ${board.usedWidth.toFixed(1)} mm\nAusgangsdiele: ${board.source.length} × ${board.source.width} mm\nAbfallfläche: ${((board.source.length * board.source.width - board.area) / 1e6).toFixed(3)} m²`}</title>
          </path>)}
          <polygon points={pointsString(points)} fill="none" stroke={selected ? '#4b6546' : '#8b9588'} strokeDasharray={room.flooringEnabled === false ? '7 4' : undefined} strokeWidth={selected ? 2.5 : 1.5} vectorEffect="non-scaling-stroke" pointerEvents="none" />
          <text x={(b.minX + b.maxX) / 2} y={(b.minY + b.maxY) / 2} textAnchor="middle" fontSize={labelSize} className="room-label" pointerEvents="none">{room.name}</text>
          {room.flooringEnabled === false && <text x={(b.minX + b.maxX) / 2} y={(b.minY + b.maxY) / 2 + labelSize * 1.5} textAnchor="middle" fontSize={labelSize * .75} fill="#6a7780" pointerEvents="none">ohne Laminat</text>}
          {selected && tool === 'select' && points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={view.w / 330}
            fill="white" stroke="#4b6546" strokeWidth="2" vectorEffect="non-scaling-stroke" className="vertex"
            onPointerDown={e => { e.stopPropagation(); drag.current = { kind: 'vertex', id: room.id, index, point, initial: room.polygon };
              svg.current?.setPointerCapture(e.pointerId); }} />)}
        </g>;
      })}
      {draft.length > 0 && <g pointerEvents="none">
        <polyline points={pointsString(cursor ? [...draft, cursor] : draft)} fill="rgba(75,101,70,.08)" stroke="#4b6546" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {draft.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={view.w / 350} fill={i === 0 ? '#4b6546' : 'white'} stroke="#4b6546" vectorEffect="non-scaling-stroke" />)}
        {cursor && draft.at(-1) && <text x={(cursor.x + draft.at(-1)!.x) / 2} y={(cursor.y + draft.at(-1)!.y) / 2 - labelSize / 2}
          fontSize={labelSize * .75} textAnchor="middle" fill="#34532f">{Math.round(Math.hypot(cursor.x - draft.at(-1)!.x, cursor.y - draft.at(-1)!.y))} mm</text>}
      </g>}
      {calibrationPoints.length > 0 && <g pointerEvents="none">
        {calibrationPoints.length === 2 && <line x1={calibrationPoints[0].x} y1={calibrationPoints[0].y} x2={calibrationPoints[1].x} y2={calibrationPoints[1].y} stroke="#bd613b" strokeWidth="3" vectorEffect="non-scaling-stroke" />}
        {calibrationPoints.map((p, i) => <g key={i}><circle cx={p.x} cy={p.y} r={view.w / 250} fill="#bd613b" /><text x={p.x + labelSize} y={p.y} fontSize={labelSize} fill="#bd613b">{i ? 'B' : 'A'}</text></g>)}
      </g>}
      {snapTarget && <g pointerEvents="none"><circle cx={snapTarget.x} cy={snapTarget.y} r={view.w / 180} fill="none" stroke="#2c9979" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <text x={snapTarget.x + labelSize} y={snapTarget.y - labelSize / 2} fill="#26795f" fontSize={labelSize * .7}>eingerastet</text></g>}
    </svg>
    <div className="canvas-scale"><span>{gridSize} mm Raster</span><span>Maße in Millimetern</span></div>
    <div className="zoom-controls"><button title="Verkleinern" onClick={() => zoom(1.2)}><Minus size={17} /></button>
      <button title="Vergrößern" onClick={() => zoom(.8)}><Plus size={17} /></button><button title="Plan einpassen" onClick={fit}><Maximize size={17} /></button></div>
  </div>;
}
