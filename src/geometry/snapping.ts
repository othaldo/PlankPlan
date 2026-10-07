import type { Point, Room } from '../model/types';
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export function projectToSegment(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2)) : 0;
  return { x: a.x + t * dx, y: a.y + t * dy };
}
export function snapToRooms(p: Point, rooms: Room[], tolerance: number, excludeId?: string): Point | null {
  const candidates = rooms.filter(r => r.id !== excludeId).flatMap(r => r.polygon);
  const vertices = candidates.map(point => ({ point, d: distance(point, p) })).filter(c => c.d <= tolerance).sort((a, b) => a.d - b.d);
  if (vertices.length) return { ...vertices[0].point };
  const edges = rooms.filter(r => r.id !== excludeId).flatMap(r => r.polygon.map((a, i) => {
    const point = projectToSegment(p, a, r.polygon[(i + 1) % r.polygon.length]); return { point, d: distance(p, point) };
  })).filter(c => c.d <= tolerance).sort((a, b) => a.d - b.d);
  return edges[0]?.point ?? null;
}
/** Translate the complete polygon, preserving dimensions and angles. */
export function snapRoomTranslation(polygon: Point[], delta: Point, rooms: Room[], tolerance: number, excludeId: string) {
  const matches = polygon.map(p => {
    const moved = { x: p.x + delta.x, y: p.y + delta.y };
    const target = snapToRooms(moved, rooms, tolerance, excludeId);
    return target ? { target, correction: { x: target.x - moved.x, y: target.y - moved.y }, distance: distance(target, moved) } : null;
  }).filter(c => c !== null).sort((a, b) => a.distance - b.distance);
  const match = matches[0];
  const translation = match ? { x: delta.x + match.correction.x, y: delta.y + match.correction.y } : delta;
  return { polygon: polygon.map(p => ({ x: p.x + translation.x, y: p.y + translation.y })), target: match?.target ?? null };
}
