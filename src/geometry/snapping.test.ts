import { describe, expect, it } from 'vitest';
import { snapRoomTranslation, snapToRooms } from './snapping';
import { signedArea } from './polygon';
import type { Room } from '../model/types';
const room: Room = { id: 'existing', name: 'Existing', polygon: [{x:0,y:0},{x:4000,y:0},{x:4000,y:3000},{x:0,y:3000}], layout: { direction: 0, offsetX: 0, offsetY: 0 }, flooringEnabled: false };
describe('room adjacency snapping', () => {
  it('snaps exactly to an existing corner including rooms without laminate', () => { expect(snapToRooms({ x: 3980, y: 3010 }, [room], 30)).toEqual({ x: 4000, y: 3000 }); });
  it('projects onto a wall without snapping to a distant endpoint', () => { expect(snapToRooms({ x: 3990, y: 1500 }, [room], 20)).toEqual({ x: 4000, y: 1500 }); });
  it('excludes the edited room and leaves distant points unchanged', () => {
    expect(snapToRooms({ x: 3980, y: 3010 }, [room], 30, room.id)).toBeNull();
    expect(snapToRooms({ x: 4200, y: 1500 }, [room], 30)).toBeNull();
  });
  it('moves an entire room flush against a wall without changing its size', () => {
    const polygon = [{x:4500,y:0},{x:6500,y:0},{x:6500,y:3000},{x:4500,y:3000}];
    const result = snapRoomTranslation(polygon, {x:-480,y:0}, [room], 30, 'moved');
    expect(result.polygon[0]).toEqual({ x:4000, y:0 }); expect(result.polygon[3]).toEqual({x:4000,y:3000});
    expect(signedArea(result.polygon)).toBe(signedArea(polygon));
  });
});
