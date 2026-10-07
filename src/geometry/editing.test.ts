import { describe, expect, it } from 'vitest';
import { calibrateFloor } from './calibration';
import { resizeRoom, changeCorner } from './dimensions';
import { bounds, signedArea } from './polygon';
import { demoProject } from '../model/types';
import type { Floor } from '../model/types';

const fixture = (): Floor => ({ ...demoProject().floors[0],
  background: { name: 'plan.png', dataUrl: 'data:image/png;base64,AA==', widthPx: 800, heightPx: 600, opacity: .5, origin: { x: 100, y: 200 } }, calibration: null });
const points: [{ x: number; y: number }, { x: number; y: number }] = [{ x: 600, y: 700 }, { x: 3600, y: 700 }];

describe('image calibration protects real room coordinates', () => {
  it('leaves all existing polygons and layout settings unchanged on first calibration', () => {
    const floor = fixture(), before = structuredClone(floor), next = calibrateFloor(floor, points, 6000);
    expect(next.calibration?.mmPerPixel).toBe(10);
    expect(next.calibration?.pointsPx).toEqual([{ x: 100, y: 100 }, { x: 700, y: 100 }]);
    expect(next.rooms).toBe(floor.rooms); expect(floor).toEqual(before);
  });
  it('leaves rooms unchanged when recalibrating or replacing an existing image', () => {
    const floor = calibrateFloor(fixture(), points, 6000);
    const next = calibrateFloor(floor, [{ x: 1100, y: 1200 }, { x: 7100, y: 1200 }], 3000);
    expect(next.calibration?.mmPerPixel).toBe(5); expect(next.rooms).toBe(floor.rooms);
    const replaced = { ...next, calibration: null, background: { ...next.background!, name: 'replacement.png' } };
    expect(calibrateFloor(replaced, points, 6000).rooms).toBe(floor.rooms);
  });
  it('only rescales contours on explicit opt-in and preserves the image anchor', () => {
    const floor = fixture(), next = calibrateFloor(floor, points, 6000, true);
    expect(next.rooms[0].polygon[0]).toEqual({ x: -100, y: -200 });
    expect(Math.abs(signedArea(next.rooms[0].polygon))).toBeCloseTo(Math.abs(signedArea(floor.rooms[0].polygon)) * 4);
    expect(next.rooms[0].layout).toEqual(floor.rooms[0].layout);
  });
  it('rejects invalid measurements without mutating any data', () => {
    const floor = fixture(), before = structuredClone(floor);
    expect(() => calibrateFloor(floor, [points[0], points[0]], 6000)).toThrow();
    expect(() => calibrateFloor(floor, points, 0)).toThrow();
    expect(() => calibrateFloor(floor, [{x: -100, y: 200}, points[1]], 6000)).toThrow(/innerhalb/);
    expect(() => calibrateFloor(floor, [{x: 100, y: 200}, {x:105, y:200}], 1e6)).toThrow(/größer/);
    expect(floor).toEqual(before);
  });
});

describe('manual dimensions', () => {
  const polygon = [{x:100,y:200},{x:4100,y:200},{x:4100,y:2200},{x:2100,y:2200},{x:2100,y:3200},{x:100,y:3200}];
  it('resizes a concave room proportionally while keeping its origin', () => {
    const next = resizeRoom(polygon, 8000, 1500);
    expect(bounds(next)).toEqual({minX:100,minY:200,maxX:8100,maxY:1700});
    expect(next[3]).toEqual({x:4100,y:1200}); expect(next[0]).toEqual(polygon[0]);
    expect(signedArea(next)).toBeCloseTo(signedArea(polygon));
    expect(bounds(polygon).maxX).toBe(4100);
  });
  it.each([0, -1, NaN, Infinity, 1e6 + 1])('rejects invalid dimension %s', dimension => {
    expect(() => resizeRoom(polygon, dimension, 3000)).toThrow();
  });
  it('rejects resizing beyond coordinate limits', () => {
    expect(() => resizeRoom(polygon, 1e6, 3000)).toThrow(/Raumkoordinaten/);
  });
  it('edits one corner and rejects intersections or duplicate corners', () => {
    const next = changeCorner(polygon, 1, {x:4200,y:250});
    expect(next[1]).toEqual({x:4200,y:250}); expect(polygon[1]).toEqual({x:4100,y:200});
    expect(() => changeCorner(polygon, 1, polygon[0])).toThrow(/identisch/);
    expect(() => changeCorner(polygon, 1, {x:100,y:3200})).toThrow();
    expect(() => changeCorner(polygon, 99, {x:0,y:0})).toThrow(/nicht gefunden/);
  });
});
