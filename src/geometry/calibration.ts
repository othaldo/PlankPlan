import type { Calibration, Floor, Point } from '../model/types';
import { validatePolygon } from './polygon';
export function calibrate(pointsPx: [Point, Point], distanceMm: number): Calibration {
  const pixels = Math.hypot(pointsPx[1].x - pointsPx[0].x, pointsPx[1].y - pointsPx[0].y);
  if (!Number.isFinite(pixels) || pixels < 1) throw new Error('Die Messpunkte müssen mindestens einen Bildpixel auseinanderliegen.');
  if (!Number.isFinite(distanceMm) || distanceMm <= 0 || distanceMm > 1e6) throw new Error('Bitte eine gültige Strecke in Millimetern eingeben (max. 1.000.000).');
  return { pointsPx, distanceMm, mmPerPixel: distanceMm / pixels };
}
export function scaleAround(p: Point, origin: Point, factor: number): Point {
  return { x: origin.x + (p.x - origin.x) * factor, y: origin.y + (p.y - origin.y) * factor };
}

/** Image calibration never changes real room dimensions unless explicitly requested. */
export function calibrateFloor(floor: Floor, worldPoints: [Point, Point], distanceMm: number, scaleRooms = false): Floor {
  if (!floor.background) throw new Error('Bitte zuerst ein Grundrissbild laden.');
  const bg = floor.background, oldScale = floor.calibration?.mmPerPixel ?? 5;
  const px = worldPoints.map(p => ({ x: (p.x - bg.origin.x) / oldScale, y: (p.y - bg.origin.y) / oldScale })) as [Point, Point];
  const calibration = calibrate(px, distanceMm);
  if (px.some(p => p.x < 0 || p.y < 0 || p.x > bg.widthPx || p.y > bg.heightPx)) throw new Error('Bitte beide Messpunkte innerhalb des Grundrissbilds setzen.');
  if (Math.max(bg.widthPx, bg.heightPx) * calibration.mmPerPixel > 1e6)
    throw new Error('Der kalibrierte Grundriss würde größer als 1.000.000 mm. Bitte Messpunkte und reale Strecke prüfen.');
  const rooms = scaleRooms ? floor.rooms.map(r => ({ ...r, polygon: r.polygon.map(p => scaleAround(p, bg.origin, calibration.mmPerPixel / oldScale)) })) : floor.rooms;
  for (const r of rooms) { const error = validatePolygon(r.polygon); if (error) throw new Error(error); }
  return { ...floor, calibration, rooms };
}
