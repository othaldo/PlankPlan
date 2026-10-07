import type { Calibration, Point } from '../model/types';
export function calibrate(pointsPx: [Point, Point], distanceMm: number): Calibration {
  const pixels = Math.hypot(pointsPx[1].x - pointsPx[0].x, pointsPx[1].y - pointsPx[0].y);
  if (!Number.isFinite(pixels) || pixels < 1) throw new Error('Die Messpunkte müssen mindestens einen Bildpixel auseinanderliegen.');
  if (!Number.isFinite(distanceMm) || distanceMm <= 0 || distanceMm > 1e6) throw new Error('Bitte eine gültige Strecke in Millimetern eingeben (max. 1.000.000).');
  return { pointsPx, distanceMm, mmPerPixel: distanceMm / pixels };
}
export function scaleAround(p: Point, origin: Point, factor: number): Point {
  return { x: origin.x + (p.x - origin.x) * factor, y: origin.y + (p.y - origin.y) * factor };
}
