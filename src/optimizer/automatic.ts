import polygonClipping from 'polygon-clipping';
import type { MultiPolygon } from 'polygon-clipping';
import { area, bounds, EPS, mod, polygonPoints, rectangle } from '../geometry/polygon';
import { allocateLayout, emptyLayout, fillPrepared, prepareRoom } from '../flooring/layout';
import type { Layout } from '../flooring/layout';
import type { Flooring, Room } from '../model/types';
import { optimizeTransverse } from './transverse';
import { allocateMaterial, initialMaterial } from '../flooring/material';
import type { MaterialContext, MaterialState, Requirement } from '../flooring/material';

interface Span { minX: number; maxX: number }
interface Candidate { origin: number; phase: number; spans: Span[]; joints: number[]; count: number; first: number; last: number; cutCount: number; requirements: Requirement[] }
interface State { candidate: Candidate; cost: number; previous?: State; row: number; material: MaterialState }
export function jointsCompatible(a: { joints: number[]; spans: Span[] }, b: { joints: number[]; spans: Span[] }, minimum: number): boolean {
  const common = a.spans.flatMap(s => b.spans.map(t => ({ minX: Math.max(s.minX, t.minX), maxX: Math.min(s.maxX, t.maxX) }))).filter(s => s.maxX > s.minX + EPS);
  const inCommon = (x: number) => common.some(s => x > s.minX + EPS && x < s.maxX - EPS);
  return !a.joints.some(x => inCommon(x) && b.joints.some(y => inCommon(y) && Math.abs(x - y) < minimum - EPS));
}
function candidate(band: MultiPolygon, y: number, phase: number, row: number, f: Flooring): Candidate | null {
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
      if (p.maxX - p.minX < f.minEndPieceLength - EPS) return null;
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
/** Beam search over real per-row cuts with hard end-piece and adjacent-joint constraints. */
export function layoutAutomatic(room: Room, f: Flooring): Layout {
  return planAutomatic(room, f).layout;
}
export function planAutomatic(room: Room, f: Flooring, initial: MaterialState = initialMaterial(), context?: MaterialContext) {
  const failure = (warnings: string[]) => ({ layout: emptyLayout(room, warnings), inventory: initial });
  const prepared = prepareRoom(room, f);
  const firstWidth = room.layout.firstRowWidth;
  if (typeof firstWidth === 'number' && (!Number.isFinite(firstWidth) || firstWidth < .1 || firstWidth > 1000))
    throw new Error('Die Breite der ersten Reihe muss zwischen 0,1 und 1000 mm liegen.');
  // Fix only the transverse origin; longitudinal cuts, joints and offcuts stay automatic.
  const offsetY = firstWidth === undefined
    ? optimizeTransverse({ ...room, layout: { ...room.layout, mode: 'manual' } }, f).offsetY
    : firstWidth === 'full' ? 0 : f.width - Math.min(firstWidth, f.width);
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
    const choices = [...phases].map(phase => candidate(band, y, phase, row, f)).filter((c): c is Candidate => !!c);
    if (!choices.length) return failure([`Reihe ${row + 1}: Keine Verlegung mit allen Teilstücken mindestens ${f.minEndPieceLength} mm gefunden. Raumkontur, Richtung oder Verlegeregel prüfen. Es werden keine zu kurzen Dielen eingeplant.`]);
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
