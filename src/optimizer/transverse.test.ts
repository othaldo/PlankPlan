import { describe, expect, it } from 'vitest';
import { optimizeTransverse, scoreLayout } from './transverse';
import { layoutRoom } from '../flooring/layout';
import { PRESETS } from '../model/types';
import type { Room } from '../model/types';
function room(height: number): Room { return { id: 'test', name: 'Test', polygon: [{ x: 0, y: 0 }, { x: 5200, y: 0 }, { x: 5200, y: height }, { x: 0, y: height }], layout: { direction: 0, offsetX: 100, offsetY: 0 } }; }
describe('transverse optimizer', () => {
  it('turns a 27 mm strip into balanced 110.5 mm edge rows', () => {
    const f = { ...PRESETS[0], expansionGap: 0 }, r = room(194 * 10 + 27);
    const before = layoutRoom(r, f), result = optimizeTransverse(r, f);
    expect(before.lastRowWidth).toBe(27);
    expect(result.layout.firstRowWidth).toBeCloseTo(110.5, 1); expect(result.layout.lastRowWidth).toBeCloseTo(110.5, 1);
    expect(result.offsetY).toBeCloseTo(83.5, 1); expect(result.candidates).toBeGreaterThan(80);
    expect(scoreLayout(result.layout, f)).toBeLessThan(scoreLayout(before, f));
    expect(r.layout.offsetY).toBe(0); expect(r.layout.offsetX).toBe(100);
  });
  it('keeps full-width edge rows for an exact multiple', () => {
    const result = optimizeTransverse(room(1940), { ...PRESETS[0], expansionGap: 0 });
    expect(result.offsetY).toBe(0); expect(result.layout.firstRowWidth).toBe(194); expect(result.layout.lastRowWidth).toBe(194);
  });
  it('reports infeasible minimum widths instead of inventing a solution', () => {
    const result = optimizeTransverse(room(45), { ...PRESETS[0], expansionGap: 0 });
    expect(result.layout.firstRowWidth).toBeCloseTo(45); expect(result.layout.warnings.some(w => w.includes('Randreihe'))).toBe(true);
  });
  it('applies the gap before measuring edge widths and reproduces the returned offset', () => {
    const r = room(4000), result = optimizeTransverse(r, PRESETS[0]);
    const reproduced = layoutRoom({ ...r, layout: { ...r.layout, offsetY: result.offsetY } }, PRESETS[0]);
    expect(reproduced.firstRowWidth).toBeCloseTo(result.layout.firstRowWidth, 2);
    expect(reproduced.lastRowWidth).toBeCloseTo(result.layout.lastRowWidth, 2);
    expect(reproduced.coveredArea).toBeCloseTo(5180 * 3980, 2);
  });
});
