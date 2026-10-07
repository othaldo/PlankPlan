import polygonClipping from 'polygon-clipping';
import type { MultiPolygon } from 'polygon-clipping';
import { area, bounds, EPS, inset, mod, polygonPoints, rectangle, transform } from '../geometry/polygon';
import type { Flooring, LayoutSettings, Room } from '../model/types';
import { layoutAutomatic } from '../optimizer/automatic';

export interface Board {
  id: string; row: number; column: number; source: { x: number; y: number; length: number; width: number; rotation: number };
  polygon: MultiPolygon; area: number; cut: boolean; usedLength: number; usedWidth: number; pieceLengths: number[];
}
export interface Row { index: number; width: number; fragmentWidths: number[]; firstLength: number; lastLength: number; originX: number; joints: number[] }
export interface Layout {
  boards: Board[]; rows: Row[]; inner: MultiPolygon; roomArea: number; coveredArea: number;
  fullBoards: number; cutBoards: number; materialArea: number; wasteArea: number; wastePercent: number;
  firstRowWidth: number; lastRowWidth: number; warnings: string[]; feasible: boolean; resolvedOffsetY: number;
}
export interface PreparedRoom { inner: MultiPolygon; local: MultiPolygon; extent: ReturnType<typeof bounds>; roomArea: number }
export function validateFlooring(f: Flooring) {
  if ((f.minJointOffset !== undefined && (!Number.isFinite(f.minJointOffset) || f.minJointOffset < 0 || f.minJointOffset > f.length / 2)) ||
    (f.boardsPerPack !== undefined && (!Number.isInteger(f.boardsPerPack) || f.boardsPerPack < 1 || f.boardsPerPack > 500)) ||
    (f.reservePercent !== undefined && (!Number.isFinite(f.reservePercent) || f.reservePercent < 0 || f.reservePercent > 100)))
    throw new Error('Ungültiger Mindest-Fugenversatz, Paketinhalt oder Reserve.');
  if (![f.length, f.width, f.thickness, f.expansionGap, f.minRowWidth, f.minEndPieceLength, f.jointOffset].every(Number.isFinite) ||
    f.length < 100 || f.length > 5000 || f.width < 20 || f.width > 1000 || f.thickness <= 0 || f.thickness > 100 ||
    f.expansionGap < 0 || f.expansionGap > 100 || f.minRowWidth <= 0 || f.minRowWidth > f.width ||
    f.minEndPieceLength <= 0 || f.minEndPieceLength > f.length || f.jointOffset < 0 || f.jointOffset >= f.length)
    throw new Error('Ungültige Dielenmaße oder Verlegeregeln. Mindestmaße dürfen das Dielenmaß nicht überschreiten.');
}
export function prepareRoom(room: Room, flooring: Flooring): PreparedRoom {
  validateFlooring(flooring);
  if (![room.layout.direction, room.layout.offsetX, room.layout.offsetY].every(Number.isFinite)) throw new Error('Ungültige Verlegeparameter.');
  const inner = inset(room.polygon, flooring.expansionGap);
  if (!inner.length) throw new Error('Die Bewegungsfuge lässt keine verlegbare Fläche übrig.');
  const local = transform(inner, -room.layout.direction);
  return { inner, local, extent: bounds(polygonPoints(local)), roomArea: area([[room.polygon.map(p => [p.x, p.y])]]) };
}
export function fillPrepared(prepared: PreparedRoom, f: Flooring, settings: LayoutSettings, rowOrigins?: Map<number, number>): Layout {
  const { local, extent: b } = prepared;
  const offsetY = mod(settings.offsetY, f.width), offsetX = mod(settings.offsetX, f.length);
  const originY = b.minY - offsetY;
  const rowCount = Math.ceil((b.maxY - originY - 1e-7) / f.width);
  const estimated = rowCount * (Math.ceil((b.maxX - b.minX) / f.length) + 3);
  if (estimated > 15000) throw new Error('Dieser Raum erzeugt mehr als 15.000 Dielen. Bitte kleinere Räume oder größere Dielen verwenden.');
  const boards: Board[] = [], rows: Row[] = [];
  for (let row = 0; row < rowCount; row++) {
    const y = originY + row * f.width;
    const band = polygonClipping.intersection(local, rectangle(b.minX - 1, y, b.maxX - b.minX + 2, f.width));
    if (area(band) < 0.001) continue;
    const rb = bounds(polygonPoints(band));
    const fragmentWidths = band.map(poly => { const bb = bounds(polygonPoints([poly])); return bb.maxY - bb.minY; });
    const originX = rowOrigins?.get(row) ?? b.minX - offsetX + mod(row * f.jointOffset, f.length);
    const firstColumn = Math.floor((rb.minX - originX + 1e-7) / f.length);
    const lastColumn = Math.ceil((rb.maxX - originX - 1e-7) / f.length) - 1;
    const inRow: Board[] = [];
    for (let column = firstColumn; column <= lastColumn; column++) {
      const x = originX + column * f.length;
      const clipped = polygonClipping.intersection(band, rectangle(x, y, f.length, f.width));
      const usedArea = area(clipped); if (usedArea < 0.001) continue;
      const bb = bounds(polygonPoints(clipped));
      const board: Board = { id: `${row}:${column}`, row, column,
        source: { x, y, length: f.length, width: f.width, rotation: settings.direction },
        polygon: transform(clipped, settings.direction), area: usedArea,
        cut: Math.abs(usedArea - f.length * f.width) > 0.1,
        usedLength: bb.maxX - bb.minX, usedWidth: bb.maxY - bb.minY,
        pieceLengths: clipped.map(poly => { const p = bounds(polygonPoints([poly])); return p.maxX - p.minX; }) };
      boards.push(board); inRow.push(board);
    }
    const spans = band.map(poly => bounds(polygonPoints([poly])));
    const joints = inRow.map(board => board.source.x + f.length).filter(x => spans.some(s => x > s.minX + EPS && x < s.maxX - EPS));
    if (inRow.length) rows.push({ index: row, width: rb.maxY - rb.minY, fragmentWidths, originX, joints,
      firstLength: inRow[0].usedLength, lastLength: inRow[inRow.length - 1].usedLength });
  }
  const coveredArea = boards.reduce((a, board) => a + board.area, 0);
  const materialArea = boards.length * f.length * f.width;
  const wasteArea = Math.max(0, materialArea - coveredArea);
  const firstRowWidth = rows[0]?.width ?? 0, lastRowWidth = rows.at(-1)?.width ?? 0;
  const warnings: string[] = [];
  if (firstRowWidth < f.minRowWidth - EPS || lastRowWidth < f.minRowWidth - EPS) warnings.push(`Randreihe unter ${f.minRowWidth} mm. Quer-Offset optimieren.`);
  const narrow = rows.filter(row => row.fragmentWidths.some(w => w < f.minRowWidth - EPS)).length;
  if (narrow) warnings.push(`${narrow} Reihen mit schmalen Bereichen, z. B. an Nischen oder schrägen Wänden.`);
  const short = boards.flatMap(board => board.pieceLengths).filter(length => length < f.minEndPieceLength - EPS).length;
  if (short) warnings.push(`${short} Teilstücke kürzer als ${f.minEndPieceLength} mm. Diese manuelle Verlegung ist nicht zulässig; automatische Planung verwenden.`);
  const jointDistance = Math.min(f.jointOffset, f.length - f.jointOffset);
  if (!rowOrigins && jointDistance < (f.minJointOffset ?? 300)) warnings.push(`Stirnfugenversatz nur ${Math.round(jointDistance)} mm. Automatische Planung verwenden.`);
  const split = boards.filter(board => board.polygon.length > 1).length;
  if (split) warnings.push(`${split} Dielen werden in getrennte Teilstücke geschnitten.`);
  return { boards, rows, inner: prepared.inner, roomArea: prepared.roomArea, coveredArea,
    fullBoards: boards.filter(b => !b.cut).length, cutBoards: boards.filter(b => b.cut).length,
    materialArea, wasteArea, wastePercent: materialArea ? wasteArea / materialArea * 100 : 0,
    firstRowWidth, lastRowWidth, warnings, feasible: short === 0, resolvedOffsetY: offsetY };
}
export function emptyLayout(room: Room, warnings: string[] = []): Layout {
  return { boards: [], rows: [], inner: [], roomArea: area([[room.polygon.map(p => [p.x, p.y])]]), coveredArea: 0,
    fullBoards: 0, cutBoards: 0, materialArea: 0, wasteArea: 0, wastePercent: 0, firstRowWidth: 0, lastRowWidth: 0,
    warnings, feasible: warnings.length === 0, resolvedOffsetY: 0 };
}
const autoCache = new Map<string, Layout>();
export function layoutRoom(room: Room, flooring: Flooring): Layout {
  if (room.flooringEnabled === false) return emptyLayout(room);
  if (room.layout.mode === 'manual') return fillPrepared(prepareRoom(room, flooring), flooring, room.layout);
  const key = JSON.stringify([room.polygon, room.layout.direction, flooring]);
  const cached = autoCache.get(key); if (cached) return cached;
  const result = layoutAutomatic(room, flooring);
  if (autoCache.size >= 40) autoCache.delete(autoCache.keys().next().value!);
  autoCache.set(key, result); return result;
}
