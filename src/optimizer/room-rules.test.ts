import { describe, expect, it } from 'vitest';
import { PRESETS, roomFlooring } from '../model/types';
import type { Project, Room } from '../model/types';
import { layoutRoom } from '../flooring/layout';
import { allocateMaterial, initialMaterial } from '../flooring/material';
import { findFixedStagger, planAutomatic } from './automatic';
import { optimizeTransverse } from './transverse';
import { optimizeProject, planProject, planningSignature, roomKey } from './project';
import { parseProject, parseRooms } from '../import/project';
import { serializeProject } from '../export/project';

const f={...PRESETS[0],minJointOffset:400,reservePercent:0};
const room=(id='r'):Room=>({id,name:id,polygon:[{x:0,y:0},{x:4010,y:0},{x:4010,y:2348},{x:0,y:2348}],
  layout:{direction:0,offsetX:0,offsetY:0,firstRowWidth:'full',pattern:'custom',fixedStagger:400,startWithFullPlank:true}});
const project=(rooms:Room[]):Project=>({version:1,name:'Raumregeln',flooring:f,floors:[{id:'f',name:'Etage',background:null,calibration:null,rooms}]});
describe('per-room laying rules',()=>{
  it('retains a 150 mm remainder for another room that permits shorter pieces',()=>{
    const a=room('a'),b=room('b'); b.rules={minEndPieceLength:100};
    const end={id:'0:3',length:1132,width:194,area:1132*194,rectangular:true,role:'end' as const};
    const first=allocateMaterial([end],roomFlooring(a,f),initialMaterial(),{roomKey:'a',roomName:'a',floorName:'Etage',minReusableLength:100});
    expect(first.offcuts[0].length).toBe(150);
    const second=allocateMaterial([{...end,id:'1:0',length:150,area:150*194,role:'start'}],roomFlooring(b,f),first);
    expect(second.newBoards).toBe(1); expect(second.allocations[0].reusedFromRoomKey).toBe('a');
  });
  it('inherits legacy defaults and changes only the selected room',()=>{
    const a=room('a'),b=room('b'); a.rules={minEndPieceLength:100};
    expect(layoutRoom(a,f).feasible).toBe(true); expect(layoutRoom(b,f).feasible).toBe(false);
    expect(roomFlooring(a,f).minJointOffset).toBe(400); expect(f.minEndPieceLength).toBe(300);
    a.rules.minEndPieceLength=300; expect(layoutRoom(a,f).feasible).toBe(false);
  });
  it('uses room rules in manual layouts, gap geometry and transverse optimization',()=>{
    const r=room(); r.layout.mode='manual'; r.rules={expansionGap:20,minEndPieceLength:1,minRowWidth:90,jointOffset:500,minJointOffset:500};
    const plan=layoutRoom(r,f); expect(plan.coveredArea).toBeCloseTo(3970*2308,2);
    expect(plan.rows[1].firstLength).toBeCloseTo(500);
    expect(optimizeTransverse(r,f)).toEqual(optimizeTransverse({...r,rules:undefined},roomFlooring(r,f)));
  });
  it('uses room rules in direct automatic and full-start search entry points',()=>{
    const r=room(); r.rules={minEndPieceLength:100};
    expect(planAutomatic(r,f).layout.feasible).toBe(true); expect(findFixedStagger(r,f).fixedStagger).toBe(400);
    r.rules.minJointOffset=500;
    expect(planAutomatic(r,f).layout.feasible).toBe(false); expect(findFixedStagger(r,f).fixedStagger).toBe(642.5);
  });
  it('preserves distinct rules with shared offcuts and adaptive package optimization',()=>{
    const a=room('a'),b=room('b'); a.rules={minEndPieceLength:100};
    b.rules={minEndPieceLength:350,minJointOffset:500,expansionGap:15}; b.layout={direction:0,offsetX:0,offsetY:0};
    const p=project([a,b]),best=optimizeProject(p); expect(best.valid).toBe(true);
    for(const r of [a,b]) {
      const plan=best.layouts.get(roomKey('f',r.id))!;
      expect(plan.boards.every(board=>board.pieceLengths.every(length=>length>=r.rules!.minEndPieceLength!-.01))).toBe(true);
      for(let i=1;i<plan.rows.length;i++) for(const x of plan.rows[i].joints) for(const y of plan.rows[i-1].joints)
        expect(Math.abs(x-y)).toBeGreaterThanOrEqual((r.rules!.minJointOffset??400)-.01);
    }
    const loaded=parseProject(serializeProject({...p,materialPlan:{roomOrder:best.order,adaptive:best.adaptive,signature:planningSignature(p)}}));
    expect(loaded.floors[0].rooms.map(r=>r.rules)).toEqual([a.rules,b.rules]);
    expect([...planProject(loaded).layouts]).toEqual([...best.layouts]);
  });
  it('canonicalizes inherited values and invalidates saved optimization on changed rules',()=>{
    const r=room(),p=project([r]),signature=planningSignature(p);
    r.rules={minEndPieceLength:300,minJointOffset:400}; expect(planningSignature(p)).toBe(signature);
    r.rules.minEndPieceLength=100; expect(planningSignature(p)).not.toBe(signature);
  });
  it('validates room rules and supports room-only JSON imports',()=>{
    const r=room(); r.rules={expansionGap:12,minEndPieceLength:100};
    expect(parseProject(serializeProject(project([r]))).floors[0].rooms[0].rules).toEqual(r.rules);
    expect(parseRooms(JSON.stringify({rooms:[r]}))[0].rules).toEqual(r.rules);
    for(const rules of [{minEndPieceLength:1400},{minRowWidth:200},{minJointOffset:650},{expansionGap:-1}])
      expect(()=>parseProject(serializeProject(project([{...r,rules}])))).toThrow();
  });
});
