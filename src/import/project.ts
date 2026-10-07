import { z } from 'zod';
import { validatePolygon } from '../geometry/polygon';
import { calibrate } from '../geometry/calibration';
import { validateFlooring } from '../flooring/layout';
import type { Project, Room } from '../model/types';

const finite = z.number().finite();
const point = z.object({ x: finite.min(-1e6).max(1e6), y: finite.min(-1e6).max(1e6) });
const name = z.string().trim().min(1).max(120);
const id = z.string().min(1).max(120);
const polygon = z.array(point).min(3).max(512).superRefine((points, ctx) => {
  const error = validatePolygon(points); if (error) ctx.addIssue({ code: 'custom', message: error });
});
const layout = z.object({ direction: finite.min(-360).max(360), offsetX: finite.min(-1e6).max(1e6), offsetY: finite.min(-1e6).max(1e6), mode: z.enum(['automatic', 'manual']).optional() });
const room = z.object({ id, name, polygon, layout, flooringEnabled: z.boolean().optional() });
const flooring = z.object({ name, length: finite, width: finite, thickness: finite,
  expansionGap: finite, minRowWidth: finite, minEndPieceLength: finite, jointOffset: finite,
  minJointOffset: finite.min(0).optional(), boardsPerPack: finite.int().min(1).max(500).optional(), reservePercent: finite.min(0).max(100).optional() }).superRefine((f, ctx) => {
    try { validateFlooring(f); } catch (e) { ctx.addIssue({ code: 'custom', message: (e as Error).message }); }
  });
const background = z.object({ name, dataUrl: z.string().max(16e6).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\r\n]+$/),
  widthPx: finite.int().positive().max(20000), heightPx: finite.int().positive().max(20000), opacity: finite.min(0).max(1), origin: point });
const calibration = z.object({ pointsPx: z.tuple([point, point]), distanceMm: finite.positive().max(1e6), mmPerPixel: finite.positive().max(1e6) })
  .superRefine((c, ctx) => {
    try { const expected = calibrate(c.pointsPx, c.distanceMm).mmPerPixel;
      if (Math.abs(expected - c.mmPerPixel) > 1e-6 * expected) ctx.addIssue({ code: 'custom', message: 'Kalibrierung und Maßstab stimmen nicht überein.' });
    } catch (e) { ctx.addIssue({ code: 'custom', message: (e as Error).message }); }
  });
const floor = z.object({ id, name, background: background.nullable(), calibration: calibration.nullable(), rooms: z.array(room).max(100) })
  .superRefine((f, ctx) => {
    if (f.calibration && !f.background) ctx.addIssue({ code: 'custom', message: 'Eine Kalibrierung benötigt ein Hintergrundbild.' });
    if (new Set(f.rooms.map(r => r.id)).size !== f.rooms.length) ctx.addIssue({ code: 'custom', message: 'Raum-IDs müssen je Etage eindeutig sein.' });
  });
export const projectSchema = z.object({ version: z.literal(1), name, flooring, floors: z.array(floor).min(1).max(50) })
  .superRefine((p, ctx) => {
    if (new Set(p.floors.map(f => f.id)).size !== p.floors.length) ctx.addIssue({ code: 'custom', message: 'Etagen-IDs müssen eindeutig sein.' });
  });
export function parseProject(text: string): Project {
  if (text.length > 24e6) throw new Error('Das Projekt ist größer als 24 MB.');
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error('Die Datei enthält kein gültiges JSON.'); }
  const result = projectSchema.safeParse(raw);
  if (!result.success) throw new Error(`Ungültiges Projekt: ${result.error.issues[0].path.join('.')} – ${result.error.issues[0].message}`);
  // Older projects predate pack metadata; restore only the positively identified product preset.
  if (!result.data.flooring.boardsPerPack && result.data.flooring.length === 1285 && result.data.flooring.width === 194 && result.data.flooring.name.includes('Luxemburg'))
    result.data.flooring.boardsPerPack = 10;
  return result.data;
}
const importPoint = z.union([point, z.tuple([finite, finite]).transform(([x, y]) => ({ x, y }))]);
const roomsSchema = z.object({ rooms: z.array(z.object({ name, polygon: z.array(importPoint).min(3).max(512), layout: layout.optional(), flooringEnabled: z.boolean().optional() })).min(1).max(100) });
export function parseRooms(text: string): Room[] {
  const result = roomsSchema.safeParse(JSON.parse(text));
  if (!result.success) throw new Error('Erwartet wird { "rooms": [{ "name": "…", "polygon": [[x, y], …] }] } mit Millimeter-Koordinaten.');
  return result.data.rooms.map(r => {
    const error = validatePolygon(r.polygon); if (error) throw new Error(error);
    return { ...r, id: crypto.randomUUID(), layout: r.layout ?? { direction: 0, offsetX: 0, offsetY: 0 } };
  });
}
