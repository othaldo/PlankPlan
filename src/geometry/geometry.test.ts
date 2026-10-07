import { describe, expect, it } from 'vitest';
import { area, inset, rotate, validatePolygon } from './polygon';
import { calibrate, scaleAround } from './calibration';
import type { Point } from '../model/types';
const rect = (w: number, h: number): Point[] => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
describe('polygon geometry in mm', () => {
  it('subtracts a true 10 mm expansion gap on all four walls', () => {
    expect(area(inset(rect(4000, 5000), 10))).toBeCloseTo(3980 * 4980, 4);
  });
  it('is independent of winding direction', () => {
    expect(area(inset(rect(4000, 5000).reverse(), 10))).toBeCloseTo(3980 * 4980, 4);
  });
  it('preserves a concave L rather than filling its bounding box', () => {
    const l = [{ x: 0, y: 0 }, { x: 5000, y: 0 }, { x: 5000, y: 2000 }, { x: 2000, y: 2000 }, { x: 2000, y: 5000 }, { x: 0, y: 5000 }];
    expect(area(inset(l, 10))).toBeCloseTo(4980 * 1980 + 1980 * 3000, 2);
  });
  it('returns no area when the gap consumes the room', () => { expect(inset(rect(10, 10), 10)).toEqual([]); });
  it('detects self-crossings and touching non-adjacent edges', () => {
    expect(validatePolygon([{ x: 0, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }, { x: 4, y: 0 }])).toMatch(/kreuzen/);
    expect(validatePolygon([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }, { x: 3, y: 0 }])).toMatch(/kreuzen/);
  });
  it('rejects non-finite coordinates and duplicate corners', () => {
    expect(validatePolygon([{ x: NaN, y: 0 }, { x: 0, y: 3 }, { x: 3, y: 0 }])).toBeTruthy();
    expect(validatePolygon([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 3, y: 0 }])).toMatch(/identisch/);
  });
  it('rejects negative or non-finite expansion gaps', () => {
    expect(() => inset(rect(100, 100), -1)).toThrow(); expect(() => inset(rect(100, 100), Infinity)).toThrow();
  });
  it('rotates and inversely rotates without depending on the view', () => {
    const p = { x: 5412.4, y: -283.7 }; const result = rotate(rotate(p, 37), -37);
    expect(result.x).toBeCloseTo(p.x, 8); expect(result.y).toBeCloseTo(p.y, 8);
  });
});
describe('image calibration', () => {
  it('maps pixel distance to real millimetres', () => { expect(calibrate([{ x: 20, y: 30 }, { x: 320, y: 430 }], 4000).mmPerPixel).toBe(8); });
  it('rejects coinciding points and invalid real distances', () => {
    expect(() => calibrate([{ x: 1, y: 1 }, { x: 1, y: 1 }], 4000)).toThrow();
    expect(() => calibrate([{ x: 0, y: 0 }, { x: 100, y: 0 }], 0)).toThrow();
  });
  it('rescales traced rooms around the image origin', () => { expect(scaleAround({ x: 140, y: 250 }, { x: 100, y: 200 }, 2)).toEqual({ x: 180, y: 300 }); });
});
