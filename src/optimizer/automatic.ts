import polygonClipping from 'polygon-clipping';
import type { MultiPolygon } from 'polygon-clipping';
import { area, bounds, EPS, mod, polygonPoints, rectangle } from '../geometry/polygon';
import { emptyLayout, fillPrepared, prepareRoom } from '../flooring/layout';
import type { Layout } from '../flooring/layout';
import type { Flooring, Room } from '../model/types';
import { optimizeTransverse } from './transverse';

interface Span { minX: number; maxX: number }
interface Candidate { origin: number; phase: number; spans: Span[]; joints: number[]; count: number; first: number; last: number; cutCount: number }
interface State { candidate: Candidate; cost: number; previous?: State; row: number }
export function jointsCompatible(a: { joints: number[]; spans: Span[] }, b: { joints: number[]; spans: Span[] }, minimum: number): boolean {
  const common = a.spans.flatMap(s => b.spans.map(t => ({ minX: Math.max(s.minX, t.minX), maxX: Math.min(s.maxX, t.maxX) }))).filter(s => s.maxX > s.minX + EPS);
  const inCommon = (x: number) => common.some(s => x > s.minX + EPS && x < s.maxX - EPS);
  return !a.joints.some(x => inCommon(x) && b.joints.some(y => inCommon(y) && Math.abs(x - y) < minimum - EPS));
}
function candidate(band: MultiPolygon, y: number, phase: number, f: Flooring): Candidate | null {
  const b = bounds(polygonPoints(band)), spans = band.map(poly => bounds(polygonPoints([poly])));
  const origin = phase + Math.floor((b.minX - phase + 1e-7) / f.length) * f.length;
  const count = Math.ceil((b.maxX - origin - 1e-7) / f.length);
  let first = 0, last = 0, usedCount = 0, cutCount = 0;
  const joints: number[] = [];
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
    if (Math.abs(a - f.length * f.width) > .1) cutCount++;
    if (spans.some(s => x + f.length > s.minX + EPS && x + f.length < s.maxX - EPS)) joints.push(x + f.length);
  }
  return usedCount ? { origin, phase, spans, joints, count: usedCount, first, last, cutCount } : null;
}
/** Beam search over real per-row cuts with hard end-piece and adjacent-joint constraints. */
export function layoutAutomatic(room: Room, f: Flooring): Layout {
  const prepared = prepareRoom(room, f);
  const transverse = optimizeTransverse({ ...room, layout: { ...room.layout, mode: 'manual' } }, f);
  const offsetY = transverse.offsetY, b = prepared.extent, originY = b.minY - offsetY;
  const rows = Math.ceil((b.maxY - originY - 1e-7) / f.width);
  const minimumJoint = f.minJointOffset ?? 300;
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
    const choices = [...phases].map(phase => candidate(band, y, phase, f)).filter((c): c is Candidate => !!c);
    if (!choices.length) return emptyLayout(room, [`Reihe ${row + 1}: Keine Verlegung mit allen Teilstücken mindestens ${f.minEndPieceLength} mm gefunden. Raumkontur, Richtung oder Verlegeregel prüfen. Es werden keine zu kurzen Dielen eingeplant.`]);
    const next: State[] = [];
    for (const choice of choices) {
      const base = choice.count * 100000 + choice.cutCount * 10;
      if (!states.length) { next.push({ candidate: choice, row, cost: base + f.length - choice.first }); continue; }
      let best: State | undefined;
      for (const previous of states) {
        if (row === previous.row + 1 && !jointsCompatible(previous.candidate, choice, minimumJoint)) continue;
        const distance = mod(choice.phase - previous.candidate.phase - f.jointOffset, f.length);
        const cost = previous.cost + base + Math.min(distance, f.length - distance);
        if (!best || cost < best.cost) best = { candidate: choice, row, cost, previous };
      }
      if (best) next.push(best);
    }
    if (!next.length) return emptyLayout(room, [`Reihe ${row + 1}: Keine Kombination mit mindestens ${f.minEndPieceLength} mm Stücklänge und ${minimumJoint} mm Fugenversatz gefunden. Bitte Raumrichtung oder Regeln prüfen. Es wird kein ungültiger Plan ausgegeben.`]);
    states = next.sort((a, b) => a.cost - b.cost).slice(0, 32);
  }
  const origins = new Map<number, number>();
  for (let state: State | undefined = states[0]; state; state = state.previous) origins.set(state.row, state.candidate.origin);
  const layout = fillPrepared(prepared, f, { ...room.layout, offsetY }, origins);
  if (!layout.feasible) return emptyLayout(room, ['Die abschließende Zuschnittprüfung hat ein zu kurzes Teilstück entdeckt. Es wird kein ungültiger Plan ausgegeben.']);
  return layout;
}
