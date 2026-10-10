import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { MultiPolygon } from 'polygon-clipping';
import { bounds, signedArea, validatePolygon } from '../geometry/polygon';
import type { Layout } from '../flooring/layout';
import type { Floor, Flooring, Point, Room } from '../model/types';
import { roomFlooring } from '../model/types';
import { spacerPositions } from '../geometry/spacers';
import { Maximize, Minus, Plus } from 'lucide-react';
import { alignVertex, snapRoomTranslation, snapToRooms } from '../geometry/snapping';
import { materialSource } from '../flooring/material';
import { changeWallLength, isRectangle } from '../geometry/dimensions';
import { NumberField } from './NumberField';
import { HelpInfo } from './HelpInfo';

export type Tool = 'select' | 'draw' | 'calibrate' | 'pan' | 'move-room';
export function pathData(polygons: MultiPolygon) {
  return polygons.map(poly => poly.map(ring => `M ${ring.map(p => p.join(' ')).join(' L ')} Z`).join(' ')).join(' ');
}
const pointsString = (points: Point[]) => points.map(p => `${p.x},${p.y}`).join(' ');
export function PlanCanvas({ floor, selectedId, layouts, tool, draft, setDraft, calibrationPoints, setCalibrationPoints,
  onSelect, onRoom, onPolygon, onError, snap, snapRooms, showBoards, showCutColors = true, showSpacers = false, flooring }:
  { floor: Floor; flooring: Flooring; selectedId: string | null; layouts: Map<string, Layout>; tool: Tool;
    draft: Point[]; setDraft: (p: Point[]) => void; calibrationPoints: Point[]; setCalibrationPoints: (p: Point[]) => void;
    onSelect: (id: string) => void; onRoom: (polygon: Point[]) => void; onPolygon: (id: string, polygon: Point[]) => void;
    onError: (message: string) => void; snap: number; snapRooms: boolean; showBoards: boolean; showCutColors?: boolean; showSpacers?: boolean }) {
  const spacers=useMemo(()=>new Map(floor.rooms.map(room=>[room.id,
    showSpacers && room.flooringEnabled!==false && layouts.get(room.id)?.feasible
      ? spacerPositions(room.polygon,roomFlooring(room,flooring).expansionGap) : []])),[floor.rooms,flooring,layouts,showSpacers]);
  const svg = useRef<SVGSVGElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const spaceHeld = useRef(false), canvasHovered = useRef(false);
  const [spacePan, setSpacePan] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  useEffect(() => {
    const node = svg.current; if (!node) return;
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setCanvasSize({ width, height });
    });
    observer.observe(node); return () => observer.disconnect();
  }, []);
  const [view, setView] = useState({ x: -450, y: -450, w: 7000, h: 5700 });
  const [cursor, setCursor] = useState<Point | null>(null);
  const drag = useRef<{ kind: 'vertex' | 'pan' | 'room'; id?: string; index?: number; pointerId?: number; point: Point; initial?: Point[]; view?: typeof view; current?: Point[] } | null>(null);
  const [preview, setPreview] = useState<{ id: string; polygon: Point[] } | null>(null);
  const [snapTarget, setSnapTarget] = useState<Point | null>(null);
  const lastVertexPointer = useRef<Point | null>(null);
  const [alignment, setAlignment] = useState<{ anchor: Point; point: Point } | null>(null);
  const [activeVertex, setActiveVertex] = useState<{ id: string; index: number } | null>(null);
  const [activeWall, setActiveWall] = useState<{ id: string; index: number } | null>(null);
  const touches = useRef(new Map<number, { point: Point; start: Point; moved: boolean }>());
  const touchGesture = useRef<{ ids: number[]; center: Point; distance: number; anchor: Point; scale: number; view: typeof view } | null>(null);
  function cancelEdit() {
    drag.current = null; lastVertexPointer.current = null; setPreview(null); setAlignment(null); setSnapTarget(null); setCursor(null);
  }
  function cancelTouches() {
    const ids = [...touches.current.keys()]; touches.current.clear(); touchGesture.current = null; cancelEdit();
    for (const id of ids) if (svg.current?.hasPointerCapture(id)) svg.current.releasePointerCapture(id);
  }
  useEffect(() => {
    const hidden = () => { if (document.hidden) cancelTouches(); };
    window.addEventListener('blur', cancelTouches); document.addEventListener('visibilitychange', hidden);
    return () => { window.removeEventListener('blur', cancelTouches); document.removeEventListener('visibilitychange', hidden); };
  }, []);
  useEffect(() => () => cancelTouches(), [floor.id, tool, floor.background?.dataUrl, floor.calibration?.mmPerPixel]);
  useEffect(() => {
    function endSpacePan() {
      spaceHeld.current = false; setSpacePan(false);
      if (drag.current?.kind === 'pan') {
        const id = drag.current.pointerId;
        drag.current = null;
        if (id !== undefined && svg.current?.hasPointerCapture(id)) svg.current.releasePointerCapture(id);
      }
    }
    function keyDown(event: KeyboardEvent) {
      if (event.code !== 'Space' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      // Text fields and HTML controls keep their normal keyboard behavior.
      if (target instanceof Element && target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]')) return;
      if (target instanceof Element && target.closest('button') && (!canvasHovered.current || canvas.current?.contains(target))) return;
      if (!canvasHovered.current && !canvas.current?.contains(document.activeElement)) return;
      if (drag.current && drag.current.kind !== 'pan') return;
      event.preventDefault(); event.stopPropagation();
      spaceHeld.current = true; setSpacePan(true); setCursor(null); setSnapTarget(null);
    }
    function keyUp(event: KeyboardEvent) {
      if (event.code === 'Space' && spaceHeld.current) { event.preventDefault(); endSpacePan(); }
    }
    function visibility() { if (document.hidden) endSpacePan(); }
    window.addEventListener('keydown', keyDown, true); window.addEventListener('keyup', keyUp, true);
    window.addEventListener('blur', endSpacePan); document.addEventListener('visibilitychange', visibility);
    return () => {
      spaceHeld.current = false;
      window.removeEventListener('keydown', keyDown, true); window.removeEventListener('keyup', keyUp, true);
      window.removeEventListener('blur', endSpacePan); document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  useEffect(() => { setActiveVertex(null); setActiveWall(null); setAlignment(null); }, [floor.id, selectedId, tool]);
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
    if (shift && tool === 'draw' && draft.length) {
      const start = draft.at(-1)!; const length = Math.hypot(p.x - start.x, p.y - start.y);
      const angle = Math.round(Math.atan2(p.y - start.y, p.x - start.x) / (Math.PI / 4)) * Math.PI / 4;
      result = { x: start.x + length * Math.cos(angle), y: start.y + length * Math.sin(angle) };
    }
    const target = snapRooms && (tool === 'draw' || drag.current?.kind === 'vertex') ? snapToRooms(p, floor.rooms, tolerance(), excludeId) : null;
    setSnapTarget(target); return target ?? result;
  }
  function finish() { const error = validatePolygon(draft); if (error) onError(error); else onRoom(draft); }
  function click(e: ReactPointerEvent<SVGSVGElement>, touchTap = false) {
    if (e.pointerType === 'touch' && !touchTap && (tool === 'draw' || tool === 'calibrate')) return;
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
    if (tool === 'pan' || (e.pointerType === 'touch' && tool === 'select')) {
      drag.current = { kind: 'pan', point: p, view, pointerId: e.pointerId }; e.currentTarget.setPointerCapture(e.pointerId);
    }
  }
  function spacePointer(e: ReactPointerEvent<SVGSVGElement>) {
    if (e.pointerType === 'touch') {
      const point = { x: e.clientX, y: e.clientY };
      touches.current.set(e.pointerId, { point, start: point, moved: false });
      e.currentTarget.setPointerCapture(e.pointerId);
      if (touches.current.size >= 2) {
        e.preventDefault(); e.stopPropagation(); cancelEdit(); setActiveWall(null); setActiveVertex(null);
        if (!touchGesture.current) {
          const ids = [...touches.current.keys()].slice(0, 2);
          const a = touches.current.get(ids[0])!.point, b = touches.current.get(ids[1])!.point;
          const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          const matrix = svg.current?.getScreenCTM();
          if (matrix) touchGesture.current = { ids, center, distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
            anchor: coordinate(center.x, center.y), scale: Math.hypot(matrix.a, matrix.b), view };
        }
        return;
      }
      // After a pinch, ignore the remaining finger until both have lifted.
      if (touchGesture.current) { e.preventDefault(); e.stopPropagation(); return; }
    }
    if (!spaceHeld.current || e.button !== 0) return;
    // Capture before rooms, vertices and wall labels can start an edit.
    e.preventDefault(); e.stopPropagation();
    drag.current = { kind: 'pan', point: coordinate(e.clientX, e.clientY), view, pointerId: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: ReactPointerEvent<SVGSVGElement>) {
    const touch = touches.current.get(e.pointerId);
    if (touch) {
      touch.point = { x: e.clientX, y: e.clientY };
      touch.moved ||= Math.hypot(e.clientX - touch.start.x, e.clientY - touch.start.y) > 8;
      const gesture = touchGesture.current;
      if (gesture) {
        const a = touches.current.get(gesture.ids[0])?.point, b = touches.current.get(gesture.ids[1])?.point;
        if (a && b && gesture.scale > 0) {
          const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          const factor = Math.max(100 / gesture.view.w, Math.min(2e6 / gesture.view.w,
            gesture.distance / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))));
          const v = gesture.view;
          setView({ x: gesture.anchor.x - (gesture.anchor.x - v.x) * factor - (center.x - gesture.center.x) * factor / gesture.scale,
            y: gesture.anchor.y - (gesture.anchor.y - v.y) * factor - (center.y - gesture.center.y) * factor / gesture.scale,
            w: v.w * factor, h: v.h * factor });
        }
        return;
      }
    }
    const p = coordinate(e.clientX, e.clientY);
    const d = drag.current;
    if (d?.kind === 'pan' && d.view) {
      const m = svg.current?.getScreenCTM(); if (!m) return;
      // Keep the initial world anchor under the current pointer, independent of accumulated pan.
      setView(v => ({ ...v, x: v.x + d.point.x - p.x, y: v.y + d.point.y - p.y }));
      return;
    }
    if (spaceHeld.current) return;
    setCursor(snapped(p, e.shiftKey));
    if (d?.kind === 'vertex' && d.initial && d.id !== undefined && d.index !== undefined) {
      updateVertex(p, e.shiftKey);
    }
    if (d?.kind === 'room' && d.initial && d.id) {
      const delta = { x: p.x - d.point.x, y: p.y - d.point.y };
      const moved = snapRoomTranslation(d.initial, delta, snapRooms ? floor.rooms : [], tolerance(), d.id);
      d.current = moved.polygon; setPreview({ id: d.id, polygon: moved.polygon }); setSnapTarget(moved.target);
    }
  }
  function updateVertex(p: Point, shift: boolean) {
    const d = drag.current;
    if (d?.kind !== 'vertex' || !d.initial || d.id === undefined || d.index === undefined) return;
    lastVertexPointer.current = p;
    let point: Point;
    if (shift) {
      const aligned = alignVertex({ x: Math.round(p.x / snap) * snap, y: Math.round(p.y / snap) * snap }, d.initial, d.index);
      point = aligned.point; setAlignment(aligned); setSnapTarget(null);
    } else { point = snapped(p, false, d.id); setAlignment(null); }
    const polygon = d.initial.map((initial, i) => i === d.index ? point : initial);
    d.current = polygon; setPreview({ id: d.id, polygon });
  }
  useEffect(() => {
    const shiftChanged = (event: KeyboardEvent) => {
      if (event.key === 'Shift' && lastVertexPointer.current) updateVertex(lastVertexPointer.current, event.type === 'keydown');
      if (event.type === 'keydown' && event.key === 'Delete' && activeVertex && tool === 'select' && !drag.current &&
        !(event.target as HTMLElement).matches('input,textarea,select,[contenteditable="true"]')) {
        event.preventDefault(); deleteVertex();
      }
      if (event.type === 'keydown' && event.key === 'Escape') { setActiveVertex(null); setActiveWall(null); }
    };
    window.addEventListener('keydown', shiftChanged); window.addEventListener('keyup', shiftChanged);
    return () => { window.removeEventListener('keydown', shiftChanged); window.removeEventListener('keyup', shiftChanged); };
  }, [floor.rooms, tool, snap, snapRooms, activeVertex]);
  function deleteVertex() {
    const room = floor.rooms.find(r => r.id === activeVertex?.id);
    if (!room || !activeVertex || room.id !== selectedId) return;
    const polygon = room.polygon.filter((_, index) => index !== activeVertex.index);
    const error = validatePolygon(polygon);
    if (error) { onError(error); return; }
    onPolygon(room.id, polygon); setActiveVertex(null);
  }
  function release(e: ReactPointerEvent<SVGSVGElement>) {
    const touch = touches.current.get(e.pointerId);
    touches.current.delete(e.pointerId);
    if (touchGesture.current) {
      if (!touches.current.size) touchGesture.current = null;
      cancelEdit(); return;
    }
    if (touch && !touch.moved && (tool === 'draw' || tool === 'calibrate')) click(e, true);
    const d = drag.current;
    if ((d?.kind === 'vertex' || d?.kind === 'room') && d.id && d.current) {
      const error = validatePolygon(d.current); if (error) onError(error); else onPolygon(d.id, d.current);
    }
    drag.current = null; lastVertexPointer.current = null; setPreview(null); setSnapTarget(null); setAlignment(null);
  }
  function roomPointer(e: ReactPointerEvent<SVGElement>, room: Room) {
    if (tool !== 'select' && tool !== 'move-room') return;
    e.stopPropagation(); setActiveWall(null); onSelect(room.id);
    if (tool === 'move-room') {
      drag.current = { kind: 'room', id: room.id, point: coordinate(e.clientX, e.clientY), initial: room.polygon };
      svg.current?.setPointerCapture(e.pointerId);
    } else if (e.pointerType === 'touch') {
      drag.current = { kind: 'pan', point: coordinate(e.clientX, e.clientY), view, pointerId: e.pointerId };
      svg.current?.setPointerCapture(e.pointerId);
    }
  }
  function insertVertex(room: Room, edge: number, point: Point, event?: ReactPointerEvent<SVGGElement>) {
    setActiveWall(null);
    const polygon = [...room.polygon.slice(0, edge + 1), point, ...room.polygon.slice(edge + 1)];
    const error = validatePolygon(polygon);
    if (error) { onError(error); return; }
    setActiveVertex({ id: room.id, index: edge + 1 });
    if (event) {
      // Clicking commits the new point on release; dragging previews its new position.
      drag.current = { kind: 'vertex', id: room.id, index: edge + 1, point, initial: polygon, current: polygon };
      lastVertexPointer.current = point;
      setPreview({ id: room.id, polygon });
      svg.current?.setPointerCapture(event.pointerId);
    } else onPolygon(room.id, polygon);
  }
  const zoom = useCallback((factor: number, center?: Point) => {
    setView(v => {
      if (v.w * factor < 100 || v.w * factor > 2e6) return v;
      const anchor = center ?? { x: v.x + v.w / 2, y: v.y + v.h / 2 };
      return { x: anchor.x - (anchor.x - v.x) * factor, y: anchor.y - (anchor.y - v.y) * factor, w: v.w * factor, h: v.h * factor };
    });
  }, []);
  useEffect(() => {
    const node = canvas.current; if (!node) return;
    const wheel = (event: WheelEvent) => {
      // React's delegated wheel listener is passive. Cancel scrolling here,
      // including over controls and at zoom limits, before the event bubbles.
      event.preventDefault(); event.stopPropagation();
      const matrix = svg.current?.getScreenCTM(); if (!matrix) return;
      if (event.ctrlKey || event.metaKey) {
        if (!event.deltaY) return;
        const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
        zoom(event.deltaY > 0 ? 1.12 : .88, { x: point.x, y: point.y });
        return;
      }
      // Some browsers already turn Shift + wheel into a horizontal delta.
      const dx = event.shiftKey ? event.deltaX || event.deltaY : event.deltaX;
      const dy = event.shiftKey ? 0 : event.deltaY;
      const unitX = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? node.clientWidth : 1;
      const unitY = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? node.clientHeight : 1;
      const scale = Math.hypot(matrix.a, matrix.b);
      if (scale > 0) setView(v => ({ ...v, x: v.x + dx * unitX / scale, y: v.y + dy * unitY / scale }));
    };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => node.removeEventListener('wheel', wheel);
  }, [zoom]);
  function roomPoints(room: Room) { return preview?.id === room.id ? preview.polygon : room.polygon; }
  const labelSize = view.w / 75, gridSize = view.w > 16000 ? 1000 : 500;
  const worldPerPixel = Math.max(view.w / canvasSize.width, view.h / canvasSize.height);
  const wallRoom = floor.rooms.find(r=>r.id===activeWall?.id && r.id===selectedId);
  const wallIndex = activeWall?.index ?? 0;
  const wallStart = wallRoom?.polygon[wallIndex], wallEnd = wallRoom?.polygon[(wallIndex+1)%wallRoom.polygon.length];
  return <div ref={canvas} className={`plan-canvas tool-${tool}${spacePan ? ' space-pan' : ''}`}
    onPointerEnter={() => { canvasHovered.current = true; }} onPointerLeave={() => { canvasHovered.current = false; }}>
    <svg ref={svg} role="img" aria-label="Interaktiver Verlegeplan" viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      onPointerDownCapture={spacePointer} onPointerDown={click} onPointerMove={move} onPointerUp={release}
      onPointerCancel={cancelTouches} onLostPointerCapture={e => { if (touches.current.has(e.pointerId)) cancelTouches(); }}>
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
            fill={!showCutColors ? '#e6d3af' : board.material?.reusedFrom ? '#bdd2ac' : board.cut ? (board.row % 2 ? '#d5ad76' : '#dfbc88') : (board.row % 2 ? '#eee0c5' : '#e6d3af')}
            stroke={!showCutColors ? '#b6a082' : board.material?.reusedFrom ? '#5f8650' : board.cut ? '#a47940' : '#b6a082'} strokeWidth="0.7" vectorEffect="non-scaling-stroke"
            onPointerDown={e => roomPointer(e, room)}>
            <title>{`${room.name} · Reihe ${board.row + 1} · Diele ${board.column + 1}\n${board.cut ? 'Zuschnitt' : 'Ganze Diele'}: ${board.usedLength.toFixed(1)} × ${board.usedWidth.toFixed(1)} mm\nAusgangsdiele: ${board.material?.sourceBoardId ?? 'neu'} · ${board.source.length} × ${board.source.width} mm${board.material?.reusedFromPlacementId ? `\n${materialSource(board.material)}: ${board.material.stockLength.toFixed(1)} mm · ungedreht` : ''}`}</title>
          </path>)}
          <polygon points={pointsString(points)} fill="none" stroke={selected ? '#4b6546' : '#8b9588'} strokeDasharray={room.flooringEnabled === false ? '7 4' : undefined} strokeWidth={selected ? 2.5 : 1.5} vectorEffect="non-scaling-stroke" pointerEvents="none" />
          {showSpacers && preview?.id!==room.id && !!spacers.get(room.id)?.length &&
            <g data-testid="spacer-markers" data-room-id={room.id} aria-label={`Abstandskeile: ${room.name}`} pointerEvents="none">
              {spacers.get(room.id)!.map((s,i)=><g key={i} data-testid="spacer-marker" transform={`translate(${s.point.x} ${s.point.y}) rotate(${s.angle})`}>
                <path d={`M ${-5*worldPerPixel} ${-3*worldPerPixel} L ${5*worldPerPixel} ${-3*worldPerPixel} L ${3*worldPerPixel} ${3*worldPerPixel} L ${-3*worldPerPixel} ${3*worldPerPixel} Z`}
                  fill="#3987c9" stroke="#fff" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              </g>)}
            </g>}
          <text x={(b.minX + b.maxX) / 2} y={(b.minY + b.maxY) / 2} textAnchor="middle" fontSize={labelSize} className="room-label" pointerEvents="none">{room.name}</text>
          {room.flooringEnabled === false && <text x={(b.minX + b.maxX) / 2} y={(b.minY + b.maxY) / 2 + labelSize * 1.5} textAnchor="middle" fontSize={labelSize * .75} fill="#6a7780" pointerEvents="none">ohne Laminat</text>}
          {selected && tool==='select' && !preview && points.map((p,index)=>{
            const q=points[(index+1)%points.length],length=Math.hypot(q.x-p.x,q.y-p.y),sign=signedArea(points)>0?1:-1;
            // Keep the entire label clear of the wall and its add-vertex handle.
            const distance=worldPerPixel*(Math.abs(q.y-p.y)/length*43+Math.abs(q.x-p.x)/length*11+12);
            const x=(p.x+q.x)/2+sign*(q.y-p.y)/length*distance;
            const y=(p.y+q.y)/2-sign*(q.x-p.x)/length*distance;
            const select=()=>{setActiveVertex(null);setActiveWall({id:room.id,index});};
            return <g key={`wall-${index}`} role="button" tabIndex={0} aria-label={`Länge von Wand ${index+1} ändern`} className="wall-length-label" transform={`translate(${x} ${y})`}
              onPointerDown={e=>{if(e.button!==0)return;e.stopPropagation();select();}}
              onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();select();}}}>
              <title>Wandlänge eingeben</title><rect x={-worldPerPixel*43} y={-worldPerPixel*11} width={worldPerPixel*86} height={worldPerPixel*22} rx={worldPerPixel*4} fill="#fff" stroke="#a8b99e" vectorEffect="non-scaling-stroke" />
              <text textAnchor="middle" dominantBaseline="central" fontSize={worldPerPixel*11} fill="#344931">{Math.round(length).toLocaleString('de-DE')} mm</text>
            </g>;
          })}
          {selected && tool === 'select' && !preview && points.map((point, index) => {
            const next = points[(index + 1) % points.length];
            const midpoint = { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 }, radius = worldPerPixel * 8;
            return <g key={`insert-${index}`} role="button" tabIndex={0} aria-label={`Eckpunkt an Kante ${index + 1} einfügen`}
              className="insert-vertex" transform={`translate(${midpoint.x} ${midpoint.y})`}
              onPointerDown={e => { if (e.button !== 0) return; e.stopPropagation(); insertVertex(room, index, midpoint, e); }}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); insertVertex(room, index, midpoint); } }}>
              <title>Eckpunkt einfügen · klicken oder direkt ziehen</title>
              <circle r={radius} fill="#f7faf3" stroke="#4b6546" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              <path d={`M ${-radius * .45} 0 H ${radius * .45} M 0 ${-radius * .45} V ${radius * .45}`}
                stroke="#4b6546" strokeWidth="1.5" vectorEffect="non-scaling-stroke" pointerEvents="none" />
            </g>;
          })}
          {selected && tool === 'select' && points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={worldPerPixel * 6}
            fill={activeVertex?.id === room.id && activeVertex.index === index ? '#4b6546' : 'white'} stroke="#4b6546" strokeWidth="2" vectorEffect="non-scaling-stroke" className="vertex"
            role="button" tabIndex={0} aria-label={`Eckpunkt ${index + 1}`} onFocus={() => { setActiveWall(null); setActiveVertex({ id: room.id, index }); }}
            onContextMenu={e => { e.preventDefault(); setActiveVertex({ id: room.id, index }); }}
            onPointerDown={e => { if (e.button !== 0) return; e.stopPropagation(); setActiveWall(null); setActiveVertex({ id: room.id, index }); drag.current = { kind: 'vertex', id: room.id, index, point, initial: room.polygon };
              lastVertexPointer.current = point;
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
      {alignment && <g pointerEvents="none" data-testid="axis-alignment">
        <line x1={alignment.anchor.x} y1={alignment.anchor.y} x2={alignment.point.x} y2={alignment.point.y}
          stroke="#317d99" strokeWidth="2.5" strokeDasharray="6 3" vectorEffect="non-scaling-stroke" />
        <text x={alignment.point.x + labelSize} y={alignment.point.y - labelSize / 2} fill="#317d99" fontSize={labelSize * .7}>
          {alignment.anchor.y === alignment.point.y ? 'waagerecht' : 'senkrecht'} · Shift
        </text>
      </g>}
    </svg>
    {wallRoom && wallStart && wallEnd && tool==='select' && <div className="wall-editor" onPointerDown={e=>e.stopPropagation()}>
      <div><strong>Wand {wallIndex+1}</strong><HelpInfo label="Wandlänge ändern">{isRectangle(wallRoom.polygon)?'Der Raum bleibt rechteckig. Die gegenüberliegende Wand wird ebenfalls angepasst; die obere linke Begrenzung bleibt fest.':'Die Richtung und der Anfang dieser Wand bleiben fest. Ihr Endpunkt wird verschoben; die angrenzende Wand passt sich an. Ungültige Konturen werden abgewiesen.'}</HelpInfo>
        <button aria-label="Wandbearbeitung schließen" onClick={()=>setActiveWall(null)}>×</button></div>
      <NumberField label="Wandlänge" value={Math.round(Math.hypot(wallEnd.x-wallStart.x,wallEnd.y-wallStart.y)*1000)/1000} min={1} step={.1}
        onChange={length=>{try{onPolygon(wallRoom.id,changeWallLength(wallRoom.polygon,wallIndex,length));return true;}catch(e){onError((e as Error).message);return false;}}} />
    </div>}
    {activeVertex && activeVertex.id === selectedId && tool === 'select' && <div className="vertex-actions">
      <span>Eckpunkt {activeVertex.index + 1}</span>
      <button onClick={deleteVertex} disabled={(floor.rooms.find(r => r.id === selectedId)?.polygon.length ?? 0) <= 3}
        title="Ausgewählten Eckpunkt entfernen (Entf)">Punkt löschen</button>
      <button aria-label="Eckpunktauswahl aufheben" onClick={() => setActiveVertex(null)}>×</button>
    </div>}
    <div className="canvas-scale"><span>{gridSize} mm Raster</span><span>Maße in Millimetern</span></div>
    <div className="zoom-controls"><button title="Verkleinern" onClick={() => zoom(1.2)}><Minus size={17} /></button>
      <button title="Vergrößern" onClick={() => zoom(.8)}><Plus size={17} /></button><button title="Plan einpassen" onClick={fit}><Maximize size={17} /></button></div>
  </div>;
}
