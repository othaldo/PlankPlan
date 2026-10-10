import { describe, expect, it } from 'vitest';
import { allocateMaterial } from './material';
import type { Requirement } from './material';
import { PRESETS } from '../model/types';
const f = { ...PRESETS[0], sawKerf: 3 };
const piece = (id: string, length: number, role: Requirement['role'], rectangular = true, width = 194): Requirement => ({ id, length, role, width, area: length * width, rectangular });
describe('physical offcuts with factory click edges', () => {
  it('uses the previous row end before an equally sized older remainder',()=>{
    const stock={length:600,width:194,edge:'right' as const,sourceBoardId:'D1',sourceRoomKey:'room',sourceRoomName:'Raum',sourceFloorName:'Etage',cutRole:'end' as const};
    const result=allocateMaterial([piece('2:0',600,'start')],f,{newBoards:2,offcuts:[
      {...stock,id:'older',sourcePlacementId:'0:3'}, {...stock,id:'direct',sourceBoardId:'D2',sourcePlacementId:'1:3'}
    ]},{roomKey:'room',roomName:'Raum',floorName:'Etage'});
    expect(result.allocations[0]).toMatchObject({reusedFrom:'direct',sourceBoardId:'D2',cutLoss:0});
    expect(result.offcuts.map(s=>s.id)).toEqual(['older']);
  });
  it('uses an end offcut as the next starter and subtracts saw kerf', () => {
    const first = allocateMaterial([piece('0:4', 800, 'end')], f);
    expect(first.offcuts[0]).toMatchObject({ length: 482, edge: 'right', sourceBoardId: 'D1' });
    const next = allocateMaterial([piece('1:0', 482, 'start')], f, first);
    expect(next.newBoards).toBe(1); expect(next.allocations[0]).toMatchObject({ reusedFrom: 'R-0:4', stockLength: 482, sourceBoardId: 'D1', cutLoss: 0 });
    expect(next.offcuts).toHaveLength(0);
  });
  it('uses a starter offcut as a later end piece with its factory left edge', () => {
    const first = allocateMaterial([piece('0:0', 500, 'start')], f);
    expect(first.offcuts[0]).toMatchObject({ length: 782, edge: 'left' });
    const next = allocateMaterial([piece('1:5', 700, 'end')], f, first);
    expect(next.newBoards).toBe(1); expect(next.allocations[0].reusedFrom).toBeTruthy();
    expect(next.offcuts).toHaveLength(0); // Remaining middle scrap has neither required factory end.
  });
  it('does not reuse the wrong short click edge or rotate a stock', () => {
    const first = allocateMaterial([piece('0:4', 800, 'end')], f);
    const next = allocateMaterial([piece('1:4', 400, 'end')], f, first);
    expect(next.newBoards).toBe(2); expect(next.allocations[0].reusedFrom).toBeUndefined();
  });
  it('cannot consume one offcut twice', () => {
    const first = allocateMaterial([piece('0:4', 800, 'end')], f);
    const next = allocateMaterial([piece('1:0', 482, 'start'), piece('2:0', 482, 'start')], f, first);
    expect(next.newBoards).toBe(2); expect(next.allocations.filter(a => a.reusedFrom)).toHaveLength(1);
  });
  it('does not inventory strips, angled cuts or too-short leftovers', () => {
    expect(allocateMaterial([piece('0:4', 800, 'end', true, 109)], f).offcuts).toHaveLength(0);
    expect(allocateMaterial([piece('0:4', 800, 'end', false)], f).offcuts).toHaveLength(0);
    expect(allocateMaterial([piece('0:4', 1000, 'end')], f).offcuts).toHaveLength(0);
  });
  it('reserves enough material for a second cut rather than pretending stock is sufficient', () => {
    const first = allocateMaterial([piece('0:4', 800, 'end')], f);
    const next = allocateMaterial([piece('1:0', 481, 'start')], f, first);
    expect(next.newBoards).toBe(2); // 482 stock is neither an exact fit nor 481 + 3 mm.
  });
});
