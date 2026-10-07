import ClipperLib from 'clipper-lib';
import type { MultiPolygon, Ring } from 'polygon-clipping';
import type { Point } from '../model/types';

export const EPS = 0.01;
export const mod = (n: number, period: number) => ((n % period) + period) % period;
export function rotate(p: Point, degrees: number): Point {
  const a = degrees * Math.PI / 180;
  return { x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) };
}
export function signedArea(points: Point[]): number {
  return points.reduce((a, p, i) => {
    const q = points[(i + 1) % points.length]; return a + p.x * q.y - q.x * p.y;
  }, 0) / 2;
}
export function area(polygons: MultiPolygon): number {
  return polygons.reduce((sum, rings) => sum + rings.reduce((a, ring, i) =>
    a + (i === 0 ? 1 : -1) * Math.abs(signedArea(ring.map(([x, y]) => ({ x, y })))), 0), 0);
}
export function bounds(points: Point[]) {
  if (!points.length) throw new Error('Die Geometrie enthält keine Punkte.');
  return { minX: Math.min(...points.map(p => p.x)), maxX: Math.max(...points.map(p => p.x)),
    minY: Math.min(...points.map(p => p.y)), maxY: Math.max(...points.map(p => p.y)) };
}
export const polygonPoints = (polygons: MultiPolygon): Point[] => polygons.flat(2).map(([x, y]) => ({ x, y }));
export function transform(polygons: MultiPolygon, angle: number): MultiPolygon {
  return polygons.map(poly => poly.map(ring => ring.map(([x, y]) => {
    const p = rotate({ x, y }, angle); return [p.x, p.y];
  })));
}
export function ring(points: Point[]): Ring { return points.map(p => [p.x, p.y]); }
export function rectangle(x: number, y: number, w: number, h: number): MultiPolygon {
  return [[[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]]];
}
function cross(a: Point, b: Point, c: Point) { return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); }
function onSegment(a: Point, b: Point, c: Point) {
  return Math.abs(cross(a, b, c)) < 1e-7 && c.x >= Math.min(a.x, b.x) - EPS &&
    c.x <= Math.max(a.x, b.x) + EPS && c.y >= Math.min(a.y, b.y) - EPS && c.y <= Math.max(a.y, b.y) + EPS;
}
function intersects(a: Point, b: Point, c: Point, d: Point) {
  const c1 = cross(a, b, c), c2 = cross(a, b, d), c3 = cross(c, d, a), c4 = cross(c, d, b);
  return (c1 * c2 < 0 && c3 * c4 < 0) || onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
}
export function validatePolygon(points: Point[]): string | null {
  if (points.length < 3 || points.length > 512) return 'Ein Raum benötigt 3 bis 512 Eckpunkte.';
  if (points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > 1e6 || Math.abs(p.y) > 1e6))
    return 'Raumkoordinaten müssen endlich sein und innerhalb von ±1.000.000 mm liegen.';
  for (let i = 0; i < points.length; i++) {
    const next = (i + 1) % points.length;
    if (Math.hypot(points[i].x - points[next].x, points[i].y - points[next].y) < EPS) return 'Zwei benachbarte Eckpunkte sind identisch.';
    for (let j = i + 1; j < points.length; j++) {
      if (j === next || (j + 1) % points.length === i) continue;
      if (intersects(points[i], points[next], points[j], points[(j + 1) % points.length])) return 'Die Raumkontur darf sich nicht selbst kreuzen oder berühren.';
    }
  }
  if (Math.abs(signedArea(points)) < 1) return 'Der Raum hat keine messbare Fläche.';
  return null;
}
/** Inward miter offset, quantized to 0.01 mm. Concave rooms may split into multiple islands. */
export function inset(points: Point[], gap: number): MultiPolygon {
  const error = validatePolygon(points); if (error) throw new Error(error);
  if (!Number.isFinite(gap) || gap < 0) throw new Error('Die Bewegungsfuge muss mindestens 0 mm betragen.');
  if (gap === 0) return [[ring(points)]];
  const path = points.map(p => ({ X: Math.round(p.x * 100), Y: Math.round(p.y * 100) }));
  if (!ClipperLib.Clipper.Orientation(path)) path.reverse();
  const offset = new ClipperLib.ClipperOffset(2, 0.25);
  offset.AddPath(path, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
  const solution: ClipperLib.Paths = [];
  offset.Execute(solution, -gap * 100);
  return solution.map(path => [path.map(p => [p.X / 100, p.Y / 100])]);
}
