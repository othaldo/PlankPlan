import type { Point } from '../model/types';
import { bounds, validatePolygon } from './polygon';

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
