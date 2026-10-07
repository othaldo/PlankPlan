export interface Point { x: number; y: number }
export interface Flooring {
  name: string; length: number; width: number; thickness: number;
  expansionGap: number; minRowWidth: number; minEndPieceLength: number; jointOffset: number;
}
export interface LayoutSettings { direction: number; offsetX: number; offsetY: number }
export interface Room { id: string; name: string; polygon: Point[]; layout: LayoutSettings }
export interface Background {
  name: string; dataUrl: string; widthPx: number; heightPx: number; opacity: number; origin: Point;
}
export interface Calibration { pointsPx: [Point, Point]; distanceMm: number; mmPerPixel: number }
export interface Floor { id: string; name: string; background: Background | null; calibration: Calibration | null; rooms: Room[] }
export interface Project { version: 1; name: string; flooring: Flooring; floors: Floor[] }
export const PRESETS: Flooring[] = [
  { name: 'Parador Selected · Eiche Luxemburg', length: 1285, width: 194, thickness: 8,
    expansionGap: 10, minRowWidth: 60, minEndPieceLength: 300, jointOffset: 400 },
  { name: 'Wunderwerk · Eiche Malmö', length: 1292, width: 246, thickness: 8,
    expansionGap: 10, minRowWidth: 60, minEndPieceLength: 300, jointOffset: 400 },
];
export const newFloor = (name: string): Floor => ({ id: crypto.randomUUID(), name, background: null, calibration: null, rooms: [] });
export function demoProject(): Project {
  const floor = newFloor('Erdgeschoss');
  floor.rooms = [{ id: crypto.randomUUID(), name: 'Wohnzimmer',
    polygon: [{ x: 0, y: 0 }, { x: 5200, y: 0 }, { x: 5200, y: 4100 },
      { x: 3800, y: 4100 }, { x: 3800, y: 4700 }, { x: 0, y: 4700 }],
    layout: { direction: 0, offsetX: 0, offsetY: 0 } }];
  return { version: 1, name: 'Mein Verlegeprojekt', flooring: { ...PRESETS[0] }, floors: [floor] };
}
