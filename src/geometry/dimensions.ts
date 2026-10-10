import type { Point } from '../model/types';
import { bounds, signedArea, validatePolygon } from './polygon';

export type RoomEdge = 'left' | 'right' | 'top' | 'bottom';
/** Translate the entire contour so one outer boundary reaches the target coordinate. */
export function positionRoom(polygon: Point[], edge: RoomEdge, coordinate: number): Point[] {
  const error=validatePolygon(polygon); if(error) throw new Error(error);
  if(!Number.isFinite(coordinate)) throw new Error('Die Raumposition muss eine endliche Zahl sein.');
  const b=bounds(polygon), horizontal=edge==='left'||edge==='right';
  const current=edge==='left'?b.minX:edge==='right'?b.maxX:edge==='top'?b.minY:b.maxY;
  const delta=coordinate-current;
  const next=polygon.map(p=>({x:p.x+(horizontal?delta:0),y:p.y+(horizontal?0:delta)}));
  const invalid=validatePolygon(next); if(invalid) throw new Error(invalid);
  return next;
}

/** Change the outer dimensions in plan axes, keeping the top-left corner fixed. */
export function resizeRoom(polygon: Point[], width: number, depth: number): Point[] {
  const error = validatePolygon(polygon); if (error) throw new Error(error);
  if (![width, depth].every(n => Number.isFinite(n) && n > 0 && n <= 1e6))
    throw new Error('Breite und Tiefe müssen größer als 0 und höchstens 1.000.000 mm sein.');
  const b = bounds(polygon);
  const next = polygon.map(p => ({ x: b.minX + (p.x - b.minX) * width / (b.maxX - b.minX),
    y: b.minY + (p.y - b.minY) * depth / (b.maxY - b.minY) }));
  const invalid = validatePolygon(next); if (invalid) throw new Error(invalid);
  return next;
}

export function changeCorner(polygon: Point[], index: number, point: Point): Point[] {
  if (!Number.isInteger(index) || index < 0 || index >= polygon.length) throw new Error('Eckpunkt nicht gefunden.');
  const next = polygon.map((p, i) => i === index ? { ...point } : p);
  const error = validatePolygon(next); if (error) throw new Error(error);
  return next;
}

export function isRectangle(polygon: Point[]): boolean {
  return polygon.length === 4 && !validatePolygon(polygon) && polygon.every((p, i) => {
    const q = polygon[(i + 1) % 4]; return Math.abs(p.x - q.x) < .01 || Math.abs(p.y - q.y) < .01;
  });
}

/** Explicitly replace a four-corner contour, retaining its bounds origin and vertex order. */
export function makeRectangle(polygon: Point[], width: number, depth: number): Point[] {
  if (polygon.length !== 4) throw new Error('Rechteckig ausrichten ist nur für Räume mit vier Eckpunkten möglich.');
  const resized = resizeRoom(polygon, width, depth), b = bounds(resized);
  let corners = [{x:b.minX,y:b.minY},{x:b.minX+width,y:b.minY},{x:b.minX+width,y:b.minY+depth},{x:b.minX,y:b.minY+depth}];
  if (signedArea(polygon) < 0) corners = corners.reverse();
  const candidates = corners.map((_, shift) => corners.map((__, i) => ({...corners[(i + shift) % 4]})));
  const distance = (points: Point[]) => points.reduce((sum, p, i) => sum + (p.x-resized[i].x)**2 + (p.y-resized[i].y)**2, 0);
  return candidates.sort((a,b) => distance(a)-distance(b))[0];
}

/** Rectangle edits resize its matching axis; other contours retain the edited wall's direction and start. */
export function changeWallLength(polygon: Point[], index: number, length: number): Point[] {
  if (!Number.isInteger(index) || index < 0 || index >= polygon.length) throw new Error('Wand nicht gefunden.');
  if (!Number.isFinite(length) || length <= 0 || length > 1e6) throw new Error('Wandlänge muss größer als 0 und höchstens 1.000.000 mm sein.');
  const p=polygon[index], next=(index+1)%polygon.length, q=polygon[next], dx=q.x-p.x, dy=q.y-p.y;
  if (isRectangle(polygon)) {
    const b=bounds(polygon);
    return makeRectangle(polygon,Math.abs(dx)>Math.abs(dy)?length:b.maxX-b.minX,Math.abs(dx)>Math.abs(dy)?b.maxY-b.minY:length);
  }
  const current=Math.hypot(dx,dy);
  if (current<.001) throw new Error('Die Wand hat keine eindeutige Richtung.');
  return changeCorner(polygon,next,{x:p.x+dx/current*length,y:p.y+dy/current*length});
}
