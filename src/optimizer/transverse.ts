import { mod } from '../geometry/polygon';
import { fillPrepared, prepareRoom } from '../flooring/layout';
import type { Layout } from '../flooring/layout';
import type { Flooring, Room } from '../model/types';

export function scoreLayout(layout: Layout, f: Flooring): number {
  const narrow = layout.rows.flatMap(row => row.fragmentWidths).reduce((a, w) =>
    a + Math.max(0, f.minRowWidth - w) ** 2, 0);
  const edge = Math.max(0, f.minRowWidth - layout.firstRowWidth) ** 2 + Math.max(0, f.minRowWidth - layout.lastRowWidth) ** 2;
  return narrow * 1e6 + edge * 1e7 + Math.abs(layout.firstRowWidth - layout.lastRowWidth) * 1000 + layout.wasteArea / 1000;
}
/** Finite candidate search plus 0.25 mm refinement; direction and longitudinal offset stay fixed. */
export function optimizeTransverse(room: Room, f: Flooring): { offsetY: number; layout: Layout; candidates: number } {
  const prepared = prepareRoom(room, f);
  const candidates = new Set<number>([mod(room.layout.offsetY, f.width), 0]);
  const remainder = mod(prepared.extent.maxY - prepared.extent.minY, f.width);
  candidates.add(remainder < 0.01 ? 0 : (f.width - remainder) / 2);
  for (let i = 0; i < 80; i++) candidates.add(i * f.width / 80);
  // Include phase changes at recesses, together with balanced offsets between wall levels.
  const levels = [...new Set(prepared.local.flat(2).map(p => mod(p[1] - prepared.extent.minY, f.width)))].slice(0, 64);
  for (const level of levels) {
    candidates.add(mod(-level, f.width));
    candidates.add(mod((f.width - level) / 2, f.width));
  }
  let bestOffset = 0, bestScore = Infinity, tested = 0;
  let best = fillPrepared(prepared, f, { ...room.layout, offsetY: 0 });
  const test = (offset: number) => {
    const normalized = mod(offset, f.width);
    const layout = fillPrepared(prepared, f, { ...room.layout, offsetY: normalized });
    const score = scoreLayout(layout, f); tested++;
    if (score < bestScore) { bestScore = score; bestOffset = normalized; best = layout; }
  };
  candidates.forEach(test);
  const center = bestOffset, radius = f.width / 80;
  for (let delta = -radius; delta <= radius; delta += 0.25) test(center + delta);
  return { offsetY: Math.round(bestOffset * 1000) / 1000, layout: best, candidates: tested };
}
