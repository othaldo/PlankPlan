import { describe, expect, it } from 'vitest';
import { parseProject, parseRooms } from './project';
import { serializeProject } from '../export/project';
import { demoProject, newFloor } from '../model/types';
describe('project JSON', () => {
  it('round-trips all floors, room offsets, embedded backgrounds and calibration', () => {
    const project = demoProject(); const floor = newFloor('OG');
    floor.background = { name: 'plan.png', dataUrl: 'data:image/png;base64,aGVsbG8=', widthPx: 800, heightPx: 600, opacity: .45, origin: { x: 20, y: 30 } };
    floor.calibration = { pointsPx: [{ x: 0, y: 0 }, { x: 500, y: 0 }], distanceMm: 4000, mmPerPixel: 8 };
    project.floors.push(floor); project.floors[0].rooms[0].layout = { direction: 37, offsetX: 42, offsetY: 19 };
    expect(parseProject(serializeProject(project))).toEqual(project);
  });
  it('rejects unknown schema versions, malformed JSON and invalid polygons', () => {
    expect(() => parseProject('{oops')).toThrow(/JSON/);
    const p = demoProject(); expect(() => parseProject(JSON.stringify({ ...p, version: 2 }))).toThrow(/version/);
    p.floors[0].rooms[0].polygon = [{ x: 0, y: 0 }]; expect(() => parseProject(JSON.stringify(p))).toThrow();
  });
  it('rejects repeated identifiers and unsafe background formats', () => {
    const p = demoProject(); p.floors.push(p.floors[0]); expect(() => parseProject(JSON.stringify(p))).toThrow(/eindeutig/);
    const q = demoProject(); q.floors[0].background = { name: 'bad', dataUrl: 'javascript:alert(1)', widthPx: 100, heightPx: 100, opacity: .5, origin: { x: 0, y: 0 } };
    expect(() => parseProject(JSON.stringify(q))).toThrow();
  });
  it('rejects inconsistent calibration', () => {
    const p = demoProject(); p.floors[0].calibration = { pointsPx: [{ x: 0, y: 0 }, { x: 100, y: 0 }], distanceMm: 4000, mmPerPixel: 2 };
    expect(() => parseProject(JSON.stringify(p))).toThrow(/Kalibrierung/);
  });
  it('imports tuple and object coordinates with separate generated IDs', () => {
    const a = parseRooms('{"rooms":[{"name":"Flur","polygon":[[0,0],[4000,0],[4000,2000],[0,2000]]}]}');
    const b = parseRooms('{"rooms":[{"name":"Flur","polygon":[{"x":0,"y":0},{"x":4000,"y":0},{"x":4000,"y":2000},{"x":0,"y":2000}]}]}');
    expect(a[0].polygon).toEqual(b[0].polygon); expect(a[0].id).not.toBe(b[0].id);
    expect(a[0].layout).toEqual({ direction: 0, offsetX: 0, offsetY: 0 });
  });
  it('round-trips disabled rooms, automatic/manual modes and package settings', () => {
    const p = demoProject(); p.floors[0].rooms[0].flooringEnabled = false; p.floors[0].rooms[0].layout.mode = 'manual';
    expect(parseProject(serializeProject(p))).toEqual(p);
    expect(parseRooms('{"rooms":[{"name":"Bad","flooringEnabled":false,"polygon":[[0,0],[3000,0],[3000,3000],[0,3000]]}]}')[0].flooringEnabled).toBe(false);
  });
  it('restores known pack metadata when loading a legacy Luxemburg project', () => {
    const p = demoProject(); delete p.flooring.boardsPerPack;
    expect(parseProject(serializeProject(p)).flooring.boardsPerPack).toBe(10);
  });
});
