import polygonClipping from 'polygon-clipping';
import type { MultiPolygon } from 'polygon-clipping';
import { area, bounds, EPS, mod, polygonPoints, rectangle } from '../geometry/polygon';
import { allocateLayout, emptyLayout, fillPrepared, prepareRoom } from '../flooring/layout';
import type { Layout, PreparedRoom } from '../flooring/layout';
import type { Flooring, Room } from '../model/types';
import { roomFlooring } from '../model/types';
import { optimizeTransverse } from './transverse';
import { allocateMaterial, initialMaterial } from '../flooring/material';
import type { MaterialContext, MaterialState, Requirement } from '../flooring/material';

interface Span { minX: number; maxX: number }
interface Candidate { origin: number; phase: number; spans: Span[]; joints: number[]; count: number; first: number; last: number; cutCount: number; requirements: Requirement[] }
interface State { candidate: Candidate; cost: number; previous?: State; row: number; material: MaterialState }
// Full length at the wall must be a rectangular starter, not an angled wall cut.
function fullStarter(c: Candidate, f: Flooring) { return Math.abs(c.first - f.length) < EPS && c.requirements[0].rectangular; }
function closestJointDistance(a: { joints: number[]; spans: Span[] }, b: { joints: number[]; spans: Span[] }): number {
  const common = a.spans.flatMap(s => b.spans.map(t => ({ minX: Math.max(s.minX, t.minX), maxX: Math.min(s.maxX, t.maxX) }))).filter(s => s.maxX > s.minX + EPS);
  const inCommon = (x: number) => common.some(s => x > s.minX + EPS && x < s.maxX - EPS);
  let distance = Infinity;
  for (const x of a.joints) if (inCommon(x)) for (const y of b.joints) if (inCommon(y)) distance = Math.min(distance, Math.abs(x - y));
  return distance;
}
export function jointsCompatible(a: { joints: number[]; spans: Span[] }, b: { joints: number[]; spans: Span[] }, minimum: number): boolean {
  return closestJointDistance(a, b) >= minimum - EPS;
}
const millimeters = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');
function candidate(band: MultiPolygon, y: number, phase: number, row: number, f: Flooring, conflict?: { reason?: string }): Candidate | null {
  const b = bounds(polygonPoints(band)), spans = band.map(poly => bounds(polygonPoints([poly])));
  const origin = phase + Math.floor((b.minX - phase + 1e-7) / f.length) * f.length;
  const count = Math.ceil((b.maxX - origin - 1e-7) / f.length);
  let first = 0, last = 0, usedCount = 0, cutCount = 0;
  const joints: number[] = [];
  const requirements: Requirement[] = [];
  for (let i = 0; i < count; i++) {
    const x = origin + i * f.length;
    const clipped = polygonClipping.intersection(band, rectangle(x, y, f.length, f.width));
    const a = area(clipped); if (a < .001) continue;
    for (const poly of clipped) {
      const p = bounds(polygonPoints([poly]));
      // Check each disconnected physical piece, not the bounding box of a whole source board.
      if (p.maxX - p.minX < f.minEndPieceLength - EPS) {
        if (conflict) conflict.reason = `Reihe ${row + 1}: ${i === count - 1 ? 'Das Endstück' : i === 0 ? 'Das Startstück' : 'Ein Teilstück'} wäre nur ${millimeters(p.maxX - p.minX)} mm lang. Eingestellte Mindeststücklänge: ${f.minEndPieceLength} mm.`;
        return null;
      }
    }
    const bb = bounds(polygonPoints(clipped));
    if (!usedCount) first = bb.maxX - bb.minX;
    last = bb.maxX - bb.minX; usedCount++;
    const length = bb.maxX - bb.minX, width = bb.maxY - bb.minY;
    requirements.push({ id: `${row}:${i}`, length, width, area: a,
      rectangular: clipped.length === 1 && Math.abs(a - length * width) < .1, role: 'other' });
    if (Math.abs(a - f.length * f.width) > .1) cutCount++;
    if (spans.some(s => x + f.length > s.minX + EPS && x + f.length < s.maxX - EPS)) joints.push(x + f.length);
  }
  if (requirements.length) { requirements[0].role = 'start'; requirements[requirements.length - 1].role = 'end'; }
  return usedCount ? { origin, phase, spans, joints, count: usedCount, first, last, cutCount, requirements } : null;
}

/** Search the common start phase, keeping every row in the selected repeating pattern. */
function planRegular(room: Room, f: Flooring, prepared: PreparedRoom, offsetY: number, initial: MaterialState, context?: MaterialContext) {
  const step = room.layout.pattern === 'custom' ? room.layout.fixedStagger ?? f.jointOffset : f.length / (room.layout.pattern === 'half' ? 2 : 3);
  // Repeat named fractions exactly to avoid accumulated floating-point drift.
  const shift = (row: number) => (room.layout.pattern === 'custom' ? row : row % (room.layout.pattern === 'half' ? 2 : 3)) * step;
  const patternName = room.layout.pattern === 'custom' ? `Fester Versatz ${step} mm` : room.layout.pattern === 'half' ? 'Halbversatz' : 'Drittelversatz';
  if (!Number.isFinite(step) || step < 0 || step >= f.length)
    return { layout: emptyLayout(room, [`Der feste Versatz muss zwischen 0 mm und weniger als ${f.length} mm liegen.`]), inventory: initial };
  const b = prepared.extent, originY = b.minY - offsetY, rows = Math.ceil((b.maxY - originY - 1e-7) / f.width);
  if (rows * (Math.ceil((b.maxX - b.minX) / f.length) + 3) > 15000) throw new Error('Dieser Raum erzeugt mehr als 15.000 Dielen. Bitte kleinere Räume oder größere Dielen verwenden.');
  const bands: { row: number; y: number; band: MultiPolygon }[] = [], phases = new Set<number>();
  const add = (n: number) => phases.add(Math.round(mod(n, f.length) * 1e5) / 1e5);
  for (let i = 0; i < 64; i++) add(b.minX + i * f.length / 64);
  for (let row = 0; row < rows; row++) {
    const y = originY + row * f.width;
    const band = polygonClipping.intersection(prepared.local, rectangle(b.minX - 1, y, b.maxX - b.minX + 2, f.width));
    if (area(band) < .001) continue;
    bands.push({ row, y, band });
    for (const poly of band) {
      const span = bounds(polygonPoints([poly]));
      for (const x of [span.minX, span.maxX, span.minX + f.minEndPieceLength, span.maxX - f.minEndPieceLength]) add(x - shift(row));
    }
    for (const stock of initial.offcuts.slice(-32)) {
      add((stock.edge === 'right' ? b.minX + stock.length : b.maxX - stock.length) - shift(row));
    }
  }
  // Bound unusual polygons without approximating the selected pattern itself.
  const all = [...phases], samples = room.layout.startWithFullPlank && bands.length
    ? [mod(bounds(polygonPoints(bands[0].band)).minX - shift(bands[0].row), f.length)]
    : all.length <= 256 ? all : Array.from({ length: 256 }, (_, i) => all[Math.floor(i * (all.length - 1) / 255)]);
  let best: { origins: Map<number, number>; boards: number; cuts: number; first: number } | undefined;
  let firstConflict: string | undefined;
  for (const phase of samples) {
    let inventory = initial, previous: Candidate | undefined, previousRow = -2, cuts = 0, first = 0, valid = true;
    const origins = new Map<number, number>();
    for (const { row, y, band } of bands) {
      const detail: { reason?: string } = {};
      const choice = candidate(band, y, mod(phase + shift(row), f.length), row, f, detail);
      if (!choice) { firstConflict = detail.reason; valid = false; break; }
      if (!previous && room.layout.startWithFullPlank && !fullStarter(choice, f)) {
        firstConflict = `Reihe ${row + 1}: Die Startwand ist schräg oder hat eine Nische; eine ganze rechteckige Startdiele passt dort nicht. Raumkontur prüfen oder „Mit ganzer Startdiele beginnen“ ausschalten.`;
        valid = false; break;
      }
      if (previous && row === previousRow + 1 && !jointsCompatible(previous, choice, f.minJointOffset ?? 300)) {
        firstConflict = `Reihen ${previousRow + 1} und ${row + 1}: Die Stirnfugen liegen nur ${millimeters(closestJointDistance(previous, choice))} mm auseinander. Eingestellter Mindest-Fugenversatz: ${f.minJointOffset ?? 300} mm.`;
        valid = false; break;
      }
      inventory = allocateMaterial(choice.requirements, f, inventory, context);
      origins.set(row, choice.origin); cuts += choice.cutCount; if (!previous) first = choice.first;
      previous = choice; previousRow = row;
    }
    if (valid && (!best || inventory.newBoards < best.boards || (inventory.newBoards === best.boards && (cuts < best.cuts || (cuts === best.cuts && first > best.first)))))
      best = { origins, boards: inventory.newBoards, cuts, first };
  }
  if (!best) return { layout: emptyLayout(room, [
    ...(room.layout.startWithFullPlank && firstConflict ? [firstConflict] : []),
    `${patternName}${room.layout.startWithFullPlank ? ' mit ganzer Startdiele' : ''}: Kein gültiges regelmäßiges Muster mit mindestens ${f.minEndPieceLength} mm Stücklänge und ${f.minJointOffset ?? 300} mm Fugenabstand gefunden. Startdiele, Versatz, Richtung oder Regeln ändern. Deine Vorgaben werden nicht automatisch verändert.`
  ]), inventory: initial };
  const layout = fillPrepared(prepared, f, { ...room.layout, offsetY }, best.origins);
  if (!layout.feasible) return { layout: emptyLayout(room, ['Das regelmäßige Muster enthält einen unzulässigen Zuschnitt. Bitte anderes Muster oder andere Regeln wählen.']), inventory: initial };
  return allocateLayout(layout, f, initial, context);
}
/** Beam search over real per-row cuts with hard end-piece and adjacent-joint constraints. */
export function layoutAutomatic(room: Room, f: Flooring): Layout {
  return planAutomatic(room, f).layout;
}
/** Find a feasible constant stagger with a full starter; never relax construction rules. */
export function findFixedStagger(room: Room, f: Flooring): { fixedStagger?: number; layout: Layout; candidates: number } {
  f = roomFlooring(room, f);
  const requested = { ...room, layout: { ...room.layout, mode: 'automatic' as const, pattern: 'custom' as const, startWithFullPlank: true } };
  const steps = [...new Set([room.layout.fixedStagger ?? f.jointOffset, f.length / 2, f.length / 3, f.length / 4,
    ...Array.from({ length: 63 }, (_, i) => Math.round((i + 1) * f.length / 64 * 10) / 10)])].filter(n => n >= 0 && n < f.length);
  let result: Layout | undefined, candidates = 0;
  for (const fixedStagger of steps) {
    result = planAutomatic({ ...requested, layout: { ...requested.layout, fixedStagger } }, f).layout;
    candidates++;
    if (result.feasible) return { fixedStagger, layout: result, candidates };
    // Every full-start pattern has the same first row, regardless of its stagger.
    if (result.warnings[0]?.startsWith('Reihe 1:')) return { layout: result, candidates };
  }
  return { layout: result ?? emptyLayout(room, ['Kein passender fester Versatz gefunden.']), candidates };
}
export function planAutomatic(room: Room, f: Flooring, initial: MaterialState = initialMaterial(), context?: MaterialContext) {
  f = roomFlooring(room, f);
  const failure = (warnings: string[]) => ({ layout: emptyLayout(room, warnings), inventory: initial });
  const prepared = prepareRoom(room, f);
  const firstWidth = room.layout.firstRowWidth;
  if (typeof firstWidth === 'number' && (!Number.isFinite(firstWidth) || firstWidth < .1 || firstWidth > 1000))
    throw new Error('Die Breite der ersten Reihe muss zwischen 0,1 und 1000 mm liegen.');
  // Fix only the transverse origin; longitudinal cuts, joints and offcuts stay automatic.
  const offsetY = firstWidth === undefined
    ? optimizeTransverse({ ...room, layout: { ...room.layout, mode: 'manual' } }, f).offsetY
    : firstWidth === 'full' ? 0 : f.width - Math.min(firstWidth, f.width);
  if (room.layout.pattern === 'half' || room.layout.pattern === 'third' || room.layout.pattern === 'custom') return planRegular(room, f, prepared, offsetY, initial, context);
  const b = prepared.extent, originY = b.minY - offsetY;
  const rows = Math.ceil((b.maxY - originY - 1e-7) / f.width);
  const minimumJoint = f.minJointOffset ?? 300;
  const uniqueIncoming = [...new Map(initial.offcuts.map(s => [`${s.edge}:${s.length.toFixed(2)}`, s])).values()].sort((a, b) => a.length - b.length);
  const incomingCandidates = uniqueIncoming.length <= 32 ? uniqueIncoming : Array.from({ length: 32 }, (_, i) => uniqueIncoming[Math.floor(i * (uniqueIncoming.length - 1) / 31)]);
  let states: State[] = [];
  for (let row = 0; row < rows; row++) {
    const y = originY + row * f.width;
    const band = polygonClipping.intersection(prepared.local, rectangle(b.minX - 1, y, b.maxX - b.minX + 2, f.width));
    if (area(band) < .001) continue;
    const spans = band.map(poly => bounds(polygonPoints([poly])));
    const phases = new Set<number>();
    const add = (n: number) => phases.add(Math.round(mod(n, f.length) * 1e5) / 1e5);
    for (let i = 0; i < 32; i++) add(b.minX + i * f.length / 32);
    for (const s of spans) {
      add(s.minX); add(s.maxX); add(s.minX + f.minEndPieceLength); add(s.maxX - f.minEndPieceLength);
      const remainder = mod(s.maxX - s.minX, f.length);
      if (remainder > EPS && remainder < f.minEndPieceLength) add(s.minX - (f.minEndPieceLength - remainder));
    }
    for (const state of states.slice(0, 12)) {
      add(state.candidate.phase + f.jointOffset); add(state.candidate.phase - f.jointOffset);
      add(state.candidate.phase + minimumJoint); add(state.candidate.phase - minimumJoint);
    }
    // Material-aware candidates include using an existing offcut at its full
    // usable length. Fugenversatz can require trimming it or saving it for later.
    const stocks = states.length ? states.slice(0, 8).flatMap(state => state.material.offcuts.slice(-8)) : incomingCandidates;
    for (const stock of stocks) {
      if (stock.edge === 'right') add(spans[0].minX + stock.length);
      else add(spans[spans.length - 1].maxX - stock.length);
    }
    const rowPhases = !states.length && room.layout.startWithFullPlank ? [mod(bounds(polygonPoints(band)).minX, f.length)] : [...phases];
    const choices = rowPhases.map(phase => candidate(band, y, phase, row, f)).filter((c): c is Candidate => !!c && (states.length > 0 || !room.layout.startWithFullPlank || fullStarter(c, f)));
    if (!choices.length) return failure([`Reihe ${row + 1}: Keine Verlegung${!states.length && room.layout.startWithFullPlank ? ' mit ganzer Startdiele' : ''} mit allen Teilstücken mindestens ${f.minEndPieceLength} mm gefunden. Raumkontur, Richtung oder Verlegeregel prüfen. Es werden keine zu kurzen Dielen eingeplant.`]);
    const next: State[] = [];
    for (const choice of choices) {
      if (!states.length) {
        const material = allocateMaterial(choice.requirements, f, initial, context);
        next.push({ candidate: choice, row, material, cost: (material.newBoards - initial.newBoards) * 100000 + choice.cutCount * 10 + f.length - choice.first }); continue;
      }
      let best: State | undefined;
      for (const previous of states) {
        if (row === previous.row + 1 && !jointsCompatible(previous.candidate, choice, minimumJoint)) continue;
        const distance = mod(choice.phase - previous.candidate.phase - f.jointOffset, f.length);
        const material = allocateMaterial(choice.requirements, f, previous.material, context);
        const cost = previous.cost + (material.newBoards - previous.material.newBoards) * 100000 + choice.cutCount * 10 + Math.min(distance, f.length - distance);
        if (!best || cost < best.cost) best = { candidate: choice, row, cost, previous, material };
      }
      if (best) next.push(best);
    }
    if (!next.length) return failure([`Reihe ${row + 1}: Keine Kombination mit mindestens ${f.minEndPieceLength} mm Stücklänge und ${minimumJoint} mm Fugenversatz gefunden. Bitte Raumrichtung oder Regeln prüfen. Es wird kein ungültiger Plan ausgegeben.`]);
    states = next.sort((a, b) => a.cost - b.cost).slice(0, 32);
  }
  const origins = new Map<number, number>();
  for (let state: State | undefined = states[0]; state; state = state.previous) origins.set(state.row, state.candidate.origin);
  const layout = fillPrepared(prepared, f, { ...room.layout, offsetY }, origins);
  if (!layout.feasible) return failure(['Die abschließende Zuschnittprüfung hat ein zu kurzes Teilstück entdeckt. Es wird kein ungültiger Plan ausgegeben.']);
  return allocateLayout(layout, f, initial, context);
}
