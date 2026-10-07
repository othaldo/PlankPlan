import { describe, expect, it } from 'vitest';
import ClipperLib from 'clipper-lib';
import type { MultiPolygon } from 'polygon-clipping';
import { layoutRoom } from './layout';
import { area, rotate } from '../geometry/polygon';
import { PRESETS } from '../model/types';
import type { Point, Room } from '../model/types';
const material = { ...PRESETS[0], expansionGap: 0, jointOffset: 0 };
function room(w: number, h: number): Room {
  return { id: 'room', name: 'Room', polygon: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }], layout: { direction: 0, offsetX: 0, offsetY: 0 } };
}
function verifyCoverage(r: Room, f = PRESETS[0]) {
  const layout = layoutRoom(r, f);
  expect(layout.coveredArea).toBeCloseTo(area(layout.inner), 2);
  // Independent integer audit: combining many rotated floating-point rings through
  // the same floating-point clipping library is ill-conditioned at coincident seams.
  const auditScale = 1e6;
  const paths = (polygons: MultiPolygon): ClipperLib.Paths => polygons.flatMap(poly => poly.map((ring, index) => {
    const path = ring.map(([x, y]) => ({ X: Math.round(x * auditScale), Y: Math.round(y * auditScale) }));
    if (ClipperLib.Clipper.Orientation(path) !== (index === 0)) path.reverse(); return path;
  }));
  const unionClipper = new ClipperLib.Clipper();
  unionClipper.AddPaths(layout.boards.flatMap(b => paths(b.polygon)), ClipperLib.PolyType.ptSubject, true);
  const union: ClipperLib.Paths = [];
  unionClipper.Execute(ClipperLib.ClipType.ctUnion, union, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  const unionArea = Math.abs(union.reduce((a, path) => a + ClipperLib.Clipper.Area(path), 0)) / auditScale ** 2;
  expect(Math.abs(unionArea - layout.coveredArea)).toBeLessThan(.1); // Boards cannot overlap.
  const differenceClipper = new ClipperLib.Clipper();
  differenceClipper.AddPaths(union, ClipperLib.PolyType.ptSubject, true);
  differenceClipper.AddPaths(paths(layout.inner), ClipperLib.PolyType.ptClip, true);
  const outside: ClipperLib.Paths = [];
  differenceClipper.Execute(ClipperLib.ClipType.ctDifference, outside, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  expect(Math.abs(outside.reduce((a, path) => a + ClipperLib.Clipper.Area(path), 0)) / auditScale ** 2).toBeLessThan(.1);
  expect(layout.wasteArea).toBeGreaterThanOrEqual(0);
  expect(layout.fullBoards + layout.cutBoards).toBe(layout.boards.length);
  return layout;
}
describe('board layout', () => {
  it('creates four whole boards for exact multiples without phantom rows', () => {
    const l = layoutRoom(room(2570, 388), material);
    expect(l.boards).toHaveLength(4); expect(l.cutBoards).toBe(0); expect(l.rows).toHaveLength(2);
    expect(l.wasteArea).toBe(0); expect(l.firstRowWidth).toBe(194); expect(l.lastRowWidth).toBe(194);
  });
  it('shows a narrow final row and the correct real cut geometry', () => {
    const l = layoutRoom(room(2000, 194 * 10 + 27), material);
    expect(l.lastRowWidth).toBeCloseTo(27); expect(l.warnings.some(w => w.includes('Randreihe'))).toBe(true);
    expect(l.boards.some(b => b.cut && Math.abs(b.usedWidth - 27) < .01)).toBe(true);
  });
  it('covers a concave room without crossing the recess', () => {
    const r = room(5000, 5000); r.polygon = [{ x: 0, y: 0 }, { x: 5000, y: 0 }, { x: 5000, y: 2000 }, { x: 2000, y: 2000 }, { x: 2000, y: 5000 }, { x: 0, y: 5000 }];
    verifyCoverage(r);
  });
  it('retains disconnected fragments produced by a U-shaped room', () => {
    const r = room(4000, 4000); r.polygon = [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 4000 }, { x: 2800, y: 4000 }, { x: 2800, y: 1200 }, { x: 1200, y: 1200 }, { x: 1200, y: 4000 }, { x: 0, y: 4000 }];
    const l = verifyCoverage(r, { ...PRESETS[0], length: 5000 });
    expect(l.boards.some(b => b.polygon.length > 1)).toBe(true);
  });
  it.each([0, 90, 37, -25, 180])('preserves area at direction %s degrees', direction => {
    const r = room(4230, 3190); r.layout = { direction, offsetX: 187, offsetY: 53 }; verifyCoverage(r);
  });
  it('rotates world geometry and the layout together', () => {
    const r = room(4000, 3200), baseline = layoutRoom(r, PRESETS[0]);
    r.polygon = r.polygon.map(p => rotate(p, 90)); r.layout.direction = 90;
    const rotated = layoutRoom(r, PRESETS[0]); expect(rotated.boards.length).toBe(baseline.boards.length);
    expect(rotated.coveredArea).toBeCloseTo(baseline.coveredArea, 3);
  });
  it('normalizes periodic offsets including negatives', () => {
    const a = room(4000, 3000), b = room(4000, 3000);
    a.layout = { direction: 0, offsetX: 100, offsetY: 50 };
    b.layout = { direction: 0, offsetX: 100 - 1285, offsetY: 50 + 194 };
    expect(layoutRoom(a, PRESETS[0]).boards).toEqual(layoutRoom(b, PRESETS[0]).boards);
  });
  it('rejects impossible parameters and huge layouts before looping', () => {
    expect(() => layoutRoom(room(4000, 4000), { ...material, width: 0 })).toThrow();
    expect(() => layoutRoom(room(4000, 4000), { ...material, minRowWidth: 500 })).toThrow();
    expect(() => layoutRoom(room(1e6, 1e6), material)).toThrow(/15.000/);
    const r = room(4000, 4000); r.layout.direction = NaN; expect(() => layoutRoom(r, material)).toThrow();
  });
  it('covers several asymmetric polygons with reproducible offsets', () => {
    let seed = 18273;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 6; i++) {
      const points: Point[] = Array.from({ length: 7 }, (_, j) => {
        const angle = j * Math.PI * 2 / 7, radius = 1000 + random() * 700;
        return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
      });
      const r = room(1, 1); r.polygon = points; r.layout = { direction: random() * 180, offsetX: random() * 1285, offsetY: random() * 194 };
      verifyCoverage(r);
    }
  });
});
