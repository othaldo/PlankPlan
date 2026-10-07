import { allocateLayout, layoutRoom } from '../flooring/layout';
import type { Layout } from '../flooring/layout';
import { initialMaterial } from '../flooring/material';
import type { MaterialContext, MaterialState } from '../flooring/material';
import { packageQuantity } from '../flooring/packages';
import type { Project, Room } from '../model/types';
import { planAutomatic } from './automatic';

export const roomKey = (floorId: string, roomId: string) => JSON.stringify([floorId, roomId]);
export const planningSignature = (p: Project) => {
  const f = p.flooring;
  return JSON.stringify([[f.length, f.width, f.thickness, f.expansionGap, f.minRowWidth, f.minEndPieceLength, f.jointOffset,
    f.minJointOffset ?? 300, f.boardsPerPack ?? null, f.reservePercent ?? 5, f.sawKerf ?? 3],
    p.floors.map(floor => [floor.id, floor.rooms.map(r => [r.id, r.polygon.map(point => [point.x, point.y]),
      [r.layout.direction, r.layout.offsetX, r.layout.offsetY, r.layout.mode ?? 'automatic', r.layout.firstRowWidth ?? null, r.layout.pattern ?? 'optimized'], r.flooringEnabled !== false])])]);
};
interface Entry { key: string; room: Room; context: MaterialContext }
interface Base { entries: Entry[]; layouts: Map<string, Layout>; errors: Map<string, string>; independentBoards: number; separatePackages: number | null }
export interface ProjectPlan {
  layouts: Map<string, Layout>; errors: Map<string, string>; order: string[]; inventory: MaterialState;
  valid: boolean; newBoards: number; reusedPieces: number; crossRoomReusedPieces: number;
  coveredArea: number; materialArea: number; wasteArea: number; remainingOffcutArea: number;
  packages: ReturnType<typeof packageQuantity>; independentBoards: number; independentPackages: ReturnType<typeof packageQuantity>;
  separatePackages: number | null; candidates: number; adaptive: boolean; sharing: boolean;
}
function prepare(p: Project): Base {
  const entries: Entry[] = [], layouts = new Map<string, Layout>(), errors = new Map<string, string>();
  let independentBoards = 0, separatePackages: number | null = p.flooring.boardsPerPack ? 0 : null;
  for (const floor of p.floors) for (const room of floor.rooms) {
    const key = roomKey(floor.id, room.id);
    if (room.flooringEnabled !== false) entries.push({ key, room, context: { roomKey: key, roomName: room.name, floorName: floor.name } });
    try {
      const layout = layoutRoom(room, p.flooring); layouts.set(key, layout);
      independentBoards += layout.newBoards;
      if (separatePackages !== null) separatePackages += packageQuantity(layout.newBoards, p.flooring)!.packages;
    } catch (e) { errors.set(key, (e as Error).message); }
  }
  return { entries, layouts, errors, independentBoards, separatePackages };
}
function ordered(base: Base, requested: string[]) {
  const keys = [...new Set([...requested, ...base.entries.map(e => e.key)])];
  const map = new Map(base.entries.map(e => [e.key, e]));
  return keys.flatMap(key => map.has(key) ? [map.get(key)!] : []);
}
function evaluate(p: Project, base: Base, requested: string[], adaptive = false, sharing = true, deadline = Infinity): ProjectPlan {
  const entries = ordered(base, requested), layouts = new Map(base.layouts), errors = new Map(base.errors);
  let inventory = initialMaterial(), valid = errors.size === 0;
  for (const entry of entries) {
    if (Date.now() > deadline) { valid = false; break; }
    const original = base.layouts.get(entry.key);
    if (!original?.feasible) { valid = false; continue; }
    // Independent planning remains a feasible incumbent even when greedy stock use
    // in a different order would consume an offcut needed by a later row.
    const incoming = sharing ? inventory : { newBoards: inventory.newBoards, offcuts: [] };
    try {
      const result = adaptive && entry.room.layout.mode !== 'manual'
        ? planAutomatic(entry.room, p.flooring, incoming, entry.context)
        : allocateLayout(original, p.flooring, incoming, entry.context);
      if (!result.layout.feasible) { valid = false; continue; }
      layouts.set(entry.key, result.layout);
      inventory = sharing ? result.inventory : { newBoards: result.inventory.newBoards, offcuts: [...inventory.offcuts, ...result.inventory.offcuts] };
    } catch (e) { valid = false; errors.set(entry.key, (e as Error).message); }
  }
  // Transfer stock area from its producer to its consumer exactly once, keeping
  // room totals additive and avoiding "waste" claims for material used elsewhere.
  const exported = new Map<string, number>();
  let crossRoomReusedPieces = 0;
  for (const [key, layout] of layouts) for (const board of layout.boards) {
    const allocation = board.material;
    if (allocation?.reusedFromRoomKey && allocation.reusedFromRoomKey !== key) {
      crossRoomReusedPieces++;
      exported.set(allocation.reusedFromRoomKey, (exported.get(allocation.reusedFromRoomKey) ?? 0) + allocation.stockLength * p.flooring.width);
    }
  }
  for (const [key, layout] of layouts) {
    const offcuts = inventory.offcuts.filter(s => s.sourceRoomKey === key);
    const materialArea = Math.max(0, layout.materialArea - (exported.get(key) ?? 0)), wasteArea = Math.max(0, materialArea - layout.coveredArea);
    layouts.set(key, { ...layout, offcuts, materialArea, wasteArea, wastePercent: materialArea ? wasteArea / materialArea * 100 : 0,
      remainingOffcutArea: offcuts.reduce((sum, s) => sum + s.length * s.width, 0) });
  }
  const coveredArea = [...layouts.values()].reduce((sum, l) => sum + l.coveredArea, 0);
  const materialArea = inventory.newBoards * p.flooring.length * p.flooring.width;
  return { layouts, errors, order: entries.map(e => e.key), inventory, valid, newBoards: inventory.newBoards,
    reusedPieces: [...layouts.values()].reduce((sum, l) => sum + l.reusedPieces, 0), crossRoomReusedPieces,
    coveredArea, materialArea, wasteArea: Math.max(0, materialArea - coveredArea),
    remainingOffcutArea: inventory.offcuts.reduce((sum, s) => sum + s.length * s.width, 0),
    packages: valid ? packageQuantity(inventory.newBoards, p.flooring) : null,
    independentBoards: base.independentBoards, independentPackages: valid ? packageQuantity(base.independentBoards, p.flooring) : null,
    separatePackages: valid ? base.separatePackages : null, candidates: 1, adaptive, sharing };
}
function compare(a: ProjectPlan, b: ProjectPlan) {
  return Number(b.valid) - Number(a.valid) || (a.packages?.packages ?? a.newBoards) - (b.packages?.packages ?? b.newBoards) ||
    a.newBoards - b.newBoards || b.crossRoomReusedPieces - a.crossRoomReusedPieces;
}
export function planProject(p: Project): ProjectPlan {
  const base = prepare(p), order = p.materialPlan?.roomOrder ?? [];
  const independent = evaluate(p, base, order, false, false);
  if (!independent.valid) return independent;
  const adaptive = !!p.materialPlan?.adaptive && p.materialPlan.signature === planningSignature(p);
  const shared = evaluate(p, base, order, adaptive);
  return compare(shared, independent) <= 0 ? shared : independent;
}
function candidateOrders(keys: string[]): string[][] {
  const orders: string[][] = [], seen = new Set<string>();
  const add = (order: string[]) => { const key = JSON.stringify(order); if (!seen.has(key) && orders.length < 128) { seen.add(key); orders.push(order); } };
  add(keys); add([...keys].reverse());
  if (keys.length <= 5) {
    const permute = (prefix: string[], rest: string[]) => {
      if (!rest.length) add(prefix);
      else rest.forEach((key, i) => permute([...prefix, key], rest.filter((_, j) => j !== i)));
    };
    permute([], keys);
  } else {
    for (let i = 1; i < Math.min(keys.length, 32); i++) { const rotation = [...keys.slice(i), ...keys.slice(0, i)]; add(rotation); add([...rotation].reverse()); }
    // Reproducible samples for large houses; never claim an exhaustive minimum.
    let seed = 173;
    for (let sample = 0; sample < 64; sample++) {
      const shuffled = [...keys];
      for (let i = shuffled.length - 1; i > 0; i--) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const j = seed % (i + 1); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
      add(shuffled);
    }
  }
  return orders;
}
export function optimizeProject(p: Project, progress?: (completed: number, total: number) => void): ProjectPlan {
  const base = prepare(p), current = p.materialPlan?.roomOrder ?? [];
  const baseline = evaluate(p, base, current, false, false);
  if (!baseline.valid || !base.entries.length) return baseline;
  const orders = candidateOrders(ordered(base, current).map(e => e.key));
  const fixed = orders.map((order, i) => { const result = evaluate(p, base, order); progress?.(i + 1, orders.length + Math.min(4, orders.length)); return result; });
  const saved = p.materialPlan?.adaptive && p.materialPlan.signature === planningSignature(p) ? evaluate(p, base, current, true) : baseline;
  const ranked = [baseline, saved, ...fixed].sort(compare);
  let best = ranked[0], tested = orders.length;
  // Refine the best orders: incoming offcuts actively influence start lengths,
  // including the first row of the next room. Manual geometry stays fixed.
  const deadline = Date.now() + 45000;
  for (const candidate of fixed.sort(compare).slice(0, 4)) {
    if (Date.now() > deadline) break;
    const result = evaluate(p, base, candidate.order, true, true, deadline); tested++;
    if (compare(result, best) < 0) best = result;
    progress?.(tested, orders.length + Math.min(4, orders.length));
  }
  return { ...best, candidates: tested };
}
